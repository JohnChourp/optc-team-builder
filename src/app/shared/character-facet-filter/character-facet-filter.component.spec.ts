/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type CharacterFacetKind,
  type CharacterFacetSelection,
} from '../../core/models/optc.models';
import { createEmptyCharacterFacetSelection } from '../../core/services/character-facet-filter.utils';
import {
  CharacterFacetFilterComponent,
  type CharacterFacetPresentation,
} from './character-facet-filter.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonIcon: class {},
  IonSelect: class {},
  IonSelectOption: class {},
}));

const TYPE_OPTIONS = ['STR', 'DEX', 'QCK', 'PSY', 'INT'];
const CLASS_OPTIONS = [
  'Booster',
  'Cerebral',
  'Driven',
  'Evolver',
  'Fighter',
  'Free Spirit',
  'Powerhouse',
  'Shooter',
  'Slasher',
  'Striker',
];

/** Only the leaves the control actually reads; everything else falls through to the key. */
const TRANSLATIONS: Record<string, string> = {
  'kind.type.label': 'Type',
  'kind.type.placeholder': 'Filter by type',
  'kind.class.label': 'Class',
  'kind.class.placeholder': 'Filter by class',
  'mode.any': 'Any of these',
  'mode.all': 'All of these',
  'mode.toggleAria': 'Choose whether a character must match any or all of the selected values',
  'mode.capacity.type':
    'Switched to "Any": a character has at most {{max}} types, so "All" can never match {{count}}.',
  'mode.capacity.class':
    'Switched to "Any": a character has at most {{max}} classes, so "All" can never match {{count}}.',
  'mode.disjoint.type':
    'No character carries every selected type, so nothing matches. Switch to "Any" or remove one.',
  'mode.disjoint.class':
    'No character carries every selected class, so nothing matches. Switch to "Any" or remove one.',
  removeValue: 'Remove {{value}}',
  selectedCount: '{{count}} selected',
  matchCount: '{{count}} match this filter',
  'support.empty': 'Pick one or more values. Nothing selected means no filter.',
  'support.any': 'Showing characters that match any of the selected values.',
  'support.all': 'Showing characters that match every selected value.',
  'a11y.applied': 'Filter applied: {{count}} value(s), {{mode}}.',
  'a11y.cleared': 'Filter cleared.',
};

