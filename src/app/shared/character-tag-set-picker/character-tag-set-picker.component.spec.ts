/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterTagSetSelection } from '../../core/models/optc.models';
import {
  createCharacterTagSet,
  createEmptyCharacterTagSetSelection,
} from '../../core/services/character-tag-set.utils';
import {
  CharacterTagSetPickerComponent,
  type CharacterTagMatchIndex,
} from './character-tag-set-picker.component';

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

const AVAILABLE_TAGS = ['Straw Hat Pirates', 'Heart Pirates', 'Dressrosa', 'Worst Generation'];

const MATCH_INDEX: CharacterTagMatchIndex = new Map([
  ['straw hat pirates', [1, 2, 3]],
  ['heart pirates', [4, 5]],
  ['dressrosa', [3, 5, 6]],
  ['worst generation', [2, 4]],
]);

describe('CharacterTagSetPickerComponent', () => {
  it('edits a cloned draft and leaves the host selection untouched until save', () => {
    const component = createComponent();
    const selection: CharacterTagSetSelection = {
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')],
    };

    component.selection = selection;
    openComponent(component);
    component.toggleTag('Heart Pirates');

    expect(component.workingSelection().sets[0]?.tags).toEqual([
      'Straw Hat Pirates',
      'Heart Pirates',
    ]);
    expect(selection.sets[0]?.tags).toEqual(['Straw Hat Pirates']);
    expect(component.workingSelection().sets[0]).not.toBe(selection.sets[0]);
  });

  it('emits a cloned selection on save and drops half-built empty groups', () => {
    const component = createComponent();
    const emitSpy = vi.spyOn(component.saveSelection, 'emit');

    component.selection = {
      operator: 'all',
      sets: [
        createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'set-1'),
        createCharacterTagSet([], 'any', 'set-empty'),
      ],
    };
    openComponent(component);
    component.save();

    const emitted = emitSpy.mock.calls[0]?.[0];

    expect(emitted).toEqual({
      operator: 'all',
      sets: [
        expect.objectContaining({
          id: 'set-1',
          operator: 'any',
          tags: ['Straw Hat Pirates', 'Heart Pirates'],
        }),
      ],
    });
    expect(emitted?.sets[0]).not.toBe(component.workingSelection().sets[0]);
  });

  it('discards draft edits when the modal is cancelled and reopened', () => {
    const component = createComponent();
    const dismissSpy = vi.spyOn(component.dismiss, 'emit');

    component.selection = {
      operator: 'all',
      sets: [createCharacterTagSet(['Dressrosa'], 'any', 'set-1')],
    };
    openComponent(component);
    component.toggleTag('Worst Generation');
    component.cancel();

    expect(dismissSpy).toHaveBeenCalledTimes(1);

    // The host never wrote the draft back, so reopening restores its selection.
    component.isOpen = false;
    component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });
    openComponent(component);

    expect(component.workingSelection().sets[0]?.tags).toEqual(['Dressrosa']);
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

  it('defaults a new group to "any", matching mostly-disjoint crew tags', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();

    expect(component.workingSelection().sets[0]?.operator).toBe('any');
    expect(component.workingSelection().operator).toBe('all');
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
        createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1'),
        createCharacterTagSet(['Dressrosa'], 'any', 'set-2'),
      ],
    };
    openComponent(component);

    expect(component.workingSelection().sets).toHaveLength(2);
    expect(component.canAddSet()).toBe(false);
  });

  it('lets the same tag join two different groups', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleTag('Dressrosa');

    const firstSetId = component.workingSelection().sets[0]!.id;

    component.addSet();
    component.toggleTag('Dressrosa');

    const [first, second] = component.workingSelection().sets;

    expect(first?.tags).toEqual(['Dressrosa']);
    expect(second?.tags).toEqual(['Dressrosa']);
    expect(second?.id).not.toBe(firstSetId);
    expect(
      component.filteredTags().find((tile) => tile.tag === 'Dressrosa')?.memberSetIndexes,
    ).toEqual([1, 2]);
  });

  it('treats a differently-cased persisted tag as the same catalog tag', () => {
    const component = createComponent();

    component.selection = {
      operator: 'all',
      sets: [createCharacterTagSet(['straw hat pirates'], 'any', 'set-1')],
    };
    openComponent(component);

    expect(component.filteredTags()[0]?.inActiveSet).toBe(true);

    // Toggling removes the stored entry rather than adding a cased duplicate.
    component.toggleTag('Straw Hat Pirates');

    expect(component.workingSelection().sets[0]?.tags).toEqual([]);
  });

  it('shows the operator control only from two tags up, with a count per option', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleTag('Straw Hat Pirates');

    expect(component.setCards()[0]?.showsOperator).toBe(false);

    component.toggleTag('Dressrosa');

    const card = component.setCards()[0];

    expect(card?.showsOperator).toBe(true);
    // Straw Hats = {1,2,3}, Dressrosa = {3,5,6}.
    expect(card?.anyCount).toBe(5);
    expect(card?.allCount).toBe(1);
    expect(card?.matchCount).toBe(5);
  });

  it('flags an all-group that no character can satisfy', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.toggleTag('Straw Hat Pirates');
    component.toggleTag('Heart Pirates');
    component.setSetOperator(component.workingSelection().sets[0]!.id, 'all');

    expect(component.setCards()[0]?.isNullifying).toBe(true);
  });

  it('combines groups by the selection operator when totalling matches', () => {
    const component = createComponent();

    component.selection = {
      operator: 'all',
      sets: [
        createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'set-1'),
        createCharacterTagSet(['Dressrosa'], 'any', 'set-2'),
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

  it('hides every count when the host supplies no match index', () => {
    const component = createComponent({ tagCharacterIds: null });

    component.selection = {
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates', 'Dressrosa'], 'any', 'set-1')],
    };
    openComponent(component);

    const card = component.setCards()[0];

    expect(component.hasMatchCounts()).toBe(false);
    expect(component.totalMatchCount()).toBeNull();
    expect(card?.matchCount).toBeNull();
    expect(card?.anyCount).toBeNull();
    expect(card?.allCount).toBeNull();
    expect(card?.isNullifying).toBe(false);
  });

  it('announces short deltas with a count only when one is available', () => {
    const withCounts = createComponent();

    openComponent(withCounts);
    withCounts.addSet();
    withCounts.toggleTag('Heart Pirates');

    expect(withCounts.liveAnnouncement()).toEqual({
      key: 'chips.added',
      params: { label: 'Heart Pirates', index: 1, count: 2 },
    });

    const withoutCounts = createComponent({ tagCharacterIds: null });

    openComponent(withoutCounts);
    withoutCounts.addSet();
    withoutCounts.toggleTag('Heart Pirates');

    expect(withoutCounts.liveAnnouncement()).toEqual({
      key: 'chips.addedNoCount',
      params: { label: 'Heart Pirates', index: 1 },
    });
  });

  it('locks the cross-set operator to "all" when the host disallows it', () => {
    const component = createComponent({ allowSelectionOperator: false });

    component.selection = { operator: 'any', sets: [createCharacterTagSet(['Dressrosa'])] };
    openComponent(component);
    component.toggleSelectionOperator();

    expect(component.selectionOperator()).toBe('all');

    const emitSpy = vi.spyOn(component.saveSelection, 'emit');

    component.save();

    expect(emitSpy.mock.calls[0]?.[0]?.operator).toBe('all');
  });

  it('filters the flat catalog by search term and adds the top hit on enter', () => {
    const component = createComponent();

    openComponent(component);
    component.addSet();
    component.onSearchChange({ detail: { value: 'pirates' } } as CustomEvent<{
      value?: string | null;
    }>);

    expect(component.filteredTags().map((tile) => tile.tag)).toEqual([
      'Straw Hat Pirates',
      'Heart Pirates',
    ]);

    component.onSearchEnter();

    expect(component.workingSelection().sets[0]?.tags).toEqual(['Straw Hat Pirates']);
  });

  it('drops blank and duplicate catalog tags while preserving host order and case', () => {
    const component = createComponent();

    component.availableTags = ['Dressrosa', '  ', 'Dressrosa', ' Heart Pirates '];
    openComponent(component);

    expect(component.catalogTags()).toEqual(['Dressrosa', 'Heart Pirates']);
  });

  it('clears every group and forgets the active one', () => {
    const component = createComponent();

    component.selection = {
      operator: 'all',
      sets: [createCharacterTagSet(['Dressrosa'], 'any', 'set-1')],
    };
    openComponent(component);
    component.clearAll();

    expect(component.workingSelection()).toEqual(createEmptyCharacterTagSetSelection());
    expect(component.activeSetId()).toBeNull();
    expect(component.liveAnnouncement()).toEqual({ key: 'actions.clearedAll', params: {} });
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

    component.labelModalDialog(event, 'Crew tags');

    expect(host.getAttribute('aria-label')).toBe('Crew tags');
    expect(dialog.getAttribute('aria-label')).toBe('Crew tags');

    host.remove();
  });

  it('wires the shared style panels, live region and didPresent labelling', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-tag-set-picker/character-tag-set-picker.component.html',
      ),
      'utf8',
    );

    // Bound, not hardcoded: modalCssClass() always emits the picker's own class
    // and appends the host's scope only when one is given.
    expect(template).toContain('[cssClass]="modalCssClass()"');
    expect(createComponent().modalCssClass()).toBe('character-tag-set-picker-modal');
    expect(template).toContain('<app-ability-tag-set-picker-style-panels>');
    expect(template).toContain('(didPresent)="labelModalDialog($event, title || t(\'title\'))"');
    expect(template).toContain('role="status" aria-live="polite"');
    expect(template).toContain('class="ability-tag-set-formula__body" aria-hidden="true"');
    expect(template).toContain('data-testid="character-tag-set-picker-save"');
    expect(template).toContain('data-testid="character-tag-set-selection-operator"');
    expect(template).toContain("scope: 'character-tag-sets'");
  });

  it('registers the modal in every shared modal chrome selector list', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles.scss'), 'utf8');

    expect(stylesheet).toContain('.character-tag-set-picker-modal::part(backdrop)');
    expect(stylesheet.match(/\.character-tag-set-picker-modal::part\(content\)/g)?.length).toBe(2);
  });

  it('collapses its inherited animations under prefers-reduced-motion', () => {
    // The modal renders through AbilityTagSetPickerStylePanelsComponent, so its
    // reduced-motion override lives in the ability panel's stylesheet and must
    // name this modal's own cssClass or it never applies here.
    const stylesheet = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-motion-panel.component.scss',
      ),
      'utf8',
    );
    const reducedMotionBlock = stylesheet.slice(
      stylesheet.indexOf('@media (prefers-reduced-motion: reduce)'),
    );

    expect(reducedMotionBlock).toContain('.character-tag-set-picker-modal *,');
    expect(reducedMotionBlock).toContain('.character-tag-set-picker-modal *::before,');
    expect(reducedMotionBlock).toContain('.character-tag-set-picker-modal *::after');
    expect(reducedMotionBlock).toContain('.ability-tag-set-picker-modal *,');
  });

  it('confirms with one centred Filter button and no Cancel beside it', () => {
    const template = readFileSync(resolve(process.cwd(), 'src/app/shared/character-tag-set-picker/character-tag-set-picker.component.html'), 'utf8');
    const footer = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-footer-panel.component.scss',
      ),
      'utf8',
    );

    // "Save" implied the selection was stored somewhere; it applies a filter.
    expect(template).toContain("{{ 'common.actions.filter' | transloco }}");
    expect(template).not.toContain("{{ 'common.actions.save' | transloco }}");
    /*
     * Cancel is gone because the header X already runs the identical
     * `cancel(); dismiss(null, 'cancel')` pair - two controls for one escape.
     * That X is what makes the removal safe, so it is asserted here rather
     * than left implied.
     */
    expect(template).not.toContain("{{ 'common.actions.cancel' | transloco }}");
    expect(template).toContain('[attr.aria-label]="\'common.actions.close\' | transloco"');
    expect(template).toContain("(click)=\"cancel(); characterTagSetPickerModal.dismiss(null, 'cancel')\"");
    // The confirm keeps its testid: it names the role, not the printed word.
    expect(template).toContain('data-testid="character-tag-set-picker-save"');
    // A lone confirm hugging the right edge reads as half of a missing pair.
    expect(footer).toContain('.ability-tag-set-footer__actions {');
    expect(footer).toContain('justify-content: center;');
    expect(footer).not.toContain('justify-content: flex-end;');
  });
});

