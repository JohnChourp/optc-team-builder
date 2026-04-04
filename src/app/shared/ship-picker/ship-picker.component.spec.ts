import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ShipPickerComponent } from './ship-picker.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonFooter: class {},
  IonIcon: class {},
  IonModal: class {},
  IonSearchbar: class {},
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
    expect(template).toContain('[disabled]="card.isBlocked"');
    expect(template).toContain('card.supportLabel');
    expect(template).toContain('[disabled]="selectedCard().isBlocked"');
    expect(template).toContain("{{ confirmLabel }}");
    expect(template).toContain("t('selected.title')");
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
