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
    component.toggleCatalogItem(CAPTAIN_BOOST_ATK);

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
