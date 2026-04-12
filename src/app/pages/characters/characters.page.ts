import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSearchbar,
  IonSpinner,
  IonToggle,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  heart,
  heartOutline,
  layersOutline,
  searchOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { type CharacterListItem, type DatasetManifest } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';

const PAGE_SIZE = 48;

@Component({
  selector: 'app-characters-page',
  standalone: true,
  imports: [
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonSearchbar,
    IonSpinner,
    IonToggle,
    IonTitle,
    IonToolbar,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './characters.page.html',
  styleUrl: './characters.page.scss',
})
export class CharactersPage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly characters = signal<CharacterListItem[]>([]);
  public readonly loading = signal(true);
  public readonly loadingMore = signal(false);
  public readonly hasMore = signal(true);
  public readonly searchTerm = signal('');
  public readonly typeQuery = signal('');
  public readonly classQuery = signal('');
  public readonly selectedType = signal('');
  public readonly selectedClass = signal('');
  public readonly favoritesOnly = signal(false);
  public readonly favoriteIds;
  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly filteredTypeOptions = computed(() =>
    this.filterOptions(this.availableTypes(), this.typeQuery(), this.selectedType()),
  );
  public readonly filteredClassOptions = computed(() =>
    this.filterOptions(this.availableClasses(), this.classQuery(), this.selectedClass()),
  );
  public readonly showTypeSuggestions = computed(
    () => this.filteredTypeOptions().length > 0 && this.typeQuery().trim() !== this.selectedType(),
  );
  public readonly showClassSuggestions = computed(
    () =>
      this.filteredClassOptions().length > 0 && this.classQuery().trim() !== this.selectedClass(),
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.favoriteIds().length
      ? this.i18n.translate(
          'filters.favoritesOnly.withCount',
          { count: this.favoriteIds().length },
          'characters',
        )
      : this.i18n.translate('filters.favoritesOnly.empty', undefined, 'characters'),
  );

  public readonly searchIcon = searchOutline;
  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    this.summary.set(await this.repository.getDatasetManifest());
    await this.loadCharacters(true);
  }

  public ionViewDidEnter(): void {
    console.log('CharactersPage component');
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm.set((event.detail.value ?? '').trim());
    await this.loadCharacters(true);
  }

  public async onTypeQueryChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = (event.detail.value ?? '').trimStart();
    this.typeQuery.set(nextValue);

    if (this.selectedType() && nextValue.trim() !== this.selectedType()) {
      this.selectedType.set('');
      await this.loadCharacters(true);
    }
  }

  public async onClassQueryChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = (event.detail.value ?? '').trimStart();
    this.classQuery.set(nextValue);

    if (this.selectedClass() && nextValue.trim() !== this.selectedClass()) {
      this.selectedClass.set('');
      await this.loadCharacters(true);
    }
  }

  public async applyTypeFilter(type: string): Promise<void> {
    if (this.selectedType() === type) {
      return;
    }

    this.typeQuery.set(type);
    this.selectedType.set(type);
    await this.loadCharacters(true);
  }

  public async applyClassFilter(characterClass: string): Promise<void> {
    if (this.selectedClass() === characterClass) {
      return;
    }

    this.classQuery.set(characterClass);
    this.selectedClass.set(characterClass);
    await this.loadCharacters(true);
  }

  public async clearTypeFilter(): Promise<void> {
    const hadSelection = Boolean(this.selectedType());
    this.typeQuery.set('');

    if (!hadSelection) {
      return;
    }

    this.selectedType.set('');
    await this.loadCharacters(true);
  }

  public async clearClassFilter(): Promise<void> {
    const hadSelection = Boolean(this.selectedClass());
    this.classQuery.set('');

    if (!hadSelection) {
      return;
    }

    this.selectedClass.set('');
    await this.loadCharacters(true);
  }

  public async onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    this.favoritesOnly.set(event.detail.checked);
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

  public async toggleFavorite(characterId: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.userState.toggleFavorite(characterId);

    if (this.favoritesOnly()) {
      await this.loadCharacters(true);
    }
  }

  public async resetPage(): Promise<void> {
    this.searchTerm.set('');
    this.typeQuery.set('');
    this.classQuery.set('');
    this.selectedType.set('');
    this.selectedClass.set('');
    this.favoritesOnly.set(false);
    this.characters.set([]);
    this.loadingMore.set(false);
    this.hasMore.set(true);
    await this.loadCharacters(true);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  private async loadCharacters(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
    }

    const nextOffset = reset ? 0 : this.characters().length;
    const nextPage = await this.repository.searchCharacters({
      searchTerm: this.searchTerm(),
      typeFilter: this.selectedType(),
      classFilter: this.selectedClass(),
      allowedCharacterIds: this.favoritesOnly() ? this.favoriteIds() : undefined,
      limit: PAGE_SIZE,
      offset: nextOffset,
    });

    this.characters.set(reset ? nextPage : [...this.characters(), ...nextPage]);
    this.hasMore.set(nextPage.length === PAGE_SIZE);
    this.loading.set(false);
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private filterOptions(options: string[], query: string, selectedValue: string): string[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options.slice(0, 8);
    }

    return options
      .filter((option) => option.toLowerCase().includes(normalizedQuery))
      .filter((option) => option !== selectedValue)
      .slice(0, 8);
  }
}
