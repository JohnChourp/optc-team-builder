import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  addOutline,
  closeOutline,
  constructOutline,
  imagesOutline,
  peopleOutline,
  searchOutline,
  settingsOutline,
  shieldHalfOutline,
  sparklesOutline,
  starOutline,
  trashOutline,
} from 'ionicons/icons';

import {
  MAX_AUTO_BUILD_RANKED_RESULT_COUNT,
  type AutoBuildAbilityCoverageBreakdownItem,
  type AutoBuildRankedResult,
} from '../../core/models/auto-team-builder.models';
import {
  CREW_FORGE_IMAGE_SLOT_BLUEPRINTS,
  type CharacterBox,
  type CharacterListItem,
  type CrewForgeImagePreprocessConfig,
  type CrewForgeImageProfile,
  type CrewForgeImageRecognitionResult,
  type DatasetManifest,
} from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { AutoTeamBuilderService } from '../../core/services/auto-team-builder.service';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { CrewForgeImageImportService } from '../../core/services/crew-forge-image-import.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { CharacterImagePickerComponent } from '../../shared/character-image-picker/character-image-picker.component';

const CATALOG_PAGE_SIZE = 24;
const RESULT_PAGE_SIZE = 10;

interface CrewForgeImageProfileDraft {
  id: string | null;
  name: string;
  imageWidth: number;
  imageHeight: number;
  slotDefinitions: CrewForgeImageProfile['slotDefinitions'];
  preprocess: CrewForgeImagePreprocessConfig;
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
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToggle,
    IonToolbar,
    CharacterImagePickerComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './crew-forge.page.html',
  styleUrl: './crew-forge.page.scss',
})
export class CrewForgePage implements OnInit {
  public readonly sparklesIcon = sparklesOutline;
  public readonly forgeIcon = constructOutline;
  public readonly searchIcon = searchOutline;
  public readonly rosterIcon = peopleOutline;
  public readonly coverageIcon = shieldHalfOutline;
  public readonly addIcon = addOutline;
  public readonly closeIcon = closeOutline;
  public readonly favoriteIcon = starOutline;
  public readonly imageImportIcon = imagesOutline;
  public readonly imageImportManageIcon = settingsOutline;
  public readonly imageImportDeleteIcon = trashOutline;

  public readonly manifest = signal<DatasetManifest | null>(null);
  public readonly catalogCharacters = signal<CharacterListItem[]>([]);
  public readonly catalogLoading = signal(false);
  public readonly catalogLoadingMore = signal(false);
  public readonly catalogHasMore = signal(true);
  public readonly searchTerm = signal('');
  public readonly selectedTypeFilter = signal('');
  public readonly selectedClassFilter = signal('');
  public readonly favoritesOnly = signal(false);
  public readonly selectedCharacterBoxId = signal<string | null>(null);
  public readonly captainCharacterId = signal<number | null>(null);
  public readonly friendCaptainCharacterId = signal<number | null>(null);
  public readonly poolCharacterIds = signal<number[]>([]);
  public readonly building = signal(false);
  public readonly results = signal<AutoBuildRankedResult[]>([]);
  public readonly visibleResultCount = signal(RESULT_PAGE_SIZE);
  public readonly errorMessage = signal('');
  public readonly imageImportLoading = signal(false);
  public readonly imageImportProcessing = signal(false);
  public readonly imageImportApplying = signal(false);
  public readonly imageImportErrorMessage = signal('');
  public readonly imageImportDataUrl = signal<string | null>(null);
  public readonly imageImportFilename = signal('');
  public readonly imageImportWidth = signal<number | null>(null);
  public readonly imageImportHeight = signal<number | null>(null);
  public readonly selectedImageProfileId = signal<string | null>(null);
  public readonly imageImportRecognition = signal<CrewForgeImageRecognitionResult | null>(null);
  public readonly profileEditorVisible = signal(false);
  public readonly profileDraft = signal<CrewForgeImageProfileDraft>({
    id: null,
    name: '',
    imageWidth: 0,
    imageHeight: 0,
    slotDefinitions: CREW_FORGE_IMAGE_SLOT_BLUEPRINTS.map((slot) => ({
      key: slot.key,
      label: slot.label,
      role: slot.role,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    })),
    preprocess: {
      fingerprintSize: 16,
      contrast: 1,
      brightness: 0,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold: 0.92,
      emptyVarianceThreshold: 0.005,
    },
  });
  public readonly saveImageCorrectionsToProfile = signal(true);
  public readonly activeRecognitionSlotKey = signal<string | null>(null);
  public readonly recognitionPickerOpen = signal(false);

