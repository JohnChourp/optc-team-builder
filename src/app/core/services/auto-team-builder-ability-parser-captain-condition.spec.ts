import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// Per-topic regression for special sentences that hold only with a given captain
// (869fhvfva). The harness preamble is duplicated from auto-team-builder-ability-parser.spec.ts
// on purpose: a new case gets its own file, so parallel branches never meet in the monolith.
type AbilitySource = 'specialText' | 'superSpecialText' | 'captainAbility' | 'sailorAbilities';

interface CaptainCondition {
  text: string;
  captain: 'self' | 'named' | 'other';
  names: string[];
  captainTypes: string[];
  hasOtherRequirements: boolean;
}

interface ParsedAbility {
  key: string;
  minTurns: number | null;
  source: AbilitySource;
  captainCondition?: CaptainCondition;
}

interface ParserCharacter {
  id: number;
  detail: {
    specialText: string | null;
    captainAbility: string | null;
    builderAbilities: Array<Record<string, unknown>>;
    conditionalBuilderAbilities?: ParsedAbility[];
  };
}

let analyzeBuilderAbilityText: (value: unknown, source: AbilitySource) => ParsedAbility[];
let enrichCharactersWithBuilderAbilities: (
  characters: ParserCharacter[],
  options?: { logger?: null },
) => Promise<
  Array<{ key: string; matchingCharacterIds: number[]; turnMatchingCharacterIds: unknown }>
>;

beforeAll(async () => {
  ({ analyzeBuilderAbilityText, enrichCharactersWithBuilderAbilities } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/auto-team-builder-ability-parser.mjs')).href
  ));
});

const CORA =
  "Recovers 50x character's RCV in HP and reduces Bind, Despair, Paralysis, ATK DOWN, Chain " +
  'Multiplier Limit and Chain Coefficient Reduction duration by 3 turns. If Corazon is your ' +
  'Captain or Friend/Guest Captain, reduces Despair duration by 20 turns.';

function entries(text: string, key: string): ParsedAbility[] {
  return analyzeBuilderAbilityText(text, 'specialText').filter((ability) => ability.key === key);
}

function unconditional(text: string, key: string): Array<number | null> {
  return entries(text, key)
    .filter((ability) => !ability.captainCondition)
    .map((ability) => ability.minTurns);
}

function conditional(text: string, key: string): ParsedAbility[] {
  return entries(text, key).filter((ability) => ability.captainCondition);
}

