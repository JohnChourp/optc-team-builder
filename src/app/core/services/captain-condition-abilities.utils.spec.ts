import { describe, expect, it } from 'vitest';

import {
  type CaptainCondition,
  type ConditionalBuilderAbility,
} from '../models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { type AutoBuildSlot } from '../models/auto-team-builder.models';
import { buildAutoBuildAbilityCoverageBreakdown } from './auto-team-builder.utils';
import {
  isCaptainConditionMet,
  resolveAutoBuildSlotAbilities,
  resolveCrewSeatAbilities,
} from './captain-condition-abilities.utils';

function condition(overrides: Partial<CaptainCondition>): CaptainCondition {
  return {
    text: 'If X is your Captain',
    captain: 'self',
    names: [],
    friendCaptain: false,
    captainTypes: [],
    captainTags: [],
    captainClasses: [],
    captainTypeAndClass: false,
    hasOtherRequirements: false,
    ...overrides,
  };
}

function despair(minTurns: number, captainCondition?: CaptainCondition) {
  return {
    key: 'remove_despair',
    label: 'Remove Despair',
    minTurns,
    isCompleteRemoval: false,
    slotTokens: [],
    source: 'specialText' as const,
    coverageMode: 'explicit' as const,
    effectTargetScope: 'crew' as const,
    ...(captainCondition ? { captainCondition } : {}),
  };
}

function unit(
  id: number,
  options: {
    type?: string;
    classes?: string[];
    families?: string[];
    characterTags?: string[];
    conditional?: ConditionalBuilderAbility[];
  } = {},
): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
    type: options.type ?? 'STR',
    classes: options.classes ?? ['Fighter'],
    families: options.families ?? [],
    detail: {
      builderAbilities: [despair(3)],
      characterTags: options.characterTags ?? [],
      ...(options.conditional ? { conditionalBuilderAbilities: options.conditional } : {}),
    },
  } as unknown as CharacterDetailRecord;
}

const CORAZON_CONDITION = condition({
  text: 'If Corazon is your Captain or Friend/Guest Captain',
  captain: 'named',
  names: ['Corazon'],
  friendCaptain: true,
});
const cora = unit(2195, {
  conditional: [despair(20, CORAZON_CONDITION) as ConditionalBuilderAbility],
});
const corazon = unit(1001, { families: ['Donquixote Rosinante', 'Corazon'] });
const luffy = unit(1, { families: ['Monkey D. Luffy'], type: 'DEX', classes: ['Driven'] });

function despairTurns(seats: Array<CharacterDetailRecord | null>, seatIndex: number): number[] {
  return resolveCrewSeatAbilities(seats, seatIndex)
    .filter((ability) => ability.key === 'remove_despair')
    .map((ability) => ability.minTurns ?? 0);
}

