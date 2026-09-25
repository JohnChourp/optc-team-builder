import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import partyConflictOverrides from '../../core/data/auto-team-builder-party-conflict-overrides.json';
import { MAX_HELD_CHARACTER_FACET_VALUES } from '../../core/services/character-facet-filter.utils';
import { resolveCharacterSameCharacterKeys } from '../../core/services/character-party-conflict-keys.utils';
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

  it('states the Captain and Friend Captain rule the code actually implements', () => {
    /*
     * Owner-confirmed 2026-09-03 and asked repeatedly, so the answer says it outright, and this
     * binds the answer to the code that makes it true.
     *
     * 869f127ej moved that code. It used to be two guards written out inside the Manual Team
     * Builder - an early return below the first sub index, and the Friend Captain excluded from
     * the key set - and this test named both literally. They now live once, in
     * `character-party-conflict-keys.utils.ts`, so the binding points there.
     *
     * That is why this test failed when the predicate landed, and why it is worth having: the FAQ
     * makes a promise about behaviour, and something has to notice when the behaviour moves.
     */
    const predicate = readFileSync(
      resolve(process.cwd(), 'src/app/core/services/character-party-conflict-keys.utils.ts'),
      'utf8',
    );

    // A leader seat is exempt before any key is resolved.
    expect(predicate).toContain('if (isLeaderSlotIndex(slotIndex)) {');
    // The borrowed seat contributes nothing to what the four subs must avoid.
    expect(predicate).toContain('index === TEAM_FRIEND_CAPTAIN_SLOT_INDEX');
    expect(english.entries['conflicts']?.bullets['leaders']).toContain('may be the same character');
    expect(greek.entries['conflicts']?.bullets['leaders']).toContain(
      'ΜΠΟΡΟΥΝ να είναι ο ίδιος χαρακτήρας',
    );
  });

  it('states where the same-character answer comes from, and the corrections it makes', () => {
    /*
     * 869f63grj. The answer used to promise "Thirty-four" built-in name aliases, bound to the size
     * of an alias table that no longer decides anything: the community database's families do. So
     * each sentence is bound to the behaviour that makes it true instead of to a count.
     */
    // A card the database names is decided by that name, whatever the card is called.
    expect(
      resolveCharacterSameCharacterKeys({
        id: 900001,
        name: 'Lucy',
        families: ['Monkey D. Luffy'],
      }),
    ).toEqual(['monkey d. luffy']);
    // "A card it does not name yet is judged by its name."
    expect(
      resolveCharacterSameCharacterKeys({ id: 900002, name: 'Monkey D. Luffy - A New Card' }),
    ).toContain('monkey d. luffy');

    // The hand correction the answer names: both Blackback cards, without the shared "BB".
    const overrides = partyConflictOverrides as Record<string, string[]>;

    for (const blackbackId of ['2179', '3537']) {
      expect(overrides[blackbackId]).toContain('blackback');
      expect(overrides[blackbackId]).not.toContain('bb');
    }

    expect(english.entries['conflicts']?.bullets['aliases']).toContain('Lucy as Luffy');
    expect(english.entries['conflicts']?.bullets['aliases']).toContain('two Blackback cards');
    expect(greek.entries['conflicts']?.bullets['aliases']).toContain('ο Lucy ως Luffy');
    expect(greek.entries['conflicts']?.bullets['aliases']).toContain('δύο κάρτες του Blackback');
  });

  it('does not re-answer empty results, it points at the answer that owns them', () => {
    const bullet = english.entries['firstRunProblems']?.bullets['emptyResults'] ?? '';

    expect(bullet).toContain('its own answer above');
    // The one that owns it.
    expect(english.entries['fallbackAndLimits']?.bullets['whatDoesNot']).toBeTruthy();
  });
});
