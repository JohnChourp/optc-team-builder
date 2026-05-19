import { Injectable } from '@angular/core';

import {
  CREW_FORGE_IMAGE_SLOT_BLUEPRINTS,
  type CharacterListItem,
  type CrewForgeImageExemplar,
  type CrewForgeImagePreprocessConfig,
  type CrewForgeImageProfile,
  type CrewForgeImageRecognitionCandidate,
  type CrewForgeImageRecognitionResult,
  type CrewForgeImageRecognitionSlotResult,
  type CrewForgeImageSlotDefinition,
} from '../models/optc.models';

interface LoadedCrewForgeImageFile {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

interface CatalogFingerprintEntry {
  characterId: number;
  fingerprint: number[];
}

const DEFAULT_PROFILE_MATCH_THRESHOLD = 0.92;
const DEFAULT_EMPTY_VARIANCE_THRESHOLD = 0.005;
const ASPECT_RATIO_TOLERANCE = 0.03;

@Injectable({ providedIn: 'root' })
export class CrewForgeImageImportService {
  private readonly imageFingerprintCache = new Map<string, number[]>();
  private readonly catalogFingerprintCache = new Map<string, Promise<CatalogFingerprintEntry[]>>();

  public createEmptyProfileInput(
    imageWidth = 0,
    imageHeight = 0,
  ): Omit<CrewForgeImageProfile, 'id' | 'source' | 'createdAt' | 'updatedAt'> {
    return {
      name: '',
      imageWidth,
      imageHeight,
      slotDefinitions: CREW_FORGE_IMAGE_SLOT_BLUEPRINTS.map((slot) => ({
        key: slot.key,
        label: slot.label,
        role: slot.role,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      })),
      preprocess: this.createDefaultPreprocessConfig(),
      examples: [],
      exemplars: [],
    };
  }

  public createDefaultPreprocessConfig(): CrewForgeImagePreprocessConfig {
    return {
      fingerprintSize: 16,
      contrast: 1,
      brightness: 0,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold: DEFAULT_PROFILE_MATCH_THRESHOLD,
      emptyVarianceThreshold: DEFAULT_EMPTY_VARIANCE_THRESHOLD,
    };
  }

  public resolveProfile(
    profiles: CrewForgeImageProfile[],
    imageWidth: number,
    imageHeight: number,
    preferredProfileId: string | null = null,
  ): CrewForgeImageProfile | null {
    if (imageWidth <= 0 || imageHeight <= 0 || !profiles.length) {
      return null;
    }

    const exactProfiles = profiles.filter(
      (profile) => profile.imageWidth === imageWidth && profile.imageHeight === imageHeight,
    );

    if (exactProfiles.length) {
      return (
        exactProfiles.find((profile) => profile.id === preferredProfileId) ??
        exactProfiles[0] ??
        null
      );
    }

    const sourceAspect = imageWidth / imageHeight;
    const compatibleProfiles = profiles
      .filter((profile) => profile.imageWidth > 0 && profile.imageHeight > 0)
      .map((profile) => ({
        profile,
        delta: Math.abs(profile.imageWidth / profile.imageHeight - sourceAspect),
      }))
      .filter(({ delta }) => delta <= ASPECT_RATIO_TOLERANCE)
      .sort((left, right) => left.delta - right.delta);

    if (!compatibleProfiles.length) {
      return null;
    }

    return (
      compatibleProfiles.find(({ profile }) => profile.id === preferredProfileId)?.profile ??
      compatibleProfiles[0]?.profile ??
      null
    );
  }

  public async loadImageFile(file: File): Promise<LoadedCrewForgeImageFile> {
    const dataUrl = await this.readBlobAsDataUrl(file);
    const dimensions = await this.measureImage(dataUrl);

    return {
      dataUrl,
      width: dimensions.width,
      height: dimensions.height,
      name: file.name,
    };
  }

