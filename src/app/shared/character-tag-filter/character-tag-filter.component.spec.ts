/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CharacterTagSetSelection } from '../../core/models/optc.models';
import {
  createCharacterTagSet,
  createEmptyCharacterTagSetSelection,
  type CharacterTagMatchIndex,
} from '../../core/services/character-tag-set.utils';
import {
  CharacterTagFilterComponent,
  type CharacterTagFilterChange,
} from './character-tag-filter.component';

// Covers the shell's own imports plus everything the hosted picker pulls in.
vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSpinner: class {},
  IonToolbar: class {},
}));

const AVAILABLE_TAGS = ['Straw Hat Pirates', 'Heart Pirates', 'Dressrosa'];

const MATCH_INDEX: CharacterTagMatchIndex = new Map<string, readonly number[]>([
  ['straw hat pirates', [1, 2, 3]],
  ['heart pirates', [4, 5]],
  ['dressrosa', [3, 5, 6]],
]);

/** Only the leaves the shell actually reads; everything else falls through to the key. */
const TRANSLATIONS: Record<string, string> = {
  label: 'Character Tags',
  title: 'Character tag filter',
  'trigger.empty': 'Choose character tags',
  'trigger.active': '{{tags}} tag(s) in {{groups}} group(s)',
  'trigger.loading': 'Loading character tags…',
  'joiners.any': 'or',
  'joiners.all': 'and',
  removeGroup: 'Remove tag group {{group}}',
  'support.empty': 'Group crew and family tags with OR inside a group and AND across groups.',
  'support.all': 'Showing characters that match every tag group.',
  'support.any': 'Showing characters that match at least one tag group.',
  'support.unavailable': 'Character tags are unavailable for this dataset.',
  'a11y.applied': 'Character tag filter applied: {{tags}} tag(s) in {{groups}} group(s).',
  'a11y.cleared': 'Character tag filter cleared.',
};

