import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
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
  chevronDownOutline,
  chevronUpOutline,
  heart,
  heartOutline,
  layersOutline,
  searchOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  RUMBLE_BUFF_FOCUS_RANKS,
  type NormalizedRumbleRoleTag,
  type RumbleBuffFocusPreference,
  type RumbleBuffFocusRank,
  type RumbleBuffFocusStat,
} from '../../core/models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord, type DatasetManifest } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  canMoveRumbleBuffFocusStat,
  getRumbleBuffFocusStatsForRank,
  moveRumbleBuffFocusStat,
  type RumbleBuffFocusDirection,
} from '../../core/services/auto-team-builder-rumble-focus.utils';
import { AutoTeamBuilderRumbleService } from '../../core/services/auto-team-builder-rumble.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  rankRumbleCharacters,
  type RumbleCharacterRankedScore,
} from './rumble-characters-ranking.utils';

const PAGE_SIZE = 48;
const RUMBLE_ROLE_FILTERS: NormalizedRumbleRoleTag[] = [
  'attacker',
  'booster',
  'defender',
  'disruptor',
  'healer',
  'speed',
];

interface RumbleCharacterCardView {
  rankedScore: RumbleCharacterRankedScore;
  character: CharacterDetailRecord;
  detailLink: string[];
  isFavorite: boolean;
  favoriteAriaLabel: string;
}

