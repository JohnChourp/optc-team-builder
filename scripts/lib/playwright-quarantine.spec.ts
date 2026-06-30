import { describe, expect, it } from 'vitest';

import { buildQuarantineGrep, validateQuarantineConfig } from './playwright-quarantine.mjs';

describe('playwright quarantine metadata', () => {
  it('accepts an empty active quarantine list', () => {
    const result = validateQuarantineConfig({ schemaVersion: 1, entries: [] });

    expect(result.failures).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it('requires registered quarantine tags to appear in specs', () => {
    const result = validateQuarantineConfig(
      {
        schemaVersion: 1,
        entries: [
          {
            tag: '@quarantined:guided-toggle',
            browsers: ['chromium'],
            reason: 'Repeated CI failures on the guided toggle.',
            trackingUrl: 'https://app.clickup.com/t/90121749478/869dwc3za',
            firstSeenAt: '2026-06-29',
            firstSeenEvidence: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/28385874618',
            owner: 'Browser regression maintainers',
            restorationCriteria: 'Three clean CI runs after the interaction fix lands.',
          },
        ],
      },
      { specTags: new Set(['@quarantined:guided-toggle']) },
    );

    expect(result.failures).toEqual([]);
    expect(result.tags).toEqual(['@quarantined:guided-toggle']);
  });

  it('rejects drift between spec tags and metadata', () => {
    const result = validateQuarantineConfig(
      { schemaVersion: 1, entries: [] },
      { specTags: new Set(['@quarantined:missing']) },
    );

    expect(result.failures).toContain('Spec tag @quarantined:missing is missing from e2e/quarantine.json.');
  });

  it('builds a grep expression for multiple tags', () => {
    expect(buildQuarantineGrep(['@quarantined:b-case', '@quarantined:a-case'])).toBe(
      '(?:^|\\s)(?:@quarantined:a-case|@quarantined:b-case)(?=\\s|$)',
    );
  });

  it('does not match longer quarantine tags with the same prefix', () => {
    const grep = new RegExp(buildQuarantineGrep(['@quarantined:foo']));

    expect(grep.test('case @quarantined:foo')).toBe(true);
    expect(grep.test('case @quarantined:foo-bar')).toBe(false);
  });
});