describe('CharacterFacetFilterComponent', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('preloads its own scope on init so no host has to remember it', async () => {
    const { component, i18n } = createComponent();

    await component.ngOnInit();

    expect(i18n.preloadScope).toHaveBeenCalledWith('character-facet-filter');
  });

  it('shows the selected-value chips unless a host opts out', () => {
    const { component } = createComponent({ kind: 'class', options: CLASS_OPTIONS });

    // Default is on, so every existing host keeps today's behaviour.
    expect(component.showSelectedChips).toBe(true);
    expect(component.showSelectedChipsState()).toBe(true);

    component.showSelectedChips = false;
    component.ngOnChanges({
      showSelectedChips: new SimpleChange(true, false, false),
    });

    expect(component.showSelectedChipsState()).toBe(false);

    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-facet-filter/character-facet-filter.component.html',
      ),
      'utf8',
    );

    expect(template).toContain('@if (showSelectedChipsState() && values().length) {');
  });

  it('emits a normalized selection when values change', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['  str ', 'STR', 'qck']));

    expect(emitted).toEqual([{ values: ['STR', 'QCK'], matchMode: 'any' }]);
    expect(component.values()).toEqual(['STR', 'QCK']);
  });

  it('keeps class values in author case so the chips and the select cannot desync', () => {
    const { component, emitted } = createComponent({ kind: 'class', options: CLASS_OPTIONS });

    component.onValuesChange(asSelectEvent(['Free Spirit', 'Fighter']));

    expect(emitted[0]?.values).toEqual(['Free Spirit', 'Fighter']);
    expect(component.isSelected('free spirit')).toBe(true);
  });

  it('shows the match mode control as soon as one value is selected', () => {
    const { component } = createComponent();

    expect(component.showModeControl()).toBe(false);

    component.toggleValue('STR');

    expect(component.showModeControl()).toBe(true);
  });

  it('disables the all option once the selection exceeds what a character can hold', () => {
    const { component } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    expect(component.allModeSatisfiable()).toBe(true);

    component.onValuesChange(asSelectEvent(['STR', 'QCK', 'INT']));
    expect(component.allModeSatisfiable()).toBe(false);
  });

  it('refuses a synthetic all-mode switch past the arity cap', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK', 'INT']));
    expect(emitted).toHaveLength(1);

    // A restored preset, a future URL param or a synthetic click all land here.
    component.setMatchMode('all');

    expect(emitted).toHaveLength(1);
    expect(component.matchMode()).toBe('any');
    // The refused mode must not be REMEMBERED either. Recording it would make
    // the control claim a demotion that never happened, and would silently
    // switch the filter to `all` the moment the selection dropped back to two.
    expect(component.zeroReason()).toBeNull();

    component.removeValue('INT');

    expect(component.values()).toEqual(['STR', 'QCK']);
    expect(component.matchMode()).toBe('any');
  });

  it('demotes to any and announces the capacity reason when a third value is added while all is active', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    component.setMatchMode('all');
    expect(component.matchMode()).toBe('all');

    component.onValuesChange(asSelectEvent(['STR', 'QCK', 'INT']));

    expect(component.matchMode()).toBe('any');
    expect(emitted.at(-1)).toEqual({ values: ['STR', 'QCK', 'INT'], matchMode: 'any' });
    // Loud, not silent: the copy names what happened and why.
    expect(component.announcement()).toBe(
      'Switched to "Any": a character has at most 2 types, so "All" can never match 3.',
    );
  });

  it('restores the previous all mode when the selection drops back to two values', () => {
    const { component } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    component.setMatchMode('all');
    component.onValuesChange(asSelectEvent(['STR', 'QCK', 'INT']));
    expect(component.matchMode()).toBe('any');

    component.removeValue('INT');

    expect(component.values()).toEqual(['STR', 'QCK']);
    expect(component.matchMode()).toBe('all');
    expect(component.zeroReason()).toBeNull();
  });

  it('reports the capacity reason rather than the disjoint reason for an over-capacity selection', () => {
    const { component } = createComponent({ matchCount: 0 });

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    component.setMatchMode('all');
    component.onValuesChange(asSelectEvent(['STR', 'QCK', 'INT']));

    expect(component.zeroReason()).toBe('capacity');
  });

  it('stays silent about capacity for an ordinary any-mode selection of three values', () => {
    const { component } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK', 'INT']));

    expect(component.matchMode()).toBe('any');
    expect(component.zeroReason()).toBeNull();
  });

  it('reports the disjoint reason only when the host supplies a match count', () => {
    const withoutCount = createComponent();

    withoutCount.component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    withoutCount.component.setMatchMode('all');

    // The host handed over no catalog, so disjointness is unprovable and unclaimed.
    expect(withoutCount.component.zeroReason()).toBeNull();

    const withCount = createComponent({ matchCount: 0 });

    withCount.component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    withCount.component.setMatchMode('all');

    expect(withCount.component.zeroReason()).toBe('disjoint');
  });

  it('drops the disjoint reason once the host reports matching characters', () => {
    const { component } = createComponent({ matchCount: 0 });

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    component.setMatchMode('all');
    expect(component.zeroReason()).toBe('disjoint');

    component.matchCount = 12;
    component.ngOnChanges({ matchCount: asChange(12) });

    expect(component.zeroReason()).toBeNull();
  });

  it('removes a single value without resetting the match mode', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    component.setMatchMode('all');

    component.removeValue('QCK');

    expect(emitted.at(-1)).toEqual({ values: ['STR'], matchMode: 'all' });
    expect(component.matchMode()).toBe('all');
  });

  it('emits an empty selection when cleared and resets the match mode with it', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    component.setMatchMode('all');

    component.clear();

    expect(emitted.at(-1)).toEqual({ values: [], matchMode: 'any' });
    expect(component.announcement()).toBe(TRANSLATIONS['a11y.cleared']);
    expect(component.supportText()).toBe(TRANSLATIONS['support.empty']);

    // The mode preference went with it: a fresh pair starts back on `any`.
    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    expect(component.matchMode()).toBe('any');
  });

  it('announces the applied count and mode for an ordinary change', () => {
    const { component } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));

    expect(component.announcement()).toBe('Filter applied: 2 value(s), Any of these.');
    expect(component.supportText()).toBe(TRANSLATIONS['support.any']);

    component.setMatchMode('all');

    expect(component.announcement()).toBe('Filter applied: 2 value(s), All of these.');
    expect(component.supportText()).toBe(TRANSLATIONS['support.all']);
  });

  it('does not re-emit when a change normalizes to the selection already held', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['STR']));
    component.onValuesChange(asSelectEvent([' str ']));

    expect(emitted).toHaveLength(1);
  });

  it('ignores toggles, mode changes and clear while disabled', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['STR']));
    component.disabled = true;
    component.ngOnChanges({ disabled: asChange(true) });

    component.toggleValue('QCK');
    component.setMatchMode('all');
    component.clear();

    expect(emitted).toHaveLength(1);
    expect(component.values()).toEqual(['STR']);
  });

  it('mirrors a host selection reset into the values without re-emitting', () => {
    const { component, emitted } = createComponent();

    component.onValuesChange(asSelectEvent(['STR', 'QCK']));
    component.setMatchMode('all');
    expect(component.values()).toHaveLength(2);

    const previous = component.selection;
    component.selection = createEmptyCharacterFacetSelection();
    component.ngOnChanges({ selection: new SimpleChange(previous, component.selection, false) });

    expect(component.values()).toEqual([]);
    expect(component.matchMode()).toBe('any');
    expect(component.showModeControl()).toBe(false);
    // A host reset is already the host's own state change; re-emitting would
    // send the host a second load for a filter it just cleared itself.
    expect(emitted).toHaveLength(2);
  });

  it('adopts a host-pushed all-mode selection as the remembered intent', () => {
    const { component } = createComponent();

    component.selection = { values: ['STR', 'QCK'], matchMode: 'all' };
    component.ngOnChanges({ selection: asChange(component.selection) });

    expect(component.matchMode()).toBe('all');

    // Sticky intent came from the host, so growing past the cap still demotes loudly.
    component.onValuesChange(asSelectEvent(['STR', 'QCK', 'INT']));

    expect(component.matchMode()).toBe('any');
    expect(component.zeroReason()).toBe('capacity');
  });

  /**
   * Regression guard shared with the character tag filter: a `computed()` only
   * recomputes when a SIGNAL it read changes, so reading the plain `disabled`
   * @Input inside one latches the first render's value — and hosts bind it to a
   * load flag that is true on that very first render.
   */
  it('keeps the control usable after the host toggles disabled off', () => {
    const { component, emitted } = createComponent();

    component.disabled = true;
    component.ngOnChanges({ disabled: asChange(true) });
    component.toggleValue('STR');
    expect(emitted).toHaveLength(0);

    component.disabled = false;
    component.ngOnChanges({ disabled: asChange(false) });
    component.toggleValue('STR');

    expect(emitted).toEqual([{ values: ['STR'], matchMode: 'any' }]);
  });

  it('builds host-scoped, facet-scoped test ids', () => {
    const { component } = createComponent({ kind: 'class', options: CLASS_OPTIONS });

    expect(component.facetTestId('mode-all')).toBe('characters-class-facet-mode-all');
    expect(component.valueTestId('Free Spirit')).toBe('characters-class-facet-value-free-spirit');
  });

  it('renders the chips presentation, the select presentation, the mode segment and the zero line', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-facet-filter/character-facet-filter.component.html',
      ),
      'utf8',
    );

    expect(template).toContain("scope: 'character-facet-filter'");
    expect(template).toContain('<app-character-facet-filter-style-panels>');
    expect(template).toContain("presentation === 'chips'");
    expect(template).toContain('(click)="toggleValue(option)"');
    expect(template).toContain('[multiple]="true"');
    expect(template).toContain('(ionChange)="onValuesChange($event)"');
    expect(template).toContain('[selectedText]="selectedText()"');
    expect(template).toContain('(click)="removeValue(value)"');
    expect(template).toContain('@if (showModeControl()) {');
    expect(template).toContain('[attr.aria-pressed]="matchMode() === \'all\'"');
    expect(template).toContain('[disabled]="disabledState() || !allModeSatisfiable()"');
    expect(template).toContain("facetTestId('mode-all')");
    expect(template).toContain("facetTestId('mode-any')");
    expect(template).toContain("facetTestId('match-count')");
    expect(template).toContain('@if (zeroReason()) {');
    expect(template).toContain("facetTestId('zero-' + zeroReason())");
    expect(template).toContain('role="status" aria-live="polite"');
  });

  it('reserves the label row height the Clear button will need', () => {
    const shell = readFileSync(resolve(process.cwd(), 'src/app/shared/character-facet-filter/character-facet-filter-shell-panel.component.scss'), 'utf8');

    /*
     * Ionic sizes a small button from `:host(.button-small) { min-height: 2.1em }`
     * at `font-size: 0.8125rem` = 1.70625rem, which overshot the old 24px floor
     * by ~3px. The row reserves the taller value whether or not Clear is
     * rendered, so the control below it no longer jumps down the page the
     * moment a filter is set.
     */
    expect(shell).toContain('.character-facet-filter__header {');
    expect(shell).toContain('min-height: 1.75rem;');
    expect(shell).not.toContain('min-height: 24px;');
  });
});

