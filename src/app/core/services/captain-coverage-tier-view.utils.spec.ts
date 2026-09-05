import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type CharacterCaptainAbilityCoverageTier } from '../models/optc.models';
import {
  CAPTAIN_TIER_SCOPE_SEPARATOR,
  buildCaptainCoverageTierConditionLineTokens,
  buildCaptainCoverageTierScopeTokens,
  buildCaptainCoverageTierView,
  type CaptainCoverageTierScopeToken,
} from './captain-coverage-tier-view.utils';

function tier(
  overrides: Partial<CharacterCaptainAbilityCoverageTier> = {},
): CharacterCaptainAbilityCoverageTier {
  return {
    tier: 1,
    kind: 'baseline',
    scope: 'subset',
    characterConditions: {
      universal: false,
      fallbackOther: false,
      selfOnly: false,
      types: [],
      classes: [],
      characterTags: [],
    },
    teamConditions: [],
    fieldConditions: [],
    triggerConditions: [],
    clauses: [],
    ...overrides,
  } as CharacterCaptainAbilityCoverageTier;
}

/** The English catalogue, read from the shipped file rather than restated here. */
function englishCatalogue(): Record<string, string> {
  const global = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/i18n/en.json'), 'utf8'),
  ) as { captainTiers?: { scope?: Record<string, string> } };

  return global.captainTiers?.scope ?? {};
}

/** Renders tokens the way a template does, so tokens and label can be compared. */
function render(
  tokens: CaptainCoverageTierScopeToken[],
  catalogue: Record<string, string>,
): string {
  return tokens
    .map((token) => {
      if (token.text !== undefined) {
        return token.text;
      }

      const short = token.key.replace('captainTiers.scope.', '');
      const template = catalogue[short];

      expect(template, `missing English string for ${token.key}`).toBeTruthy();

      return Object.entries(token.params ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        template,
      );
    })
    .join(CAPTAIN_TIER_SCOPE_SEPARATOR);
}

