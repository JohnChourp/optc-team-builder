import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import {
  type AutoBuildConstraints,
  type AutoBuildResult,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { AutoTeamBuilderService } from './auto-team-builder.service';
import { matchesCharacterFacet } from './character-facet-filter.utils';

/**
 * 869fhvfva. A special effect that needs a captain, through the real search.
 *
 * Unit 120 removes Bind only "If your Captain is a <class> character"; nobody else removes it. The
 * pool's Captains are a Fighter and a Slasher, so a Fighter condition is met and the search must
 * use 120 for a Bind requirement and report it covered; a Cerebral condition is never met, and
 * the same search must report Bind missing rather than credit 120 - the control.
 *
 * The harness preamble is duplicated from auto-team-builder-avoid-prefer-search.spec.ts on purpose:
 * a new case gets its own file, so parallel branches never meet in one spec.
 */

const CAPTAIN = 100;
const FRIEND_CAPTAIN = 101;
const BIND_REMOVER = 120;

const SPECIAL = 'Boosts ATK of all characters by 2x for 1 turn.';

function character(
  id: number,
  type: string,
  classes: string[],
  options: {
    captainAbility?: string;
    removesBind?: boolean;
    bindUnderCaptainClass?: string;
    bindCondition?: Record<string, unknown>;
    families?: string[];
  } = {},
): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
    families: options.families ?? [],
    isIncomplete: false,
    type,
    classes,
    primaryClass: classes[0] ?? 'Fighter',
    secondaryClass: classes[1] ?? null,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1.2,
    captainAtkBoost: 3,
    captainAverageBoost: 2.1,
    stats: {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: { hp: 3900, atk: 1900, rcv: 340 },
      growth: 3,
    },
    regionArtwork: { exactLocal: true, thumbnailGlobal: true, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: options.captainAbility ?? null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: SPECIAL,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: options.removesBind
        ? [
            {
              key: 'remove_bind',
              label: 'Bind',
              minTurns: null,
              isCompleteRemoval: true,
              slotTokens: [],
              source: 'specialText',
            },
          ]
        : [],
      ...(options.bindUnderCaptainClass || options.bindCondition
        ? {
            conditionalBuilderAbilities: [
              {
                key: 'remove_bind',
                label: 'Bind',
                minTurns: null,
                isCompleteRemoval: true,
                slotTokens: [],
                source: 'specialText',
                captainCondition: options.bindCondition ?? {
                  text: `If your Captain is a ${options.bindUnderCaptainClass} character`,
                  captain: 'type',
                  names: [],
                  friendCaptain: false,
                  captainTypes: [],
                  captainTags: [],
                  captainClasses: [options.bindUnderCaptainClass],
                  captainTypeAndClass: false,
                  hasOtherRequirements: false,
                },
              },
            ],
          }
        : {}),
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superTandemData: null,
      superClass: null,
      rumbleData: null,
    },
  } as unknown as CharacterDetailRecord;
}

function pool(bindUnderCaptainClass: string): CharacterDetailRecord[] {
  const captainAbility = 'Boosts ATK of all characters by 3x and their HP by 1.2x.';

  return [
    character(CAPTAIN, 'STR', ['Fighter'], { captainAbility }),
    character(FRIEND_CAPTAIN, 'DEX', ['Slasher'], { captainAbility }),
    character(110, 'STR', ['Fighter']),
    character(111, 'DEX', ['Slasher']),
    character(112, 'QCK', ['Shooter']),
    character(113, 'PSY', ['Cerebral']),
    character(BIND_REMOVER, 'QCK', ['Driven'], { bindUnderCaptainClass }),
    character(121, 'STR', ['Driven']),
    character(122, 'DEX', ['Driven']),
    character(123, 'INT', ['Driven']),
  ];
}

class Repository {
  public constructor(private readonly records: CharacterDetailRecord[]) {}

  public async getAutoBuilderCandidates(
    types: string[],
    _limit: number | null,
    options: { selectedClasses?: string[]; lockedCharacterIds?: number[] } = {},
  ): Promise<CharacterDetailRecord[]> {
    const locked = new Set(options.lockedCharacterIds ?? []);

    return this.records.filter(
      (record) =>
        locked.has(record.id) ||
        (matchesCharacterFacet('type', record, { values: types, matchMode: 'any' }) &&
          matchesCharacterFacet('class', record, {
            values: options.selectedClasses ?? [],
            matchMode: 'any',
          })),
    );
  }

