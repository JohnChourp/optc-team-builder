import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_HELD_CHARACTER_FACET_VALUES } from '../../core/services/character-facet-filter.utils';
import { FAQ_SECTIONS } from './faq.data';

const template = readFileSync(resolve(process.cwd(), 'src/app/pages/faq/faq.page.html'), 'utf8');

describe('FaqPage template', () => {
  it('reads the faq translation scope', () => {
    expect(template).toContain("*transloco=\"let t; scope: 'faq'; read: 'faq'\"");
  });

  it('opens the drawer instead of going back, because it is a menu destination', () => {
    expect(template).toContain(
      '<ion-menu-button menu="tabs-navigation-menu" autoHide="false"></ion-menu-button>',
    );
    expect(template).not.toMatch(/app-toolbar-back-button|ion-back-button/u);
  });

  it('builds every answer key from the entry id rather than hard-coding one', () => {
    expect(template).toContain("t('entries.' + entry.id + '.question')");
    expect(template).toContain("t('entries.' + entry.id + '.answer')");
    expect(template).toContain("t('entries.' + entry.id + '.bullets.' + bullet)");
    expect(template).toContain("t('entries.' + entry.id + '.links.' + link.key)");
    expect(template).toContain("t('sections.' + section.id + '.title')");
  });

  it('lets several answers stay open at once', () => {
    expect(template).toContain('[multiple]="true"');
  });

  it('starts with every answer closed, so the page is a list of questions', () => {
    // ion-accordion-group opens whatever its `value` names. Binding one here
    // would expand that answer for every reader on every visit.
    expect(template).not.toMatch(/<ion-accordion-group[^>]*\bvalue=/u);
    expect(template).not.toMatch(/<ion-accordion-group[^>]*\[value\]=/u);
  });

  it('skips the bullet list and the link row when an entry declares neither', () => {
    expect(template).toContain('@if (entry.bullets.length) {');
    expect(template).toContain('@if (entry.links.length) {');
  });
});

describe('FaqPage content', () => {
  type Entry = { answer: string; bullets: Record<string, string> };
  const english = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/i18n/faq/en.json'), 'utf8'),
  ) as { entries: Record<string, Entry> };
  const greek = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/i18n/faq/el.json'), 'utf8'),
  ) as { entries: Record<string, Entry> };

  it('answers that the Auto Team Builder result never changes on its own', () => {
    // The measured behaviour: every build-input mutator runs resetBuildState(),
    // which does result.set(null). An answer that said the result "updates as
    // you change filters" would describe an app this is not.
    expect(english.entries['whenResultChanges']?.answer).toContain('Never on its own');
  });

  it('does not promise ready-made preset teams', () => {
    const presets = english.entries['presets']?.answer ?? '';

    expect(presets).toContain('no ready-made preset teams');
  });

  it('states the type and class capacity the app actually enforces', () => {
    // The tripwire: if the constant moves, this fails and points at the two
    // sentences that would silently become false. The numbers are spelled out
    // in prose, so nothing else can catch the drift.
    expect(MAX_HELD_CHARACTER_FACET_VALUES).toEqual({ type: 2, class: 2 });
    expect(english.entries['filterLabels']?.bullets['typesClasses']).toContain(
      'at most two types and at most two classes',
    );
    expect(greek.entries['filterLabels']?.bullets['typesClasses']).toContain(
      'το πολύ δύο types και το πολύ δύο classes',
    );
  });

  it('does not promise a fallback guarantee the engine has stopped making', () => {
    // buildSubsetCandidates skips any subset that would empty the type filter,
    // which is the whole basis of "at least one always survives".
    const engine = readFileSync(
      resolve(process.cwd(), 'src/app/core/services/auto-team-builder.engine.ts'),
      'utf8',
    );

    expect(engine).toContain('if (!nextTypes.length) {');
    expect(english.entries['fallbackAndLimits']?.bullets['order']).toContain(
      'never drops every type',
    );
    expect(greek.entries['fallbackAndLimits']?.bullets['order']).toContain(
      'ποτέ δεν ρίχνει όλα τα types',
    );
  });

  it('tells the reader the search is exhausted rather than to retry it', () => {
    // resolveBuildFailureMessage names only rules no fallback relaxes, so
    // pressing Build again genuinely cannot produce a different answer.
    expect(english.entries['fallbackAndLimits']?.bullets['noTeam']).toContain(
      'Pressing Build again changes nothing',
    );
  });
});