describe('a special sentence that holds only with a given captain', () => {
  it('keeps Cora #2195 at 3 turns and the 20 turns behind Corazon', () => {
    expect(unconditional(CORA, 'remove_despair')).toEqual([3]);

    const [corazon, ...rest] = conditional(CORA, 'remove_despair');

    expect(rest).toEqual([]);
    expect(corazon.minTurns).toBe(20);
    expect(corazon.captainCondition).toEqual({
      text: 'If Corazon is your Captain or Friend/Guest Captain',
      captain: 'named',
      names: ['Corazon'],
      captainTypes: [],
      hasOtherRequirements: false,
    });
  });

  it('reads an elliptical "otherwise" as the effect without the captain (#3983)', () => {
    const text =
      'Reduces Bind duration by 3 turns. If this character is your Captain ' +
      'or Friend/Guest Captain, boosts ATK against enemies inflicted with Increase Damage Taken ' +
      'by 3x for 2 turns, by 2.75x for 1 turn otherwise.';

    expect(unconditional(text, 'boost_atk')).toEqual([1]);
    expect(conditional(text, 'boost_atk').map((ability) => ability.minTurns)).toEqual([2]);
    expect(conditional(text, 'boost_atk')[0].captainCondition?.captain).toBe('self');
  });

  it('keeps a full ", otherwise," clause unconditional (#1681)', () => {
    const text =
      "Deals 20% of enemies' current HP in damage to all enemies. If Luffy is your Captain or " +
      'Friend/Guest Captain, changes all orbs of left column characters into Matching orbs, ' +
      'otherwise, adds 0.5x to Chain multiplier for 1 turn.';

    expect(unconditional(text, 'chain_multiplier_additive_boost')).toHaveLength(1);
    expect(unconditional(text, 'change_slots')).toEqual([]);
    expect(conditional(text, 'change_slots')[0].captainCondition?.names).toEqual(['Luffy']);
  });

  it('records a captain-type alternative without calling it another requirement (#3649)', () => {
    const [ability] = conditional(
      'If this character is your Captain or Friend/Guest Captain or your Captain is a [STR] or ' +
        '[DEX] character, boosts ATK against delayed enemies by 2.25x for 3 turns, by 2x for 1 ' +
        'turn otherwise.',
      'boost_atk',
    );

    expect(ability.captainCondition).toEqual(
      expect.objectContaining({
        captain: 'self',
        captainTypes: ['STR', 'DEX'],
        hasOtherRequirements: false,
      }),
    );
  });

  it('marks a condition with more than a captain seat, and reads seat lists past a comma', () => {
    const territory = conditional(
      'If this character is your Captain or Friend Captain and field has Territory: [QCK] and ' +
        'Free Spirit when the special is activated, boosts ATK of all characters by 2x for 1 turn.',
      'boost_atk',
    );
    const seatList = analyzeBuilderAbilityText(
      "Deals 50x character's ATK in Typeless damage to all enemies. If this character is your " +
        'Captain, Friend/Guest Captain or was Captain at start of adventure and is crewmate when ' +
        'the Special is activated, increases boost effects of Chain Tap Timing Bonus buffs by ' +
        '+0.2x, including effects activated in the same Ability.',
      'specialText',
    ).filter((ability) => ability.captainCondition);
    const timingOnly = conditional(
      'If this character is your Captain or Friend/Guest Captain when the special is activated, ' +
        'boosts ATK of all characters by 2x for 1 turn.',
      'boost_atk',
    );

    expect(territory[0].captainCondition?.hasOtherRequirements).toBe(true);
    expect(seatList.length).toBeGreaterThan(0);
    expect(seatList[0].captainCondition?.text).toContain('or was Captain at start of adventure');
    expect(seatList[0].captainCondition?.hasOtherRequirements).toBe(true);
    expect(timingOnly[0].captainCondition?.hasOtherRequirements).toBe(false);
  });

  it('leaves text without such a sentence exactly as before', () => {
    const text =
      'Reduces Despair duration by 3 turns. If your crew has 3+ Slasher characters, boosts ATK ' +
      'of all characters by 2x for 1 turn.';

    expect(
      analyzeBuilderAbilityText(text, 'specialText').some((ability) => ability.captainCondition),
    ).toBe(false);
    expect(
      analyzeBuilderAbilityText(CORA, 'captainAbility').some((ability) => ability.captainCondition),
    ).toBe(false);
  });

  it('stores the conditional entries apart and drops a stale unconditional copy', async () => {
    const characters: ParserCharacter[] = [
      {
        id: 2195,
        detail: {
          specialText: CORA,
          captainAbility: null,
          // What a seed written before 869fhvfva holds for Cora.
          builderAbilities: [
            {
              key: 'remove_despair',
              label: 'Remove Despair',
              minTurns: 20,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
              coverageMode: 'explicit',
              effectTargetScope: 'crew',
            },
          ],
        },
      },
    ];
    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });
    const detail = characters[0].detail;
    const despair = catalog.find((item) => item.key === 'remove_despair');

    expect(
      detail.builderAbilities
        .filter((ability) => ability['key'] === 'remove_despair')
        .map((ability) => ability['minTurns']),
    ).toEqual([3]);
    expect(detail.conditionalBuilderAbilities?.map((ability) => ability.minTurns)).toEqual([20]);
    expect(JSON.stringify(despair?.turnMatchingCharacterIds)).not.toContain('20');
  });
});
