import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FormClassMarkerComponent } from './form-class-marker.component';

/**
 * 869f63gv6. What the "after swap" marker SHOWS, in both languages, and when it shows nothing.
 *
 * No TestBed, like every component spec here (docs/suite-environments.json): the component is
 * built with `new`, and the keys the template picks are resolved against the real copy the way its
 * `t()` resolves them, so a key with nothing behind it fails here instead of rendering raw.
 */

const template = readFileSync(
  resolve(process.cwd(), 'src/app/shared/character-facet-filter/form-class-marker.component.html'),
  'utf8',
);
const copy = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/character-facet-filter/en.json'), 'utf8')),
  el: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/character-facet-filter/el.json'), 'utf8')),
};

function shown(language: keyof typeof copy, key: string, params: Record<string, string>): string {
  const text = key.split('.').reduce((node, part) => node?.[part], copy[language]) as unknown;

  expect(typeof text, `${language}:${key}`).toBe('string');

  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/gu, (_, name: string) => params[name] ?? '');
}

const SMOKER_AND_TASHIGI = {
  classes: ['Striker', 'Slasher'],
  forms: [
    { name: 'Smoker', classes: ['Striker', 'Driven'] },
    { name: 'Tashigi', classes: ['Slasher', 'Cerebral'] },
  ],
};

function marker(inputs: Partial<FormClassMarkerComponent>): FormClassMarkerComponent {
  const component = Object.assign(new FormClassMarkerComponent(), inputs);

  component.ngOnChanges();

  return component;
}

describe('FormClassMarkerComponent', () => {
  it('resolves the marker from a record and its class filter', () => {
    expect(
      marker({ record: SMOKER_AND_TASHIGI, selection: { values: ['Driven'], matchMode: 'any' } }).resolved,
    ).toEqual({ classes: ['Driven'], forms: ['Smoker'] });
  });

  it('prefers a match the host resolved itself, such as a Captain boost', () => {
    const resolved = marker({
      match: { classes: ['Cerebral'], forms: ['Tashigi'] },
      record: SMOKER_AND_TASHIGI,
      selection: { values: ['Driven'], matchMode: 'any' },
    }).resolved;

    expect(resolved).toEqual({ classes: ['Cerebral'], forms: ['Tashigi'] });
    expect(marker({ match: null, record: SMOKER_AND_TASHIGI, selection: { values: ['Driven'], matchMode: 'any' } }).resolved).toBeNull();
  });

  it('shows nothing when the unit matches as it is, or no class is filtered', () => {
    expect(
      marker({ record: SMOKER_AND_TASHIGI, selection: { values: ['Striker'], matchMode: 'any' } }).resolved,
    ).toBeNull();
    expect(marker({ record: SMOKER_AND_TASHIGI, selection: null }).resolved).toBeNull();
    expect(marker({}).resolved).toBeNull();
    expect(template).toContain('@if (resolved; as marker)');
  });

  it('reads "after swap" in English and «μετά από swap» in Greek, naming the form', () => {
    const params = { classes: 'Driven', forms: 'Smoker' };

    expect(template).toContain("t('formMarker.afterSwapAs'");
    expect(template).toContain("t('formMarker.afterSwap'");
    expect(shown('en', 'formMarker.afterSwapAs', params)).toBe('Driven after swap (as Smoker)');
    expect(shown('el', 'formMarker.afterSwapAs', params)).toBe('Driven μετά από swap (ως Smoker)');
    expect(shown('en', 'formMarker.afterSwap', params)).toBe('Driven after swap');
    expect(shown('el', 'formMarker.afterSwap', params)).toBe('Driven μετά από swap');
  });
});

/*
 * Every screen that lets a form's class count renders the marker - the rule is "said, never
 * implied", and a host that drops the element would imply it again without a test failing.
 */
const HOSTS = [
  ['src/app/pages/characters/characters.page', '[selection]="classFacet()"'],
  ['src/app/pages/character-boxes/character-boxes.page', '[selection]="classFacet()"'],
  ['src/app/pages/manual-team-builder/manual-team-builder.page', '[selection]="classFacet()"'],
  ['src/app/shared/character-image-picker/character-image-picker.component', '[selection]="classFacet()"'],
  ['src/app/pages/captain-coverage/captain-coverage.page', '[match]="card.formClassMatch"'],
  ['src/app/pages/auto-team-builder/auto-team-builder.page', '[match]="slot.formClassMatch"'],
] as const;

describe('the hosts that count a form\'s classes', () => {
  it.each(HOSTS)('%s renders the marker', (host, binding) => {
    const html = readFileSync(resolve(process.cwd(), `${host}.html`), 'utf8');
    const ts = readFileSync(resolve(process.cwd(), `${host}.ts`), 'utf8');
    const element = html.slice(html.indexOf('<app-form-class-marker'));

    expect(html).toContain('<app-form-class-marker');
    expect(element.slice(0, element.indexOf('/>'))).toContain(binding);
    const imports = ts.slice(ts.indexOf('imports: ['));

    expect(imports.slice(0, imports.indexOf(']')).split(/[\s,[]+/u)).toContain(
      'FormClassMarkerComponent',
    );
  });
});
