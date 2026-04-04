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
  isSelected: boolean;
  ship: ShipRecord | null;
  shipId: number | null;
  subtitle: string;
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
  @Input({ required: true }) public emptySelectionLabel = '';
  @Input({ required: true }) public emptySelectionCopy = '';
  @Input({ required: true }) public confirmLabel = '';
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<number | null>();

  public readonly closeIcon = closeOutline;
  public readonly shipIcon = boatOutline;
  public readonly searchTerm = signal('');
  public readonly shipsState = signal<ShipRecord[]>([]);
  public readonly workingShipId = signal<number | null>(null);
  public readonly filteredShipCards = computed<ShipPickerCardView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const baseCards: ShipPickerCardView[] = [
      {
        shipId: null,
        ship: null,
        title: this.emptySelectionLabel,
        subtitle: this.emptySelectionCopy,
        thumbUrl: null,
        isSelected: this.workingShipId() === null,
      },
      ...this.shipsState().map((ship) => ({
        shipId: ship.id,
        ship,
        title: ship.name,
        subtitle: this.buildShipSubtitle(ship.description),
        thumbUrl: ship.thumbUrl,
        isSelected: ship.id === this.workingShipId(),
      })),
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
        shipId: null,
        ship: null,
        title: this.emptySelectionLabel,
        subtitle: this.emptySelectionCopy,
        thumbUrl: null,
        isSelected: true,
      };
    }

    const selectedShip = this.shipsState().find((ship) => ship.id === selectedShipId) ?? null;

    return {
      shipId: selectedShipId,
      ship: selectedShip,
      title: selectedShip?.name ?? this.emptySelectionLabel,
      subtitle: selectedShip
        ? selectedShip.description
        : this.emptySelectionCopy,
      thumbUrl: selectedShip?.thumbUrl ?? null,
      isSelected: true,
    };
  });

  private dismissReason: 'save' | 'cancel' | null = null;

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['ships']) {
      this.shipsState.set(this.ships);
    }

    if (changes['isOpen'] && this.isOpen) {
      this.dismissReason = null;
      this.searchTerm.set('');
      this.workingShipId.set(this.selectedShipId);
      this.shipsState.set(this.ships);
    }
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public selectShip(shipId: number | null): void {
    this.workingShipId.set(shipId);
  }

  public save(): void {
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
}
