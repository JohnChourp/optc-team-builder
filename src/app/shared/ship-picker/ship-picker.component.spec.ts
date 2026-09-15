import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ShipPickerComponent } from './ship-picker.component';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({
  IonButton: class {},
}));
vi.mock('@ionic/angular/ion-buttons', () => ({
  IonButtons: class {},
}));
vi.mock('@ionic/angular/ion-content', () => ({
  IonContent: class {},
}));
vi.mock('@ionic/angular/ion-footer', () => ({
  IonFooter: class {},
}));
vi.mock('@ionic/angular/ion-header', () => ({
  IonHeader: class {},
}));
vi.mock('@ionic/angular/ion-toolbar', () => ({
  IonToolbar: class {},
}));

describe('ShipPickerComponent', () => {
  it('hydrates local ship state and selected ship when the modal opens', () => {
    const component = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
    });

    expect(component.filteredShipCards()).toHaveLength(3);
    expect(component.selectedCard().ship?.id).toBe(9001);
  });

  it('filters ships by name and description and supports clearing to null', () => {
    const component = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
    });

    component.onSearchChange({
      detail: { value: 'slasher' },
    } as CustomEvent<{ value?: string | null }>);

    expect(component.filteredShipCards().map((card) => card.title)).toEqual(['Coffin Boat']);

    component.selectShip(null);
    expect(component.selectedCard().ship).toBeNull();
    expect(component.selectedCard().title).toBe('No ship');
  });

  it('emits favorite toggle events for ship cards and the selected preview', () => {
    const component = createComponent();
    const emitSpy = vi.spyOn(component.toggleFavoriteShip, 'emit');

    component.favoriteShipIds = [9001];
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
      favoriteShipIds: new SimpleChange([], component.favoriteShipIds, true),
    });

    component.onToggleFavoriteShip(new Event('click'), 9002);
    component.onToggleFavoriteShip(new Event('click'), component.selectedCard().shipId);

    expect(emitSpy).toHaveBeenNthCalledWith(1, 9002);
    expect(emitSpy).toHaveBeenNthCalledWith(2, 9001);
  });

  it('emits the current ship selection when confirmed', () => {
    const component = createComponent();
    const emitSpy = vi.spyOn(component.saveSelection, 'emit');

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
    });

    component.selectShip(9002);
    component.save();

    expect(emitSpy).toHaveBeenCalledWith(9002);
  });

  it('keeps blocked ships visible with support labels and prevents selecting them', () => {
    const component = createComponent();

    component.blockedShipIds = [9002];
    component.shipSupportLabels = {
      9002: 'This ship is excluded and cannot be confirmed as the manual ship.',
    };
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
      blockedShipIds: new SimpleChange([], component.blockedShipIds, true),
      shipSupportLabels: new SimpleChange({}, component.shipSupportLabels, true),
    });

    expect(component.filteredShipCards().find((card) => card.shipId === 9002)).toMatchObject({
      shipId: 9002,
      isBlocked: true,
      supportLabel: 'This ship is excluded and cannot be confirmed as the manual ship.',
    });

    component.selectShip(9002);

    expect(component.workingShipId()).toBe(9001);
  });

  it('does not emit favorite toggle events for blocked favorite controls', () => {
    const component = createComponent();
    const emitSpy = vi.spyOn(component.toggleFavoriteShip, 'emit');

    component.blockedFavoriteShipIds = [9001];
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
      blockedFavoriteShipIds: new SimpleChange([], component.blockedFavoriteShipIds, true),
    });

    component.onToggleFavoriteShip(new Event('click'), 9001);

    expect(component.selectedCard().isFavoriteToggleBlocked).toBe(true);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  /**
   * 869f1327r. The gap the sweep found: every other character or ship picker could already narrow
   * to favourites, and this one could only ADD to them. A favourites set the reader can build but
   * not use from where they are choosing is one they stop trusting everywhere.
   */
  it('narrows to favourite ships when the filter is on', () => {
    const component = createComponent();
    component.favoriteShipIds = [9002];
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
      favoriteShipIds: new SimpleChange([], component.favoriteShipIds, true),
    });

    expect(component.filteredShipCards().map((card) => card.shipId)).toEqual([null, 9001, 9002]);

    component.onFavoritesOnlyChange({ detail: { checked: true } } as never);

    expect(component.filteredShipCards().map((card) => card.shipId)).toEqual([null, 9002]);
  });

  /**
   * The "no ship" card is how a reader CLEARS a selection, so it survives the filter. Without it
   * the empty state would be a dead end rather than something they can back out of.
   */
  it('keeps the clear-selection card and explains itself when no ship is a favourite', () => {
    const component = createComponent();
    component.favoriteShipIds = [];
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
      favoriteShipIds: new SimpleChange([], component.favoriteShipIds, true),
    });
    component.onFavoritesOnlyChange({ detail: { checked: true } } as never);

    expect(component.filteredShipCards().map((card) => card.shipId)).toEqual([null]);
    expect(component.favoritesOnlyIsEmpty()).toBe(true);
  });

  it('is not an empty state merely because a search found nothing', () => {
    const component = createComponent();
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
    });
    component.onSearchChange({ detail: { value: 'no such ship' } } as never);

    expect(component.favoritesOnlyIsEmpty()).toBe(false);
  });

  it('does not emit blocked ship selections on save', () => {
    const component = createComponent();
    const emitSpy = vi.spyOn(component.saveSelection, 'emit');

    component.selectedShipId = 9002;
    component.blockedShipIds = [9002];
    component.shipSupportLabels = {
      9002: 'This ship is excluded and cannot be confirmed as the manual ship.',
    };
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
      blockedShipIds: new SimpleChange([], component.blockedShipIds, true),
      shipSupportLabels: new SimpleChange({}, component.shipSupportLabels, true),
    });

    component.save();

    expect(component.selectedCard().isBlocked).toBe(true);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('renders the search, card selection and confirm action in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/shared/ship-picker/ship-picker.component.html'),
      'utf8',
    );

    expect(template).toContain("t('catalog.searchPlaceholder')");
    expect(template).toContain('(click)="selectShip(card.shipId)"');
    expect(template).toContain('(click)="onToggleFavoriteShip($event, card.shipId)"');
    expect(template).toContain('[disabled]="card.isFavoriteToggleBlocked"');
    expect(template).toContain('[disabled]="card.isBlocked"');
    expect(template).toContain('card.supportLabel');
    expect(template).toContain('[disabled]="selectedCard().isBlocked"');
    expect(template).toContain("t('favorites.addAria')");
    expect(template).toContain("{{ confirmLabel }}");
    expect(template).toContain("t('selected.title')");
  });

  /*
   * 869f135rf. A ship is the one team slot with no detail page and no comparison,
   * so the effect text IS the choice - and 44 of 66 ships have a description past
   * the 132-character cap, median 188 and max 500. Two thirds of that choice was
   * being made on a sentence fragment.
   */
  it('marks a long effect as truncated and keeps the full text available', () => {
    const component = createComponent();
    const longEffect = 'x'.repeat(200);

    component.ships = [
      { id: 1, name: 'Long', thumb: null, thumbUrl: null, description: longEffect },
    ] as never;
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
    });

    const card = component.filteredShipCards().find((entry) => entry.shipId === 1)!;

    expect(card.isTruncated).toBe(true);
    expect(card.subtitle.length).toBeLessThan(longEffect.length);
    expect(card.fullEffect).toBe(longEffect);
  });

  it('does not offer to expand an effect that was never cut', () => {
    const component = createComponent();

    component.ships = [
      { id: 2, name: 'Short', thumb: null, thumbUrl: null, description: 'Boosts ATK.' },
    ] as never;
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
      ships: new SimpleChange([], component.ships, true),
    });

    const card = component.filteredShipCards().find((entry) => entry.shipId === 2)!;

    expect(card.isTruncated).toBe(false);
    expect(card.subtitle).toBe('Boosts ATK.');
  });

  it('expands and collapses one ship at a time without selecting it', () => {
    const component = createComponent();
    const stopPropagation = vi.fn();
    const event = { stopPropagation } as unknown as Event;

    expect(component.isShipExpanded(1)).toBe(false);

    component.toggleShipEffect(1, event);

    expect(component.isShipExpanded(1)).toBe(true);
    expect(component.isShipExpanded(2)).toBe(false);
    /*
     * The toggle sits inside a card whose own click selects the ship, so the event
     * must not reach it: opening the effect to read it is not choosing it.
     */
    expect(stopPropagation).toHaveBeenCalled();

    component.toggleShipEffect(1, event);

    expect(component.isShipExpanded(1)).toBe(false);
  });

});

function createComponent() {
  const component = new ShipPickerComponent();

  component.title = 'Choose ship';
  component.copy = 'Pick one ship for this crew.';
  component.emptySelectionLabel = 'No ship';
  component.emptySelectionCopy = 'Leave the team without a ship.';
  component.confirmLabel = 'Use ship';
  component.selectedShipId = 9001;
  component.blockedShipIds = [];
  component.favoriteShipIds = [];
  component.blockedFavoriteShipIds = [];
  component.shipSupportLabels = {};
  component.ships = [
    {
      id: 9001,
      name: 'Going Merry',
      thumb: 'ship_0001_t2.png',
      thumbUrl: 'assets/offline-packs/ship-thumbnails/ship_0001_t2.png',
      description: 'Boosts ATK by 1.5x and makes PERFECTs easier to hit.',
    },
    {
      id: 9002,
      name: 'Coffin Boat',
      thumb: 'ship_0005_t2.png',
      thumbUrl: null,
      description: 'Boosts ATK and HP of Slasher characters by 1.5x.',
    },
  ];

  return component;
}