interface CreateComponentResult {
  component: CharacterFacetFilterComponent;
  i18n: { preloadScope: ReturnType<typeof vi.fn>; translate: ReturnType<typeof vi.fn> };
  emitted: CharacterFacetSelection[];
}

function createComponent(
  options: {
    kind?: CharacterFacetKind;
    options?: string[];
    presentation?: CharacterFacetPresentation;
    matchCount?: number | null;
  } = {},
): CreateComponentResult {
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) =>
      interpolate(TRANSLATIONS[key] ?? key, params),
    ),
  };
  const component = new CharacterFacetFilterComponent(i18n as never);
  const emitted: CharacterFacetSelection[] = [];

  component.kind = options.kind ?? 'type';
  component.options = options.options ?? TYPE_OPTIONS;
  component.presentation = options.presentation ?? 'select';
  component.matchCount = options.matchCount ?? null;
  component.selection = createEmptyCharacterFacetSelection();
  component.testIdPrefix = 'characters';
  component.selectionChange.subscribe((selection) => emitted.push(selection));

  component.ngOnChanges({
    kind: asChange(component.kind),
    options: asChange(component.options),
    presentation: asChange(component.presentation),
    matchCount: asChange(component.matchCount),
    selection: asChange(component.selection),
  });

  return { component, i18n, emitted };
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

function asSelectEvent(values: string[]): CustomEvent<{ value?: string[] | null }> {
  return { detail: { value: values } } as CustomEvent<{ value?: string[] | null }>;
}