describe('captain coverage tier scope tokens', () => {
  /*
   * The whole point of the token list: the same label, in pieces a template can
   * translate. If the two ever disagree, one of the two renderings is lying to
   * somebody - so they are asserted against each other rather than separately.
   */
  const cases: Array<[string, CharacterCaptainAbilityCoverageTier]> = [
    [
      'fallback other',
      tier({ characterConditions: { ...tier().characterConditions, fallbackOther: true } }),
    ],
    [
      'universal',
      tier({ characterConditions: { ...tier().characterConditions, universal: true } }),
    ],
    [
      'cost and rarity ranges',
      tier({
        characterConditions: {
          ...tier().characterConditions,
          costRange: { min: 30, max: 55 },
          rarityRange: { min: 5, max: 6 },
        },
      } as Partial<CharacterCaptainAbilityCoverageTier>),
    ],
    [
      'types, classes and tags',
      tier({
        characterConditions: {
          ...tier().characterConditions,
          types: ['DEX', 'QCK'],
          classes: ['Fighter'],
          characterTags: ['Straw Hat Pirates'],
        },
      }),
    ],
    ['nothing at all, so the tier number stands in', tier({ tier: 7 })],
  ];

  it.each(cases)('renders the same scope label as the English string: %s', (_name, input) => {
    const catalogue = englishCatalogue();
    const view = buildCaptainCoverageTierView(input);

    expect(render(view.scopeLabelTokens, catalogue)).toBe(view.scopeLabel);
  });

  it('keeps game data out of the translation catalogue', () => {
    const tokens = buildCaptainCoverageTierScopeTokens(
      tier({
        characterConditions: {
          ...tier().characterConditions,
          universal: true,
          types: ['INT'],
          classes: ['Striker'],
          characterTags: ['Giant'],
        },
      }),
    );

    // A type, a class and a tag are the game's own names in every language.
    expect(tokens.filter((token) => token.text !== undefined).map((token) => token.text)).toEqual([
      '[INT]',
      'Striker',
      '[Giant]',
    ]);
    expect(tokens.filter((token) => token.key !== undefined)).toHaveLength(1);
  });

  it('never returns an empty token list, so a tier always names itself', () => {
    const tokens = buildCaptainCoverageTierScopeTokens(tier({ tier: 3 }));

    expect(tokens).toEqual([{ key: 'captainTiers.scope.tierFallback', params: { tier: 3 } }]);
  });

  it('ships every key it emits, in both languages', () => {
    const emitted = new Set<string>();

    for (const [, input] of cases) {
      for (const token of buildCaptainCoverageTierScopeTokens(input)) {
        if (token.key !== undefined) {
          emitted.add(token.key.replace('captainTiers.scope.', ''));
        }
      }
    }
    // The ones the cases above do not reach are still shipped.
    emitted.add('dominantType');

    for (const locale of ['en', 'el']) {
      const catalogue = (
        JSON.parse(readFileSync(resolve(process.cwd(), `public/i18n/${locale}.json`), 'utf8')) as {
          captainTiers?: { scope?: Record<string, string> };
        }
      ).captainTiers?.scope;

      expect(catalogue, `${locale}.json has no captainTiers.scope`).toBeTruthy();

      for (const key of emitted) {
        expect(catalogue?.[key], `${locale} is missing captainTiers.scope.${key}`).toBeTruthy();
      }
    }
  });

  /*
   * The condition lines ARE translated now, structurally: every line carries a
   * translated prefix, and a line whose tail is game data - types, classes,
   * tags, territories, a branch label - or one of the four fixed clauses the
   * parser emits verbatim becomes fully translatable. A line whose tail is raw
   * parser English keeps that English, because inventing a translation for text
   * the dataset spells in English would be worse than showing what the game says.
   *
   * The English is the contract: these keys replaced hardcoded literals, so
   * rendering the tokens through the shipped English catalogue must reproduce
   * `conditionLines` character for character. That is what the first test below
   * pins, and it is the check that catches a well-meaning reword of a key.
   */
  const CONDITION_CASES: Array<[string, CharacterCaptainAbilityCoverageTier]> = [
    [
      'crew exclusion, game tokens',
      tier({
        teamConditions: [
          { kind: 'crew-exclusion', rawClause: '', types: ['PSY'], classes: ['Fighter'] },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'crew exclusion falling back to its raw clause',
      tier({
        teamConditions: [
          { kind: 'crew-exclusion', rawClause: 'no Slashers at all' },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'a raw team clause',
      tier({
        teamConditions: [
          {
            kind: 'crew-composition',
            rawClause: 'you have 5 or more Slashers characters in your crew',
          },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'the fixed requires-captain clause',
      tier({
        teamConditions: [
          { kind: 'requires-captain', rawClause: 'this character is your Captain' },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'crew composition with a count and targets',
      tier({
        teamConditions: [
          { kind: 'crew-composition', rawClause: '', minCount: 3, classes: ['Powerhouse'] },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'crew composition, same Type only',
      tier({
        teamConditions: [
          { kind: 'crew-composition', rawClause: '', minCount: 4, sameType: true },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'crew composition whose raw clause no longer shadows its structured fields',
      tier({
        teamConditions: [
          {
            kind: 'crew-composition',
            rawClause: 'you have 6 or more Powerhouse characters in your crew',
            minCount: 6,
            classes: ['Powerhouse'],
          },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'crew composition, one of each listed target',
      tier({
        teamConditions: [
          {
            kind: 'crew-composition',
            rawClause: 'there is a [STR], [DEX] and [QCK] character in your crew',
            minCount: 3,
            types: ['STR', 'DEX', 'QCK'],
          },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'a single target whose minCount equals it, which is NOT one of each',
      tier({
        teamConditions: [
          {
            kind: 'crew-composition',
            rawClause: 'there is a [PSY] character in your crew',
            minCount: 1,
            types: ['PSY'],
          },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    ],
    [
      'an HP-above trigger whose raw phrasing differs from the rebuilt one',
      tier({
        triggerConditions: [
          { kind: 'hp-above', rawClause: 'HP is 99% or above', hpPercent: 99 },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    ],
    [
      'an HP-below trigger whose raw phrasing differs from the rebuilt one',
      tier({
        triggerConditions: [
          { kind: 'hp-below', rawClause: 'HP is 50% or below', hpPercent: 50 },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    ],
    [
      'an action-special trigger keyed by kind, not by its clause',
      tier({
        triggerConditions: [
          {
            kind: 'action-special-excellent',
            rawClause: 'performs EXCELLENT with their Action Special',
          },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    ],
    [
      'a field territory',
      tier({
        fieldConditions: [
          { territories: ['Wano', 'Dressrosa'] },
        ] as CharacterCaptainAbilityCoverageTier['fieldConditions'],
      }),
    ],
    [
      'a captain branch state',
      tier({
        triggerConditions: [
          { kind: 'captain-branch-state', rawClause: '', branchLabel: 'Gear 4 - Boundman Captain' },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    ],
    [
      'consecutive PERFECTs',
      tier({
        triggerConditions: [
          { kind: 'consecutive-perfects', rawClause: '', perfectStreak: 2 },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    ],
    [
      'the fixed beneficial-orb trigger',
      tier({
        triggerConditions: [
          { kind: 'other', rawClause: 'if they have a beneficial orb' },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    ],
    [
      'a raw trigger clause',
      tier({
        triggerConditions: [
          { kind: 'other', rawClause: 'if total Damage Taken is 20,000 or more' },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    ],
  ];

  function conditionCatalogue(locale = 'en'): Record<string, string> {
    const global = JSON.parse(
      readFileSync(resolve(process.cwd(), `public/i18n/${locale}.json`), 'utf8'),
    ) as { captainTiers?: { condition?: Record<string, string> } };

    return global.captainTiers?.condition ?? {};
  }

  it.each(CONDITION_CASES)(
    'renders the same English condition line as the hardcoded output: %s',
    (_name, input) => {
      const catalogue = conditionCatalogue();
      const view = buildCaptainCoverageTierView(input);

      expect(view.conditionLineTokens).toHaveLength(view.conditionLines.length);

      view.conditionLineTokens.forEach((tokens, index) => {
        const rendered = tokens
          .map((token) => {
            if (token.text !== undefined) {
              return token.text;
            }

            const short = token.key.replace('captainTiers.condition.', '');
            const template = catalogue[short];

            expect(template, `missing English string for ${token.key}`).toBeTruthy();

            return Object.entries(token.params ?? {}).reduce(
              (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
              template,
            );
          })
          .join('');

        expect(rendered).toBe(view.conditionLines[index]);
      });
    },
  );

  it('ships every condition key it emits, in both languages', () => {
    const emitted = new Set<string>();

    for (const [, input] of CONDITION_CASES) {
      for (const tokens of buildCaptainCoverageTierConditionLineTokens(input)) {
        for (const token of tokens) {
          if (token.key !== undefined) {
            emitted.add(token.key.replace('captainTiers.condition.', ''));
          }
        }
      }
    }
    // The two high-volume fixed clauses the cases above do not reach.
    emitted.add('triggerActionSpecialExcellent');
    emitted.add('triggerApplicableTag');

    for (const locale of ['en', 'el']) {
      const catalogue = conditionCatalogue(locale);

      expect(
        Object.keys(catalogue).length,
        `${locale}.json has no captainTiers.condition`,
      ).toBeGreaterThan(0);

      for (const key of emitted) {
        expect(catalogue[key], `${locale} is missing captainTiers.condition.${key}`).toBeTruthy();
      }
    }
  });

  /*
   * Follow-up 1: the structured crew branch was dead code, shadowed by a
   * rawClause check that fired for all 240 crew conditions in the dataset. It
   * now wins, and the "one of each" family keeps its own meaning instead of
   * collapsing into "N of any".
   */
  it('prefers structured crew fields over the raw clause, and distinguishes one-of-each', () => {
    const shadowed = buildCaptainCoverageTierView(
      tier({
        teamConditions: [
          {
            kind: 'crew-composition',
            rawClause: 'you have 6 or more Powerhouse characters in your crew',
            minCount: 6,
            classes: ['Powerhouse'],
          },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    );

    expect(shadowed.conditionLines).toEqual(['Team: crew has 6+ Powerhouse']);

    const oneOfEach = buildCaptainCoverageTierView(
      tier({
        teamConditions: [
          {
            kind: 'crew-composition',
            rawClause: 'there is a [STR], [DEX] and [QCK] character in your crew',
            minCount: 3,
            types: ['STR', 'DEX', 'QCK'],
          },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    );

    expect(oneOfEach.conditionLines).toEqual([
      'Team: crew has one of each of [STR] / [DEX] / [QCK]',
    ]);

    // A single target trivially satisfies minCount === targets.length, and must not
    // become "one of each of [PSY]".
    const single = buildCaptainCoverageTierView(
      tier({
        teamConditions: [
          {
            kind: 'crew-composition',
            rawClause: 'there is a [PSY] character in your crew',
            minCount: 1,
            types: ['PSY'],
          },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    );

    expect(single.conditionLines).toEqual(['Team: crew has 1+ [PSY]']);

    // A crew condition with no structured fields still falls back to its prose.
    const proseOnly = buildCaptainCoverageTierView(
      tier({
        teamConditions: [
          { kind: 'crew-composition', rawClause: 'your crew is unusual somehow' },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    );

    expect(proseOnly.conditionLines).toEqual(['Team: your crew is unusual somehow']);
  });

  /*
   * Follow-up 2: the HP triggers carried hpPercent on every one of the 234
   * instances and printed the raw clause anyway. Rebuilding from the field also
   * normalises the dataset's minority phrasings onto one form.
   */
  it('rebuilds HP triggers from hpPercent, normalising the phrasing', () => {
    const view = buildCaptainCoverageTierView(
      tier({
        triggerConditions: [
          { kind: 'hp-above', rawClause: 'HP is 99% or above', hpPercent: 99 },
          { kind: 'hp-below', rawClause: 'HP is 50% or below', hpPercent: 50 },
        ] as CharacterCaptainAbilityCoverageTier['triggerConditions'],
      }),
    );

    expect(view.conditionLines).toEqual(['Trigger: HP is above 99%', 'Trigger: HP is below 50%']);
  });

  /*
   * The Greek must differ from the English, or a forgotten translation would
   * pass every other test here by quietly reading as the English string.
   */
  it('actually translates every condition key into Greek, interpolation intact', () => {
    const en = conditionCatalogue('en');
    const el = conditionCatalogue('el');

    expect(Object.keys(el).sort()).toEqual(Object.keys(en).sort());

    for (const key of Object.keys(en)) {
      expect(el[key], `${key} is untranslated`).not.toBe(en[key]);

      for (const param of en[key].matchAll(/\{\{(\w+)\}\}/gu)) {
        expect(el[key], `${key} drops ${param[0]}`).toContain(param[0]);
      }
    }
  });
});
