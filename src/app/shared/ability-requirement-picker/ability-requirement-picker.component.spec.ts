import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { AbilityRequirementPickerComponent } from './ability-requirement-picker.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonToolbar: class {},
}));

describe('AbilityRequirementPickerComponent', () => {
  it('keeps a local working copy until save is emitted', () => {
    const component = new AbilityRequirementPickerComponent();
    const inputDrafts = [
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];

    component.catalogItems = [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Removes bind'],
      },
      {
        key: 'remove_slot_barrier',
        label: 'Remove Slot Barrier',
        supportsTurns: true,
        supportsSlotTokens: true,
        availableSlotTokens: ['DEX'],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 6,
        sampleCharacterIds: [102],
        sampleTexts: ['Removes a slot barrier'],
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

  it('appends another draft when the same catalog item is selected again', () => {
    const component = new AbilityRequirementPickerComponent();

    component.catalogItems = [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Removes bind'],
      },
    ];
    component.drafts = [];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onCatalogItemSelect(component.catalogItems[0]!);
    component.onCatalogItemSelect(component.catalogItems[0]!);

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({ abilityKey: 'remove_bind' }),
      expect.objectContaining({ abilityKey: 'remove_bind' }),
    ]);
    expect(component.selectedDraftCounts().get('remove_bind')).toBe(2);
  });

  it('emits a cloned draft payload when saved', () => {
    const component = new AbilityRequirementPickerComponent();
    const emitSpy = vi.spyOn(component.saveDrafts, 'emit');

    component.catalogItems = [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Removes bind'],
      },
    ];
    component.drafts = [
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.save();

    const emittedDrafts = emitSpy.mock.calls[0]?.[0] ?? [];

    expect(emittedDrafts).toEqual(component.workingDrafts());
    expect(emittedDrafts).not.toBe(component.workingDrafts());
  });

  it('preserves captain source scope in working and saved drafts', () => {
    const component = new AbilityRequirementPickerComponent();
    const emitSpy = vi.spyOn(component.saveDrafts, 'emit');

    component.catalogItems = [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['captainAbility', 'specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Removes bind'],
      },
    ];
    component.drafts = [
      {
        draftId: 'captain-bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.save();

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      }),
    ]);
    expect(emitSpy.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      }),
    ]);
  });

  it('preserves structured captain utility controls in working and saved drafts', () => {
    const component = new AbilityRequirementPickerComponent();
    const emitSpy = vi.spyOn(component.saveDrafts, 'emit');

    component.captainAbilityMode = true;
    component.catalogItems = [
      {
        key: 'reduce_damage',
        label: 'Reduce Damage',
        supportsTurns: false,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['captainAbility'],
        availableCoverageModes: ['explicit'],
        // The scope control is data-gated: without populated scopes the picker
        // offers no scope at all, so the fixture must declare the ones its
        // characters implement.
        availableEffectTargetScopes: ['crew', 'self'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Reduces damage received by 20%'],
      },
    ];
    component.drafts = [
      {
        draftId: 'captain-damage-1',
        abilityKey: 'reduce_damage',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
        sourceScope: 'captainAbility',
        minEffectValue: 10,
        effectTargetScope: 'crew',
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onMinEffectValueChange('captain-damage-1', {
      detail: { value: '20' },
    } as CustomEvent<{ value: string }>);
    component.setEffectTargetScope('captain-damage-1', 'self');
    component.save();

    expect(component.selectedRows()[0]).toMatchObject({
      supportsMinEffectValue: true,
      supportsEffectTargetScope: true,
    });
    expect(emitSpy.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        minEffectValue: 20,
        effectTargetScope: 'self',
      }),
    ]);
  });

  it('marks captain favorable slot filters as slot-token aware', () => {
    const component = new AbilityRequirementPickerComponent();

    component.captainAbilityMode = true;
    component.catalogItems = [
      {
        key: 'make_slots_favorable',
        label: 'Make Slots Favorable',
        supportsTurns: false,
        supportsSlotTokens: true,
        availableSlotTokens: ['RCV'],
        availableSources: ['captainAbility'],
        availableCoverageModes: ['explicit'],
        availableEffectTargetScopes: ['crew', 'self'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Makes [RCV] orbs beneficial for all characters'],
      },
    ];
    component.drafts = [];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onCatalogItemSelect(component.catalogItems[0]!);

    expect(component.selectedRows()[0]).toMatchObject({
      supportsSlotTokens: true,
      supportsEffectTargetScope: true,
      availableSlotTokens: ['RCV'],
    });
  });

  it('keeps turns value 0 in working drafts so it can serialize as ignore turns', () => {
    const component = new AbilityRequirementPickerComponent();

    component.catalogItems = [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Removes bind'],
      },
    ];
    component.drafts = [
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onRequiredTurnsChange('bind-1', { detail: { value: '0' } } as CustomEvent<{
      value?: string | number | null;
    }>);

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_bind',
        minTurns: 0,
      }),
    ]);
  });

  it('updates the selected row slot scope', () => {
    const component = new AbilityRequirementPickerComponent();

    component.catalogItems = [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ['Removes bind'],
      },
    ];
    component.drafts = [
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.setSlotScope('bind-1', 'leader');

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_bind',
        slotScope: 'leader',
      }),
    ]);
  });

  it('keeps leader boost controls opt-in and does not emit settings by default', () => {
    const component = new AbilityRequirementPickerComponent();
    const settingsSpy = vi.spyOn(component.saveLeaderBoostSettings, 'emit');

    component.drafts = [];
    component.catalogItems = [];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.save();

    expect(component.showLeaderBoostControls).toBe(false);
    expect(settingsSpy).not.toHaveBeenCalled();
  });

  it('emits edited leader boost priority and ranges when enabled', () => {
    const component = new AbilityRequirementPickerComponent();
    const settingsSpy = vi.spyOn(component.saveLeaderBoostSettings, 'emit');

    component.showLeaderBoostControls = true;
    component.leaderBoostFilters = ['HP', 'ATK'];
    component.leaderBoostRanges = {
      ATK: { min: null, max: null },
      HP: { min: null, max: null },
    };
    component.drafts = [];
    component.catalogItems = [];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onLeaderBoostFilterChange({ detail: { value: ['ATK'] } } as CustomEvent<{
      value: ['ATK'];
    }>);
    component.onLeaderBoostRangeChange('ATK', 'min', {
      detail: { value: '5.25' },
    } as CustomEvent<{ value: string }>);
    component.onLeaderBoostRangeChange('ATK', 'max', {
      detail: { value: '6' },
    } as CustomEvent<{ value: string }>);
    component.onLeaderBoostRangeChange('HP', 'min', {
      detail: { value: '1.3' },
    } as CustomEvent<{ value: string }>);
    component.save();

    expect(settingsSpy).toHaveBeenCalledWith({
      filters: ['ATK'],
      ranges: {
        ATK: { min: 5.25, max: 6 },
        HP: { min: 1.3, max: null },
      },
    });
  });

  it('does not emit leader boost changes when dismissed without saving', () => {
    const component = new AbilityRequirementPickerComponent();
    const settingsSpy = vi.spyOn(component.saveLeaderBoostSettings, 'emit');
    const inputRanges = {
      ATK: { min: null, max: null },
      HP: { min: null, max: null },
    };

    component.showLeaderBoostControls = true;
    component.leaderBoostFilters = ['HP', 'ATK'];
    component.leaderBoostRanges = inputRanges;
    component.drafts = [];
    component.catalogItems = [];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onLeaderBoostRangeChange('ATK', 'min', {
      detail: { value: '5' },
    } as CustomEvent<{ value: string }>);
    component.cancel();

    expect(settingsSpy).not.toHaveBeenCalled();
    expect(inputRanges).toEqual({
      ATK: { min: null, max: null },
      HP: { min: null, max: null },
    });
  });

  it('blocks saving when leader boost range bounds are invalid', () => {
    const component = new AbilityRequirementPickerComponent();
    const settingsSpy = vi.spyOn(component.saveLeaderBoostSettings, 'emit');
    const draftsSpy = vi.spyOn(component.saveDrafts, 'emit');

    component.showLeaderBoostControls = true;
    component.drafts = [];
    component.catalogItems = [];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onLeaderBoostRangeChange('HP', 'min', {
      detail: { value: '1.5' },
    } as CustomEvent<{ value: string }>);
    component.onLeaderBoostRangeChange('HP', 'max', {
      detail: { value: '1.3' },
    } as CustomEvent<{ value: string }>);
    component.save();

    expect(component.hasInvalidLeaderBoostRanges()).toBe(true);
    expect(settingsSpy).not.toHaveBeenCalled();
    expect(draftsSpy).not.toHaveBeenCalled();
  });

  it('renders badge and conditional field blocks in the template', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/ability-requirement-picker/ability-requirement-picker.component.html',
      ),
      'utf8',
    );

    expect(template).toContain('ability-picker-tile__badge');
    expect(template).toContain('ability-picker-mini-badge-list');
    expect(template).toContain('@if (row.supportsTurns)');
    expect(template).toContain('min="0"');
    expect(template).toContain('ability-picker-segmented');
    expect(template).toContain("setSlotScope(row.draft.draftId, 'leader')");
    expect(template).toContain('@if (row.supportsSlotTokens && row.availableSlotTokens.length)');
    expect(template).toContain('@if (row.supportsMinEffectValue)');
    expect(template).toContain('onMinEffectValueChange(row.draft.draftId, $event)');
    expect(template).toContain(
      '@if (row.supportsEffectTargetScope && row.availableEffectTargetScopes.length > 1)',
    );
    // Scopes come from the ROW (data-gated per ability), never a static list.
    expect(template).toContain('@for (scope of row.availableEffectTargetScopes; track scope)');
    expect(template).toContain('setEffectTargetScope(row.draft.draftId, scope)');
    expect(template).toContain('@if (showLeaderBoostControls)');
    expect(template).toContain("t('leaderBoost.range.atkMin')");
    expect(template).toContain("onLeaderBoostRangeChange('HP', 'max', $event)");
    expect(template).toContain('[disabled]="hasInvalidLeaderBoostRanges()"');
  });
});