  public readonly favoriteCharacterIds;
  public readonly characterBoxes;
  public readonly crewForgeImageProfiles;
  public readonly crewForgeLastImageProfileId;

  public readonly availableTypes = computed(() => this.manifest()?.availableTypes ?? []);
  public readonly availableClasses = computed(() => this.manifest()?.availableClasses ?? []);
  public readonly selectedBox = computed<CharacterBox | null>(() => {
    const selectedBoxId = this.selectedCharacterBoxId();

    if (!selectedBoxId) {
      return null;
    }

    return this.characterBoxes().find((box) => box.id === selectedBoxId) ?? null;
  });
  public readonly rosterCharacterIds = computed(() =>
    [
      ...new Set(
        [this.captainCharacterId(), this.friendCaptainCharacterId(), ...this.poolCharacterIds()].filter(
          (characterId): characterId is number => typeof characterId === 'number',
        ),
      ),
    ],
  );
  public readonly minimumRosterCount = computed(() => {
    const captainCharacterId = this.captainCharacterId();
    const friendCaptainCharacterId = this.friendCaptainCharacterId();

    return captainCharacterId && friendCaptainCharacterId && captainCharacterId !== friendCaptainCharacterId
      ? 6
      : 5;
  });
  public readonly selectedCaptain = computed(() =>
    this.resolveCharacter(this.captainCharacterId()),
  );
  public readonly selectedFriendCaptain = computed(() =>
    this.resolveCharacter(this.friendCaptainCharacterId()),
  );
  public readonly selectedPoolCharacters = computed(() =>
    this.resolveCharacters(this.poolCharacterIds()),
  );
  public readonly buildReady = computed(
    () => this.rosterCharacterIds().length >= this.minimumRosterCount(),
  );
  public readonly visibleResults = computed(() =>
    this.results().slice(0, this.visibleResultCount()),
  );
  public readonly hasMoreResults = computed(
    () => this.visibleResultCount() < this.results().length,
  );
  public readonly rosterSummaryLabel = computed(() =>
    this.t('roster.summary', {
      count: this.rosterCharacterIds().length,
      pool: this.poolCharacterIds().length,
    }),
  );
  public readonly emptyStateVisible = computed(
    () =>
      !this.building() &&
      !this.results().length &&
      this.errorMessage().length === 0 &&
      this.rosterCharacterIds().length === 0,
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
  public readonly selectedImageProfileIsBuiltIn = computed(
    () => this.selectedImageProfile()?.source === 'built-in',
  );
  public readonly imageImportDimensionLabel = computed(() => {
    const imageWidth = this.imageImportWidth();
    const imageHeight = this.imageImportHeight();

    return imageWidth && imageHeight ? `${imageWidth} × ${imageHeight}` : '';
  });
  public readonly canRecognizeUploadedImage = computed(() => {
    const profile = this.selectedImageProfile();

    return Boolean(
      this.imageImportDataUrl() &&
        profile &&
        this.imageImportWidth() === profile.imageWidth &&
        this.imageImportHeight() === profile.imageHeight,
    );
  });
  public readonly recognitionPreviewSlots = computed(() =>
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
  public readonly recognizedPoolCount = computed(
    () =>
      new Set(
        (this.imageImportRecognition()?.slots ?? [])
          .map((slot) => slot.characterId)
          .filter((characterId): characterId is number => typeof characterId === 'number'),
      ).size,
  );

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
    private readonly crewForgeImageImport: CrewForgeImageImportService,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
    this.characterBoxes = this.userState.characterBoxes;
    this.crewForgeImageProfiles = this.userState.crewForgeImageProfiles;
    this.crewForgeLastImageProfileId = this.userState.crewForgeLastImageProfileId;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    this.catalogLoading.set(true);

    try {
      const [manifest] = await Promise.all([
        this.repository.getDatasetManifest(),
        this.characterCatalogCache.ensureLoaded(),
      ]);

      this.manifest.set(manifest);
      this.selectedImageProfileId.set(this.crewForgeLastImageProfileId());
      await this.refreshCatalog(true);
    } finally {
      this.catalogLoading.set(false);
    }
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
    await this.refreshCatalog(true);
  }

  public async onTypeChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedTypeFilter.set(typeof event.detail.value === 'string' ? event.detail.value : '');
    await this.refreshCatalog(true);
  }

