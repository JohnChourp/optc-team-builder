import { Component, type OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  constructOutline,
  imagesOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  MAX_AUTO_BUILD_RANKED_RESULT_COUNT,
  type AutoBuildAbilityCoverageBreakdownItem,
  type AutoBuildRankedResult,
} from '../../core/models/auto-team-builder.models';
import {
  type CharacterListItem,
  type CrewForgeImageRecognitionCandidate,
  type CrewForgeImageProfile,
  type CrewForgeImageRecognitionResult,
  type CrewForgeImageRecognitionSlotResult,
} from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { AutoTeamBuilderService } from '../../core/services/auto-team-builder.service';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { CrewForgeImageImportService } from '../../core/services/crew-forge-image-import.service';
import { UserStateService } from '../../core/services/user-state.service';
import { CharacterImagePickerComponent } from '../../shared/character-image-picker/character-image-picker.component';
import { CrewForgeStylePanelsComponent } from './crew-forge-style-panels.component';

const MINIMUM_RECOGNIZED_ROSTER_COUNT = 5;
const RESULT_PAGE_SIZE = 10;

type RecognitionPreviewCandidateView = {
  candidate: CrewForgeImageRecognitionCandidate;
  character: CharacterListItem;
};

type RecognitionPreviewSlotView = {
  slot: CrewForgeImageRecognitionSlotResult;
  character: CharacterListItem | null;
  candidates: RecognitionPreviewCandidateView[];
};

@Component({
  selector: 'app-crew-forge-page',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
    CharacterImagePickerComponent,
    CrewForgeStylePanelsComponent,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './crew-forge.page.html',
  styleUrl: './crew-forge.page.scss',
})
export class CrewForgePage implements OnInit {
  public readonly sparklesIcon = sparklesOutline;
  public readonly forgeIcon = constructOutline;
  public readonly coverageIcon = shieldHalfOutline;
  public readonly imageImportIcon = imagesOutline;

  public readonly building = signal(false);
  public readonly results = signal<AutoBuildRankedResult[]>([]);
  public readonly visibleResultCount = signal(RESULT_PAGE_SIZE);
  public readonly errorMessage = signal('');
  public readonly imageImportLoading = signal(false);
  public readonly imageImportProcessing = signal(false);
  public readonly imageImportErrorMessage = signal('');
  public readonly imageImportDataUrl = signal<string | null>(null);
  public readonly imageImportFilename = signal('');
  public readonly imageImportWidth = signal<number | null>(null);
  public readonly imageImportHeight = signal<number | null>(null);
  public readonly selectedImageProfileId = signal<string | null>(null);
  public readonly imageImportRecognition = signal<CrewForgeImageRecognitionResult | null>(null);
  public readonly activeRecognitionSlotKey = signal<string | null>(null);
  public readonly recognitionPickerOpen = signal(false);

  public readonly crewForgeImageProfiles;
  public readonly crewForgeLastImageProfileId;

  public readonly recognizedRosterCharacterIds = computed(() => [
    ...new Set(
      (this.imageImportRecognition()?.slots ?? [])
        .map((slot) => slot.characterId)
        .filter((characterId): characterId is number => typeof characterId === 'number'),
    ),
  ]);
  public readonly recognizedRosterCount = computed(
    () => this.recognizedRosterCharacterIds().length,
  );
  public readonly buildReady = computed(
    () => this.recognizedRosterCount() >= MINIMUM_RECOGNIZED_ROSTER_COUNT,
  );
  public readonly visibleResults = computed(() =>
    this.results().slice(0, this.visibleResultCount()),
  );
  public readonly hasMoreResults = computed(
    () => this.visibleResultCount() < this.results().length,
  );
  public readonly emptyStateVisible = computed(
    () => !this.building() && !this.results().length && this.errorMessage().length === 0,
  );
  public readonly noResultStateVisible = computed(
    () => !this.building() && !this.results().length && this.errorMessage().length > 0,
  );
  public readonly selectedImageProfile = computed<CrewForgeImageProfile | null>(() => {
    const profileId = this.selectedImageProfileId();

    if (!profileId) {
      return null;
    }

    return this.crewForgeImageProfiles().find((profile) => profile.id === profileId) ?? null;
  });
  public readonly imageImportDimensionLabel = computed(() => {
    const imageWidth = this.imageImportWidth();
    const imageHeight = this.imageImportHeight();

    return imageWidth && imageHeight ? `${imageWidth} × ${imageHeight}` : '';
  });
  public readonly recognitionPreviewSlots = computed<RecognitionPreviewSlotView[]>(() =>
    (this.imageImportRecognition()?.slots ?? []).map((slot) => ({
      slot,
      character: this.resolveCharacter(slot.characterId),
      candidates: slot.candidates
        .map((candidate) => ({
          candidate,
          character: this.resolveCharacter(candidate.characterId),
        }))
        .filter(
          (
            candidate,
          ): candidate is {
            candidate: NonNullable<(typeof slot.candidates)[number]>;
            character: CharacterListItem;
          } => Boolean(candidate.character),
        ),
    })),
  );