@Component({
  selector: 'app-rumble-characters-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
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
  ],
  templateUrl: './rumble-characters.page.html',
  styleUrl: './rumble-characters.page.scss',
})
export class RumbleCharactersPage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly candidates = signal<RumbleCharacterRankedScore['unit'][]>([]);
  public readonly loading = signal(true);
  public readonly errorMessage = signal('');
  public readonly searchTerm = signal('');
  public readonly selectedType = signal('');
  public readonly selectedClass = signal('');
  public readonly favoritesOnly = signal(false);
  public readonly hideFavorites = signal(false);
  public readonly selectedRoles = signal<NormalizedRumbleRoleTag[]>([]);
  public readonly selectedRumbleType = signal('');
  public readonly maxCooldownInput = signal('');
  public readonly maxCostInput = signal('');
  public readonly visibleLimit = signal(PAGE_SIZE);
  public readonly buffFocus = signal<RumbleBuffFocusPreference[]>(
    DEFAULT_RUMBLE_BUFF_FOCUS.map((preference) => ({ ...preference })),
  );

  public readonly favoriteIds;
  public readonly availableRoles = RUMBLE_ROLE_FILTERS;
  public readonly buffFocusRanks = RUMBLE_BUFF_FOCUS_RANKS;

  public readonly searchIcon = searchOutline;
  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly shieldIcon = shieldHalfOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly promoteIcon = chevronUpOutline;
  public readonly demoteIcon = chevronDownOutline;

  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly availableRumbleTypes = computed(() =>
    this.normalizeOptions(
      this.candidates()
        .map((candidate) => candidate.normalized.rumbleType ?? '')
        .filter(Boolean),
    ),
  );
  public readonly maxCooldown = computed(() => this.normalizePositiveNumber(this.maxCooldownInput()));
  public readonly maxCost = computed(() => this.normalizePositiveNumber(this.maxCostInput()));
  public readonly rankedScores = computed(() =>
    rankRumbleCharacters(this.candidates(), this.buffFocus()),
  );
  public readonly filteredScores = computed(() =>
    this.rankedScores().filter((score) => this.matchesFilters(score)),
  );
  public readonly visibleScores = computed(() =>
    this.filteredScores().slice(0, this.visibleLimit()),
  );
  public readonly hasMore = computed(() => this.filteredScores().length > this.visibleLimit());
  public readonly cardViews = computed<RumbleCharacterCardView[]>(() =>
    this.visibleScores().map((rankedScore) => {
      const character = rankedScore.unit.character;
      const isFavorite = this.isFavorite(character.id);

      return {
        rankedScore,
        character,
        detailLink: ['/characters', character.id.toString()],
        isFavorite,
        favoriteAriaLabel: this.i18n.translate(
          isFavorite ? 'favorites.removeAria' : 'favorites.addAria',
          { name: character.name },
          'rumble-characters',
        ),
      };
    }),
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.favoriteIds().length
      ? this.i18n.translate(
          'filters.favoritesOnly.withCount',
          { count: this.favoriteIds().length },
          'rumble-characters',
        )
      : this.i18n.translate('filters.favoritesOnly.empty', undefined, 'rumble-characters'),
  );
  public readonly hideFavoritesSupportLabel = computed(() =>
    this.favoriteIds().length
      ? this.i18n.translate(
          'filters.hideFavorites.withCount',
          { count: this.favoriteIds().length },
          'rumble-characters',
        )
      : this.i18n.translate('filters.hideFavorites.empty', undefined, 'rumble-characters'),
  );

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly rumbleBuilder: AutoTeamBuilderRumbleService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await Promise.all([this.i18n.preloadScope('rumble-characters'), this.userState.ready()]);
      const [summary, candidates] = await Promise.all([
        this.repository.getDatasetManifest(),
        this.repository.getRumbleBuilderCandidates(),
      ]);

      this.summary.set(summary);
      this.candidates.set(this.rumbleBuilder.scoreCandidates(candidates));
    } catch (error) {
      this.errorMessage.set(this.resolveErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trim());
    this.resetVisiblePage();
  }

  public onTypeChange(event: CustomEvent<{ value?: string | null }>): void {
    this.selectedType.set(String(event.detail.value ?? '').trim());
    this.resetVisiblePage();
  }

  public onClassChange(event: CustomEvent<{ value?: string | null }>): void {
    this.selectedClass.set(String(event.detail.value ?? '').trim());
    this.resetVisiblePage();
  }

  public onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.favoritesOnly.set(event.detail.checked);

    if (event.detail.checked) {
      this.hideFavorites.set(false);
    }

    this.resetVisiblePage();
  }

  public onHideFavoritesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.hideFavorites.set(event.detail.checked);

    if (event.detail.checked) {
      this.favoritesOnly.set(false);
    }

    this.resetVisiblePage();
  }

  public onRolesChange(event: CustomEvent<{ value?: string[] | string | null }>): void {
    const values = Array.isArray(event.detail.value)
      ? event.detail.value
      : event.detail.value
        ? [event.detail.value]
        : [];
    const allowedRoles = new Set(RUMBLE_ROLE_FILTERS);

    this.selectedRoles.set(
      values.filter((value): value is NormalizedRumbleRoleTag =>
        allowedRoles.has(value as NormalizedRumbleRoleTag),
      ),
    );
    this.resetVisiblePage();
  }

  public onRumbleTypeChange(event: CustomEvent<{ value?: string | null }>): void {
    this.selectedRumbleType.set(String(event.detail.value ?? '').trim());
    this.resetVisiblePage();
  }

  public onMaxCooldownChange(event: CustomEvent<{ value?: string | number | null }>): void {
    this.maxCooldownInput.set(String(event.detail.value ?? '').trim());
    this.resetVisiblePage();
  }

  public onMaxCostChange(event: CustomEvent<{ value?: string | number | null }>): void {
    this.maxCostInput.set(String(event.detail.value ?? '').trim());
    this.resetVisiblePage();
  }

  public buffFocusLabelKey(rank: RumbleBuffFocusRank): string {
    return `filters.buffFocus.ranks.${rank}`;
  }

  public buffFocusStatsForRank(rank: RumbleBuffFocusRank): RumbleBuffFocusStat[] {
    return getRumbleBuffFocusStatsForRank(this.buffFocus(), rank);
  }

  public canMoveBuffFocusStat(
    stat: RumbleBuffFocusStat,
    direction: RumbleBuffFocusDirection,
  ): boolean {
    return canMoveRumbleBuffFocusStat(this.buffFocus(), stat, direction);
  }

  public moveBuffFocusStat(stat: RumbleBuffFocusStat, direction: RumbleBuffFocusDirection): void {
    this.buffFocus.update((currentFocus) => moveRumbleBuffFocusStat(currentFocus, stat, direction));
    this.resetVisiblePage();
  }

  public roleLabelKey(role: NormalizedRumbleRoleTag): string {
    return `roles.${role}`;
  }

  public loadMore(): void {
    this.visibleLimit.update((currentLimit) => currentLimit + PAGE_SIZE);
  }

  public async toggleFavorite(characterId: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.userState.toggleFavorite(characterId);
    this.resetVisiblePage();
  }

  public resetPage(): void {
    this.searchTerm.set('');
    this.selectedType.set('');
    this.selectedClass.set('');
    this.favoritesOnly.set(false);
    this.hideFavorites.set(false);
    this.selectedRoles.set([]);
    this.selectedRumbleType.set('');
    this.maxCooldownInput.set('');
    this.maxCostInput.set('');
    this.buffFocus.set(DEFAULT_RUMBLE_BUFF_FOCUS.map((preference) => ({ ...preference })));
    this.resetVisiblePage();
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  public formatScore(score: number): string {
    return Math.round(score).toLocaleString();
  }

  public formatStat(value: number | null | undefined): string {
    return value === null || value === undefined ? '-' : Math.round(value).toLocaleString();
  }

  public shortBuffStatLabel(stat: RumbleBuffFocusStat): string {
    return stat === 'Special CT' ? 'CT' : stat;
  }

  public roleSummary(score: RumbleCharacterRankedScore): NormalizedRumbleRoleTag[] {
    return score.unit.normalized.roleTags;
  }

  private matchesFilters(score: RumbleCharacterRankedScore): boolean {
    const unit = score.unit;
    const character = unit.character;
    const favoriteIdSet = new Set(this.favoriteIds());

    if (this.favoritesOnly() && !favoriteIdSet.has(character.id)) {
      return false;
    }

    if (this.hideFavorites() && favoriteIdSet.has(character.id)) {
      return false;
    }

    if (!this.matchesSearch(character, unit.reasonChips)) {
      return false;
    }

    const selectedType = this.selectedType().trim().toLowerCase();

    if (selectedType && !character.type.toLowerCase().includes(selectedType)) {
      return false;
    }

    const selectedClass = this.selectedClass().trim().toLowerCase();

    if (
      selectedClass &&
      !character.classes.some((characterClass) => characterClass.toLowerCase() === selectedClass)
    ) {
      return false;
    }

    const selectedRoles = this.selectedRoles();

    if (
      selectedRoles.length &&
      !selectedRoles.every((role) => unit.normalized.roleTags.includes(role))
    ) {
      return false;
    }

    const selectedRumbleType = this.selectedRumbleType().trim().toLowerCase();

    if (
      selectedRumbleType &&
      unit.normalized.rumbleType?.trim().toLowerCase() !== selectedRumbleType
    ) {
      return false;
    }

    const maxCooldown = this.maxCooldown();

    if (maxCooldown !== null && (unit.normalized.cooldown ?? Number.POSITIVE_INFINITY) > maxCooldown) {
      return false;
    }

    const maxCost = this.maxCost();
    const cost = unit.normalized.cost ?? character.cost;

    if (maxCost !== null && cost > maxCost) {
      return false;
    }

    return true;
  }

  private matchesSearch(character: CharacterDetailRecord, reasonChips: string[]): boolean {
    const searchTerm = this.searchTerm().trim().toLowerCase();

    if (!searchTerm) {
      return true;
    }

    return [
      character.id,
      character.name,
      character.searchText ?? '',
      character.type,
      ...character.classes,
      ...reasonChips,
    ]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm);
  }

  private resetVisiblePage(): void {
    this.visibleLimit.set(PAGE_SIZE);
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private normalizePositiveNumber(value: string): number | null {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return this.i18n.translate('states.errorFallback', undefined, 'rumble-characters');
  }
}
