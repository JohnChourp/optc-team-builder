// @vitest-environment jsdom
import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type AbilityFilterTagSetSelection,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  createAbilityFilterTagSet,
  createEmptyAbilityFilterTagSetSelection,
} from '../../core/services/ability-filter-tag-set.utils';
import {
  AbilityTagSetPickerComponent,
  type AbilityTagSetPickerSection,
} from './ability-tag-set-picker.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonToolbar: class {},
}));

const BOOST_ATK = catalogItem('boost_atk', 'Boost ATK', [1, 2, 3]);
const HEAL = catalogItem('heal', 'Heal Crew', [4, 5]);
const DELAY = catalogItem('delay', 'Delay Enemies', [3, 5, 6]);
const REDUCE_DAMAGE = catalogItem('reduce_damage', 'Reduce Damage', [2, 4]);
// The captain index deliberately disagrees with the crew-wide one, so a test can
// prove the captain scope is what actually drove the count.
const CAPTAIN_BOOST_ATK: AutoBuildAbilityCatalogItem = {
  ...catalogItem('captain_boost_atk', 'Captain Boost ATK', [1, 2, 7]),
  captainAbilityMatchingCharacterIds: [7],
};

describe('AbilityTagSetPickerComponent', () => {
  it('edits a cloned draft and leaves the host selection untouched until save', () => {
    const component = createComponent();
    const selection: AbilityFilterTagSetSelection = {
      operator: 'all',
      sets: [createAbilityFilterTagSet([requirement('boost_atk')], 'any', 'set-1')],
    };

    component.selection = selection;
    openComponent(component);
    component.toggleCatalogItem(HEAL);

    expect(component.workingSelection().sets[0]?.requirements.map((r) => r.abilityKey)).toEqual([
      'boost_atk',
      'heal',
    ]);
    expect(selection.sets[0]?.requirements.map((r) => r.abilityKey)).toEqual(['boost_atk']);
    expect(component.workingSelection().sets[0]).not.toBe(selection.sets[0]);
  });

  it('emits a cloned selection on save and drops half-built empty groups', () => {
    const component = createComponent();
    const emitSpy = vi.spyOn(component.saveSelection, 'emit');

    component.selection = {
      operator: 'all',
      sets: [
        createAbilityFilterTagSet([requirement('boost_atk'), requirement('heal')], 'any', 'set-1'),
        createAbilityFilterTagSet([], 'any', 'set-empty'),
      ],
    };
    openComponent(component);
    component.save();

    const emitted = emitSpy.mock.calls[0]?.[0];

    expect(emitted?.operator).toBe('all');
    expect(emitted?.sets).toHaveLength(1);
    expect(emitted?.sets[0]).toEqual(
      expect.objectContaining({
        id: 'set-1',
        operator: 'any',
        requirements: [
          expect.objectContaining({ abilityKey: 'boost_atk' }),
          expect.objectContaining({ abilityKey: 'heal' }),
        ],
      }),
    );
    expect(emitted?.sets[0]).not.toBe(component.workingSelection().sets[0]);
    expect(emitted?.sets[0]?.requirements[0]).not.toBe(
      component.workingSelection().sets[0]?.requirements[0],
    );
  });

  it('discards draft edits when the modal is cancelled and reopened', () => {
    const component = createComponent();
    const dismissSpy = vi.spyOn(component.dismiss, 'emit');

    component.selection = {
      operator: 'all',
      sets: [createAbilityFilterTagSet([requirement('delay')], 'any', 'set-1')],
    };
    openComponent(component);
    component.toggleCatalogItem(REDUCE_DAMAGE);
    component.cancel();

    expect(dismissSpy).toHaveBeenCalledTimes(1);

    // The host never wrote the draft back, so reopening restores its selection.
    component.isOpen = false;
    component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });
    openComponent(component);

    expect(component.workingSelection().sets[0]?.requirements.map((r) => r.abilityKey)).toEqual([
      'delay',
    ]);
  });

  it('does not re-emit dismiss when the modal closes after an explicit action', () => {
    const component = createComponent();
    const dismissSpy = vi.spyOn(component.dismiss, 'emit');

    openComponent(component);
    component.save();
    component.onModalDidDismiss();

    expect(dismissSpy).not.toHaveBeenCalled();

    // A backdrop dismiss has no recorded reason, so it still reports upward.
    component.onModalDidDismiss();

    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('does not re-emit dismiss when the modal closes after an explicit cancel', () => {
    const component = createComponent();
    const dismissSpy = vi.spyOn(component.dismiss, 'emit');

    openComponent(component);
    component.cancel();
    component.onModalDidDismiss();

    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults a new group to "any", matching mostly-disjoint ability tags', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();

    expect(component.workingSelection().sets[0]?.operator).toBe('any');
    expect(component.workingSelection().operator).toBe('all');
    expect(component.activeSetId()).toBe(component.workingSelection().sets[0]?.id);
    expect(component.isCatalogOpen()).toBe(true);
  });

  it('stops adding groups at maxSets', () => {
    const component = createComponent();

    component.maxSets = 2;
    openComponent(component);
    component.addSet();
    component.addSet();
    component.addSet();

    expect(component.workingSelection().sets).toHaveLength(2);
    expect(component.canAddSet()).toBe(false);
  });

  it('keeps existing over-cap groups instead of trimming a host selection', () => {
    const component = createComponent();

    component.maxSets = 1;
    component.selection = {
      operator: 'all',
      sets: [
        createAbilityFilterTagSet([requirement('boost_atk')], 'any', 'set-1'),
        createAbilityFilterTagSet([requirement('delay')], 'any', 'set-2'),
      ],
    };
    openComponent(component);

    expect(component.workingSelection().sets).toHaveLength(2);
    expect(component.canAddSet()).toBe(false);
  });

  it('lets the same ability key join two different groups', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleCatalogItem(DELAY);

    const firstSetId = component.workingSelection().sets[0]!.id;

    component.addSet();
    component.toggleCatalogItem(DELAY);

    const [first, second] = component.workingSelection().sets;

    expect(first?.requirements.map((r) => r.abilityKey)).toEqual(['delay']);
    expect(second?.requirements.map((r) => r.abilityKey)).toEqual(['delay']);
    expect(second?.id).not.toBe(firstSetId);
    expect(tileFor(component, 'delay')?.memberSetIndexes).toEqual([1, 2]);
  });

  it('toggles an ability out of the active group only', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleCatalogItem(DELAY);
    component.addSet();
    component.toggleCatalogItem(DELAY);
    component.toggleCatalogItem(DELAY);

    const [first, second] = component.workingSelection().sets;

    expect(first?.requirements.map((r) => r.abilityKey)).toEqual(['delay']);
    expect(second?.requirements).toEqual([]);
  });

  it('shows the operator control only from two tags up, with a count per option', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleCatalogItem(BOOST_ATK);

    expect(component.setCards()[0]?.showsOperator).toBe(false);

    component.toggleCatalogItem(DELAY);

    const card = component.setCards()[0];

    expect(card?.showsOperator).toBe(true);
    // Boost ATK = {1,2,3}, Delay = {3,5,6}.
    expect(card?.anyCount).toBe(5);
    expect(card?.allCount).toBe(1);
    expect(card?.matchCount).toBe(5);
  });

  it('flags an all-group that no character can satisfy', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleCatalogItem(BOOST_ATK);
    component.toggleCatalogItem(HEAL);
    component.setSetOperator(component.workingSelection().sets[0]!.id, 'all');

    const card = component.setCards()[0];

    expect(card?.matchCount).toBe(0);
    expect(card?.isNullifying).toBe(true);
  });

  it('scopes a tag picked from a captain section to the leader slot', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleCatalogItem(CAPTAIN_BOOST_ATK, true);

    expect(component.workingSelection().sets[0]?.requirements[0]).toEqual(
      expect.objectContaining({
        abilityKey: 'captain_boost_atk',
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      }),
    );
    // Resolved through captainAbilityMatchingCharacterIds ([7]), not the
    // crew-wide index ([1,2,7]).
    expect(component.setCards()[0]?.matchCount).toBe(1);
  });

  it('leaves a tag picked from a plain section unscoped', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleCatalogItem(BOOST_ATK);

    const requirementEntry = component.workingSelection().sets[0]?.requirements[0];

    expect(requirementEntry).toEqual(
      expect.objectContaining({
        abilityKey: 'boost_atk',
        slotScope: 'any',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      }),
    );
    expect(requirementEntry).not.toHaveProperty('sourceScope');
  });

  describe('a key shared by the captain + a category section', () => {
    // "Enemy Damage Reduction" is captain- AND special-sourced, so the same key
    // is offered in both sections. Broad vs captain-only match indexes let each
    // test prove which scope actually drove the selection.
    const SHARED: AutoBuildAbilityCatalogItem = {
      ...catalogItem('remove_damage_reduction', 'Enemy Damage Reduction', [1, 2, 3, 4, 5]),
      availableSources: ['captainAbility', 'specialText'],
      captainAbilityMatchingCharacterIds: [3],
    };

    function createSharedComponent(): AbilityTagSetPickerComponent {
      const component = new AbilityTagSetPickerComponent();
      component.title = 'Ability tags';
      component.sections = [
        { category: 'special', label: 'Special effects', items: [SHARED, BOOST_ATK] },
        { category: 'captain', label: 'Captain effects', items: [SHARED], captainAbility: true },
      ];
      component.selection = createEmptyAbilityFilterTagSetSelection();
      openComponent(component);
      component.addSet();
      return component;
    }

    function sharedTileIn(
      component: AbilityTagSetPickerComponent,
      sectionKey: string,
    ): { item: AutoBuildAbilityCatalogItem; isCaptainScope: boolean; inActiveSet: boolean } {
      const tile = component
        .filteredSections()
        .find((section) => section.key === sectionKey)
        ?.tiles.find((t) => t.item.key === 'remove_damage_reduction');

      if (!tile) {
        throw new Error(`no shared tile in section ${sectionKey}`);
      }

      return tile;
    }

    it('leaves a shared key unscoped and highlights only the special tile when picked there', () => {
      const component = createSharedComponent();
      const specialTile = sharedTileIn(component, 'special');

      component.toggleCatalogItem(specialTile.item, specialTile.isCaptainScope);

      const req = component.workingSelection().sets[0]?.requirements[0];
      expect(req).toEqual(
        expect.objectContaining({ abilityKey: 'remove_damage_reduction', slotScope: 'any' }),
      );
      expect(req).not.toHaveProperty('sourceScope');
      expect(sharedTileIn(component, 'special').inActiveSet).toBe(true);
      expect(sharedTileIn(component, 'captain').inActiveSet).toBe(false);
    });

    it('captain-scopes a shared key and highlights only the captain tile when picked there', () => {
      const component = createSharedComponent();
      const captainTile = sharedTileIn(component, 'captain');

      component.toggleCatalogItem(captainTile.item, captainTile.isCaptainScope);

      expect(component.workingSelection().sets[0]?.requirements[0]).toEqual(
        expect.objectContaining({
          abilityKey: 'remove_damage_reduction',
          slotScope: 'leader',
          sourceScope: 'captainAbility',
        }),
      );
      expect(sharedTileIn(component, 'captain').inActiveSet).toBe(true);
      expect(sharedTileIn(component, 'special').inActiveSet).toBe(false);
    });

    it('keeps both scopes of a shared key as independent tags in one set', () => {
      const component = createSharedComponent();
      const specialTile = sharedTileIn(component, 'special');
      component.toggleCatalogItem(specialTile.item, specialTile.isCaptainScope);
      const captainTile = sharedTileIn(component, 'captain');
      component.toggleCatalogItem(captainTile.item, captainTile.isCaptainScope);

      const reqs = component.workingSelection().sets[0]?.requirements ?? [];
      expect(reqs).toHaveLength(2);
      expect(reqs.filter((r) => r.sourceScope === 'captainAbility')).toHaveLength(1);
      expect(reqs.filter((r) => !r.sourceScope)).toHaveLength(1);
      expect(sharedTileIn(component, 'special').inActiveSet).toBe(true);
      expect(sharedTileIn(component, 'captain').inActiveSet).toBe(true);
    });

    it('removes only the picked scope of a shared key, leaving the other selected', () => {
      const component = createSharedComponent();
      const specialTile = sharedTileIn(component, 'special');
      component.toggleCatalogItem(specialTile.item, specialTile.isCaptainScope);
      const captainTile = sharedTileIn(component, 'captain');
      component.toggleCatalogItem(captainTile.item, captainTile.isCaptainScope);

      const setId = component.workingSelection().sets[0]!.id;
      const unscoped = component.workingSelection().sets[0]!.requirements.find((r) => !r.sourceScope)!;
      component.removeRequirement(setId, unscoped);

      const reqs = component.workingSelection().sets[0]?.requirements ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]?.sourceScope).toBe('captainAbility');
      expect(sharedTileIn(component, 'special').inActiveSet).toBe(false);
      expect(sharedTileIn(component, 'captain').inActiveSet).toBe(true);
    });

    it('resolves the special scope against the broad index, not the captain one', () => {
      const component = createSharedComponent();
      const specialTile = sharedTileIn(component, 'special');

      component.toggleCatalogItem(specialTile.item, specialTile.isCaptainScope);

      // Broad matchingCharacterIds ([1..5]) — NOT the captain subset ([3]).
      expect(component.setCards()[0]?.matchCount).toBe(5);
    });

    it('resolves the captain scope against the captain index', () => {
      const component = createSharedComponent();
      const captainTile = sharedTileIn(component, 'captain');

      component.toggleCatalogItem(captainTile.item, captainTile.isCaptainScope);

      expect(component.setCards()[0]?.matchCount).toBe(1);
    });
  });

  describe('per-turn selection', () => {
    // Non-captain special effect with three ascending turn buckets.
    const REDUCE: AutoBuildAbilityCatalogItem = {
      ...catalogItem('reduce_damage', 'Reduce Damage', [1, 2, 3, 4, 5]),
      supportsTurns: true,
      turnMatchingCharacterIds: [
        { minTurns: 1, characterIds: [1, 2, 3, 4, 5] },
        { minTurns: 2, characterIds: [2, 3, 4, 5] },
        { minTurns: 3, characterIds: [3, 4, 5] },
      ],
    };
    // A cure whose only bucket is the 99 sentinel plus a finite bucket.
    const CURE: AutoBuildAbilityCatalogItem = {
      ...catalogItem('crewmate_recover_stun', 'Recover Stun', [10, 20]),
      category: 'crewmate',
      supportsTurns: true,
      turnMatchingCharacterIds: [
        { minTurns: 1, characterIds: [10] },
        { minTurns: 99, characterIds: [20] },
      ],
    };
    // Turn-supporting item that is ALSO captain-sourced WITH captain turn buckets.
    const CAPTAIN_WITH_BUCKETS: AutoBuildAbilityCatalogItem = {
      ...catalogItem('boost_base_atk', 'Boost Base ATK', [1, 2, 7]),
      supportsTurns: true,
      availableSources: ['specialText', 'captainAbility'],
      captainAbilityMatchingCharacterIds: [1, 2, 7],
      turnMatchingCharacterIds: [
        { minTurns: 1, characterIds: [1, 2, 7] },
        { minTurns: 2, characterIds: [2, 7] },
      ],
      captainAbilityTurnMatchingCharacterIds: [{ minTurns: 1, characterIds: [7] }],
    };
    // Captain-sourced turn item WITHOUT a captain per-turn index (the empty-set trap).
    const CAPTAIN_NO_BUCKETS: AutoBuildAbilityCatalogItem = {
      ...catalogItem('nullify_damage', 'Nullify Damage', [1, 2, 3]),
      supportsTurns: true,
      availableSources: ['specialText', 'captainAbility'],
      captainAbilityMatchingCharacterIds: [1, 2, 3],
      turnMatchingCharacterIds: [{ minTurns: 1, characterIds: [1, 2, 3] }],
    };
    // supportsTurns is false (e.g. a potential resistance).
    const NO_TURNS = catalogItem('potential_str_damage_reduction', 'STR Damage Reduction', [9]);

    function turnComponent(): AbilityTagSetPickerComponent {
      const component = new AbilityTagSetPickerComponent();
      component.title = 'Ability tags';
      component.sections = [
        {
          category: 'special',
          label: 'Special',
          items: [REDUCE, CURE, NO_TURNS, CAPTAIN_WITH_BUCKETS, CAPTAIN_NO_BUCKETS],
        },
        {
          category: 'captain',
          label: 'Captain',
          items: [CAPTAIN_WITH_BUCKETS, CAPTAIN_NO_BUCKETS],
          captainAbility: true,
        },
      ];
      component.selection = createEmptyAbilityFilterTagSetSelection();
      openComponent(component);
      component.addSet();
      return component;
    }

    function chipFor(
      component: AbilityTagSetPickerComponent,
      abilityKey: string,
      captainScoped: boolean,
    ) {
      return component
        .setCards()[0]
        ?.chips.find(
          (chip) =>
            chip.requirement.abilityKey === abilityKey &&
            (chip.requirement.sourceScope === 'captainAbility') === captainScoped,
        );
    }

    it('offers each ascending turn bucket for a turn-based chip', () => {
      const component = turnComponent();
      component.toggleCatalogItem(REDUCE, false);

      const chip = chipFor(component, 'reduce_damage', false);
      expect(chip?.supportsTurns).toBe(true);
      expect(chip?.turnOptions).toEqual([
        { value: 1, permanent: false },
        { value: 2, permanent: false },
        { value: 3, permanent: false },
      ]);
    });

    it('shows no turn control for an ability that does not support turns', () => {
      const component = turnComponent();
      component.toggleCatalogItem(NO_TURNS, false);

      const chip = chipFor(component, 'potential_str_damage_reduction', false);
      expect(chip?.supportsTurns).toBe(false);
      expect(chip?.turnOptions).toEqual([]);
    });

    it('collapses 99+ sentinel buckets into a single permanent option', () => {
      const component = turnComponent();
      component.toggleCatalogItem(CURE, false);

      const chip = chipFor(component, 'crewmate_recover_stun', false);
      expect(chip?.turnOptions).toEqual([
        { value: 1, permanent: false },
        { value: 99, permanent: true },
      ]);
    });

    it('reads the captain per-turn index for a captain-scoped chip', () => {
      const component = turnComponent();
      component.toggleCatalogItem(CAPTAIN_WITH_BUCKETS, true);

      const chip = chipFor(component, 'boost_base_atk', true);
      // captainAbilityTurnMatchingCharacterIds has only minTurns=1, unlike the
      // crew-wide buckets [1,2] — proving the scope-appropriate list is used.
      expect(chip?.supportsTurns).toBe(true);
      expect(chip?.turnOptions).toEqual([{ value: 1, permanent: false }]);
    });

    it('hides the turn control for a captain scope with no captain turn buckets', () => {
      const component = turnComponent();
      component.toggleCatalogItem(CAPTAIN_NO_BUCKETS, true);
      component.toggleCatalogItem(CAPTAIN_NO_BUCKETS, false);

      // Captain scope: no captainAbilityTurnMatchingCharacterIds -> no control,
      // so the user cannot collapse the captain match set to zero.
      expect(chipFor(component, 'nullify_damage', true)?.supportsTurns).toBe(false);
      // Non-captain scope: crew-wide buckets exist -> control shows.
      expect(chipFor(component, 'nullify_damage', false)?.supportsTurns).toBe(true);
    });

    it('sets minTurns on only the matching (key, scope) requirement', () => {
      const component = turnComponent();
      component.toggleCatalogItem(CAPTAIN_WITH_BUCKETS, false);
      component.toggleCatalogItem(CAPTAIN_WITH_BUCKETS, true);

      const captainReq = chipFor(component, 'boost_base_atk', true)!.requirement;
      component.setRequirementTurns(component.workingSelection().sets[0]!.id, captainReq, 1);

      const reqs = component.workingSelection().sets[0]!.requirements;
      expect(reqs.find((r) => r.sourceScope === 'captainAbility')?.minTurns).toBe(1);
      expect(reqs.find((r) => r.sourceScope !== 'captainAbility')?.minTurns).toBeNull();
    });

    it('normalizes any/0/blank turn values to null', () => {
      const component = turnComponent();
      component.toggleCatalogItem(REDUCE, false);
      const setId = component.workingSelection().sets[0]!.id;
      const req = chipFor(component, 'reduce_damage', false)!.requirement;

      component.setRequirementTurns(setId, req, 3);
      expect(chipFor(component, 'reduce_damage', false)?.requirement.minTurns).toBe(3);

      component.setRequirementTurns(setId, req, 'any');
      expect(chipFor(component, 'reduce_damage', false)?.requirement.minTurns).toBeNull();

      component.setRequirementTurns(setId, req, 0);
      expect(chipFor(component, 'reduce_damage', false)?.requirement.minTurns).toBeNull();
    });

    it('recomputes the live match count from the chosen turn threshold', () => {
      const component = turnComponent();
      component.toggleCatalogItem(REDUCE, false);
      const setId = component.workingSelection().sets[0]!.id;
      const req = chipFor(component, 'reduce_damage', false)!.requirement;

      // minTurns=null -> full matchingCharacterIds [1..5] = 5.
      expect(component.setCards()[0]?.matchCount).toBe(5);

      // minTurns=2 -> union of buckets >=2 ({2,3,4,5}) = 4.
      component.setRequirementTurns(setId, req, 2);
      expect(component.setCards()[0]?.matchCount).toBe(4);

      // minTurns=3 -> bucket {3,4,5} = 3.
      component.setRequirementTurns(setId, req, 3);
      expect(component.setCards()[0]?.matchCount).toBe(3);
    });
  });

  it('combines groups by the selection operator when totalling matches', () => {
    const component = createComponent();

    component.selection = {
      operator: 'all',
      sets: [
        createAbilityFilterTagSet([requirement('boost_atk'), requirement('heal')], 'any', 'set-1'),
        createAbilityFilterTagSet([requirement('delay')], 'any', 'set-2'),
      ],
    };
    openComponent(component);

    // (1,2,3 or 4,5) and (3,5,6) => {3,5}
    expect(component.totalMatchCount()).toBe(2);

    component.toggleSelectionOperator();

    // (1,2,3,4,5) or (3,5,6) => {1,2,3,4,5,6}
    expect(component.selectionOperator()).toBe('any');
    expect(component.totalMatchCount()).toBe(6);
  });

  it('reports no matches while every group is still half-built', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();

    expect(component.totalMatchCount()).toBe(0);
    expect(component.totalRequirementCount()).toBe(0);
    expect(component.populatedSets()).toEqual([]);
  });

  it('locks the cross-set operator to "all" when the host disallows it', () => {
    const component = createComponent({ allowSelectionOperator: false });

    component.selection = {
      operator: 'any',
      sets: [createAbilityFilterTagSet([requirement('delay')], 'any', 'set-1')],
    };
    openComponent(component);
    component.toggleSelectionOperator();

    expect(component.selectionOperator()).toBe('all');

    const emitSpy = vi.spyOn(component.saveSelection, 'emit');

    component.save();

    expect(emitSpy.mock.calls[0]?.[0]?.operator).toBe('all');
  });

  it('filters the sectioned catalog by search term and adds the top hit on enter', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.onSearchChange({ detail: { value: 'boost' } } as CustomEvent<{
      value?: string | null;
    }>);

    expect(
      component.filteredSections().map((section) => section.tiles.map((tile) => tile.item.key)),
    ).toEqual([['boost_atk'], ['captain_boost_atk']]);

    component.onSearchEnter();

    expect(component.workingSelection().sets[0]?.requirements.map((r) => r.abilityKey)).toEqual([
      'boost_atk',
    ]);
  });

  it('drops sections whose tiles all fall outside the search term', () => {
    const component = createComponent();

    openComponent(component);
    component.onSearchChange({ detail: { value: 'delay' } } as CustomEvent<{
      value?: string | null;
    }>);

    expect(component.filteredSections().map((section) => section.key)).toEqual(['special']);
  });

  it('clears every group and forgets the active one', () => {
    const component = createComponent();

    component.selection = {
      operator: 'all',
      sets: [createAbilityFilterTagSet([requirement('delay')], 'any', 'set-1')],
    };
    openComponent(component);
    component.clearAll();

    expect(component.workingSelection()).toEqual(createEmptyAbilityFilterTagSetSelection());
    expect(component.activeSetId()).toBeNull();
    expect(component.liveAnnouncement()).toEqual({ key: 'actions.clearedAll', params: {} });
  });

  it('announces short deltas with the running total, never the whole formula', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleCatalogItem(HEAL);

    expect(component.liveAnnouncement()).toEqual({
      key: 'chips.added',
      params: { label: 'Heal Crew', index: 1, count: 2 },
    });

    component.toggleCatalogItem(HEAL);

    expect(component.liveAnnouncement()).toEqual({
      key: 'chips.removed',
      params: { label: 'Heal Crew', index: 1, count: 0 },
    });
  });

  it('removes a group after its leave animation and re-homes the active group', () => {
    vi.useFakeTimers();

    try {
      const component = createComponent();

      component.selection = {
        operator: 'all',
        sets: [
          createAbilityFilterTagSet([requirement('boost_atk')], 'any', 'set-1'),
          createAbilityFilterTagSet([requirement('delay')], 'any', 'set-2'),
        ],
      };
      openComponent(component);
      component.activateSet('set-2');
      component.removeSet('set-2');

      expect(component.leavingSetId()).toBe('set-2');
      expect(component.workingSelection().sets).toHaveLength(2);

      vi.runAllTimers();

      expect(component.leavingSetId()).toBeNull();
      expect(component.workingSelection().sets.map((set) => set.id)).toEqual(['set-1']);
      expect(component.activeSetId()).toBe('set-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels the Ionic dialog when the modal presents', () => {
    const component = createComponent();
    // Asserted through the real DOM effect rather than a module mock: the Angular
    // unit-test system rejects vi.mock on relative imports.
    const host = document.createElement('div');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    host.appendChild(dialog);
    document.body.appendChild(host);

    const event = new Event('didPresent');
    Object.defineProperty(event, 'target', { value: host });

    component.labelModalDialog(event, 'Ability tags');

    expect(host.getAttribute('aria-label')).toBe('Ability tags');
    expect(dialog.getAttribute('aria-label')).toBe('Ability tags');

    host.remove();
  });

  it('wires the shared style panels, live region and didPresent labelling', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/ability-tag-set-picker/ability-tag-set-picker.component.html',
      ),
      'utf8',
    );

    expect(template).toContain('cssClass="ability-tag-set-picker-modal"');
    expect(template).toContain('<app-ability-tag-set-picker-style-panels>');
    expect(template).toContain('(didPresent)="labelModalDialog($event, title || t(\'title\'))"');
    expect(template).toContain('(didDismiss)="onModalDidDismiss()"');
    expect(template).toContain('role="status" aria-live="polite"');
    expect(template).toContain('class="ability-tag-set-formula__body" aria-hidden="true"');
    expect(template).toContain('data-testid="ability-tag-set-picker-save"');
    expect(template).toContain('data-testid="ability-tag-set-selection-operator"');
    expect(template).toContain("scope: 'ability-tag-sets'");
  });

  it('registers the modal in every shared modal chrome selector list', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles.scss'), 'utf8');

    expect(stylesheet).toContain('.ability-tag-set-picker-modal::part(backdrop)');
    expect(stylesheet.match(/\.ability-tag-set-picker-modal::part\(content\)/g)?.length).toBe(2);
  });

  it('scrolls the panels rather than the modal body', () => {
    // Without this the 263-tag catalog renders at full length inside
    // ion-content's own scroller: the two-panel layout collapses into one
    // ~9000px column and a newly added group lands far below the fold.
    const shellPanel = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-shell-panel.component.scss',
      ),
      'utf8',
    );

    expect(shellPanel).toContain('.ability-tag-set-content::part(scroll)');
    expect(shellPanel).toMatch(/::part\(scroll\)\s*\{[^}]*overflow:\s*hidden/);
    expect(shellPanel).toMatch(/\.ability-tag-set-canvas\s*\{[^}]*overflow-y:\s*auto/);
  });
});

