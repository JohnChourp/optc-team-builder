import { Component, type OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular';
import { IonButton } from '@ionic/angular/ion-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonMenuButton } from '@ionic/angular/ion-menu-button';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
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

/**
 * 869f12x41. A slot is worth reviewing when it holds something and the reader
 * has not yet said they are happy with it.
 *
 * `empty` and `no_profile` slots hold nothing to look at - `empty` means the
 * crop's variance was below the profile's threshold, so no comparison was even
 * made. Their confidence is 0 for that reason, not because the match is bad.
 */
function needsReview(item: RecognitionPreviewSlotView, reviewed: ReadonlySet<string>): boolean {
  if (reviewed.has(item.slot.slotKey)) {
    return false;
  }

  return item.slot.status === 'ambiguous' || item.slot.status === 'matched';
}

/** Lower sorts first. See `recognitionReviewSlots` for why this is not a plain confidence sort. */
function reviewRank(item: RecognitionPreviewSlotView, reviewed: ReadonlySet<string>): number {
  if (reviewed.has(item.slot.slotKey)) {
    return 3;
  }

  if (item.slot.status === 'ambiguous') {
    return 0;
  }

  if (item.slot.status === 'matched') {
    return 1;
  }

  return 2;
}

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
  /**
   * 869f12x41. Slot keys the reader has looked at and accepted.
   *
   * The import preview already showed the crop, the confidence, the top three
   * candidates and one-tap correction - what it could not do was tell a reader
   * WHICH of forty matches deserved their attention, or let them mark one as
   * dealt with. Without that they either trust everything or re-check
   * everything, which is why the confidence score existed and no surface used
   * it.
   *
   * Cleared whenever a new image is recognised, because the keys refer to that
   * recognition's slots and nothing else.
   */
  public readonly reviewedSlotKeys = signal<ReadonlySet<string>>(new Set());
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

  /**
   * The same preview cards, lowest confidence first, with everything already
   * dealt with pushed to the end.
   *
   * The order is deliberately not a plain confidence sort. An `empty` slot
   * scores 0 because nothing was compared - the crop was blank - so a pure
   * ascending sort would fill the top of the queue with the slots that need no
   * attention at all. Order of attention:
   *
   *   1. unreviewed slots the matcher could not resolve (`ambiguous`), worst
   *      confidence first - these are the ones most likely to be wrong;
   *   2. unreviewed matches, worst confidence first;
   *   3. slots with nothing in them;
   *   4. anything the reader has already confirmed.
   */
  public readonly recognitionReviewSlots = computed<RecognitionPreviewSlotView[]>(() => {
    const reviewed = this.reviewedSlotKeys();

    return [...this.recognitionPreviewSlots()].sort((left, right) => {
      const leftRank = reviewRank(left, reviewed);
      const rightRank = reviewRank(right, reviewed);

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (left.slot.confidence !== right.slot.confidence) {
        return left.slot.confidence - right.slot.confidence;
      }

      return left.slot.slotKey.localeCompare(right.slot.slotKey);
    });
  });

  /** Slots still worth a look: everything with a crop in it that is not yet confirmed. */
  public readonly recognitionPendingReviewCount = computed(
    () =>
      this.recognitionPreviewSlots().filter((item) => needsReview(item, this.reviewedSlotKeys()))
        .length,
  );

  public readonly recognitionReviewComplete = computed(
    () => Boolean(this.imageImportRecognition()) && this.recognitionPendingReviewCount() === 0,
  );

  /**
   * How many slots this import lost to the threshold, and what the threshold was.
   *
   * 869f13gay. `matchThreshold` lives on the image profile, it is stored per player, and it was
   * invisible: set too high it silently rejects correct matches, too low it accepts wrong ones,
   * and in BOTH cases the import simply looks worse with nothing pointing at the setting that
   * caused it.
   *
   * `ambiguous` is exactly the population that answers it - the matcher found a best candidate
   * and the threshold rejected it. `empty` is not, because nothing was compared at all, and a
   * count that mixed the two would blame the threshold for a blank crop.
   */
  public readonly thresholdExcludedCount = computed(
    () =>
      (this.imageImportRecognition()?.slots ?? []).filter((slot) => slot.status === 'ambiguous')
        .length,
  );

  public readonly activeMatchThreshold = computed(
    () => this.selectedImageProfile()?.preprocess.matchThreshold ?? null,
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
    this.reviewedSlotKeys.set(new Set());
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
      this.reviewedSlotKeys.set(new Set());

      if (recognitionResult.reason !== 'matched') {
        this.imageImportErrorMessage.set(
          recognitionResult.reason === 'dimension_mismatch'
            ? this.t('imageImport.errors.profileMismatch')
            : this.t('imageImport.errors.noProfile'),
        );
      }
    } catch {
      this.imageImportRecognition.set(null);
      this.reviewedSlotKeys.set(new Set());
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

  /** Accept a slot as it stands; it drops to the end of the queue. */
  public confirmRecognitionSlot(slotKey: string): void {
    this.reviewedSlotKeys.update((keys) => new Set([...keys, slotKey]));
  }

  public reopenRecognitionSlot(slotKey: string): void {
    this.reviewedSlotKeys.update((keys) => {
      const next = new Set(keys);

      next.delete(slotKey);

      return next;
    });
  }

  public isRecognitionSlotReviewed(slotKey: string): boolean {
    return this.reviewedSlotKeys().has(slotKey);
  }

  public confirmAllRecognitionSlots(): void {
    this.reviewedSlotKeys.set(
      new Set(this.recognitionPreviewSlots().map((item) => item.slot.slotKey)),
    );
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
    /*
     * Choosing a candidate IS reviewing the slot - the reader has just looked
     * at it and decided. Making them confirm afterwards would be asking twice.
     */
    this.confirmRecognitionSlot(slotKey);
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