  public async onClassChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedClassFilter.set(typeof event.detail.value === 'string' ? event.detail.value : '');
    await this.refreshCatalog(true);
  }

  public async onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    this.favoritesOnly.set(Boolean(event.detail.checked));
    await this.refreshCatalog(true);
  }

  public async onCharacterBoxChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = typeof event.detail.value === 'string' ? event.detail.value : '';
    this.selectedCharacterBoxId.set(nextValue || null);
    await this.refreshCatalog(true);
  }

  public async loadMoreCatalog(): Promise<void> {
    if (this.catalogLoading() || this.catalogLoadingMore() || !this.catalogHasMore()) {
      return;
    }

    await this.refreshCatalog(false);
  }

  public setCaptain(characterId: number): void {
    this.captainCharacterId.set(characterId);
    this.poolCharacterIds.update((current) => current.filter((id) => id !== characterId));
  }

  public setFriendCaptain(characterId: number): void {
    this.friendCaptainCharacterId.set(characterId);
    this.poolCharacterIds.update((current) => current.filter((id) => id !== characterId));
  }

  public clearCaptain(): void {
    this.captainCharacterId.set(null);
  }

  public clearFriendCaptain(): void {
    this.friendCaptainCharacterId.set(null);
  }

  public togglePoolCharacter(characterId: number): void {
    if (this.isLeader(characterId)) {
      return;
    }

    this.poolCharacterIds.update((current) =>
      current.includes(characterId)
        ? current.filter((id) => id !== characterId)
        : [...current, characterId],
    );
  }

  public removePoolCharacter(characterId: number): void {
    this.poolCharacterIds.update((current) => current.filter((id) => id !== characterId));
  }

  public clearPool(): void {
    this.poolCharacterIds.set([]);
  }

  public openImageImportPicker(input: HTMLInputElement): void {
    if (this.imageImportLoading() || this.imageImportProcessing() || this.imageImportApplying()) {
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

    try {
      const loadedImage = await this.crewForgeImageImport.loadImageFile(file);
      const matchedProfile = this.crewForgeImageImport.resolveExactProfile(
        this.crewForgeImageProfiles(),
        loadedImage.width,
        loadedImage.height,
        this.selectedImageProfileId() ?? this.crewForgeLastImageProfileId(),
      );

      this.imageImportDataUrl.set(loadedImage.dataUrl);
      this.imageImportFilename.set(loadedImage.name);
      this.imageImportWidth.set(loadedImage.width);
      this.imageImportHeight.set(loadedImage.height);
      this.profileDraft.set(this.createEmptyProfileDraft(loadedImage.width, loadedImage.height));

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

  public async onSelectedImageProfileChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const profileId = typeof event.detail.value === 'string' ? event.detail.value : '';
    const nextProfileId = profileId || null;

    this.selectedImageProfileId.set(nextProfileId);
    await this.userState.setCrewForgeLastImageProfileId(nextProfileId);
    this.imageImportRecognition.set(null);

    if (this.canRecognizeUploadedImage()) {
      await this.runImageRecognition();
    }
  }

  public openProfileEditorForCreate(): void {
    this.profileDraft.set(
      this.createEmptyProfileDraft(this.imageImportWidth() ?? 0, this.imageImportHeight() ?? 0),
    );
    this.profileEditorVisible.set(true);
  }

  public openProfileEditorForSelected(): void {
    const selectedProfile = this.selectedImageProfile();

    if (!selectedProfile) {
      this.openProfileEditorForCreate();
      return;
    }

    this.profileDraft.set(this.createDraftFromProfile(selectedProfile));
    this.profileEditorVisible.set(true);
  }

  public closeProfileEditor(): void {
    this.profileEditorVisible.set(false);
  }

  public updateProfileDraftName(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';

    this.profileDraft.update((draft) => ({
      ...draft,
      name: value,
    }));
  }

  public updateProfileDraftDimension(field: 'imageWidth' | 'imageHeight', event: Event): void {
    const rawValue = Number.parseInt((event.target as HTMLInputElement | null)?.value ?? '', 10);

    this.profileDraft.update((draft) => ({
      ...draft,
      [field]: Number.isInteger(rawValue) && rawValue > 0 ? rawValue : 0,
    }));
  }

  public updateProfileDraftPreprocess(
    field: keyof CrewForgeImagePreprocessConfig,
    event: Event,
  ): void {
    const target = event.target as HTMLInputElement | null;
    const nextValue =
      target?.type === 'checkbox'
        ? Boolean(target.checked)
        : Number.parseFloat(target?.value ?? '') || 0;

    this.profileDraft.update((draft) => ({
      ...draft,
      preprocess: {
        ...draft.preprocess,
        [field]: nextValue,
      },
    }));
  }

  public updateProfileDraftSlot(
    slotKey: string,
    field: 'x' | 'y' | 'width' | 'height',
    event: Event,
  ): void {
    const rawValue = Number.parseInt((event.target as HTMLInputElement | null)?.value ?? '', 10);

    this.profileDraft.update((draft) => ({
      ...draft,
      slotDefinitions: draft.slotDefinitions.map((slot) =>
        slot.key === slotKey
          ? {
              ...slot,
              [field]: Number.isInteger(rawValue) && rawValue >= 0 ? rawValue : 0,
            }
          : slot,
      ),
    }));
  }

  public async saveProfileDraft(): Promise<void> {
    const draft = this.profileDraft();
    const savedProfile = await this.userState.saveCrewForgeImageProfile({
      id: draft.id ?? undefined,
      name: draft.name,
      imageWidth: draft.imageWidth,
      imageHeight: draft.imageHeight,
      slotDefinitions: draft.slotDefinitions,
      preprocess: draft.preprocess,
      examples: this.selectedImageProfile()?.id === draft.id ? this.selectedImageProfile()?.examples ?? [] : [],
      exemplars:
        this.selectedImageProfile()?.id === draft.id ? this.selectedImageProfile()?.exemplars ?? [] : [],
    });

    if (!savedProfile) {
      this.imageImportErrorMessage.set(this.t('imageImport.errors.invalidProfile'));
      return;
    }

    this.selectedImageProfileId.set(savedProfile.id);
    this.profileEditorVisible.set(false);
    this.imageImportErrorMessage.set('');

    if (this.canRecognizeUploadedImage()) {
      await this.runImageRecognition();
    }
  }

  public async deleteSelectedProfile(): Promise<void> {
    const selectedProfile = this.selectedImageProfile();

    if (!selectedProfile || selectedProfile.source === 'built-in') {
      return;
    }

    await this.userState.deleteCrewForgeImageProfile(selectedProfile.id);
    this.selectedImageProfileId.set(this.crewForgeLastImageProfileId());
    this.imageImportRecognition.set(null);
  }

  public async saveCurrentImageAsExample(): Promise<void> {
    const selectedProfile = this.selectedImageProfile();
    const imageDataUrl = this.imageImportDataUrl();
    const imageWidth = this.imageImportWidth();
    const imageHeight = this.imageImportHeight();

    if (!selectedProfile || !imageDataUrl || !imageWidth || !imageHeight) {
      return;
    }

    const savedProfile = await this.userState.saveCrewForgeImageExample(selectedProfile.id, {
      name: this.imageImportFilename() || `${selectedProfile.name} example`,
      imageDataUrl,
      imageWidth,
      imageHeight,
    });

    if (savedProfile) {
      this.selectedImageProfileId.set(savedProfile.id);
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

    try {
      const recognitionResult = await this.crewForgeImageImport.recognizeImage(
        imageDataUrl,
        imageWidth,
        imageHeight,
        selectedProfile,
        this.characterCatalogCache.catalog(),
      );

      this.imageImportRecognition.set(recognitionResult);

      if (recognitionResult.reason !== 'matched') {
        this.imageImportErrorMessage.set(
          recognitionResult.reason === 'dimension_mismatch'
            ? this.t('imageImport.errors.profileMismatch')
            : this.t('imageImport.errors.noProfile'),
        );
      }
    } catch {
      this.imageImportErrorMessage.set(this.t('imageImport.errors.recognitionFailed'));
    } finally {
      this.imageImportProcessing.set(false);
    }
  }

  public openRecognitionPicker(slotKey: string): void {
    this.activeRecognitionSlotKey.set(slotKey);
    this.recognitionPickerOpen.set(true);
  }

  public closeRecognitionPicker(): void {
    this.activeRecognitionSlotKey.set(null);
    this.recognitionPickerOpen.set(false);
  }

  public applyRecognitionCandidate(slotKey: string, characterId: number | null, confidence = 1): void {
    const currentRecognition = this.imageImportRecognition();

    if (!currentRecognition) {
      return;
    }

    this.imageImportRecognition.set(
      this.crewForgeImageImport.applyManualSelection(currentRecognition, slotKey, characterId, confidence),
    );
  }

  public applyRecognitionCharacterSelection(character: CharacterListItem): void {
    const activeSlotKey = this.activeRecognitionSlotKey();

    if (!activeSlotKey) {
      return;
    }

    this.applyRecognitionCandidate(activeSlotKey, character.id, 1);
    this.closeRecognitionPicker();
  }

  public onSaveCorrectionsToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.saveImageCorrectionsToProfile.set(Boolean(event.detail.checked));
  }

  public async applyRecognizedPool(): Promise<void> {
    const recognitionResult = this.imageImportRecognition();
    const selectedProfile = this.selectedImageProfile();

    if (!recognitionResult) {
      return;
    }

    this.imageImportApplying.set(true);

    try {
      const captainCharacterId = this.captainCharacterId();
      const friendCaptainCharacterId = this.friendCaptainCharacterId();
      const detectedCharacterIds = [
        ...new Set(
          recognitionResult.slots
            .map((slot) => slot.characterId)
            .filter((characterId): characterId is number => typeof characterId === 'number'),
        ),
      ].filter(
        (characterId) => characterId !== captainCharacterId && characterId !== friendCaptainCharacterId,
      );

      this.poolCharacterIds.set(detectedCharacterIds);

      if (!selectedProfile || !this.saveImageCorrectionsToProfile()) {
        return;
      }

      let mutableProfile = selectedProfile;

      for (const slot of recognitionResult.slots) {
        const exemplar = await this.crewForgeImageImport.buildExemplarFromSlot(mutableProfile, slot);

        if (!exemplar) {
          continue;
        }

        const savedProfile = await this.userState.saveCrewForgeImageExemplar(mutableProfile.id, exemplar);

        if (savedProfile) {
          mutableProfile = savedProfile;
        }
      }

      if (mutableProfile.id !== selectedProfile.id) {
        this.selectedImageProfileId.set(mutableProfile.id);
      }
    } finally {
      this.imageImportApplying.set(false);
    }
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
          rosterCharacterIds: this.rosterCharacterIds(),
          captainCharacterId: this.captainCharacterId(),
          friendCaptainCharacterId: this.friendCaptainCharacterId(),
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

  public isInPool(characterId: number): boolean {
    return this.poolCharacterIds().includes(characterId);
  }

  public isLeader(characterId: number): boolean {
    return this.captainCharacterId() === characterId || this.friendCaptainCharacterId() === characterId;
  }

  public isCaptain(characterId: number): boolean {
    return this.captainCharacterId() === characterId;
  }

  public isFriendCaptain(characterId: number): boolean {
    return this.friendCaptainCharacterId() === characterId;
  }

  public resultCoverageSummary(result: AutoBuildRankedResult): string {
    return this.t('results.coverageSummary', {
      utility: result.ranking.utilityCoverageCount,
      burst: result.ranking.burstCoverageCount,
      consistency: result.ranking.consistencyCoverageCount,
    });
  }

  public abilityLabels(
    abilities: AutoBuildAbilityCoverageBreakdownItem[],
    limit = 8,
  ): string[] {
    return abilities.slice(0, limit).map((ability) =>
      ability.count > 1 ? `${ability.label} ×${ability.count}` : ability.label,
    );
  }

  private async refreshCatalog(reset: boolean): Promise<void> {
    if (reset) {
      this.catalogLoading.set(true);
    } else {
      this.catalogLoadingMore.set(true);
    }

    try {
      await this.characterCatalogCache.ensureLoaded();
      const nextOffset = reset ? 0 : this.catalogCharacters().length;
      const nextPage = this.characterCatalogCache.queryCharacters({
        searchTerm: this.searchTerm().trim(),
        typeFilter: this.selectedTypeFilter(),
        classFilter: this.selectedClassFilter(),
        allowedCharacterIds: this.resolveCatalogScopeIds() ?? undefined,
        limit: CATALOG_PAGE_SIZE,
        offset: nextOffset,
      });

      this.catalogCharacters.set(reset ? nextPage : [...this.catalogCharacters(), ...nextPage]);
      this.catalogHasMore.set(nextPage.length === CATALOG_PAGE_SIZE);
    } finally {
      if (reset) {
        this.catalogLoading.set(false);
      } else {
        this.catalogLoadingMore.set(false);
      }
    }
  }

  private resolveCatalogScopeIds(): number[] | null {
    const selectedBoxIds = this.selectedBox()?.characterIds ?? null;
    const favoriteIds = this.favoritesOnly() ? this.favoriteCharacterIds() : null;

    if (!selectedBoxIds && !favoriteIds) {
      return null;
    }

    if (selectedBoxIds && favoriteIds) {
      return selectedBoxIds.filter((characterId) => favoriteIds.includes(characterId));
    }

    return [...(selectedBoxIds ?? favoriteIds ?? [])];
  }

  private resolveCharacter(characterId: number | null): CharacterListItem | null {
    if (!characterId) {
      return null;
    }

    return this.characterCatalogCache.getCharactersByIds([characterId])[0] ?? null;
  }

  private resolveCharacters(characterIds: number[]): CharacterListItem[] {
    return this.characterCatalogCache.getCharactersByIds(characterIds);
  }

  private createEmptyProfileDraft(imageWidth = 0, imageHeight = 0): CrewForgeImageProfileDraft {
    const profileInput = this.crewForgeImageImport.createEmptyProfileInput(imageWidth, imageHeight);

    return {
      id: null,
      name: '',
      imageWidth: profileInput.imageWidth,
      imageHeight: profileInput.imageHeight,
      slotDefinitions: profileInput.slotDefinitions,
      preprocess: profileInput.preprocess,
    };
  }

  private createDraftFromProfile(profile: CrewForgeImageProfile): CrewForgeImageProfileDraft {
    return {
      id: profile.source === 'built-in' ? null : profile.id,
      name: profile.source === 'built-in' ? `${profile.name} Copy` : profile.name,
      imageWidth: profile.imageWidth,
      imageHeight: profile.imageHeight,
      slotDefinitions: profile.slotDefinitions.map((slot) => ({ ...slot })),
      preprocess: { ...profile.preprocess },
    };
  }

  public isBuiltInProfile(profile: CrewForgeImageProfile | null | undefined): boolean {
    return profile?.source === 'built-in';
  }

  private t(key: string, params?: Record<string, number | string>): string {
    return this.i18n.translate(key, params, 'crew-forge');
  }
}
