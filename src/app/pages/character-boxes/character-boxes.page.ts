import { Component, OnInit, computed, signal } from '@angular/core';
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
  addCircleOutline,
  albumsOutline,
  heart,
  heartOutline,
  layersOutline,
  peopleOutline,
  searchOutline,
  trashOutline,
} from 'ionicons/icons';

import {
  type CharacterBox,
  type CharacterListItem,
  type DatasetManifest,
} from '../../core/models/optc.models';
import { type AutoBuildAbilityCatalog } from '../../core/models/auto-team-builder-ability.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  createAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from '../../core/services/ability-requirement-draft.utils';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  getSpecialAbilityCatalogItems,
  resolveSpecialAbilityMatchingCharacterIds,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import { UserStateService } from '../../core/services/user-state.service';
import { SpecialAbilityPickerComponent } from '../../shared/special-ability-picker/special-ability-picker.component';

const PAGE_SIZE = 48;
type CharacterBoxesFavoriteFilter = 'all' | 'favorites';
type CharacterBoxesMembershipFilter = 'all' | 'inBox' | 'notInBox';
type CharacterBoxesDisplayMode = 'list' | 'compact';

interface CharacterBoxCharacterCardView {
  character: CharacterListItem;
  subtitle: string;
  inSelectedBox: boolean;
  isFavorite: boolean;
  favoriteAriaLabel: string;
  membershipActionLabel: string;
}

