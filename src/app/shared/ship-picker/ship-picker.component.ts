import {
  Component,
  EventEmitter,
  Input,
  type OnChanges,
  Output,
  type SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { IonIcon, IonModal, IonSearchbar, IonToggle } from '@ionic/angular';
import { IonButton } from '@ionic/angular/ion-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonFooter } from '@ionic/angular/ion-footer';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { boatOutline, closeOutline, heart, heartOutline } from 'ionicons/icons';

import { type ShipRecord } from '../../core/models/optc.models';
import { ShipPickerStylePanelsComponent } from './ship-picker-style-panels.component';

interface ShipPickerCardView {
  isFavorite: boolean;
  isFavoriteToggleBlocked: boolean;
  isBlocked: boolean;
  isSelected: boolean;
  ship: ShipRecord | null;
  shipId: number | null;
  subtitle: string;
  /**
   * 869f135rf. Whether `subtitle` is a cut-off version of the real effect.
   *
   * Measured 2026-09-15: 44 of 66 ships - 66% - have a description longer than
   * the 132-character cap, median 188 and max 500. The hidden half is where the
   * differentiating detail lives: Gran Tesoro's card stops mid-word at
   * "[RAINBOW..." and never mentions the HP boost or the conditional ATK. A ship
   * is the one team slot with no detail page and no comparison, so the effect
   * text IS the choice - and two thirds of it was being made on a sentence
   * fragment.
   */
  isTruncated: boolean;
  fullEffect: string;
  supportLabel: string | null;
  thumbUrl: string | null;
  title: string;
}

@Component({
  selector: 'app-ship-picker',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonModal,
    IonSearchbar,
    IonToggle,
    IonToolbar,
    ShipPickerStylePanelsComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './ship-picker.component.html',
  styleUrl: './ship-picker.component.scss',
})
export class ShipPickerComponent implements OnChanges {
  @Input({ required: true }) public isOpen = false;
  @Input({ required: true }) public title = '';
  @Input({ required: true }) public copy = '';
  @Input({ required: true }) public ships: ShipRecord[] = [];
  @Input({ required: true }) public selectedShipId: number | null = null;
  @Input() public blockedShipIds: number[] = [];
  @Input() public favoriteShipIds: number[] = [];
  @Input() public blockedFavoriteShipIds: number[] = [];
  @Input() public shipSupportLabels: Record<number, string> = {};
  @Input({ required: true }) public emptySelectionLabel = '';
  @Input({ required: true }) public emptySelectionCopy = '';
  @Input({ required: true }) public confirmLabel = '';
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<number | null>();
  @Output() public readonly toggleFavoriteShip = new EventEmitter<number>();

  @Input() public favoritesOnlyLabel = 'Favorites only';
  @Input() public favoritesOnlyEmptyLabel = '';

  public readonly closeIcon = closeOutline;
  public readonly shipIcon = boatOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly searchTerm = signal('');
  public readonly shipsState = signal<ShipRecord[]>([]);
  public readonly blockedShipIdsState = signal<number[]>([]);
  public readonly favoriteShipIdsState = signal<number[]>([]);
  public readonly blockedFavoriteShipIdsState = signal<number[]>([]);
  public readonly shipSupportLabelsState = signal<Record<number, string>>({});
  /** Ships whose full effect the reader has asked to see, while choosing. */
  public readonly expandedShipIds = signal<readonly number[]>([]);

  public isShipExpanded(shipId: number | null): boolean {
    return shipId !== null && this.expandedShipIds().includes(shipId);
  }

  public toggleShipEffect(shipId: number | null, event: Event): void {
    event.stopPropagation();

    if (shipId === null) {
      return;
    }

    this.expandedShipIds.update((ids) =>
      ids.includes(shipId) ? ids.filter((id) => id !== shipId) : [...ids, shipId],
    );
  }
  public readonly workingShipId = signal<number | null>(null);
  /**
   * 869f1327r. The one genuine gap in the favourites sweep.
   *
   * `favoriteShipIds` was already wired here - every card carries a heart and can be toggled - but
   * this was the only character-or-ship picker with no way to narrow TO favourites. Character Boxes
   * and the character pickers have had it for a long time, and a favourites set the reader can
   * build but not use from the place they are choosing is one they stop trusting everywhere.
   *
   * The empty state matches what Character Boxes already gets right: the toggle stays on and the
   * list explains itself rather than looking broken.
   */
  public readonly favoritesOnly = signal(false);
  public readonly filteredShipCards = computed<ShipPickerCardView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const favoritesOnly = this.favoritesOnly();
    const favoriteShipIds = new Set(this.favoriteShipIdsState());
    const baseCards: ShipPickerCardView[] = [
      {
        isBlocked: false,
        isFavorite: false,
        isFavoriteToggleBlocked: false,
        shipId: null,
        ship: null,
        title: this.emptySelectionLabel,
        fullEffect: '',
        isTruncated: false,
        subtitle: this.emptySelectionCopy,
        supportLabel: null,
        thumbUrl: null,
        isSelected: this.workingShipId() === null,
      },
      ...this.shipsState()
        /*
         * The "no ship" card above is never filtered out: it is the way to CLEAR a selection, and
         * removing it would make the empty state a dead end rather than an explanation.
         */
        .filter((ship) => !favoritesOnly || favoriteShipIds.has(ship.id))
        .map((ship) => this.buildShipCard(ship, ship.id === this.workingShipId(), ship.id, true)),
    ];

    if (!searchTerm.length) {
      return baseCards;
    }

    return baseCards.filter((card) =>
      [card.title, card.subtitle, card.ship?.description ?? ''].some((value) =>
        value.toLowerCase().includes(searchTerm),
      ),
    );
  });
  /** True when the filter is on and has emptied the list - the case Character Boxes explains. */
  public readonly favoritesOnlyIsEmpty = computed(
    () => this.favoritesOnly() && this.filteredShipCards().every((card) => card.shipId === null),
  );
  public readonly selectedCard = computed<ShipPickerCardView>(() => {
    const selectedShipId = this.workingShipId();

    if (selectedShipId === null) {
      return {
        isBlocked: false,
        isFavorite: false,
        isFavoriteToggleBlocked: false,
        shipId: null,
        ship: null,
        title: this.emptySelectionLabel,
        fullEffect: '',
        isTruncated: false,
        subtitle: this.emptySelectionCopy,
        supportLabel: null,
        thumbUrl: null,
        isSelected: true,
      };
    }

    const selectedShip = this.shipsState().find((ship) => ship.id === selectedShipId) ?? null;

    return this.buildShipCard(selectedShip, true, selectedShipId, false);
  });

  private dismissReason: 'save' | 'cancel' | null = null;

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['ships']) {
      this.shipsState.set(this.ships);
    }

    if (changes['blockedShipIds']) {
      this.blockedShipIdsState.set([...this.blockedShipIds]);
    }

    if (changes['favoriteShipIds']) {
      this.favoriteShipIdsState.set([...this.favoriteShipIds]);
    }

    if (changes['blockedFavoriteShipIds']) {
      this.blockedFavoriteShipIdsState.set([...this.blockedFavoriteShipIds]);
    }

    if (changes['shipSupportLabels']) {
      this.shipSupportLabelsState.set({ ...this.shipSupportLabels });
    }

    if (changes['isOpen'] && this.isOpen) {
      this.dismissReason = null;
      this.searchTerm.set('');
      this.workingShipId.set(this.selectedShipId);
      this.shipsState.set(this.ships);
      this.blockedShipIdsState.set([...this.blockedShipIds]);
      this.favoriteShipIdsState.set([...this.favoriteShipIds]);
      this.blockedFavoriteShipIdsState.set([...this.blockedFavoriteShipIds]);
      this.shipSupportLabelsState.set({ ...this.shipSupportLabels });
    }
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public selectShip(shipId: number | null): void {
    if (shipId !== null && this.blockedShipIdsState().includes(shipId)) {
      return;
    }

    this.workingShipId.set(shipId);
  }

  public onFavoritesOnlyChange(event: CustomEvent<{ checked?: boolean }>): void {
    this.favoritesOnly.set(Boolean(event.detail.checked));
  }

  public onToggleFavoriteShip(event: Event, shipId: number | null): void {
    event.preventDefault();
    event.stopPropagation();

    if (shipId === null || this.blockedFavoriteShipIdsState().includes(shipId)) {
      return;
    }

    this.toggleFavoriteShip.emit(shipId);
  }

  public save(): void {
    if (this.selectedCard().isBlocked) {
      return;
    }

    this.dismissReason = 'save';
    this.saveSelection.emit(this.workingShipId());
  }

  public cancel(): void {
    this.dismissReason = 'cancel';
    this.dismiss.emit();
  }

  public onModalDidDismiss(): void {
    if (this.dismissReason !== null) {
      this.dismissReason = null;
      return;
    }

    this.dismiss.emit();
  }

  private buildShipSubtitle(description: string): string {
    const normalizedDescription = description.trim();

    return normalizedDescription.length > 132
      ? `${normalizedDescription.slice(0, 129).trimEnd()}...`
      : normalizedDescription;
  }

  private buildShipCard(
    ship: ShipRecord | null,
    isSelected: boolean,
    shipId = ship?.id ?? null,
    truncateSubtitle = true,
  ): ShipPickerCardView {
    const isBlocked = shipId !== null && this.blockedShipIdsState().includes(shipId);

    return {
      isBlocked,
      isFavorite: shipId !== null && this.favoriteShipIdsState().includes(shipId),
      isFavoriteToggleBlocked:
        shipId !== null && this.blockedFavoriteShipIdsState().includes(shipId),
      isSelected,
      shipId,
      ship,
      title: ship?.name ?? this.emptySelectionLabel,
      fullEffect: ship?.description ?? '',
      isTruncated: Boolean(
        ship && truncateSubtitle && this.buildShipSubtitle(ship.description) !== ship.description,
      ),
      subtitle: ship
        ? truncateSubtitle
          ? this.buildShipSubtitle(ship.description)
          : ship.description
        : this.emptySelectionCopy,
      supportLabel: shipId !== null ? (this.shipSupportLabelsState()[shipId] ?? null) : null,
      thumbUrl: ship?.thumbUrl ?? null,
    };
  }
}