  public async recognizeImage(
    imageDataUrl: string,
    imageWidth: number,
    imageHeight: number,
    profile: CrewForgeImageProfile | null,
    catalog: CharacterListItem[],
  ): Promise<CrewForgeImageRecognitionResult> {
    if (!profile) {
      return this.createNoProfileResult(imageWidth, imageHeight, 'no_profile');
    }

    if (
      imageWidth <= 0 ||
      imageHeight <= 0 ||
      profile.imageWidth <= 0 ||
      profile.imageHeight <= 0
    ) {
      return this.createNoProfileResult(imageWidth, imageHeight, 'dimension_mismatch');
    }

    const sourceAspect = imageWidth / imageHeight;
    const profileAspect = profile.imageWidth / profile.imageHeight;

    if (Math.abs(profileAspect - sourceAspect) > ASPECT_RATIO_TOLERANCE) {
      return this.createNoProfileResult(imageWidth, imageHeight, 'dimension_mismatch');
    }

    const slotDefinitions = this.scaleSlotDefinitions(
      profile.slotDefinitions,
      profile.imageWidth,
      profile.imageHeight,
      imageWidth,
      imageHeight,
    );
    const sourceImage = await this.loadImageElement(imageDataUrl);
    const catalogFingerprints = await this.getCatalogFingerprints(catalog, profile.preprocess);
    const slots: CrewForgeImageRecognitionSlotResult[] = [];

    for (const slotDefinition of slotDefinitions) {
      const cropDataUrl = this.extractSlotCropDataUrl(sourceImage, slotDefinition);

      if (!cropDataUrl) {
        slots.push(
          this.createRecognitionSlotResult(slotDefinition, {
            characterId: null,
            confidence: 0,
            status: 'empty',
            cropDataUrl: null,
            candidates: [],
          }),
        );
        continue;
      }

      const fingerprint = await this.fingerprintImageDataUrl(cropDataUrl, profile.preprocess);
      const variance = this.calculateVariance(fingerprint);

      if (variance <= profile.preprocess.emptyVarianceThreshold) {
        slots.push(
          this.createRecognitionSlotResult(slotDefinition, {
            characterId: null,
            confidence: 0,
            status: 'empty',
            cropDataUrl,
            candidates: [],
          }),
        );
        continue;
      }

      const exemplarCandidates = profile.exemplars
        .filter((exemplar) => exemplar.slotKey === slotDefinition.key)
        .map((exemplar) => ({
          characterId: exemplar.characterId,
          confidence: this.compareFingerprints(fingerprint, exemplar.fingerprint),
          source: 'exemplar' as const,
        }));
      const catalogCandidates = catalogFingerprints.map((entry) => ({
        characterId: entry.characterId,
        confidence: this.compareFingerprints(fingerprint, entry.fingerprint),
        source: 'catalog' as const,
      }));
      const candidates = [...exemplarCandidates, ...catalogCandidates]
        .sort((left, right) => {
          if (right.confidence !== left.confidence) {
            return right.confidence - left.confidence;
          }

          if (left.source !== right.source) {
            return left.source === 'exemplar' ? -1 : 1;
          }

          return left.characterId - right.characterId;
        })
        .filter((candidate, index, allCandidates) => {
          const firstIndex = allCandidates.findIndex(
            (entry) => entry.characterId === candidate.characterId,
          );

          return firstIndex === index;
        })
        .slice(0, 3);
      const bestCandidate = candidates[0] ?? null;
      const threshold = profile.preprocess.matchThreshold;

      slots.push(
        this.createRecognitionSlotResult(slotDefinition, {
          characterId:
            bestCandidate && bestCandidate.confidence >= threshold ? bestCandidate.characterId : null,
          confidence: bestCandidate?.confidence ?? 0,
          status:
            !bestCandidate
              ? 'empty'
              : bestCandidate.confidence >= threshold
                ? 'matched'
                : 'ambiguous',
          cropDataUrl,
          candidates,
        }),
      );
    }

    return {
      profileId: profile.id,
      imageWidth,
      imageHeight,
      slots,
      reason: 'matched',
    };
  }

