import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  auditTranslations,
  classifyPair,
  collectNamespaces,
  compareWithRegister,
  flattenTranslations,
  placeholdersOf,
  sameSet,
} from './check-i18n-greek-coverage.mjs';

/**
 * 869f135rx. Key parity already passes. The thing this check adds is the claim
 * that a Greek value is Greek, so the tests that matter are the ones about a
 * value that LOOKS translated and is not.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

describe('classifyPair', () => {
  it('passes a value that contains Greek', () => {
    expect(classifyPair('Save', 'Αποθήκευση')).toBeNull();
  });

  it('flags an English sentence copied into the Greek file', () => {
    expect(classifyPair('Save the team', 'Save the team')).toBe('identical');
  });

  it('flags a value that was reworded in English rather than translated', () => {
    expect(classifyPair('Open Auto Team Builder', 'Auto Team Builder')).toBe('no-greek');
  });

  it('ignores a value with no letters at all, which cannot be translated', () => {
    expect(classifyPair('{{count}}', '{{count}}')).toBeNull();
    expect(classifyPair('100%', '100%')).toBeNull();
  });

  it('ignores a non-string, so a number or null never becomes a finding', () => {
    expect(classifyPair(42, 42)).toBeNull();
    expect(classifyPair('Save', undefined)).toBeNull();
  });

  it('passes a value that keeps an English game term inside Greek prose', () => {
    expect(classifyPair('Friend Captain boost', 'Ενίσχυση Friend Captain')).toBeNull();
  });

  it('ignores surrounding whitespace, so a stray space is not a finding', () => {
    expect(classifyPair('Save ', ' Save')).toBe('identical');
  });
});

describe('placeholdersOf / sameSet', () => {
  it('reads every placeholder, with or without inner spaces', () => {
    expect([...placeholdersOf('{{a}} and {{ b }}')].sort()).toEqual(['a', 'b']);
  });

  it('treats a dropped placeholder as a difference', () => {
    expect(sameSet(placeholdersOf('{{a}} {{b}}'), placeholdersOf('{{a}}'))).toBe(false);
  });

  it('treats an invented placeholder as a difference', () => {
    expect(sameSet(placeholdersOf('{{a}}'), placeholdersOf('{{a}} {{c}}'))).toBe(false);
  });

  it('does not care about order or repetition', () => {
    expect(sameSet(placeholdersOf('{{a}} {{b}}'), placeholdersOf('{{b}} {{a}} {{a}}'))).toBe(true);
  });
});

describe('flattenTranslations', () => {
  it('flattens nested namespaces to dotted keys', () => {
    expect(flattenTranslations({ a: { b: 'c' }, d: 'e' })).toEqual({ 'a.b': 'c', d: 'e' });
  });
});

describe('collectNamespaces', () => {
  /*
   * The first version of this check filtered to directories and silently lost the
   * root `public/i18n/en.json` pair - an entire namespace, missing from a check
   * written to stop exactly that. It surfaced only because the generated register
   * then disagreed with the checker.
   */
  it('includes the root namespace, not only the directories', () => {
    expect(collectNamespaces()).toContain('');
  });

  it('finds every namespace directory as well', () => {
    expect(collectNamespaces().length).toBeGreaterThan(20);
  });
});

describe('compareWithRegister', () => {
  const finding = { namespace: 'settings', key: 'a', phrase: 'Rumble', kind: 'identical' };

  it('accepts a phrase registered as a term', () => {
    const result = compareWithRegister([finding], { terms: ['Rumble'], untranslated: [] });

    expect(result.unregistered).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('accepts a phrase registered as known debt', () => {
    expect(compareWithRegister([finding], { terms: [], untranslated: ['Rumble'] }).unregistered).toEqual(
      [],
    );
  });

  it('reports a phrase in neither list', () => {
    expect(compareWithRegister([finding], { terms: [], untranslated: [] }).unregistered).toHaveLength(1);
  });

  it('reports a registered phrase that is now translated, so the debt can only shrink', () => {
    expect(compareWithRegister([], { terms: [], untranslated: ['Rumble'] }).stale).toEqual(['Rumble']);
  });

  it('reports a stale TERM too, so the permanent list cannot rot either', () => {
    expect(compareWithRegister([], { terms: ['Rumble'], untranslated: [] }).stale).toEqual(['Rumble']);
  });
});

describe('the real translations', () => {
  const audit = auditTranslations();

  it('has no placeholder mismatch in any namespace', () => {
    expect(audit.placeholderMismatches).toEqual([]);
  });

  it('reads every key, so a namespace cannot be skipped silently', () => {
    expect(audit.keyCount).toBeGreaterThan(3000);
  });

  it('keeps the register free of phrases in both lists at once', () => {
    const register = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'scripts/data/i18n-untranslated-register.json'), 'utf8'),
    );
    const terms = new Set(register.terms);

    expect(register.untranslated.filter((phrase: string) => terms.has(phrase))).toEqual([]);
  });

  it('records the vocabulary that produced the split, for whoever classifies the next phrase', () => {
    const register = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'scripts/data/i18n-untranslated-register.json'), 'utf8'),
    );

    expect(register.gameVocabulary).toContain('Captain');
    expect(register.gameVocabulary).toContain('Rumble');
    expect(register.measuredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});