function catalogItem(
  key: string,
  label: string,
  matchingCharacterIds: number[],
): AutoBuildAbilityCatalogItem {
  return {
    key,
    label,
    category: 'special',
    groupLabel: null,
    groupOrder: null,
    effectOrder: null,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: matchingCharacterIds.length,
    matchingCharacterIds,
    sampleCharacterIds: [],
    sampleTexts: [],
  };
}

function requirement(abilityKey: string): AutoBuildAbilityRequirement {
  return {
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
    slotScope: 'any',
  };
}

function createSections(): AbilityTagSetPickerSection[] {
  return [
    {
      category: 'special',
      label: 'Special effects',
      items: [BOOST_ATK, HEAL, DELAY, REDUCE_DAMAGE],
    },
    {
      category: 'captain',
      label: 'Captain effects',
      items: [CAPTAIN_BOOST_ATK],
      captainAbility: true,
    },
  ];
}

function createComponent(
  overrides: Partial<Pick<AbilityTagSetPickerComponent, 'allowSelectionOperator' | 'maxSets'>> = {},
): AbilityTagSetPickerComponent {
  const component = new AbilityTagSetPickerComponent();

  component.title = 'Ability tags';
  component.sections = createSections();
  component.selection = createEmptyAbilityFilterTagSetSelection();
  Object.assign(component, overrides);

  return component;
}

function openComponent(component: AbilityTagSetPickerComponent): void {
  component.isOpen = true;
  component.ngOnChanges({
    sections: new SimpleChange([], component.sections, true),
    isOpen: new SimpleChange(false, true, true),
  });
}

function tileFor(
  component: AbilityTagSetPickerComponent,
  key: string,
): { memberSetIndexes: number[]; inActiveSet: boolean } | undefined {
  return component
    .filteredSections()
    .flatMap((section) => section.tiles)
    .find((tile) => tile.item.key === key);
}