describe('CharacterTagFilterComponent', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('loads the tag catalog on first open and opens the picker', async () => {
    const { component, repository } = createComponent();

    await component.openPicker();

    expect(repository.getAvailableCharacterTags).toHaveBeenCalledOnce();
    expect(repository.getCharacterTagMatchIndex).toHaveBeenCalledOnce();
    expect(component.status()).toBe('ready');
    expect(component.pickerOpen()).toBe(true);
    expect(component.availableTags()).toEqual(AVAILABLE_TAGS);
  });

  it('does not open the picker when the dataset reports no tags', async () => {
    const { component } = createComponent({ availableTags: [] });

    await component.openPicker();

    expect(component.status()).toBe('unavailable');
    expect(component.pickerOpen()).toBe(false);
    expect(component.supportText()).toBe(TRANSLATIONS['support.unavailable']);
    expect(component.triggerDisabled()).toBe(true);
  });

  it('does not open the picker and never rejects when the repository lacks getAvailableCharacterTags', async () => {
    const { component, repository } = createComponent();
    (repository as Record<string, unknown>)['getAvailableCharacterTags'] = undefined;

    await expect(component.openPicker()).resolves.toBeUndefined();

    expect(component.status()).toBe('unavailable');
    expect(component.pickerOpen()).toBe(false);
  });

  /**
   * A THROW is transient, so it must stay retryable. Parking on `unavailable`
   * would disable the trigger for the rest of the session with no way back —
   * unlike a catalog that genuinely carries no tags, which stays `unavailable`
   * by design (see the test above).
   */
  it('falls back to idle — not unavailable — when the index load throws, so a retry is possible', async () => {
    const { component, repository } = createComponent();
    repository.getCharacterTagMatchIndex.mockRejectedValueOnce(new Error('catalog down'));

    await expect(component.openPicker()).resolves.toBeUndefined();

    expect(component.status()).toBe('idle');
    expect(component.matchIndex()).toBeNull();
    expect(component.pickerOpen()).toBe(false);
    expect(component.triggerDisabled()).toBe(false);
  });

  it('recovers on the next tap after a transient load failure', async () => {
    const { component, repository } = createComponent();
    repository.getCharacterTagMatchIndex.mockRejectedValueOnce(new Error('catalog down'));

    await component.openPicker();
    expect(component.pickerOpen()).toBe(false);

    await component.openPicker();

    expect(component.status()).toBe('ready');
    expect(component.pickerOpen()).toBe(true);
  });

  /**
   * Regression: `triggerDisabled` is a computed(), and a computed only recomputes
   * when a SIGNAL it read changes. Reading the plain `disabled` @Input inside it
   * cached the value from the first evaluation, and hosts bind it to a load flag
   * that is true during the very first render — so the trigger latched disabled
   * forever and the whole filter was unreachable. Caught only in the live UI.
   */
  it('re-enables the trigger when the host clears disabled after the first render', () => {
    const { component } = createComponent();

    component.disabled = true;
    component.ngOnChanges({ disabled: asChange(true) });
    expect(component.triggerDisabled()).toBe(true);

    component.disabled = false;
    component.ngOnChanges({ disabled: asChange(false) });
    expect(component.triggerDisabled()).toBe(false);
  });

  it('emits a cloned selection on save', async () => {
    const { component, emitted } = createComponent();
    const set = createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1');
    const selection: CharacterTagSetSelection = { operator: 'all', sets: [set] };

    await component.openPicker();
    component.savePicker(selection);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.selection.sets[0]).not.toBe(set);
    expect(emitted[0]?.selection.sets[0]?.tags).toEqual(['Straw Hat Pirates']);
    expect(component.pickerOpen()).toBe(false);
  });

  it('emits the resolved matching ids alongside the selection', async () => {
    const { component, emitted } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'set-1')],
    });

    expect(emitted[0]?.matchingCharacterIds).toEqual([1, 2, 3, 4, 5]);
  });

  it('emits undefined matching ids when the selection is cleared', async () => {
    const { component, emitted } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')],
    });
    component.clear();

    expect(emitted).toHaveLength(2);
    expect(emitted[1]?.matchingCharacterIds).toBeUndefined();
    expect(emitted[1]?.selection.sets).toEqual([]);
  });

  it('emits undefined matching ids while the index is unavailable', () => {
    const { component, emitted } = createComponent();

    // No open yet, so the index has never loaded: fail open rather than blank
    // the host catalog with an `[]` the host cannot tell from a real result.
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')],
    });

    expect(component.matchIndex()).toBeNull();
    expect(emitted[0]?.matchingCharacterIds).toBeUndefined();
  });

  it('summarises populated groups as removable chips and drops a whole group on remove', async () => {
    const { component, emitted } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [
        createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1'),
        createCharacterTagSet(['Dressrosa'], 'any', 'set-2'),
        createCharacterTagSet([], 'any', 'set-3'),
      ],
    });

    expect(component.chips()).toEqual([
      {
        id: 'set-1',
        label: 'Straw Hat Pirates',
        removeLabel: 'Remove tag group Straw Hat Pirates',
      },
      { id: 'set-2', label: 'Dressrosa', removeLabel: 'Remove tag group Dressrosa' },
    ]);

    component.removeSet('set-1');

    expect(emitted[1]?.selection.sets.map((set) => set.id)).toEqual(['set-2', 'set-3']);
    expect(component.chips().map((chip) => chip.id)).toEqual(['set-2']);
  });

  it('pads the group joiner in code so translations cannot glue tags together', async () => {
    const { component } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'set-1')],
    });

    expect(component.chips()[0]?.label).toBe('Straw Hat Pirates or Heart Pirates');
  });

  it('switches the support line to all/any only once two groups are populated', async () => {
    const { component } = createComponent();

    await component.openPicker();

    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')],
    });
    expect(component.supportText()).toBe(TRANSLATIONS['support.empty']);

    component.savePicker({
      operator: 'all',
      sets: [
        createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1'),
        createCharacterTagSet(['Dressrosa'], 'any', 'set-2'),
      ],
    });
    expect(component.supportText()).toBe(TRANSLATIONS['support.all']);

    component.savePicker({
      operator: 'any',
      sets: [
        createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1'),
        createCharacterTagSet(['Dressrosa'], 'any', 'set-2'),
      ],
    });
    expect(component.supportText()).toBe(TRANSLATIONS['support.any']);
  });

  it('shows a loading trigger label while the catalog resolves', async () => {
    const { component, repository } = createComponent();
    let releaseTags: (tags: string[]) => void = () => undefined;
    repository.getAvailableCharacterTags.mockReturnValueOnce(
      new Promise<string[]>((resolvePromise) => {
        releaseTags = resolvePromise;
      }),
    );

    const opening = component.openPicker();

    expect(component.status()).toBe('loading');
    expect(component.triggerLabel()).toBe(TRANSLATIONS['trigger.loading']);
    expect(component.triggerDisabled()).toBe(true);

    releaseTags([...AVAILABLE_TAGS]);
    await opening;

    expect(component.status()).toBe('ready');
    expect(component.triggerLabel()).toBe(TRANSLATIONS['trigger.empty']);
  });

  it('announces the applied and cleared states through the live region', async () => {
    const { component } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'set-1')],
    });

    expect(component.announcement()).toBe('Character tag filter applied: 2 tag(s) in 1 group(s).');

    component.clear();

    expect(component.announcement()).toBe(TRANSLATIONS['a11y.cleared']);
  });

  it('adopts a host-pushed selection so a host reset clears the chips', async () => {
    const { component, emitted } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')],
    });
    expect(component.chips()).toHaveLength(1);

    const previous = component.selection;
    component.selection = createEmptyCharacterTagSetSelection();
    component.ngOnChanges({ selection: new SimpleChange(previous, component.selection, false) });

    expect(component.chips()).toEqual([]);
    expect(component.hasSelection()).toBe(false);
    // A host reset is already the host's own state change: re-emitting would
    // send the host a second load for a filter it just cleared itself.
    expect(emitted).toHaveLength(1);
  });

  it('re-emits when a refreshed index changes the resolved ids under a populated selection', async () => {
    const { component, repository, emitted } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')],
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.matchingCharacterIds).toEqual([1, 2, 3]);

    repository.getCharacterTagMatchIndex.mockResolvedValue(
      new Map<string, readonly number[]>([['straw hat pirates', [1, 2, 3, 7]]]),
    );
    await component.openPicker();

    expect(emitted).toHaveLength(2);
    expect(emitted[1]?.matchingCharacterIds).toEqual([1, 2, 3, 7]);
  });

  it('does not re-emit when a refreshed index resolves to the same ids', async () => {
    const { component, emitted } = createComponent();

    await component.openPicker();
    component.savePicker({
      operator: 'all',
      sets: [createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')],
    });
    await component.openPicker();

    expect(emitted).toHaveLength(1);
  });

  it('preloads its own scope and the modal scope on init', async () => {
    const { component, i18n } = createComponent();

    await component.ngOnInit();

    expect(i18n.preloadScope).toHaveBeenCalledWith('character-tag-filter');
    expect(i18n.preloadScope).toHaveBeenCalledWith('character-tag-sets');
  });

  it('wires the hosted picker, the trigger test id and the live region', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-tag-filter/character-tag-filter.component.html',
      ),
      'utf8',
    );

    expect(template).toContain("scope: 'character-tag-filter'");
    expect(template).toContain('<app-character-tag-set-picker');
    expect(template).toContain('[tagCharacterIds]="matchIndex()"');
    expect(template).toContain('[selection]="workingSelection()"');
    expect(template).toContain('[availableTags]="availableTags()"');
    expect(template).toContain("testIdPrefix + '-character-tag-trigger'");
    expect(template).toContain('role="status" aria-live="polite"');
    expect(template).toContain('<app-character-tag-filter-style-panels>');
  });

  it('reserves the label row height the Clear button will need', () => {
    const shell = readFileSync(resolve(process.cwd(), 'src/app/shared/character-tag-filter/character-tag-filter-shell-panel.component.scss'), 'utf8');

    /*
     * Ionic sizes a small button from `:host(.button-small) { min-height: 2.1em }`
     * at `font-size: 0.8125rem` = 1.70625rem, which overshot the old 24px floor
     * by ~3px. The row reserves the taller value whether or not Clear is
     * rendered, so the control below it no longer jumps down the page the
     * moment a filter is set.
     */
    expect(shell).toContain('.character-tag-filter__header {');
    expect(shell).toContain('min-height: 1.75rem;');
    expect(shell).not.toContain('min-height: 24px;');
  });
});

