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
        // The scope control is data-gated, and in captain mode the scopes come
        // from captainAbilityEffectMatches — the index that actually backs the
        // captain filter. Without them the picker offers no scope at all.
        captainAbilityEffectMatches: [
          { characterId: 101, effectTargetScope: 'crew', slotTokens: [] },
          { characterId: 102, effectTargetScope: 'self', slotTokens: [] },
        ],
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
        captainAbilityEffectMatches: [
          { characterId: 101, effectTargetScope: 'crew', slotTokens: ['RCV'] },
          { characterId: 102, effectTargetScope: 'self', slotTokens: ['RCV'] },
        ],
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

  it('offers exactly the scopes real characters implement, not a static list', () => {
    const component = new AbilityRequirementPickerComponent();

    component.catalogItems = [
      {
        key: 'remove_special_bind',
        label: 'Special Bind (Silence)',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText', 'sailorAbilities'],
        availableCoverageModes: ['explicit'],
        availableEffectTargetScopes: ['crew', 'self'],
        matchCount: 464,
        sampleCharacterIds: [101],
        sampleTexts: ['Reduces Special Bind duration by 5 turns'],
      },
      {
        key: 'remove_burn',
        label: 'Burn',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        // Only ever cured crew-wide.
        availableEffectTargetScopes: ['crew'],
        matchCount: 190,
        sampleCharacterIds: [102],
        sampleTexts: ['Reduces Burn duration by 3 turns'],
      },
      {
        key: 'special_damage',
        label: 'Damage',
        supportsTurns: false,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        // Carries no scope at all.
        matchCount: 1823,
        sampleCharacterIds: [103],
        sampleTexts: ['Deals damage to all enemies'],
      },
    ];
    component.drafts = [];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onCatalogItemSelect(component.catalogItems[0]!);
    component.onCatalogItemSelect(component.catalogItems[1]!);
    component.onCatalogItemSelect(component.catalogItems[2]!);

    // Both real scopes, never captains/subs — nobody implements those.
    expect(component.selectedRows()[0]).toMatchObject({
      supportsEffectTargetScope: true,
      availableEffectTargetScopes: ['any', 'crew', 'self'],
    });
    // A single populated scope leaves nothing to choose between.
    expect(component.selectedRows()[1]).toMatchObject({
      availableEffectTargetScopes: ['any', 'crew'],
    });
    // No scope data at all => no scope control.
    expect(component.selectedRows()[2]).toMatchObject({
      supportsEffectTargetScope: false,
      availableEffectTargetScopes: ['any'],
    });
  });

  it('does not offer captain-only scopes outside captain ability mode', () => {
    // make_slots_favorable is scoped ONLY on its captainAbility branch, so in
    // special mode a scope filter would silently drop its specialText matches.
    const component = new AbilityRequirementPickerComponent();

    component.captainAbilityMode = false;
    component.catalogItems = [
      {
        key: 'make_slots_favorable',
        label: 'Make Slots Favorable',
        supportsTurns: false,
        supportsSlotTokens: true,
        availableSlotTokens: ['RCV'],
        availableSources: ['captainAbility', 'specialText'],
        availableCoverageModes: ['explicit'],
        captainAbilityEffectMatches: [
          { characterId: 101, effectTargetScope: 'crew', slotTokens: ['RCV'] },
        ],
        matchCount: 996,
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
      supportsEffectTargetScope: false,
      availableEffectTargetScopes: ['any'],
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

  it('shows a source-aware match count that is captain-scoped in captain mode', () => {
    // "Enemy Resilience" matches 137 characters overall but only ONE as a captain.
    // A captain requirement resolves against captainAbilityMatchingCharacterIds,
    // so showing 137 there would promise matches the filter will never return.
    const catalogItems = [
      {
        key: 'remove_resilience',
        label: 'Enemy Resilience',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText', 'captainAbility'],
        availableCoverageModes: ['explicit'],
        matchCount: 137,
        captainAbilityMatchingCharacterIds: [4322],
        sampleCharacterIds: [4322],
        sampleTexts: ["Reduces enemies' Resilience duration by 5 turns"],
      },
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText', 'captainAbility'],
        availableCoverageModes: ['explicit'],
        matchCount: 527,
        captainAbilityMatchingCharacterIds: [1, 2, 3, 4, 5, 6, 7, 8],
        sampleCharacterIds: [1],
        sampleTexts: ['Reduces Bind duration by 3 turns'],
      },
      {
        // No captain-scoped index at all: the filter falls back to the
        // ability-wide ids, so the tile must show the ability-wide count too.
        key: 'boost_atk',
        label: 'Boost ATK',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText'],
        availableCoverageModes: ['explicit'],
        matchCount: 1338,
        sampleCharacterIds: [9],
        sampleTexts: ['Boosts ATK of all characters by 1.5x'],
      },
    ];
    const open = (captainAbilityMode: boolean) => {
      const component = new AbilityRequirementPickerComponent();

      component.captainAbilityMode = captainAbilityMode;
      component.catalogItems = structuredClone(catalogItems) as never;
      component.isOpen = true;
      component.ngOnChanges({
        catalogItems: new SimpleChange([], component.catalogItems, true),
        isOpen: new SimpleChange(false, true, true),
      });

      return new Map(
        component.filteredCatalogTiles().map((tile) => [tile.item.key, tile] as const),
      );
    };

    const specialTiles = open(false);
    expect(specialTiles.get('remove_resilience')?.matchCount).toBe(137);
    expect(specialTiles.get('remove_resilience')?.isScarce).toBe(false);
    expect(specialTiles.get('remove_bind')?.matchCount).toBe(527);

    const captainTiles = open(true);
    // The regression: captain mode must report the captain-scoped count.
    expect(captainTiles.get('remove_resilience')?.matchCount).toBe(1);
    expect(captainTiles.get('remove_resilience')?.isScarce).toBe(true);
    // 8 captain matches is above the scarcity threshold, so no warning.
    expect(captainTiles.get('remove_bind')?.matchCount).toBe(8);
    expect(captainTiles.get('remove_bind')?.isScarce).toBe(false);
    // No captain-scoped index -> same fallback the filter uses.
    expect(captainTiles.get('boost_atk')?.matchCount).toBe(1338);
    expect(captainTiles.get('boost_atk')?.isScarce).toBe(false);
  });

  it('renders the match count on the catalog tile with scarce styling', () => {
    const template = readFileSync(
      resolve(__dirname, 'ability-requirement-picker.component.html'),
      'utf8',
    );

    expect(template).toContain("t('catalog.matchCount', { count: tile.matchCount })");
    expect(template).toContain(
      '[class.ability-picker-tile__match-count--scarce]="tile.isScarce"',
    );
  });
});
