import { Injectable } from '@angular/core';

import {
  type CharacterBox,
  type CharacterListItem,
  type ShipRecord,
} from '../models/optc.models';
import { OptcbxImportService } from './optcbx-import.service';
import { OptcRepositoryService } from './optc-repository.service';
import { UserStateService } from './user-state.service';
import {
  buildInventoryCapturePayload,
  sanitizeInventoryCapturePayload,
  type InventoryCapturePayload,
} from '../../pages/settings/inventory-capture.utils';

interface TesseractRecognizeResult {
  data?: {
    text?: string | null;
  };
}

interface MatchCatalogEntry {
  id: number;
  kind: 'character' | 'ship';
  normalizedName: string;
  rawName: string;
}

interface CatalogCaches {
  characters: CharacterListItem[];
  charactersById: Map<number, CharacterListItem>;
  ships: ShipRecord[];
  shipsById: Map<number, ShipRecord>;
}

interface FuzzyMatchResult {
  entry: MatchCatalogEntry;
  score: number;
}

export interface InventoryCapturePreview {
  capturedAt: string;
  duplicateCharacterCount: number;
  duplicateShipCount: number;
  extractedText: string | null;
  fileName: string;
  invalidCharacterCount: number;
  invalidShipCount: number;
  matchedCharacters: CharacterListItem[];
  matchedShips: ShipRecord[];
  payload: InventoryCapturePayload;
  sourceKind: 'optcbx-json' | 'screenshot';
  suggestedBoxName: string;
}

export interface InventoryCaptureApplyOptions {
  boxName: string;
  boxSelection: string | 'new';
}

export interface InventoryCaptureApplySummary {
  addedShipCount: number;
  alreadyFavoritedShipCount: number;
  alreadyInBoxCount: number;
  boxAction: 'created' | 'skipped' | 'updated';
  boxName: string | null;
  matchedCharacterCount: number;
  matchedShipCount: number;
  unmatchedCount: number;
}