  public async getShips(): Promise<never[]> {
    return [];
  }
}

const REMOVE_BIND = {
  abilityKey: 'remove_bind',
  minTurns: null,
  slotTokens: [],
  requiredCharacterCount: 1,
};

async function build(
  constraints: AutoBuildConstraints,
  records: CharacterDetailRecord[],
): Promise<AutoBuildResult | null> {
  const service = new AutoTeamBuilderService(new Repository(records) as never);

  return service.buildTeam(
    [],
    ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    {
      strictSuperSpecialCriteriaCoverage: true,
      strictSuperTandemCriteriaCoverage: true,
      ...constraints,
    },
    { workerCount: 1 },
  );
}

const subIds = (result: AutoBuildResult) =>
  result.slots.filter((slot) => slot.role === 'sub').map((slot) => slot.character.id);

function condition(overrides: Record<string, unknown>): Record<string, unknown> {
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

const SELF_CAPTAIN_BINDER = 102;
const CAPTAIN_ABILITY = 'Boosts ATK of all characters by 3x and their HP by 1.2x.';

describe('the search counts an effect that needs its captain (869fhvfva)', () => {
  it('leads with the Fighter, uses the unit and reports Bind covered', async () => {
    const result = await build({ requiredAbilities: [REMOVE_BIND] }, pool('Fighter'));

    expect(result, 'the search found a team').not.toBeNull();
    expect(result!.slots.find((slot) => slot.role === 'captain')?.character.id).toBe(CAPTAIN);
    expect(subIds(result!)).toContain(BIND_REMOVER);
    expect(result!.coverage.abilityRequirements.missing).toEqual([]);
  });

  it('never credits the unit when no Captain can meet the condition - the control', async () => {
    const result = await build({ requiredAbilities: [REMOVE_BIND] }, pool('Cerebral'));

    // No team removes Bind: the search either stops or reports it missing, never covered.
    expect(result?.coverage.abilityRequirements.matched ?? []).toEqual([]);
  });

  it('picks and reports a leader by the effect it gets as Captain, for a leader-scoped requirement', async () => {
    const binder = character(SELF_CAPTAIN_BINDER, 'INT', ['Cerebral'], {
      captainAbility: CAPTAIN_ABILITY,
      bindCondition: condition({ text: 'If this character is your Captain', captain: 'self' }),
    });
    const result = await build({ requiredAbilities: [{ ...REMOVE_BIND, slotScope: 'leader' }] }, [
      ...pool('Cerebral'),
      binder,
    ]);

    expect(result, 'the search found a team').not.toBeNull();
    expect(result!.slots.find((slot) => slot.role === 'captain')?.character.id).toBe(
      SELF_CAPTAIN_BINDER,
    );
    expect(result!.coverage.abilityRequirements.missing).toEqual([]);
  });

  it('counts a named condition met from the Friend Captain seat', async () => {
    const records = pool('Cerebral').map((record) =>
      record.id === BIND_REMOVER
        ? character(BIND_REMOVER, 'QCK', ['Driven'], {
            bindCondition: condition({
              text: 'If Corazon is your Captain or Friend/Guest Captain',
              captain: 'named',
              names: ['Corazon'],
              friendCaptain: true,
            }),
          })
        : record.id === FRIEND_CAPTAIN
          ? character(FRIEND_CAPTAIN, 'DEX', ['Slasher'], {
              captainAbility: CAPTAIN_ABILITY,
              families: ['Corazon'],
            })
          : record,
    );
    const result = await build({ requiredAbilities: [REMOVE_BIND] }, records);

    expect(result, 'the search found a team').not.toBeNull();
    expect(
      result!.slots.some((slot) => slot.role !== 'sub' && slot.character.id === FRIEND_CAPTAIN),
    ).toBe(true);
    expect(subIds(result!)).toContain(BIND_REMOVER);
    expect(result!.coverage.abilityRequirements.missing).toEqual([]);
  });
});
