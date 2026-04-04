import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, signal } from '@angular/core';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonFooter,
  IonIcon,
  IonModal,
  IonSearchbar,
  IonToolbar,
} from '@ionic/angular/standalone';
import { boatOutline, closeOutline } from 'ionicons/icons';

import { type ShipRecord } from '../../core/models/optc.models';

interface ShipPickerCardView {
  isBlocked: boolean;
  isSelected: boolean;
  ship: ShipRecord | null;
  shipId: number | null;
  subtitle: string;
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
    IonFooter,
    IonIcon,
    IonModal,
    IonSearchbar,
    IonToolbar,
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
  @Input() public shipSupportLabels: Record<number, string> = {};
  @Input({ required: true }) public emptySelectionLabel = '';
  @Input({ required: true }) public emptySelectionCopy = '';
  @Input({ required: true }) public confirmLabel = '';
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<number | null>();

  public readonly closeIcon = closeOutline;
  public readonly shipIcon = boatOutline;
  public readonly searchTerm = signal('');
  public readonly shipsState = signal<ShipRecord[]>([]);
  public readonly blockedShipIdsState = signal<number[]>([]);
  public readonly shipSupportLabelsState = signal<Record<number, string>>({});
  public readonly workingShipId = signal<number | null>(null);
  public readonly filteredShipCards = computed<ShipPickerCardView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const baseCards: ShipPickerCardView[] = [
      {
        isBlocked: false,
        shipId: null,
        ship: null,
        title: this.emptySelectionLabel,
        subtitle: this.emptySelectionCopy,
        supportLabel: null,
        thumbUrl: null,
        isSelected: this.workingShipId() === null,
      },
      ...this.shipsState().map((ship) =>
        this.buildShipCard(ship, ship.id === this.workingShipId(), ship.id, true),
      ),
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
  public readonly selectedCard = computed<ShipPickerCardView>(() => {
    const selectedShipId = this.workingShipId();

    if (selectedShipId === null) {
      return {
        isBlocked: false,
        shipId: null,
        ship: null,
        title: this.emptySelectionLabel,
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

    if (changes['shipSupportLabels']) {
      this.shipSupportLabelsState.set({ ...this.shipSupportLabels });
    }

    if (changes['isOpen'] && this.isOpen) {
      this.dismissReason = null;
      this.searchTerm.set('');
      this.workingShipId.set(this.selectedShipId);
      this.shipsState.set(this.ships);
      this.blockedShipIdsState.set([...this.blockedShipIds]);
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
      isSelected,
      shipId,
      ship,
      title: ship?.name ?? this.emptySelectionLabel,
      subtitle: ship
        ? truncateSubtitle
          ? this.buildShipSubtitle(ship.description)
          : ship.description
        : this.emptySelectionCopy,
      supportLabel: shipId !== null ? this.shipSupportLabelsState()[shipId] ?? null : null,
      thumbUrl: ship?.thumbUrl ?? null,
    };
  }
}
