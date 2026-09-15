import { describe, expect, it } from 'vitest';

import {
  auditCopy,
  collectCatchSpans,
  collectErrorFeedbackSites,
  parseVocabulary,
  readMethodBody,
  usesVocabulary,
} from './check-failure-vocabulary.mjs';

/**
 * 869f135ra. This guard was wrong three times before it was right, and every one
 * of those is a test below. A check written for the parent about checks that
 * cannot fail has no excuse for being one.
 */

const VOCABULARY = `
export const FAILURE_FAMILIES: readonly FailureFamily[] = [
  {
    id: 'invalidFile',
    dataSafety: 'safe',
    note: 'A note long enough to say why this family is not a duplicate of another one.',
  },
  {
    id: 'storageQuota',
    dataSafety: 'lost',
    note: 'Another note long enough to say why this family is not a duplicate of another one.',
  },
];
`;

const COMPLETE_COPY = {
  en: {
    action: { invalidFile: 'a', storageQuota: 'b' },
    safety: { lost: 'd', safe: 'c' },
    what: { invalidFile: 'e', storageQuota: 'f' },
  },
  el: {
    action: { invalidFile: 'α', storageQuota: 'β' },
    safety: { lost: 'δ', safe: 'γ' },
    what: { invalidFile: 'ε', storageQuota: 'ζ' },
  },
};

function copyWithout(path: [string, string, string]) {
  const clone = JSON.parse(JSON.stringify(COMPLETE_COPY));
  delete clone[path[0]][path[1]][path[2]];
  return clone;
}

describe('parseVocabulary', () => {
  it('reads every family with its safety and note', () => {
    const families = parseVocabulary(VOCABULARY);

    expect(families).toHaveLength(2);
    expect(families[0]).toMatchObject({ dataSafety: 'safe', id: 'invalidFile' });
    expect(families[1].dataSafety).toBe('lost');
  });
});

describe('auditCopy', () => {
  const families = parseVocabulary(VOCABULARY);

  it('passes complete copy', () => {
    const result = auditCopy(families, COMPLETE_COPY);

    expect(result.missing).toEqual([]);
    expect(result.orphans).toEqual([]);
  });

  it('reports a missing action in either language', () => {
    expect(auditCopy(families, copyWithout(['el', 'action', 'storageQuota'])).missing).toEqual([
      'el: action.storageQuota',
    ]);
    expect(auditCopy(families, copyWithout(['en', 'action', 'storageQuota'])).missing).toEqual([
      'en: action.storageQuota',
    ]);
  });

  it('reports a missing data-safety sentence, the part that did not exist before', () => {
    expect(auditCopy(families, copyWithout(['en', 'safety', 'lost'])).missing).toEqual([
      'en: safety.lost',
    ]);
  });

  it('reports copy that belongs to no family, so unreachable words cannot rot unseen', () => {
    const clone = JSON.parse(JSON.stringify(COMPLETE_COPY));
    clone.en.what.somethingRemoved = 'x';

    expect(auditCopy(families, clone).orphans).toEqual(['en: what.somethingRemoved']);
  });

  it('treats an empty string as missing, not as present', () => {
    const clone = JSON.parse(JSON.stringify(COMPLETE_COPY));
    clone.el.what.invalidFile = '   ';

    expect(auditCopy(families, clone).missing).toEqual(['el: what.invalidFile']);
  });
});

describe('collectErrorFeedbackSites', () => {
  /*
   * The first version took EVERY `tone: 'error'`, which swept up the manual
   * builder's validation messages - "two sub slots hold the same character".
   * Nothing has failed there and there is no data-safety question, so the lane
   * would have cried wolf on its first run.
   */
  it('ignores an error tone that is not inside a catch', () => {
    const source = `
      messages.push({ key: 'cost', copy: this.t('validation.cost'), tone: 'error' });
    `;

    expect(collectErrorFeedbackSites(source)).toEqual([]);
  });

  it('finds an error tone inside a catch', () => {
    const source = `
      try { risky(); } catch (error) {
        this.feedback.set({
          tone: 'error',
          details: [this.resolveThing(error)],
        });
      }
    `;

    expect(collectErrorFeedbackSites(source)).toHaveLength(1);
  });

  it('reads the single-string `message:` surface as well as `details:`', () => {
    const source = `
      try { risky(); } catch (error) {
        this.feedback.set({
          tone: 'error',
          message: this.text('boom'),
        });
      }
    `;
    const [site] = collectErrorFeedbackSites(source);

    expect(site.details).toContain("this.text('boom')");
  });
});

describe('collectCatchSpans', () => {
  it('bounds a catch at its own closing brace, not the next one', () => {
    const source = `catch (e) { if (x) { y(); } } after();`;
    const [span] = collectCatchSpans(source);

    expect(source.slice(span.start, span.end)).toBe('catch (e) { if (x) { y(); } }');
  });
});

describe('readMethodBody', () => {
  /*
   * This read a fixed 1800-character window first, and the mutation test caught
   * it: reverting a page to a bare error message left the lane GREEN, because the
   * window ran past the resolver into a neighbouring method that did use the
   * composer.
   */
  it('stops at the end of the method, so a neighbour cannot vouch for it', () => {
    const source = `
      private resolveThing(error: unknown): string {
        return 'bare';
      }

      private failureDetails(id: string): string[] {
        return buildFailureLines(id, this.translate);
      }
    `;
    const index = source.indexOf('private resolveThing');

    expect(readMethodBody(source, index)).not.toContain('buildFailureLines');
  });
});

describe('usesVocabulary', () => {
  const source = `
    private failureDetails(id: string, extra?: string): string[] {
      return [...buildFailureLines(id, this.translate, extra)];
    }

    private resolveBare(error: unknown): string {
      return String(error);
    }
  `;

  it('accepts a direct call to the composer', () => {
    expect(usesVocabulary('buildFailureLines("invalidFile", t)', source)).toBe(true);
  });

  it('accepts one level of indirection through a method that composes', () => {
    expect(usesVocabulary("this.failureDetails('invalidFile', x)", source)).toBe(true);
  });

  it('rejects a method that returns a bare string', () => {
    expect(usesVocabulary('this.resolveBare(error)', source)).toBe(false);
  });

  it('rejects a missing details expression rather than assuming the best', () => {
    expect(usesVocabulary(null, source)).toBe(false);
  });
});
