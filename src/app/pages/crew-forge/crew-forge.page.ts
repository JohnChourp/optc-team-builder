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
  peopleOutline,
  searchOutline,
  shieldHalfOutline,
  sparklesOutline,
  starOutline,
} from 'ionicons/icons';

import {
  MAX_AUTO_BUILD_RANKED_RESULT_COUNT,
  type AutoBuildAbilityCoverageBreakdownItem,
  type AutoBuildRankedResult,
} from '../../core/models/auto-team-builder.models';
import { type CharacterBox, type CharacterListItem, type DatasetManifest } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { AutoTeamBuilderService } from '../../core/services/auto-team-builder.service';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';

const CATALOG_PAGE_SIZE = 24;
const RESULT_PAGE_SIZE = 10;

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

  public readonly favoriteCharacterIds;
  public readonly characterBoxes;

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

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
    this.characterBoxes = this.userState.characterBoxes;
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

  private t(key: string, params?: Record<string, number | string>): string {
    return this.i18n.translate(key, params, 'crew-forge');
  }
}