@Component({
  selector: 'app-character-boxes-page',
  standalone: true,
  imports: [
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
    SpecialAbilityPickerComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './character-boxes.page.html',
  styleUrl: './character-boxes.page.scss',
})
export class CharacterBoxesPage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly boxes;
  public readonly favoriteCharacterIds;
  public readonly selectedBoxId = signal<string | null>(null);
  public readonly boxNameDraft = signal('');
  public readonly searchTerm = signal('');
  public readonly selectedType = signal('');
  public readonly selectedClass = signal('');
  public readonly selectedFavoriteFilter = signal<CharacterBoxesFavoriteFilter>('all');
  public readonly selectedMembershipFilter = signal<CharacterBoxesMembershipFilter>('all');
  public readonly specialAbilityPickerOpen = signal(false);
  public readonly specialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly displayMode = signal<CharacterBoxesDisplayMode>('list');
  public readonly characters = signal<CharacterListItem[]>([]);
  public readonly loading = signal(true);
  public readonly loadingMore = signal(false);
  public readonly hasMore = signal(true);

  public readonly selectedBox = computed(
    () => this.boxes().find((box) => box.id === this.selectedBoxId()) ?? null,
  );
  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly availableSpecialAbilityCatalogItems = computed(() =>
    getSpecialAbilityCatalogItems(this.abilityCatalog()?.abilities ?? []),
  );
  public readonly specialAbilityRequirements = computed(() =>
    serializeSpecialAbilityDrafts(
      this.specialAbilityDrafts(),
      this.availableSpecialAbilityCatalogItems(),
    ),
  );
  public readonly specialFilterCharacterIds = computed(() =>
    resolveSpecialAbilityMatchingCharacterIds(
      this.specialAbilityRequirements(),
      this.availableSpecialAbilityCatalogItems(),
    ),
  );
  public readonly totalAssignedCharacters = computed(() =>
    this.boxes().reduce((count, box) => count + box.characterIds.length, 0),
  );
  public readonly uniqueAssignedCharacters = computed(() => {
    const assignedCharacterIds = new Set(this.boxes().flatMap((box) => box.characterIds));

    return assignedCharacterIds.size;
  });
  public readonly selectedBoxCharacterCount = computed(
    () => this.selectedBox()?.characterIds.length ?? 0,
  );
  public readonly missingFavoriteIds = computed(() => {
    const selectedBox = this.selectedBox();

    if (!selectedBox) {
      return [];
    }

    return this.favoriteCharacterIds().filter(
      (favoriteCharacterId) => !selectedBox.characterIds.includes(favoriteCharacterId),
    );
  });
  public readonly missingFavoriteCount = computed(() => this.missingFavoriteIds().length);
  public readonly canAddFavoritesToSelectedBox = computed(
    () => Boolean(this.selectedBox()) && this.missingFavoriteCount() > 0,
  );
  public readonly boxNameValidationMessage = computed(() =>
    this.selectedBox() && this.boxNameDraft().trim().length === 0 ? this.t('editor.nameRequired') : '',
  );
  public readonly isCompactDisplayMode = computed(() => this.displayMode() === 'compact');
  public readonly characterCardViews = computed<CharacterBoxCharacterCardView[]>(() =>
    this.characters().map((character) => ({
      character,
      subtitle: [character.type, character.primaryClass, character.secondaryClass]
        .filter((value): value is string => Boolean(value))
        .join(' • '),
      inSelectedBox: this.selectedBox()?.characterIds.includes(character.id) ?? false,
      isFavorite: this.isFavorite(character.id),
      favoriteAriaLabel: this.isFavorite(character.id)
        ? this.t('favorites.removeAria', { name: character.name })
        : this.t('favorites.addAria', { name: character.name }),
      membershipActionLabel: this.selectedBox()?.characterIds.includes(character.id)
        ? this.i18n.translate('common.actions.remove')
        : this.i18n.translate('common.actions.add'),
    })),
  );

  public readonly addIcon = addCircleOutline;
  public readonly boxesIcon = albumsOutline;
  public readonly unitsIcon = peopleOutline;
  public readonly layersIcon = layersOutline;
  public readonly searchIcon = searchOutline;
  public readonly deleteIcon = trashOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.boxes = this.userState.characterBoxes;
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    const [summary, abilityCatalog] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      this.characterCatalogCache.ensureLoaded(),
    ]);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);

    if (this.boxes().length > 0) {
      this.selectBox(this.boxes()[0]!.id);
    }

    await this.loadCharacters(true);
  }

  public async createBox(): Promise<void> {
    const createdBox = await this.userState.saveCharacterBox({
      name: this.t('defaults.boxName', { count: this.boxes().length + 1 }),
      characterIds: [],
    });

    if (!createdBox) {
      return;
    }

    this.selectBox(createdBox.id);
  }

  public selectBox(boxId: string): void {
    const box = this.userState.getCharacterBoxById(boxId);

    this.selectedBoxId.set(box?.id ?? null);
    this.boxNameDraft.set(box?.name ?? '');
  }

  public async onBoxNameInput(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.boxNameDraft.set((event.detail.value ?? '').trimStart());

    const currentBox = this.selectedBox();

    if (!currentBox || this.boxNameDraft().trim().length === 0) {
      return;
    }

    const savedBox = await this.userState.saveCharacterBox({
      id: currentBox.id,
      name: this.boxNameDraft(),
      characterIds: currentBox.characterIds,
    });

    if (!savedBox) {
      return;
    }

    this.boxNameDraft.set(savedBox.name);
  }

  public async deleteSelectedBox(): Promise<void> {
    const currentBox = this.selectedBox();

    if (!currentBox) {
      return;
    }

    await this.userState.deleteCharacterBox(currentBox.id);
    const nextSelectedBox = this.boxes()[0] ?? null;

    this.selectedBoxId.set(nextSelectedBox?.id ?? null);
    this.boxNameDraft.set(nextSelectedBox?.name ?? '');
  }

  public async addFavoritesToSelectedBox(): Promise<void> {
    const currentBox = this.selectedBox();
    const missingFavoriteIds = this.missingFavoriteIds();

    if (!currentBox || missingFavoriteIds.length === 0) {
      return;
    }

    const savedBox = await this.userState.saveCharacterBox({
      id: currentBox.id,
      name: currentBox.name,
      characterIds: [...currentBox.characterIds, ...missingFavoriteIds],
    });

    if (!savedBox) {
      return;
    }

    this.selectBox(savedBox.id);
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm.set((event.detail.value ?? '').trim());
    await this.loadCharacters(true);
  }

  public async onTypeChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedType.set((event.detail.value ?? '').trim());
    await this.loadCharacters(true);
  }

  public async onClassChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedClass.set((event.detail.value ?? '').trim());
    await this.loadCharacters(true);
  }

  public async onFavoriteFilterChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedFavoriteFilter.set(event.detail.value === 'favorites' ? 'favorites' : 'all');
    await this.loadCharacters(true);
  }

  public async onMembershipFilterChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = event.detail.value;

    this.selectedMembershipFilter.set(
      nextValue === 'inBox' || nextValue === 'notInBox' ? nextValue : 'all',
    );
    await this.loadCharacters(true);
  }

  public setDisplayMode(mode: CharacterBoxesDisplayMode): void {
    this.displayMode.set(mode);
  }

  public openSpecialAbilityPicker(): void {
    if (!this.availableSpecialAbilityCatalogItems().length) {
      return;
    }

    this.specialAbilityPickerOpen.set(true);
  }

  public closeSpecialAbilityPicker(): void {
    this.specialAbilityPickerOpen.set(false);
  }

  public async saveSpecialAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.specialAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeSpecialAbilityDrafts(drafts, this.availableSpecialAbilityCatalogItems()),
      ),
    );
    this.specialAbilityPickerOpen.set(false);
    await this.loadCharacters(true);
  }

  public async clearSpecialAbilityFilters(): Promise<void> {
    this.specialAbilityDrafts.set([]);
    await this.loadCharacters(true);
  }

  public async toggleFavorite(characterId: number, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    await this.userState.toggleFavorite(characterId);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteCharacterIds().includes(characterId);
  }

  public async clearFilters(): Promise<void> {
    this.searchTerm.set('');
    this.selectedType.set('');
    this.selectedClass.set('');
    this.selectedFavoriteFilter.set('all');
    this.selectedMembershipFilter.set('all');
    this.specialAbilityPickerOpen.set(false);
    this.specialAbilityDrafts.set([]);
    await this.loadCharacters(true);
  }

  public async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }

    this.loadingMore.set(true);
    await this.loadCharacters(false);
    this.loadingMore.set(false);
  }

  public async toggleCharacterMembership(characterId: number): Promise<void> {
    const currentBox = this.selectedBox();

    if (!currentBox) {
      return;
    }

    const nextCharacterIds = currentBox.characterIds.includes(characterId)
      ? currentBox.characterIds.filter((currentCharacterId) => currentCharacterId !== characterId)
      : [characterId, ...currentBox.characterIds];
    const savedBox = await this.userState.saveCharacterBox({
      id: currentBox.id,
      name: currentBox.name,
      characterIds: nextCharacterIds,
    });

    if (!savedBox) {
      return;
    }

    this.selectBox(savedBox.id);
  }

  public trackBox(_: number, box: CharacterBox): string {
    return box.id;
  }

  public trackCharacter(_: number, character: CharacterListItem): number {
    return character.id;
  }

  private async loadCharacters(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
    }

    await this.characterCatalogCache.ensureLoaded();
    const nextOffset = reset ? 0 : this.characters().length;
    const selectedBoxCharacterIds = this.selectedBox()?.characterIds ?? [];
    const favoriteCharacterIds =
      this.selectedFavoriteFilter() === 'favorites' ? this.favoriteCharacterIds() : undefined;
    const scopedAllowedCharacterIds =
      this.selectedMembershipFilter() === 'inBox'
        ? selectedBoxCharacterIds.filter(
            (characterId) =>
              favoriteCharacterIds === undefined || favoriteCharacterIds.includes(characterId),
          )
        : favoriteCharacterIds;
    const allowedCharacterIds = this.intersectCharacterIds(
      scopedAllowedCharacterIds,
      this.specialFilterCharacterIds(),
    );
    const nextCharacters = this.characterCatalogCache.queryCharacters({
      searchTerm: this.searchTerm(),
      typeFilter: this.selectedType(),
      classFilter: this.selectedClass(),
      allowedCharacterIds,
      excludedCharacterIds:
        this.selectedMembershipFilter() === 'notInBox' ? selectedBoxCharacterIds : undefined,
      limit: PAGE_SIZE,
      offset: nextOffset,
    });

    this.characters.set(reset ? nextCharacters : [...this.characters(), ...nextCharacters]);
    this.hasMore.set(nextCharacters.length === PAGE_SIZE);
    this.loading.set(false);
  }

  private intersectCharacterIds(
    left: number[] | undefined,
    right: number[] | undefined,
  ): number[] | undefined {
    if (left === undefined) {
      return right;
    }

    if (right === undefined) {
      return left;
    }

    const rightSet = new Set(right);

    return left.filter((characterId) => rightSet.has(characterId));
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params, 'character-boxes');
  }
}