  public applyManualSelection(
    result: CrewForgeImageRecognitionResult,
    slotKey: string,
    characterId: number | null,
    confidence = 1,
  ): CrewForgeImageRecognitionResult {
    return {
      ...result,
      slots: result.slots.map((slot) =>
        slot.slotKey === slotKey
          ? {
              ...slot,
              characterId,
              confidence: characterId ? confidence : 0,
              status: characterId ? 'manual' : 'empty',
              manuallyEdited: true,
            }
          : slot,
      ),
    };
  }

  public async buildExemplarFromSlot(
    profile: CrewForgeImageProfile,
    slot: CrewForgeImageRecognitionSlotResult,
  ): Promise<Omit<CrewForgeImageExemplar, 'id' | 'createdAt' | 'updatedAt'> | null> {
    if (!slot.characterId || !slot.cropDataUrl) {
      return null;
    }

    const fingerprint = await this.fingerprintImageDataUrl(slot.cropDataUrl, profile.preprocess);

    return {
      slotKey: slot.slotKey,
      characterId: slot.characterId,
      fingerprint,
      cropDataUrl: slot.cropDataUrl,
    };
  }

  private createNoProfileResult(
    imageWidth: number,
    imageHeight: number,
    reason: 'no_profile' | 'dimension_mismatch',
  ): CrewForgeImageRecognitionResult {
    return {
      profileId: null,
      imageWidth,
      imageHeight,
      slots: CREW_FORGE_IMAGE_SLOT_BLUEPRINTS.map((slot) =>
        this.createRecognitionSlotResult(
          {
            key: slot.key,
            label: slot.label,
            role: slot.role,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          },
          {
            characterId: null,
            confidence: 0,
            status: 'no_profile',
            cropDataUrl: null,
            candidates: [],
          },
        ),
      ),
      reason,
    };
  }

  private createRecognitionSlotResult(
    slotDefinition: CrewForgeImageSlotDefinition,
    input: {
      characterId: number | null;
      confidence: number;
      status: CrewForgeImageRecognitionSlotResult['status'];
      cropDataUrl: string | null;
      candidates: CrewForgeImageRecognitionCandidate[];
    },
  ): CrewForgeImageRecognitionSlotResult {
    return {
      slotKey: slotDefinition.key,
      label: slotDefinition.label,
      role: slotDefinition.role,
      characterId: input.characterId,
      confidence: input.confidence,
      status: input.status,
      cropDataUrl: input.cropDataUrl,
      candidates: input.candidates,
      manuallyEdited: false,
    };
  }

  private async getCatalogFingerprints(
    catalog: CharacterListItem[],
    preprocess: CrewForgeImagePreprocessConfig,
  ): Promise<CatalogFingerprintEntry[]> {
    const cacheKey = `${catalog.map((character) => character.id).join(',')}|${this.serializePreprocess(preprocess)}`;
    const cached = this.catalogFingerprintCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const nextPromise = Promise.all(
      catalog.map(async (character) => ({
        characterId: character.id,
        fingerprint: await this.fingerprintImageDataUrl(character.imageUrl, preprocess),
      })),
    );

    this.catalogFingerprintCache.set(cacheKey, nextPromise);

    return nextPromise;
  }

  private async fingerprintImageDataUrl(
    imageSource: string,
    preprocess: CrewForgeImagePreprocessConfig,
  ): Promise<number[]> {
    const cacheKey = `${imageSource}|${this.serializePreprocess(preprocess)}`;
    const cached = this.imageFingerprintCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const image = await this.loadImageElement(imageSource);
    const fingerprint = this.extractFingerprint(image, preprocess);
    this.imageFingerprintCache.set(cacheKey, fingerprint);

    return fingerprint;
  }

  private scaleSlotDefinitions(
    slotDefinitions: CrewForgeImageSlotDefinition[],
    fromWidth: number,
    fromHeight: number,
    toWidth: number,
    toHeight: number,
  ): CrewForgeImageSlotDefinition[] {
    if (fromWidth === toWidth && fromHeight === toHeight) {
      return slotDefinitions;
    }

    const scaleX = toWidth / fromWidth;
    const scaleY = toHeight / fromHeight;

    return slotDefinitions.map((slot) => ({
      ...slot,
      x: Math.round(slot.x * scaleX),
      y: Math.round(slot.y * scaleY),
      width: Math.round(slot.width * scaleX),
      height: Math.round(slot.height * scaleY),
    }));
  }

