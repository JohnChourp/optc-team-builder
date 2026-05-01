import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
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
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  checkmarkCircleOutline,
  peopleOutline,
  searchOutline,
  shieldCheckmarkOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';

import {
  type CaptainCoverageChip,
  type CaptainCoverageResult,
  resolveCaptainCoverage,
} from '../../core/services/captain-coverage.utils';
import {
  type CharacterDetailRecord,
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type DatasetManifest,
} from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { resolveCharacterPartyConflictKeys } from '../../core/services/auto-team-builder.utils';
import { CharacterImagePickerComponent } from '../../shared/character-image-picker/character-image-picker.component';

const MAX_CAPTAIN_LOOKUP_COUNT = 12000;
const CAPTAIN_COVERAGE_TEAM_SLOT_COUNT = 5;

type CaptainCoverageSortMode =
  | Extract<
      CharacterSortMode,
      'catalog' | 'captainAtkBoost' | 'captainAverageBoost' | 'captainHpBoost' | 'nameAsc'
    >
  | 'nameDesc';
type CaptainCoverageDisplayMode = 'list' | 'compact';

interface CaptainCoverageCardView {
  captain: CharacterDetailRecord;
  coverage: CaptainCoverageResult;
  detailLink: string[];
  subtitle: string;
}

@Component({
  selector: 'app-captain-coverage-page',
  standalone: true,
  imports: [
    CharacterImagePickerComponent,
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
    IonToolbar,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './captain-coverage.page.html',
  styleUrl: './captain-coverage.page.scss',
})
export class CaptainCoveragePage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly selectedTarget = signal<CharacterListItem | null>(null);
  public readonly selectedTargetDetail = signal<CharacterDetailRecord | null>(null);
  public readonly selectedTeamSlots = signal<Array<CharacterListItem | null>>(
    createEmptyTeamSlots(),
  );
  public readonly activeTeamSlotIndex = signal(0);
  public readonly teamPickerOpen = signal(false);
  public readonly maxTotalCost = signal<number | null>(null);
  public readonly allCaptains = signal<CharacterDetailRecord[]>([]);
  public readonly loading = signal(true);
  public readonly pickerOpen = signal(false);
  public readonly searchTerm = signal('');
  public readonly selectedSortMode = signal<CaptainCoverageSortMode>('catalog');
  public readonly selectedIdOrder = signal<CharacterIdOrder>('newest');
  public readonly displayMode = signal<CaptainCoverageDisplayMode>('list');
  public readonly favoritesOnly = signal(false);
  public readonly hideFavorites = signal(false);
  public readonly favoriteIds;

  public readonly resultCards = computed<CaptainCoverageCardView[]>(() => {
    const target = this.selectedTarget();

    if (!target) {
      return [];
    }

    const normalizedSearchTerm = this.searchTerm().trim().toLowerCase();
    const favoriteIdSet = new Set(this.favoriteIds());
    const targetConflictKeys = new Set(
      resolveCharacterPartyConflictKeys(this.selectedTargetDetail() ?? target),
    );
    const matchingCaptains = this.allCaptains()
      .map((captain) => ({
        captain,
        coverage: resolveCaptainCoverage(captain, target),
      }))
      .filter(({ coverage }) => coverage.matches)
      .filter(({ captain }) => !this.hasPartyConflict(captain, targetConflictKeys))
      .filter(({ captain }) => this.canAssignTeamSlotCharacter(0, captain))
      .filter(({ captain }) => {
        if (this.favoritesOnly()) {
          return favoriteIdSet.has(captain.id);
        }

        if (this.hideFavorites()) {
          return !favoriteIdSet.has(captain.id);
        }

        return true;
      })
      .filter(({ captain, coverage }) =>
        normalizedSearchTerm.length
          ? this.matchesSearchTerm(captain, coverage, normalizedSearchTerm)
          : true,
      );

    return this.sortResultCards(
      matchingCaptains.map(({ captain, coverage }) => ({
        captain,
        coverage,
        detailLink: ['/characters', String(captain.id)],
        subtitle: [captain.type, captain.primaryClass, captain.secondaryClass]
          .filter((value): value is string => Boolean(value))
          .join(' / '),
      })),
    );
  });

  public readonly totalMatchingCaptains = computed(() => this.resultCards().length);
  public readonly isCompactDisplayMode = computed(() => this.displayMode() === 'compact');
  public readonly teamBudgetCost = computed(() =>
    this.selectedTeamSlots().reduce((total, character) => total + (character?.cost ?? 0), 0),
  );
  public readonly teamRemainingCost = computed(() => {
    const maxTotalCost = this.maxTotalCost();

    return maxTotalCost === null ? 0 : Math.max(0, maxTotalCost - this.teamBudgetCost());
  });
  public readonly teamBudgetLabel = computed(() =>
    this.maxTotalCost() === null
      ? this.t('team.cost.default')
      : this.t('team.cost.active', {
          used: this.teamBudgetCost(),
          remaining: this.teamRemainingCost(),
          max: this.maxTotalCost() ?? 0,
        }),
  );
  public readonly teamBudgetErrorLabel = computed(() =>
    this.maxTotalCost() !== null && this.teamBudgetCost() > this.maxTotalCost()!
      ? this.t('team.cost.overBudget', {
          used: this.teamBudgetCost(),
          max: this.maxTotalCost()!,
        })
      : '',
  );
  public readonly teamPickerMaxCost = computed(() => {
    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null) {
      return null;
    }

    const activeIndex = this.activeTeamSlotIndex();
    const currentSlotCost = this.selectedTeamSlots()[activeIndex]?.cost ?? 0;

    return Math.max(0, maxTotalCost - this.teamBudgetCost() + currentSlotCost);
  });
  public readonly activeTeamSlotTitle = computed(() =>
    this.teamSlotLabel(this.activeTeamSlotIndex()),
  );
  public readonly targetSubtitle = computed(() => {
    const target = this.selectedTarget();

    return target
      ? [target.type, target.primaryClass, target.secondaryClass]
          .filter((value): value is string => Boolean(value))
          .join(' / ')
      : '';
  });

  public readonly coverageIcon = shieldCheckmarkOutline;
  public readonly targetIcon = peopleOutline;
  public readonly swapIcon = swapHorizontalOutline;
  public readonly checkIcon = checkmarkCircleOutline;
  public readonly searchIcon = searchOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    this.loading.set(true);

    try {
      const [, summary, records] = await Promise.all([
        this.userState.ready(),
        this.repository.getDatasetManifest(),
        this.repository.searchDetailedCharacters({
          searchTerm: '',
          selectedTypes: [],
          selectedTypesMatchMode: 'any',
          selectedClasses: [],
          selectedClassesMatchMode: 'any',
          sortMode: 'catalog',
          idOrder: 'newest',
          limit: MAX_CAPTAIN_LOOKUP_COUNT,
          offset: 0,
        }),
      ]);

      this.summary.set(summary);
      this.allCaptains.set(
        records.filter(
          (record) =>
            typeof record.detail.captainAbility === 'string' &&
            record.detail.captainAbility.trim().length > 0,
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }

  public openPicker(): void {
    this.pickerOpen.set(true);
  }

  public closePicker(): void {
    this.pickerOpen.set(false);
  }

  public async saveTargetSelection(character: CharacterListItem): Promise<void> {
    this.selectedTarget.set(character);
    this.selectedTargetDetail.set(null);
    this.searchTerm.set('');
    this.pickerOpen.set(false);

    this.selectedTargetDetail.set(await this.repository.getCharacterById(character.id));
  }

  public clearTarget(): void {
    this.selectedTarget.set(null);
    this.selectedTargetDetail.set(null);
    this.searchTerm.set('');
  }

  public openTeamSlotPicker(index: number): void {
    if (index < 0 || index >= CAPTAIN_COVERAGE_TEAM_SLOT_COUNT) {
      return;
    }

    this.activeTeamSlotIndex.set(index);
    this.teamPickerOpen.set(true);
  }

  public closeTeamSlotPicker(): void {
    this.teamPickerOpen.set(false);
  }

  public saveTeamSlotSelection(character: CharacterListItem): void {
    const index = this.activeTeamSlotIndex();

    if (!this.canAssignTeamSlotCharacter(index, character)) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? character : slot)),
    );
    this.teamPickerOpen.set(false);
  }

  public assignCaptainFromResult(captain: CharacterDetailRecord): void {
    if (!this.canAssignTeamSlotCharacter(0, captain)) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, index) => (index === 0 ? captain : slot)),
    );
  }

  public clearTeamSlot(index: number, event?: Event): void {
    event?.stopPropagation();

    if (index < 0 || index >= CAPTAIN_COVERAGE_TEAM_SLOT_COUNT) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? null : slot)),
    );
  }

  public onMaxTotalCostChange(event: CustomEvent<{ value?: string | number | null }>): void {
    this.maxTotalCost.set(normalizeCostValue(event.detail.value));
  }

  public toggleFavoritesOnly(): void {
    const nextValue = !this.favoritesOnly();
    this.favoritesOnly.set(nextValue);

    if (nextValue) {
      this.hideFavorites.set(false);
    }
  }

  public toggleHideFavorites(): void {
    const nextValue = !this.hideFavorites();
    this.hideFavorites.set(nextValue);

    if (nextValue) {
      this.favoritesOnly.set(false);
    }
  }

  public setDisplayMode(displayMode: CaptainCoverageDisplayMode): void {
    this.displayMode.set(displayMode);
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public onSortModeChange(event: CustomEvent<{ value?: string | null }>): void {
    const value = event.detail.value;

    if (isCaptainCoverageSortMode(value)) {
      this.selectedSortMode.set(value);
    }
  }

  public onIdOrderChange(event: CustomEvent<{ value?: string | null }>): void {
    this.selectedIdOrder.set(normalizeCharacterIdOrder(event.detail.value));
  }

  public formatBoost(value: number): string {
    return value > 0 ? `${Number(value.toFixed(3))}x` : '-';
  }

  public trackCaptain(_index: number, card: CaptainCoverageCardView): number {
    return card.captain.id;
  }

  public trackChip(_index: number, chip: CaptainCoverageChip): string {
    return `${chip.kind}:${chip.label}`;
  }

  public trackTeamSlot(index: number): number {
    return index;
  }

  public teamSlotLabel(index: number): string {
    return index === 0 ? this.t('team.slots.captain') : this.t('team.slots.sub', { index });
  }

  public canAssignTeamSlotCharacter(
    index: number,
    character: Pick<CharacterListItem, 'cost'>,
  ): boolean {
    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null) {
      return true;
    }

    const currentSlotCost = this.selectedTeamSlots()[index]?.cost ?? 0;

    return this.teamBudgetCost() - currentSlotCost + character.cost <= maxTotalCost;
  }

  private matchesSearchTerm(
    captain: CharacterDetailRecord,
    coverage: CaptainCoverageResult,
    searchTerm: string,
  ): boolean {
    return [
      captain.id,
      captain.name,
      captain.type,
      captain.primaryClass,
      captain.secondaryClass ?? '',
      ...captain.classes,
      coverage.captainText,
      ...coverage.chips.map((chip) => chip.label),
    ]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm);
  }

  private hasPartyConflict(
    captain: CharacterDetailRecord,
    targetConflictKeys: Set<string>,
  ): boolean {
    if (targetConflictKeys.size === 0) {
      return false;
    }

    return resolveCharacterPartyConflictKeys(captain).some((conflictKey) =>
      targetConflictKeys.has(conflictKey),
    );
  }

  private sortResultCards(cards: CaptainCoverageCardView[]): CaptainCoverageCardView[] {
    return [...cards].sort((left, right) => {
      const sortMode = this.selectedSortMode();
      const idOrder = this.selectedIdOrder();

      if (sortMode === 'captainHpBoost') {
        return compareBoostCards(left, right, 'captainHpBoost', idOrder);
      }

      if (sortMode === 'captainAtkBoost') {
        return compareBoostCards(left, right, 'captainAtkBoost', idOrder);
      }

      if (sortMode === 'captainAverageBoost') {
        return compareBoostCards(left, right, 'captainAverageBoost', idOrder);
      }

      if (sortMode === 'nameAsc') {
        return compareNameCards(left, right, idOrder);
      }

      if (sortMode === 'nameDesc') {
        const nameDifference = right.captain.name.localeCompare(left.captain.name, undefined, {
          sensitivity: 'base',
        });

        return nameDifference || compareCharacterIds(left.captain.id, right.captain.id, idOrder);
      }

      return compareCharacterIds(left.captain.id, right.captain.id, idOrder);
    });
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(`captain-coverage.${key}`, params);
  }
}

