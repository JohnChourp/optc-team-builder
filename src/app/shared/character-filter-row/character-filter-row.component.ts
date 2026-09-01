import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  IonButton,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from '@ionic/angular/standalone';

export interface CharacterFilterCostRange {
  min: number | null;
  max: number | null;
}

export interface CharacterFilterOption {
  value: string;
  label: string;
  supportText?: string;
  disabled?: boolean;
}

export type CharacterFilterFavoriteMode = 'none' | 'toggles' | 'select';

export type CharacterFilterCostBound = 'min' | 'max';

@Component({
  selector: 'app-character-filter-row',
  standalone: true,
  imports: [IonButton, IonInput, IonSelect, IonSelectOption, IonToggle],
  templateUrl: './character-filter-row.component.html',
  styleUrl: './character-filter-row.component.scss',
})
export class CharacterFilterRowComponent {
  @Input() public disabled = false;
  @Input() public clearLabel = 'Clear';
  @Input() public showClearButton = false;

  @Input() public showCharacterBoxFilter = false;
  @Input() public characterBoxLabel = 'Character box';
  @Input() public characterBoxPlaceholder = 'Select character box';
  @Input() public characterBoxOptions: CharacterFilterOption[] = [];
  @Input() public selectedCharacterBoxValue = '';

  @Input() public favoriteMode: CharacterFilterFavoriteMode = 'none';
  @Input() public favoritesOnlyLabel = 'Show favorites only';
  @Input() public favoritesOnlySupportText = '';
  @Input() public favoritesOnly = false;
  @Input() public hideFavoritesLabel = 'Hide favorites';
  @Input() public hideFavoritesSupportText = '';
  @Input() public hideFavorites = false;
  @Input() public favoritesSelectLabel = 'Favorites';
  @Input() public favoritesSelectPlaceholder = 'Filter by favorites';
  @Input() public favoriteSelectOptions: CharacterFilterOption[] = [];
  @Input() public selectedFavoriteFilter = '';

  @Input() public showCostFilter = false;
  @Input() public costFromLabel = 'Cost from';
  @Input() public costToLabel = 'Cost to';
  @Input() public costRange: CharacterFilterCostRange = { min: null, max: null };
  /**
   * Milliseconds to hold a typed cost before it reaches the host, `0` for the
   * historical every-keystroke behaviour. Opt-in on purpose: the host that
   * renders thousands of rows wants the pause, the smaller ones did not ask
   * for a behaviour change.
   */
  @Input() public costDebounce = 0;

  @Input() public showMembershipFilter = false;
  @Input() public membershipLabel = 'Membership';
  @Input() public membershipPlaceholder = 'Filter by membership';
  @Input() public membershipOptions: CharacterFilterOption[] = [];
  @Input() public selectedMembershipFilter = '';

  @Input() public showSortFilter = false;
  @Input() public sortLabel = 'Sort';
  @Input() public sortPlaceholder = 'Sort';
  @Input() public sortOptions: CharacterFilterOption[] = [];
  @Input() public selectedSortValue = '';

  @Input() public showIdOrderFilter = false;
  @Input() public idOrderLabel = 'ID order';
  @Input() public idOrderOptions: CharacterFilterOption[] = [];
  @Input() public selectedIdOrderValue = '';

  @Output() public readonly characterBoxChange = new EventEmitter<string>();
  @Output() public readonly favoritesOnlyChange = new EventEmitter<boolean>();
  @Output() public readonly hideFavoritesChange = new EventEmitter<boolean>();
  @Output() public readonly favoriteFilterChange = new EventEmitter<string>();
  @Output() public readonly costRangeChange = new EventEmitter<{
    bound: CharacterFilterCostBound;
    value: string | number | null;
  }>();
  @Output() public readonly membershipFilterChange = new EventEmitter<string>();
  @Output() public readonly sortChange = new EventEmitter<string>();
  @Output() public readonly idOrderChange = new EventEmitter<string>();
  @Output() public readonly clearFilters = new EventEmitter<void>();

  public selectedCharacterBoxSupportText(): string {
    return this.selectedOption(this.characterBoxOptions, this.selectedCharacterBoxValue)
      ?.supportText ?? '';
  }

  public selectedCharacterBoxLabel(): string {
    return (
      this.selectedOption(this.characterBoxOptions, this.selectedCharacterBoxValue)?.label ??
      this.characterBoxPlaceholder
    );
  }

  public onCharacterBoxChange(event: CustomEvent<{ value?: string | null }>): void {
    this.characterBoxChange.emit(event.detail.value ?? '');
  }

  public onFavoritesOnlyChange(event: CustomEvent<{ checked?: boolean | null }>): void {
    this.favoritesOnlyChange.emit(Boolean(event.detail.checked));
  }

  public onHideFavoritesChange(event: CustomEvent<{ checked?: boolean | null }>): void {
    this.hideFavoritesChange.emit(Boolean(event.detail.checked));
  }

  public onFavoriteFilterChange(event: CustomEvent<{ value?: string | null }>): void {
    this.favoriteFilterChange.emit(event.detail.value ?? '');
  }

  public onCostRangeChange(
    bound: CharacterFilterCostBound,
    event: CustomEvent<{ value?: string | number | null }>,
  ): void {
    this.costRangeChange.emit({ bound, value: event.detail.value ?? null });
  }

  public onMembershipFilterChange(event: CustomEvent<{ value?: string | null }>): void {
    this.membershipFilterChange.emit(event.detail.value ?? '');
  }

  public onSortChange(event: CustomEvent<{ value?: string | null }>): void {
    this.sortChange.emit(event.detail.value ?? '');
  }

  public onIdOrderChange(event: CustomEvent<{ value?: string | null }>): void {
    this.idOrderChange.emit(event.detail.value ?? '');
  }

  public onClearFilters(): void {
    if (this.disabled) {
      return;
    }

    this.clearFilters.emit();
  }

  private selectedOption(
    options: CharacterFilterOption[],
    selectedValue: string,
  ): CharacterFilterOption | null {
    return options.find((option) => option.value === selectedValue) ?? null;
  }
}