interface CreateComponentResult {
  component: CharacterTagFilterComponent;
  repository: {
    getAvailableCharacterTags: ReturnType<typeof vi.fn>;
    getCharacterTagMatchIndex: ReturnType<typeof vi.fn>;
  };
  i18n: { preloadScope: ReturnType<typeof vi.fn>; translate: ReturnType<typeof vi.fn> };
  emitted: CharacterTagFilterChange[];
}

/*
 * 869evz13a. Captain Coverage hosts this picker directly and has always passed
 * its own sentence in (captain-coverage.page.html:300); every host reached
 * through this wrapper got a silent modal instead, purely because the wrapper
 * exposed no route to the picker's inputs. The sentence is not new copy - it is
 * the same one already rendered beside the trigger.
 */
describe('CharacterTagFilterComponent modal support text', () => {
  function readTemplate(): string {
    return readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-tag-filter/character-tag-filter.component.html',
      ),
      'utf8',
    ).replace(/\r\n/g, '\n');
  }

  it('lets the picker inherit the wrapper sentence, and lets a host override it', () => {
    const template = readTemplate();

    expect(template).toContain('[supportText]="pickerSupportText || supportText()"');
    // Still rendered beside the trigger too - the modal echoes it, not replaces it.
    expect(template).toContain('class="character-tag-filter__support">{{ supportText() }}');
  });

  it('defaults the override to empty so the inherited sentence wins', () => {
    const { component } = createComponent();

    expect(component.pickerSupportText).toBe('');
    expect(component.pickerModalScopeClass).toBe('');
    // The inherited value is a real sentence, not a blank.
    expect(component.supportText().length).toBeGreaterThan(0);
  });
});

function createComponent(
  options: { availableTags?: string[]; matchIndex?: CharacterTagMatchIndex } = {},
): CreateComponentResult {
  const repository = {
    getAvailableCharacterTags: vi
      .fn()
      .mockResolvedValue([...(options.availableTags ?? AVAILABLE_TAGS)]),
    getCharacterTagMatchIndex: vi.fn().mockResolvedValue(options.matchIndex ?? MATCH_INDEX),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) =>
      interpolate(TRANSLATIONS[key] ?? key, params),
    ),
  };
  const component = new CharacterTagFilterComponent(repository as never, i18n as never);
  const emitted: CharacterTagFilterChange[] = [];

  component.testIdPrefix = 'characters';
  component.selection = createEmptyCharacterTagSetSelection();
  component.filterChange.subscribe((change) => emitted.push(change));

  return { component, repository, i18n, emitted };
}

function interpolate(value: string, params?: Record<string, string | number>): string {
  if (!params) {
    return value;
  }

  return Object.entries(params).reduce(
    (text, [key, param]) => text.split(`{{${key}}}`).join(String(param)),
    value,
  );
}

function asChange(currentValue: unknown): SimpleChange {
  return new SimpleChange(null, currentValue, false);
}