describe('captain conditions met by a crew (869fhvfva)', () => {
  it('credits Cora with 20 turns only under a Corazon Captain or Friend Captain', () => {
    expect(despairTurns([corazon, null, cora], 2)).toEqual([3, 20]);
    expect(despairTurns([luffy, corazon, cora], 2)).toEqual([3, 20]);
    expect(despairTurns([luffy, null, cora], 2)).toEqual([3]);
    expect(despairTurns([null, null, cora], 2)).toEqual([3]);
  });

  it('never leaks the condition into the returned abilities', () => {
    const abilities = resolveCrewSeatAbilities([corazon, null, cora], 2);

    expect(abilities.some((ability) => 'captainCondition' in ability)).toBe(false);
  });

  it('matches a name by its last word, so "Luffy" finds "Monkey D. Luffy"', () => {
    const luffyCondition = condition({ captain: 'named', names: ['Luffy'] });

    expect(isCaptainConditionMet(luffyCondition, [luffy, null, cora], 2)).toBe(true);
    expect(isCaptainConditionMet(luffyCondition, [corazon, luffy, cora], 2)).toBe(false);
  });

  it('meets a self condition only from the seats it names', () => {
    const captainOnly = condition({ captain: 'self' });
    const eitherSeat = condition({ captain: 'self', friendCaptain: true });

    expect(isCaptainConditionMet(captainOnly, [cora, null], 0)).toBe(true);
    expect(isCaptainConditionMet(captainOnly, [luffy, cora], 1)).toBe(false);
    expect(isCaptainConditionMet(eitherSeat, [luffy, cora], 1)).toBe(true);
    expect(isCaptainConditionMet(eitherSeat, [luffy, null, cora], 2)).toBe(false);
  });

  it('reads captain types, classes, tags and the type-and-class rule', () => {
    const driven = condition({ captain: 'type', captainClasses: ['Driven'] });
    const dexSlasher = condition({
      captain: 'type',
      captainTypes: ['DEX'],
      captainClasses: ['Slasher'],
      captainTypeAndClass: true,
    });
    const fiveElders = condition({ captain: 'type', captainTags: ['Five Elders'] });
    const elder = unit(4400, { characterTags: ['Five Elders'] });

    expect(isCaptainConditionMet(driven, [luffy, null, cora], 2)).toBe(true);
    expect(isCaptainConditionMet(driven, [corazon, luffy, cora], 2)).toBe(false);
    expect(isCaptainConditionMet(dexSlasher, [luffy, null, cora], 2)).toBe(false);
    expect(isCaptainConditionMet(fiveElders, [elder, null, cora], 2)).toBe(true);
  });

  it('never meets a condition that asks for more than a captain seat', () => {
    const more = condition({
      captain: 'type',
      captainClasses: ['Driven'],
      hasOtherRequirements: true,
    });

    expect(isCaptainConditionMet(more, [luffy, null, cora], 2)).toBe(false);
  });

  it('reads an Auto Team Builder result by role, with or without a Friend Captain', () => {
    const slot = (role: AutoBuildSlot['role'], character: CharacterDetailRecord) =>
      ({ role, character, reasonChips: [] }) as AutoBuildSlot;
    const turns = (slots: AutoBuildSlot[]) =>
      resolveAutoBuildSlotAbilities(slots).map((abilities) =>
        abilities.filter((ability) => ability.key === 'remove_despair').map((a) => a.minTurns),
      );

    expect(turns([slot('captain', corazon), slot('sub', cora)])).toEqual([[3], [3, 20]]);
    expect(
      turns([slot('captain', luffy), slot('friendCaptain', corazon), slot('sub', cora)]),
    ).toEqual([[3], [3], [3, 20]]);
    expect(turns([slot('captain', luffy), slot('sub', cora)])).toEqual([[3], [3]]);
  });

  it('keeps a unit without conditional entries exactly as before', () => {
    const plain = unit(5);

    expect(resolveCrewSeatAbilities([corazon, null, plain], 2)).toBe(plain.detail.builderAbilities);
  });

  it('lets the ranked-team ability breakdown count what the crew unlocks', () => {
    const slot = (role: AutoBuildSlot['role'], character: CharacterDetailRecord) =>
      ({ role, character, reasonChips: [] }) as AutoBuildSlot;
    const conditionalOnly = unit(3000, {
      conditional: [
        {
          ...despair(20, CORAZON_CONDITION),
          key: 'remove_bind',
          label: 'Remove Bind',
        } as ConditionalBuilderAbility,
      ],
    });
    const slots = [slot('captain', corazon), slot('sub', conditionalOnly)];
    const characters = slots.map((entry) => entry.character);
    const keys = (breakdown: ReturnType<typeof buildAutoBuildAbilityCoverageBreakdown>) =>
      breakdown.allAbilities.map((item) => item.key).sort();

    expect(keys(buildAutoBuildAbilityCoverageBreakdown(characters))).toEqual(['remove_despair']);
    expect(
      keys(
        buildAutoBuildAbilityCoverageBreakdown(characters, resolveAutoBuildSlotAbilities(slots)),
      ),
    ).toEqual(['remove_bind', 'remove_despair']);
  });
});