/*
 * 869evz13a. The sibling ability picker has had modalScopeClass since 869etpmp3;
 * this one hardcoded its class, which is why the short-viewport rule that stops
 * a support paragraph eating the catalog could be written for Captain
 * Coverage's ability modal and for no host of this picker at all. Without a
 * scope hook, "fix it per page" had nothing to hold on to.
 */
describe('CharacterTagSetPickerComponent modal scoping', () => {
  it('keeps its own modal class and appends the host scope when asked', () => {
    const component = createComponent();

    // Default: byte-identical to what every existing host renders today.
    expect(component.modalScopeClass).toBe('');
    expect(component.modalCssClass()).toBe('character-tag-set-picker-modal');

    component.modalScopeClass = 'rumble-characters-tag-modal';

    expect(component.modalCssClass()).toBe(
      'character-tag-set-picker-modal rumble-characters-tag-modal',
    );
  });

  it('binds the modal class rather than hardcoding it', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-tag-set-picker/character-tag-set-picker.component.html',
      ),
      'utf8',
    );

    expect(template).toContain('[cssClass]="modalCssClass()"');
    expect(template).not.toContain('cssClass="character-tag-set-picker-modal"');
  });
});

function createComponent(
  overrides: Partial<
    Pick<CharacterTagSetPickerComponent, 'allowSelectionOperator' | 'tagCharacterIds'>
  > = {},
): CharacterTagSetPickerComponent {
  const component = new CharacterTagSetPickerComponent();

  component.title = 'Crew tags';
  component.availableTags = [...AVAILABLE_TAGS];
  component.tagCharacterIds = MATCH_INDEX;
  component.selection = createEmptyCharacterTagSetSelection();
  Object.assign(component, overrides);

  return component;
}

function openComponent(component: CharacterTagSetPickerComponent): void {
  component.isOpen = true;
  component.ngOnChanges({
    availableTags: new SimpleChange([], component.availableTags, true),
    tagCharacterIds: new SimpleChange(null, component.tagCharacterIds, true),
    isOpen: new SimpleChange(false, true, true),
  });
}