const OCR_WORD_MIN_LENGTH = 3;
const FUZZY_MATCH_THRESHOLD = 0.88;
const FUZZY_MATCH_DELTA = 0.03;
@Injectable({ providedIn: 'root' })
export class InventoryCaptureImportService {
  private catalogPromise: Promise<CatalogCaches> | null = null;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly optcbxImport: OptcbxImportService,
    private readonly userState: UserStateService,
  ) {}

  public async buildPreviewFromOptcbxFile(file: File): Promise<InventoryCapturePreview> {
    const rawContent = await file.text();
    const parsedImport = this.optcbxImport.parseExport(rawContent);
    const catalogs = await this.getCatalogs();
    const matchedCharacters = await this.repository.getCharactersByIds(parsedImport.importedNumbers);
    const matchedIdSet = new Set(matchedCharacters.map((character) => character.id));
    const unmatchedEntries = parsedImport.importedNumbers
      .filter((characterId) => !matchedIdSet.has(characterId))
      .map((characterId) => String(characterId));
    const sanitized = sanitizeInventoryCapturePayload(
      buildInventoryCapturePayload(
        {
          characterIds: matchedCharacters.map((character) => character.id),
          shipIds: [],
          unmatchedEntries,
        },
        new Date().toISOString(),
      ),
    );

    return {
      capturedAt: sanitized.payload.capturedAt,
      duplicateCharacterCount: parsedImport.duplicatesRemoved + sanitized.duplicateCharacterCount,
      duplicateShipCount: sanitized.duplicateShipCount,
      extractedText: null,
      fileName: file.name,
      invalidCharacterCount: sanitized.invalidCharacterCount,
      invalidShipCount: sanitized.invalidShipCount,
      matchedCharacters: sanitized.payload.characterIds
        .map((characterId) => catalogs.charactersById.get(characterId) ?? null)
        .filter((character): character is CharacterListItem => Boolean(character)),
      matchedShips: [],
      payload: sanitized.payload,
      sourceKind: 'optcbx-json',
      suggestedBoxName: this.buildSuggestedBoxName(file.name, 'Imported OPTCbx Box'),
    };
  }

  public async buildPreviewFromScreenshotFile(file: File): Promise<InventoryCapturePreview> {
    const catalogs = await this.getCatalogs();
    const extractedText = await this.extractTextFromImage(file);
    const normalizedEntries = this.extractCandidateEntries(extractedText);
    const characterIds = new Set<number>();
    const shipIds = new Set<number>();
    const unmatchedEntries: string[] = [];

    normalizedEntries.forEach((entry) => {
      const entryIds = this.extractNumericIds(entry);
      let matchedThisEntry = false;

      entryIds.forEach((id) => {
        if (catalogs.charactersById.has(id)) {
          characterIds.add(id);
          matchedThisEntry = true;
        }

        if (catalogs.shipsById.has(id)) {
          shipIds.add(id);
          matchedThisEntry = true;
        }
      });

      const fuzzyMatch = this.findBestCatalogMatch(entry, catalogs);

      if (fuzzyMatch) {
        if (fuzzyMatch.entry.kind === 'character') {
          characterIds.add(fuzzyMatch.entry.id);
        } else {
          shipIds.add(fuzzyMatch.entry.id);
        }

        matchedThisEntry = true;
      }

      if (!matchedThisEntry) {
        unmatchedEntries.push(entry);
      }
    });

    const sanitized = sanitizeInventoryCapturePayload(
      buildInventoryCapturePayload(
        {
          characterIds: [...characterIds],
          shipIds: [...shipIds],
          unmatchedEntries,
        },
        new Date().toISOString(),
      ),
    );

    return {
      capturedAt: sanitized.payload.capturedAt,
      duplicateCharacterCount: sanitized.duplicateCharacterCount,
      duplicateShipCount: sanitized.duplicateShipCount,
      extractedText,
      fileName: file.name,
      invalidCharacterCount: sanitized.invalidCharacterCount,
      invalidShipCount: sanitized.invalidShipCount,
      matchedCharacters: sanitized.payload.characterIds
        .map((characterId) => catalogs.charactersById.get(characterId) ?? null)
        .filter((character): character is CharacterListItem => Boolean(character)),
      matchedShips: sanitized.payload.shipIds
        .map((shipId) => catalogs.shipsById.get(shipId) ?? null)
        .filter((ship): ship is ShipRecord => Boolean(ship)),
      payload: sanitized.payload,
      sourceKind: 'screenshot',
      suggestedBoxName: this.buildSuggestedBoxName(file.name, 'Screenshot Import Box'),
    };
  }

  public async applyPreview(
    preview: InventoryCapturePreview,
    options: InventoryCaptureApplyOptions,
  ): Promise<InventoryCaptureApplySummary> {
    await this.userState.ready();

    const currentFavoriteShipIds = this.userState.favoriteShipIds();
    const importedShipIds = preview.payload.shipIds;
    const mergedShipIds = this.mergeShipIds(importedShipIds, currentFavoriteShipIds);
    const alreadyFavoritedShipCount = importedShipIds.filter((shipId) =>
      currentFavoriteShipIds.includes(shipId),
    ).length;

    if (mergedShipIds.length !== currentFavoriteShipIds.length) {
      await this.userState.setFavoriteShipIds(mergedShipIds);
    }

    const boxResult = await this.applyCharacterBoxPreview(preview, options);

    return {
      addedShipCount: importedShipIds.length - alreadyFavoritedShipCount,
      alreadyFavoritedShipCount,
      alreadyInBoxCount: boxResult.alreadyInBoxCount,
      boxAction: boxResult.action,
      boxName: boxResult.name,
      matchedCharacterCount: preview.payload.characterIds.length,
      matchedShipCount: importedShipIds.length,
      unmatchedCount: preview.payload.unmatchedEntries.length,
    };
  }

  private async applyCharacterBoxPreview(
    preview: InventoryCapturePreview,
    options: InventoryCaptureApplyOptions,
  ): Promise<{ action: 'created' | 'skipped' | 'updated'; alreadyInBoxCount: number; name: string | null }> {
    if (!preview.payload.characterIds.length) {
      return {
        action: 'skipped',
        alreadyInBoxCount: 0,
        name: null,
      };
    }

    const normalizedBoxName = options.boxName.trim() || preview.suggestedBoxName;

    if (options.boxSelection !== 'new') {
      const existingBox = this.userState.getCharacterBoxById(options.boxSelection);

      if (existingBox) {
        const existingIds = new Set(existingBox.characterIds);
        const mergedCharacterIds = [
          ...existingBox.characterIds,
          ...preview.payload.characterIds.filter((characterId) => !existingIds.has(characterId)),
        ];

        await this.userState.saveCharacterBox({
          id: existingBox.id,
          name: existingBox.name,
          characterIds: mergedCharacterIds,
        });

        return {
          action: 'updated',
          alreadyInBoxCount: preview.payload.characterIds.filter((characterId) =>
            existingIds.has(characterId),
          ).length,
          name: existingBox.name,
        };
      }
    }

    await this.userState.saveCharacterBox({
      name: normalizedBoxName,
      characterIds: preview.payload.characterIds,
    });

    return {
      action: 'created',
      alreadyInBoxCount: 0,
      name: normalizedBoxName,
    };
  }

  private mergeShipIds(importedShipIds: number[], currentFavoriteShipIds: number[]): number[] {
    const nextFavoriteShipIds: number[] = [];
    const seenShipIds = new Set<number>();

    [...importedShipIds, ...currentFavoriteShipIds].forEach((shipId) => {
      if (!Number.isInteger(shipId) || shipId <= 0 || seenShipIds.has(shipId)) {
        return;
      }

      seenShipIds.add(shipId);
      nextFavoriteShipIds.push(shipId);
    });

    return nextFavoriteShipIds;
  }

  private async getCatalogs(): Promise<CatalogCaches> {
    this.catalogPromise ??= Promise.all([
      this.repository.getAllCharacters(),
      this.repository.getShips(),
    ]).then(([characters, ships]) => ({
      characters,
      charactersById: new Map(characters.map((character) => [character.id, character] as const)),
      ships,
      shipsById: new Map(ships.map((ship) => [ship.id, ship] as const)),
    }));

    return this.catalogPromise;
  }

  private async extractTextFromImage(file: File): Promise<string> {
    const tesseractModule = (await import('tesseract.js')) as {
      recognize: (
        image: File,
        langs?: string,
        options?: {
          logger?: (message: unknown) => void;
        },
      ) => Promise<TesseractRecognizeResult>;
    };
    const result = await tesseractModule.recognize(file, 'eng', {
      logger: () => undefined,
    });

    return result.data?.text?.trim() ?? '';
  }

  private extractCandidateEntries(extractedText: string): string[] {
    const rawEntries = extractedText
      .split(/\r?\n/)
      .map((entry) => entry.replace(/\s+/g, ' ').trim())
      .filter((entry) => entry.length > 0);
    const seen = new Set<string>();
    const entries: string[] = [];

    rawEntries.forEach((entry) => {
      const normalizedEntry = this.normalizeMatchText(entry);

      if (
        normalizedEntry.length < OCR_WORD_MIN_LENGTH &&
        this.extractNumericIds(entry).length === 0
      ) {
        return;
      }

      if (seen.has(normalizedEntry)) {
        return;
      }

      seen.add(normalizedEntry);
      entries.push(entry);
    });

    return entries;
  }

  private extractNumericIds(value: string): number[] {
    return [...value.matchAll(/\b\d{3,6}\b/g)]
      .map((match) => Number(match[0]))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private findBestCatalogMatch(entry: string, catalogs: CatalogCaches): FuzzyMatchResult | null {
    const normalizedEntry = this.normalizeMatchText(entry);

    if (normalizedEntry.length < OCR_WORD_MIN_LENGTH) {
      return null;
    }

    const catalogEntries: MatchCatalogEntry[] = [
      ...catalogs.characters.map((character) => ({
        id: character.id,
        kind: 'character' as const,
        normalizedName: this.normalizeMatchText(character.name),
        rawName: character.name,
      })),
      ...catalogs.ships.map((ship) => ({
        id: ship.id,
        kind: 'ship' as const,
        normalizedName: this.normalizeMatchText(ship.name),
        rawName: ship.name,
      })),
    ];

    const candidates = catalogEntries
      .map((catalogEntry) => ({
        entry: catalogEntry,
        score: this.scoreFuzzyMatch(normalizedEntry, catalogEntry.normalizedName),
      }))
      .sort((left, right) => right.score - left.score);
    const best = candidates[0] ?? null;
    const secondBest = candidates[1] ?? null;

    if (!best || best.score < FUZZY_MATCH_THRESHOLD) {
      return null;
    }

    if (secondBest && best.score - secondBest.score < FUZZY_MATCH_DELTA) {
      return null;
    }

    return best;
  }

  private scoreFuzzyMatch(left: string, right: string): number {
    if (left === right) {
      return 1;
    }

    if (left.includes(right) || right.includes(left)) {
      const shorterLength = Math.min(left.length, right.length);

      return shorterLength >= 5 ? 0.95 - Math.abs(left.length - right.length) * 0.01 : 0.7;
    }

    const levenshteinScore = this.calculateLevenshteinScore(left, right);
    const tokenScore = this.calculateTokenOverlapScore(left, right);

    return Math.max(levenshteinScore, tokenScore);
  }

  private calculateTokenOverlapScore(left: string, right: string): number {
    const leftTokens = new Set(left.split(' ').filter((token) => token.length > 1));
    const rightTokens = new Set(right.split(' ').filter((token) => token.length > 1));

    if (!leftTokens.size || !rightTokens.size) {
      return 0;
    }

    let sharedTokenCount = 0;

    leftTokens.forEach((token) => {
      if (rightTokens.has(token)) {
        sharedTokenCount += 1;
      }
    });

    return sharedTokenCount / Math.max(leftTokens.size, rightTokens.size);
  }

  private calculateLevenshteinScore(left: string, right: string): number {
    const maxLength = Math.max(left.length, right.length);

    if (maxLength === 0) {
      return 1;
    }

    return 1 - this.calculateLevenshteinDistance(left, right) / maxLength;
  }

  private calculateLevenshteinDistance(left: string, right: string): number {
    const rows = Array.from({ length: left.length + 1 }, () =>
      new Array<number>(right.length + 1).fill(0),
    );

    for (let leftIndex = 0; leftIndex <= left.length; leftIndex += 1) {
      rows[leftIndex]![0] = leftIndex;
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      rows[0]![rightIndex] = rightIndex;
    }

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

        rows[leftIndex]![rightIndex] = Math.min(
          rows[leftIndex - 1]![rightIndex]! + 1,
          rows[leftIndex]![rightIndex - 1]! + 1,
          rows[leftIndex - 1]![rightIndex - 1]! + substitutionCost,
        );
      }
    }

    return rows[left.length]![right.length] ?? Math.max(left.length, right.length);
  }

  private normalizeMatchText(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private buildSuggestedBoxName(fileName: string, fallback: string): string {
    const fileStem = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();

    if (!fileStem.length) {
      return fallback;
    }

    return fileStem
      .split(' ')
      .filter((part) => part.length > 0)
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join(' ');
  }
}
