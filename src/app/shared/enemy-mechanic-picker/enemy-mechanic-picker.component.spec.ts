import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { EnemyMechanicPickerComponent } from './enemy-mechanic-picker.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonFooter: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonToolbar: class {},
}));

describe('EnemyMechanicPickerComponent', () => {
  it('keeps a local working copy until save is emitted', () => {
    const component = new EnemyMechanicPickerComponent();
    const inputDrafts = [
      {
        draftId: 'barrier-1',
        mechanicKey: 'enemy_barrier',
        category: 'enemyDefense' as const,
        minTurns: 3,
        triggerTags: [],
        responseTags: [],
        conditionTags: [],
        derivedAbilityKey: 'remove_enemy_barrier',
      },
    ];

    component.catalogItems = [
      {
        key: 'enemy_barrier',
        label: 'Barrier',
        category: 'enemyDefense',
        supportsTurns: true,
        availableTriggerTags: [],
        availableResponseTags: [],
        availableConditionTags: [],
        defaultTriggerTags: [],
        defaultResponseTags: [],
        defaultConditionTags: [],
        derivedAbilityKey: 'remove_enemy_barrier',
        keywords: ['barrier'],
      },
      {
        key: 'interrupt_special',
        label: 'Interrupt on Special',
        category: 'interrupt',
        supportsTurns: false,
        availableTriggerTags: ['onSpecial'],
        availableResponseTags: ['removeBuffs'],
        availableConditionTags: [],
        defaultTriggerTags: ['onSpecial'],
        defaultResponseTags: [],
        defaultConditionTags: [],
        derivedAbilityKey: null,
        keywords: ['interrupt'],
      },
    ];
    component.drafts = inputDrafts;
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onCatalogItemSelect(component.catalogItems[1]!);

    expect(inputDrafts).toHaveLength(1);
    expect(component.workingDrafts()).toHaveLength(2);
  });

  it('emits normalized mechanic requirements when saved', () => {
    const component = new EnemyMechanicPickerComponent();
    const emitSpy = vi.spyOn(component.saveDrafts, 'emit');

    component.catalogItems = [
      {
        key: 'interrupt_special',
        label: 'Interrupt on Special',
        category: 'interrupt',
        supportsTurns: false,
        availableTriggerTags: ['onSpecial'],
        availableResponseTags: ['removeBuffs'],
        availableConditionTags: [],
        defaultTriggerTags: ['onSpecial'],
        defaultResponseTags: [],
        defaultConditionTags: [],
        derivedAbilityKey: null,
        keywords: ['interrupt'],
      },
    ];
    component.drafts = [
      {
        draftId: 'interrupt-1',
        mechanicKey: 'interrupt_special',
        category: 'interrupt',
        minTurns: null,
        triggerTags: ['onSpecial'],
        responseTags: ['removeBuffs'],
        conditionTags: [],
        derivedAbilityKey: null,
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.save();

    expect(emitSpy).toHaveBeenCalledWith([
      {
        mechanicKey: 'interrupt_special',
        category: 'interrupt',
        minTurns: null,
        triggerTags: ['onSpecial'],
        responseTags: ['removeBuffs'],
        conditionTags: [],
        derivedAbilityKey: null,
      },
    ]);
  });

  it('renders category sections and tag blocks in the template', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/enemy-mechanic-picker/enemy-mechanic-picker.component.html',
      ),
      'utf8',
    );

    expect(template).toContain("t('categories.' + section.category)");
    expect(template).toContain("@if (row.availableTriggerTags.length)");
    expect(template).toContain("@if (row.availableResponseTags.length)");
    expect(template).toContain("@if (row.availableConditionTags.length)");
  });
});
