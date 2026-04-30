import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { SpecialAbilityPickerComponent } from './special-ability-picker.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonToolbar: class {},
}));

describe('SpecialAbilityPickerComponent', () => {
  it('keeps a local working copy and defaults selected turn-aware abilities to one turn', () => {
    const component = createComponent();

    component.drafts = [
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    openComponent(component);

    component.toggleCatalogItem(component.catalogItems[1]!);

    expect(component.drafts).toHaveLength(1);
    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({ abilityKey: 'remove_bind', minTurns: 5 }),
      expect.objectContaining({ abilityKey: 'boost_atk', minTurns: 1 }),
    ]);
  });

  it('updates selected turns locally and emits cloned drafts on save', () => {
    const component = createComponent();
    const emitSpy = vi.spyOn(component.saveDrafts, 'emit');

    component.drafts = [
      {
        draftId: 'boost-1',
        abilityKey: 'boost_atk',
        minTurns: 1,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    openComponent(component);

    component.onRequiredTurnsChange(
      'boost-1',
      { detail: { value: '3' } } as CustomEvent<{ value?: string | number | null }>,
    );
    component.save();

    const emittedDrafts = emitSpy.mock.calls[0]?.[0] ?? [];

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({ abilityKey: 'boost_atk', minTurns: 3 }),
    ]);
    expect(emittedDrafts).toEqual(component.workingDrafts());
    expect(emittedDrafts).not.toBe(component.workingDrafts());
  });

  it('treats blank turns as ignore turns and hides the field for unsupported abilities', () => {
    const component = createComponent();

    component.drafts = [
      {
        draftId: 'boost-1',
        abilityKey: 'boost_atk',
        minTurns: 3,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        draftId: 'damage-1',
        abilityKey: 'special_damage',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    openComponent(component);

    component.onRequiredTurnsChange(
      'boost-1',
      { detail: { value: '' } } as CustomEvent<{ value?: string | number | null }>,
    );

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({ abilityKey: 'boost_atk', minTurns: null }),
      expect.objectContaining({ abilityKey: 'special_damage', minTurns: null }),
    ]);
    expect(component.selectedRows()).toEqual([
      expect.objectContaining({ supportsTurns: true }),
      expect.objectContaining({ supportsTurns: false }),
    ]);
  });

  it('renders editable selected-turn controls in the template', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/special-ability-picker/special-ability-picker.component.html',
      ),
      'utf8',
    );

    expect(template).toContain('@if (row.supportsTurns)');
    expect(template).toContain('onRequiredTurnsChange(row.draft.draftId, $event)');
    expect(template).toContain('min="0"');
  });
});

function createComponent(): SpecialAbilityPickerComponent {
  const component = new SpecialAbilityPickerComponent();

  component.category = 'special';
  component.eyebrow = 'Special';
  component.title = 'Special filters';
  component.copy = 'Pick special filters.';
  component.catalogItems = [
    {
      key: 'remove_bind',
      label: 'Bind',
      category: 'special',
      groupLabel: 'Reduce Status Effect Duration',
      groupOrder: 1,
      effectOrder: 1,
      supportsTurns: true,
      supportsSlotTokens: false,
      availableSlotTokens: [],
      availableSources: ['specialText'],
      matchCount: 1,
      sampleCharacterIds: [101],
      sampleTexts: ['Reduces Bind duration by 5 turns.'],
    },
    {
      key: 'boost_atk',
      label: 'Boost ATK',
      category: 'special',
      groupLabel: 'Boost Damage',
      groupOrder: 2,
      effectOrder: 1,
      supportsTurns: true,
      supportsSlotTokens: false,
      availableSlotTokens: [],
      availableSources: ['specialText'],
      matchCount: 1,
      sampleCharacterIds: [102],
      sampleTexts: ['Boosts ATK by 2x for 3 turns.'],
    },
    {
      key: 'special_damage',
      label: 'Damage',
      category: 'special',
      groupLabel: 'Damage',
      groupOrder: 3,
      effectOrder: 1,
      supportsTurns: false,
      supportsSlotTokens: false,
      availableSlotTokens: [],
      availableSources: ['specialText'],
      matchCount: 1,
      sampleCharacterIds: [103],
      sampleTexts: ['Deals damage.'],
    },
  ];

  return component;
}

function openComponent(component: SpecialAbilityPickerComponent): void {
  component.isOpen = true;
  component.ngOnChanges({
    catalogItems: new SimpleChange([], component.catalogItems, true),
    isOpen: new SimpleChange(false, true, true),
  });
}