  private extractSlotCropDataUrl(
    sourceImage: HTMLImageElement,
    slotDefinition: CrewForgeImageSlotDefinition,
  ): string | null {
    if (
      slotDefinition.width <= 0 ||
      slotDefinition.height <= 0 ||
      slotDefinition.x < 0 ||
      slotDefinition.y < 0
    ) {
      return null;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Unable to create image canvas.');
    }

    canvas.width = slotDefinition.width;
    canvas.height = slotDefinition.height;
    context.drawImage(
      sourceImage,
      slotDefinition.x,
      slotDefinition.y,
      slotDefinition.width,
      slotDefinition.height,
      0,
      0,
      slotDefinition.width,
      slotDefinition.height,
    );

    return canvas.toDataURL('image/png');
  }

  private extractFingerprint(
    image: HTMLImageElement,
    preprocess: CrewForgeImagePreprocessConfig,
  ): number[] {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Unable to create image canvas.');
    }

    canvas.width = preprocess.fingerprintSize;
    canvas.height = preprocess.fingerprintSize;
    context.filter = preprocess.blurRadius > 0 ? `blur(${preprocess.blurRadius}px)` : 'none';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const fingerprint: number[] = [];

    for (let index = 0; index < imageData.data.length; index += 4) {
      const red = imageData.data[index] ?? 0;
      const green = imageData.data[index + 1] ?? 0;
      const blue = imageData.data[index + 2] ?? 0;
      const alpha = imageData.data[index + 3] ?? 255;
      const luminance = preprocess.grayscale
        ? (0.299 * red + 0.587 * green + 0.114 * blue) / 255
        : (red + green + blue) / (3 * 255);
      const alphaScale = alpha / 255;
      const contrasted =
        (luminance * alphaScale - 0.5) * preprocess.contrast + 0.5 + preprocess.brightness;
      const clamped = Math.max(0, Math.min(1, contrasted));

      fingerprint.push(preprocess.invert ? 1 - clamped : clamped);
    }

    return fingerprint;
  }

  private compareFingerprints(left: number[], right: number[]): number {
    const length = Math.min(left.length, right.length);

    if (!length) {
      return 0;
    }

    let sum = 0;

    for (let index = 0; index < length; index += 1) {
      const difference = (left[index] ?? 0) - (right[index] ?? 0);
      sum += difference * difference;
    }

    const rootMeanSquareError = Math.sqrt(sum / length);

    return Math.max(0, 1 - rootMeanSquareError);
  }

  private calculateVariance(fingerprint: number[]): number {
    if (!fingerprint.length) {
      return 0;
    }

    const mean = fingerprint.reduce((sum, value) => sum + value, 0) / fingerprint.length;

    return (
      fingerprint.reduce((sum, value) => {
        const difference = value - mean;

        return sum + difference * difference;
      }, 0) / fingerprint.length
    );
  }

  private serializePreprocess(preprocess: CrewForgeImagePreprocessConfig): string {
    return [
      preprocess.fingerprintSize,
      preprocess.contrast,
      preprocess.brightness,
      preprocess.grayscale ? '1' : '0',
      preprocess.invert ? '1' : '0',
      preprocess.blurRadius,
      preprocess.matchThreshold,
      preprocess.emptyVarianceThreshold,
    ].join('|');
  }

  private async readBlobAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Unable to read image data.'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read image data.'));
      reader.readAsDataURL(blob);
    });
  }

  private async measureImage(imageSource: string): Promise<{ width: number; height: number }> {
    const image = await this.loadImageElement(imageSource);

    return {
      width: image.width,
      height: image.height,
    };
  }

  private loadImageElement(imageSource: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load image from ${imageSource}.`));
      image.src = imageSource;
    });
  }
}
