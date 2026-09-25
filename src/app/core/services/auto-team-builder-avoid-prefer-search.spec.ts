import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import {
  type AutoBuildConstraints,
  type AutoBuildResult,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { AUTO_TEAM_BUILDER_AXES } from './auto-team-builder-axes.registry';
import { AutoTeamBuilderService } from './auto-team-builder.service';
import { matchesCharacterFacet } from './character-facet-filter.utils';

/**
 * 869f63gma. A Saved Enemy's avoid and prefer rules, through the real search.
 *
 * The owner decided the semantics once, for both builders: a hard avoid (the default) keeps
 * avoided units out of every seat the search fills and may be relaxed - to a ranking - only when no
 * team can be built, which the report then calls Relaxed; a soft avoid only ranks them lower; a
 * prefer only ranks up. Every case here carries a control that shows the same pool picking the
 * other way without the rule, so a rule that stopped working could not pass by accident.
 *
 * The pool: two Captains who boost everyone, four older units of other classes, and four NEWER
 * Driven units - the search breaks ties towards the newest id, so without a rule it fills every sub
 * seat with Driven. One Driven unit alone removes Bind, for the cases that need a requirement only
 * an avoided unit can meet.
 */

const CAPTAIN = 100;
const FRIEND_CAPTAIN = 101;
const OLDER_SUBS = [110, 111, 112, 113];
const CEREBRAL_SUB = 113;
const DRIVEN_SUBS = [120, 121, 122, 123];
const BIND_REMOVER = 120;
const DUAL_INT_PSY = 130;
const DUAL_DRIVEN = 124;

const SPECIAL = 'Boosts ATK of all characters by 2x for 1 turn.';

function character(
  id: number,
  type: string,
  classes: string[],
  options: { captainAbility?: string; removesBind?: boolean } = {},
): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
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
    stats: { min: { hp: 1000, atk: 400, rcv: 120 }, max: { hp: 3900, atk: 1900, rcv: 340 }, growth: 3 },
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

function pool(extra: CharacterDetailRecord[] = []): CharacterDetailRecord[] {
  const captainAbility = 'Boosts ATK of all characters by 3x and their HP by 1.2x.';

  return [
    character(CAPTAIN, 'STR', ['Fighter'], { captainAbility }),
    character(FRIEND_CAPTAIN, 'DEX', ['Slasher'], { captainAbility }),
    character(110, 'STR', ['Fighter']),
    character(111, 'DEX', ['Slasher']),
    character(112, 'QCK', ['Shooter']),
    character(CEREBRAL_SUB, 'PSY', ['Cerebral']),
    character(BIND_REMOVER, 'QCK', ['Driven'], { removesBind: true }),
    character(121, 'STR', ['Driven']),
    character(122, 'DEX', ['Driven']),
    character(123, 'INT', ['Driven']),
    ...extra,
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

const REMOVE_BIND = { abilityKey: 'remove_bind', minTurns: null, slotTokens: [], requiredCharacterCount: 1 };

async function build(
  constraints: AutoBuildConstraints,
  records: CharacterDetailRecord[] = pool(),
): Promise<AutoBuildResult> {
  const service = new AutoTeamBuilderService(new Repository(records) as never);
  const result = await service.buildTeam(
    [],
    ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    {
      // What the Auto Team Builder page sends for a loaded Saved Enemy: strict Super Special and
      // Super Tandem coverage. With them on, only the inputs themselves can mark a fallback - which
      // is exactly what the avoid fields in `inputsMatch` are for.
      strictSuperSpecialCriteriaCoverage: true,
      strictSuperTandemCriteriaCoverage: true,
      ...constraints,
    },
    { workerCount: 1 },
  );

  expect(result, 'the search found a team').not.toBeNull();

  return result!;
}

const teamIds = (result: AutoBuildResult) => result.slots.map((slot) => slot.character.id);
const subIds = (result: AutoBuildResult) =>
  result.slots.filter((slot) => slot.role === 'sub').map((slot) => slot.character.id);
const drivenIn = (result: AutoBuildResult) =>
  teamIds(result).filter((id) => DRIVEN_SUBS.includes(id));

describe('a hard avoid keeps avoided units out of every seat the search fills (869f63gma)', () => {
  it('fills the subs with Driven when nothing is avoided - the control', async () => {
    const result = await build({});

    expect(subIds(result).sort()).toEqual([...DRIVEN_SUBS].sort());
  });

  it('builds the team without a single Driven unit when Driven is avoided', async () => {
    const result = await build({ avoidedClasses: ['Driven'], avoidMode: 'hard' });

    expect(drivenIn(result)).toEqual([]);
    expect(subIds(result).sort()).toEqual([...OLDER_SUBS].sort());
    // The avoid held, so nothing was relaxed and nothing is reported as given up.
    expect(result.relaxation.usedFallback).toBe(false);
    expect(result.relaxation.relaxedAvoidedValues).toBeUndefined();
    expect(result.requestedInput).toMatchObject({ avoidedClasses: ['Driven'], avoidMode: 'hard' });
  });

  it('treats an absent mode as hard - what every enemy saved without one means', async () => {
    const result = await build({ avoidedClasses: ['Driven'] });

    expect(drivenIn(result)).toEqual([]);
  });

  it('avoids a dual unit when either of its types is avoided, as the type filter matches it', async () => {
    const withDual = pool([character(DUAL_INT_PSY, 'INT,PSY', ['Free Spirit'])]);
    const control = await build({ avoidedClasses: ['Driven'] }, withDual);
    const avoidingInt = await build({ avoidedClasses: ['Driven'], avoidedTypes: ['INT'] }, withDual);

    // Newest id first: the dual unit takes a seat until INT is avoided.
    expect(teamIds(control)).toContain(DUAL_INT_PSY);
    expect(teamIds(avoidingInt)).not.toContain(DUAL_INT_PSY);
    // A unit that merely shares the OTHER type is not caught.
    expect(teamIds(avoidingInt)).toContain(CEREBRAL_SUB);
  });

  it("leaves the reader's own pick where they put it, and does not call it a relaxation", async () => {
    const result = await build({
      avoidedClasses: ['Driven'],
      avoidMode: 'hard',
      manualSlots: [{ role: 'sub1', characterIds: [121] }],
    });

    expect(teamIds(result)).toContain(121);
    expect(drivenIn(result)).toEqual([121]);
    expect(result.relaxation.relaxedAvoidedValues).toBeUndefined();
  });
});

describe('a hard avoid the search cannot keep is relaxed, and says so (869f63gma)', () => {
  it('lets in only the Driven unit the requirement needs, and reports what it let in', async () => {
    const result = await build({
      avoidedClasses: ['Driven'],
      avoidMode: 'hard',
      requiredAbilities: [REMOVE_BIND],
    });

    expect(result.coverage.abilityRequirements.matchesAll).toBe(true);
    // Relaxed to a ranking, not dropped: the other three Driven units still stay out.
    expect(drivenIn(result)).toEqual([BIND_REMOVER]);
    expect(result.relaxation.relaxedAvoidedValues).toEqual(['Driven']);
    // `inputsMatch` knows the avoid, so a team that relaxed it is never taken for the exact one.
    expect(result.relaxation.usedFallback).toBe(true);
    expect(result.input.avoidMode).toBe('soft');
    expect(result.requestedInput.avoidMode).toBe('hard');
  });

  it('relaxes it on the plain builder defaults too, where it is one relaxation among several', async () => {
    // Without strict Super Special and Super Tandem coverage the plan's first relaxation - letting
    // leaders with super effects in - changes no input at all. An attempt that only ranks the avoid
    // must still be told apart from it, or it is dropped as a duplicate and never runs.
    const result = await build({
      strictSuperSpecialCriteriaCoverage: false,
      strictSuperTandemCriteriaCoverage: false,
      avoidedClasses: ['Driven'],
      avoidMode: 'hard',
      requiredAbilities: [REMOVE_BIND],
    });

    expect(drivenIn(result)).toEqual([BIND_REMOVER]);
    expect(result.relaxation.relaxedAvoidedValues).toEqual(['Driven']);
  });

  it("reports only what the search let in, never the reader's own pick", async () => {
    // PSY is avoided too, and the reader pinned the PSY unit themselves: that is their call, so the
    // relaxation names Driven - the Bind remover the search had to take - and not PSY.
    const result = await build({
      avoidedClasses: ['Driven'],
      avoidedTypes: ['PSY'],
      avoidMode: 'hard',
      requiredAbilities: [REMOVE_BIND],
      manualSlots: [{ role: 'sub1', characterIds: [CEREBRAL_SUB] }],
    });

    expect(teamIds(result)).toEqual(expect.arrayContaining([CEREBRAL_SUB, BIND_REMOVER]));
    expect(result.relaxation.relaxedAvoidedValues).toEqual(['Driven']);
  });

  it('is registered as a relaxable axis with its own report row', () => {
    const axis = AUTO_TEAM_BUILDER_AXES.find((entry) => entry.relaxationFields.includes('relaxedAvoidedValues'));

    expect(axis).toMatchObject({ axis: 13, relaxable: true, reportRowKey: 'avoidPrefer' });
  });
});

describe('a soft avoid and a prefer only rank (869f63gma)', () => {
  it('ranks Driven below every other unit when the avoid is soft, whatever else it matches', async () => {
    // A dual-type Driven unit matches two of the selected types where every other unit matches one,
    // so it outranks them all until the avoid is on - a penalty that only broke ties would lose.
    const withDualDriven = pool([character(DUAL_DRIVEN, 'STR,DEX', ['Driven'])]);
    const control = await build({}, withDualDriven);
    const result = await build({ avoidedClasses: ['Driven'], avoidMode: 'soft' }, withDualDriven);

    expect(teamIds(control)).toContain(DUAL_DRIVEN);
    expect(teamIds(result)).not.toContain(DUAL_DRIVEN);
    expect(drivenIn(result)).toEqual([]);
    expect(result.relaxation.usedFallback).toBe(false);
  });

  it('keeps a soft-avoided unit the requirement needs, without relaxing anything', async () => {
    const result = await build({
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
      requiredAbilities: [REMOVE_BIND],
    });

    expect(drivenIn(result)).toEqual([BIND_REMOVER]);
    expect(result.relaxation.usedFallback).toBe(false);
    expect(result.relaxation.relaxedAvoidedValues).toBeUndefined();
  });

  it('ranks a preferred class up over every newer unit that is not preferred', async () => {
    const control = await build({});
    const preferring = await build({ preferredClasses: ['Cerebral'] });

    expect(teamIds(control)).not.toContain(CEREBRAL_SUB);
    expect(teamIds(preferring)).toContain(CEREBRAL_SUB);
    // Ranking only: the rest of the team is what the control picked.
    expect(drivenIn(preferring)).toHaveLength(3);
    expect(preferring.relaxation.usedFallback).toBe(false);
  });

  it('ranks a unit that is both avoided and preferred below every unit that is only neutral', async () => {
    // Every Driven unit is also QCK, STR, DEX or INT; preferring QCK lifts the QCK Driven unit, and
    // the avoid must still win.
    const result = await build({
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
      preferredTypes: ['QCK'],
    });

    expect(drivenIn(result)).toEqual([]);
    expect(teamIds(result)).toContain(112);
  });
});