function compareBoostCards(
  left: CaptainCoverageCardView,
  right: CaptainCoverageCardView,
  key: 'captainAtkBoost' | 'captainAverageBoost' | 'captainHpBoost',
  idOrder: CharacterIdOrder,
): number {
  const boostDifference = right.captain[key] - left.captain[key];

  if (boostDifference !== 0) {
    return boostDifference;
  }

  return compareCharacterIds(left.captain.id, right.captain.id, idOrder);
}

function compareNameCards(
  left: CaptainCoverageCardView,
  right: CaptainCoverageCardView,
  idOrder: CharacterIdOrder,
): number {
  return (
    left.captain.name.localeCompare(right.captain.name, undefined, { sensitivity: 'base' }) ||
    compareCharacterIds(left.captain.id, right.captain.id, idOrder)
  );
}

function compareCharacterIds(
  leftId: number,
  rightId: number,
  idOrder: CharacterIdOrder,
): number {
  return idOrder === 'oldest' ? leftId - rightId : rightId - leftId;
}

function isCaptainCoverageSortMode(
  value: string | null | undefined,
): value is CaptainCoverageSortMode {
  return (
    value === 'catalog' ||
    value === 'captainAtkBoost' ||
    value === 'captainAverageBoost' ||
    value === 'captainHpBoost' ||
    value === 'nameAsc' ||
    value === 'nameDesc'
  );
}

function normalizeCharacterIdOrder(value: string | null | undefined): CharacterIdOrder {
  return value === 'oldest' ? 'oldest' : 'newest';
}

function createEmptyTeamSlots(): Array<CharacterListItem | null> {
  return Array.from({ length: CAPTAIN_COVERAGE_TEAM_SLOT_COUNT }, () => null);
}

function normalizeCostValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}
