import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type CharacterCaptainAbilityCoverageTier } from '../models/optc.models';
import {
  CAPTAIN_TIER_SCOPE_SEPARATOR,
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
   * Deliberately NOT translated. Measured across the shipped dataset: of ~1172
   * condition lines in 6310 tiers, ~1126 end in raw parser output that is
   * English game text. Translating only the prefix would glue a Greek label to
   * an English sentence, which reads worse than leaving it consistent.
   */
  it('leaves the condition lines in English, prefix included', () => {
    const view = buildCaptainCoverageTierView(
      tier({
        teamConditions: [
          { kind: 'crew-exclusion', rawClause: '', types: ['PSY'] },
        ] as CharacterCaptainAbilityCoverageTier['teamConditions'],
      }),
    );

    expect(view.conditionLines).toEqual(['Team excludes: [PSY]']);
  });
});