  public constructor(
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
    private readonly crewForgeImageImport: CrewForgeImageImportService,
  ) {
    this.crewForgeImageProfiles = this.userState.crewForgeImageProfiles;
    this.crewForgeLastImageProfileId = this.userState.crewForgeLastImageProfileId;
  }

  public async ngOnInit(): Promise<void> {
    await Promise.all([
      this.userState.readyCrewForgeImageProfiles(),
      this.userState.readyAutoTeamBuilderWorkerPreference(),
    ]);
    await this.characterCatalogCache.ensureLoaded();
    this.selectedImageProfileId.set(this.crewForgeLastImageProfileId());
  }

  public openImageImportPicker(input: HTMLInputElement): void {
    if (this.imageImportLoading() || this.imageImportProcessing()) {
      return;
    }

    input.click();
  }

  public async onImageImportSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0] ?? null;

    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.imageImportErrorMessage.set(this.t('imageImport.errors.invalidType'));
      return;
    }

    this.imageImportLoading.set(true);
    this.imageImportErrorMessage.set('');
    this.imageImportRecognition.set(null);
    this.results.set([]);
    this.errorMessage.set('');
    this.visibleResultCount.set(RESULT_PAGE_SIZE);

    try {
      const loadedImage = await this.crewForgeImageImport.loadImageFile(file);
      const matchedProfile = this.crewForgeImageImport.resolveProfile(
        this.crewForgeImageProfiles(),
        loadedImage.width,
        loadedImage.height,
        this.selectedImageProfileId() ?? this.crewForgeLastImageProfileId(),
      );

      this.imageImportDataUrl.set(loadedImage.dataUrl);
      this.imageImportFilename.set(loadedImage.name);
      this.imageImportWidth.set(loadedImage.width);
      this.imageImportHeight.set(loadedImage.height);

      if (!matchedProfile) {
        this.selectedImageProfileId.set(null);
        this.imageImportErrorMessage.set(
          this.t('imageImport.errors.noProfileForDimensions', {
            width: loadedImage.width,
            height: loadedImage.height,
          }),
        );
        return;
      }

      this.selectedImageProfileId.set(matchedProfile.id);
      await this.userState.setCrewForgeLastImageProfileId(matchedProfile.id);
      await this.runImageRecognition();
    } catch {
      this.imageImportErrorMessage.set(this.t('imageImport.errors.loadFailed'));
    } finally {
      this.imageImportLoading.set(false);
    }
  }

  public async runImageRecognition(): Promise<void> {
    const selectedProfile = this.selectedImageProfile();
    const imageDataUrl = this.imageImportDataUrl();
    const imageWidth = this.imageImportWidth();
    const imageHeight = this.imageImportHeight();

    if (!selectedProfile || !imageDataUrl || !imageWidth || !imageHeight) {
      return;
    }

    this.imageImportProcessing.set(true);
    this.imageImportErrorMessage.set('');
    this.results.set([]);
    this.errorMessage.set('');

    try {
      const recognitionResult = await this.crewForgeImageImport.recognizeImage(
        imageDataUrl,
        imageWidth,
        imageHeight,
        selectedProfile,
        this.characterCatalogCache.catalog(),
      );
      const normalizedRecognitionResult = this.applyDefaultRecognitionSelections(recognitionResult);

      this.imageImportRecognition.set(normalizedRecognitionResult);

      if (recognitionResult.reason !== 'matched') {
        this.imageImportErrorMessage.set(
          recognitionResult.reason === 'dimension_mismatch'
            ? this.t('imageImport.errors.profileMismatch')
            : this.t('imageImport.errors.noProfile'),
        );
      }
    } catch {
      this.imageImportRecognition.set(null);
      this.imageImportErrorMessage.set(this.t('imageImport.errors.recognitionFailed'));
    } finally {
      this.imageImportProcessing.set(false);
    }
  }

  public openRecognitionPicker(slotKey: string): void {
    this.activeRecognitionSlotKey.set(slotKey);
    this.recognitionPickerOpen.set(true);
  }

  public isRecognitionCandidateSelected(
    slot: CrewForgeImageRecognitionSlotResult,
    characterId: number,
  ): boolean {
    return slot.characterId === characterId;
  }

  public isRecognitionPickerSelected(item: RecognitionPreviewSlotView): boolean {
    if (!item.slot.manuallyEdited || typeof item.slot.characterId !== 'number') {
      return false;
    }

    return !item.candidates.some(({ character }) => character.id === item.slot.characterId);
  }

  public closeRecognitionPicker(): void {
    this.activeRecognitionSlotKey.set(null);
    this.recognitionPickerOpen.set(false);
  }

  public applyRecognitionCandidate(
    slotKey: string,
    characterId: number | null,
    confidence = 1,
  ): void {
    const currentRecognition = this.imageImportRecognition();

    if (!currentRecognition) {
      return;
    }

    this.imageImportRecognition.set(
      this.crewForgeImageImport.applyManualSelection(
        currentRecognition,
        slotKey,
        characterId,
        confidence,
      ),
    );
    this.results.set([]);
    this.errorMessage.set('');
    this.visibleResultCount.set(RESULT_PAGE_SIZE);
  }

  public applyRecognitionCharacterSelection(character: CharacterListItem): void {
    const activeSlotKey = this.activeRecognitionSlotKey();

    if (!activeSlotKey) {
      return;
    }

    this.applyRecognitionCandidate(activeSlotKey, character.id, 1);
    this.closeRecognitionPicker();
  }

  public async buildTeams(): Promise<void> {
    if (!this.buildReady() || this.building()) {
      return;
    }

    this.building.set(true);
    this.results.set([]);
    this.errorMessage.set('');
    this.visibleResultCount.set(RESULT_PAGE_SIZE);

    try {
      const result = await this.autoTeamBuilder.buildRankedTeamsFromRoster(
        {
          rosterCharacterIds: this.recognizedRosterCharacterIds(),
          captainCharacterId: null,
          friendCaptainCharacterId: null,
          resultLimit: MAX_AUTO_BUILD_RANKED_RESULT_COUNT,
          requireUniqueBaseCharacterNames: true,
        },
        {
          workerCount: this.userState.resolveAutoTeamBuilderWorkerCount(),
        },
      );

      this.results.set(result.results);

      if (!result.results.length) {
        this.errorMessage.set(this.t('results.empty'));
      }
    } finally {
      this.building.set(false);
    }
  }

  public loadMoreResults(): void {
    if (!this.hasMoreResults()) {
      return;
    }

    this.visibleResultCount.update((current) =>
      Math.min(current + RESULT_PAGE_SIZE, this.results().length),
    );
  }

  public getCharacterDetailLink(
    character: Pick<CharacterListItem, 'id'> | null | undefined,
  ): string[] | null {
    return character ? ['/characters', character.id.toString()] : null;
  }

  public resultCoverageSummary(result: AutoBuildRankedResult): string {
    return this.t('results.coverageSummary', {
      utility: result.ranking.utilityCoverageCount,
      burst: result.ranking.burstCoverageCount,
      consistency: result.ranking.consistencyCoverageCount,
    });
  }

  public abilityLabels(abilities: AutoBuildAbilityCoverageBreakdownItem[], limit = 8): string[] {
    return abilities
      .slice(0, limit)
      .map((ability) => (ability.count > 1 ? `${ability.label} ×${ability.count}` : ability.label));
  }

  private resolveCharacter(characterId: number | null): CharacterListItem | null {
    if (!characterId) {
      return null;
    }

    return this.characterCatalogCache.getCharactersByIds([characterId])[0] ?? null;
  }

  private applyDefaultRecognitionSelections(
    result: CrewForgeImageRecognitionResult,
  ): CrewForgeImageRecognitionResult {
    return {
      ...result,
      slots: result.slots.map((slot) => {
        if (typeof slot.characterId === 'number' || slot.candidates.length === 0) {
          return slot;
        }

        const defaultCandidate = slot.candidates[0];

        return defaultCandidate
          ? {
              ...slot,
              characterId: defaultCandidate.characterId,
              confidence: defaultCandidate.confidence,
            }
          : slot;
      }),
    };
  }

  private t(key: string, params?: Record<string, number | string>): string {
    return this.i18n.translate(key, params, 'crew-forge');
  }
}
