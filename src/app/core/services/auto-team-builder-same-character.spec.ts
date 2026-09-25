import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';

import {
  type AutoBuildConstraints,
  type AutoBuildResult,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { AutoTeamBuilderRumbleService } from './auto-team-builder-rumble.service';
import { AutoTeamBuilderService } from './auto-team-builder.service';
import { matchesCharacterFacet } from './character-facet-filter.utils';

/*
 * 869f63grj. Both builders decide "same character" by upstream's families, through the one rule
 * in `same-character-keys.ts`. The cards here disagree with their own names on purpose: "Lucy" is
 * Luffy, and "Pica: Neo" is not Doflamingo although both names end in "Neo". A builder that still
 * read the name would get each pair the other way round.
 */

const LUFFY = 200;
const LUCY = 201;
const DOFLAMINGO_NEO = 202;
const PICA_NEO = 203;
const FRIEND = 204;
const SUBS = [210, 211, 212, 213, 214];

function character(
  id: number,
  type: string,
  options: {
    name: string;
    families: string[];
    captainAbility?: string;
    specialText?: string;
    rumbleData?: Record<string, unknown>;
  },
): CharacterDetailRecord {
  return {
    id,
    name: options.name,
    isIncomplete: false,
    type,
    classes: ['Striker'],
    primaryClass: 'Striker',
    secondaryClass: null,
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
    families: options.families,
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: options.captainAbility ?? null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: options.specialText ?? null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superTandemData: null,
      superClass: null,
      rumbleData: options.rumbleData ?? null,
    },
  } as unknown as CharacterDetailRecord;
}

const CAPTAIN_ABILITY = 'Boosts ATK of all characters by 3x and their HP by 1.2x.';
const SPECIAL = 'Boosts ATK of all characters by 2x for 1 turn.';

function questPool(): CharacterDetailRecord[] {
  return [
    character(LUFFY, 'STR', {
      name: 'Monkey D. Luffy',
      families: ['Monkey D. Luffy'],
      captainAbility: CAPTAIN_ABILITY,
    }),
    character(LUCY, 'DEX', {
      name: 'Lucy - Corrida Coliseum',
      families: ['Monkey D. Luffy'],
      specialText: SPECIAL,
    }),
    character(DOFLAMINGO_NEO, 'STR', {
      name: 'Donquixote Doflamingo: Neo',
      families: ['Donquixote Doflamingo', 'Doffy'],
      captainAbility: CAPTAIN_ABILITY,
    }),
    character(PICA_NEO, 'DEX', { name: 'Pica: Neo', families: ['Pica'], specialText: SPECIAL }),
    character(FRIEND, 'DEX', {
      name: 'Shanks',
      families: ['Shanks'],
      captainAbility: CAPTAIN_ABILITY,
    }),
    ...SUBS.map((id, index) =>
      character(id, index % 2 === 0 ? 'DEX' : 'STR', {
        name: `Crew Member ${id}`,
        families: [`Crew Member ${id}`],
        specialText: SPECIAL,
      }),
    ),
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

async function buildQuestTeam(captain: number, sub: number): Promise<AutoBuildResult | null> {
  const constraints: AutoBuildConstraints = {
    requireUniqueBaseCharacterNames: true,
    manualSlots: [
      { role: 'captain', characterIds: [captain] },
      { role: 'friendCaptain', characterIds: [FRIEND] },
      { role: 'sub1', characterIds: [sub] },
    ],
  };

  return new AutoTeamBuilderService(new Repository(questPool()) as never).buildTeam(
    ['Striker'],
    ['DEX', 'STR'],
    constraints,
    { workerCount: 1 },
  );
}

const slotIds = (result: AutoBuildResult | null) =>
  (result?.slots ?? []).map((slot) => slot.character.id);

describe('Auto Team Builder - one character per crew, by families', () => {
  it('keeps "Lucy" out of a crew whose Captain is Luffy', async () => {
    const result = await buildQuestTeam(LUFFY, LUCY);

    expect(result).not.toBeNull();
    expect(slotIds(result)).toContain(LUFFY);
    expect(slotIds(result)).not.toContain(LUCY);
  });

  it('seats "Pica: Neo" under a "Donquixote Doflamingo: Neo" Captain', async () => {
    const result = await buildQuestTeam(DOFLAMINGO_NEO, PICA_NEO);

    expect(result).not.toBeNull();
    expect(slotIds(result)).toEqual(expect.arrayContaining([DOFLAMINGO_NEO, PICA_NEO]));
  });
});

function rumbleData(strength: number): Record<string, unknown> {
  return {
    id: strength + 1,
    cost: 30,
    stats: { rumbleType: 'ATK', def: 80 + strength * 4, spd: 90 + strength * 3 },
    ability: [{ effects: [{ effect: 'buff', attributes: ['ATK'], level: 2 + (strength % 4) }] }],
    special: [
      {
        cooldown: 28 - Math.min(strength, 8),
        effects: [{ effect: 'damage', amount: 3 + strength }],
      },
    ],
  };
}

function rumbleTeamIds(
  pairIds: [number, number],
  pairFamilies: [string[], string[]],
  pairNames: [string, string],
) {
  const service = new AutoTeamBuilderRumbleService({
    getRumbleBuilderCandidates: vi.fn().mockResolvedValue([]),
  } as never);
  // The pair is the strongest by far, so a builder that saw no conflict would field both.
  const result = service.buildTeamFromCandidates([
    character(pairIds[0], 'STR', {
      name: pairNames[0],
      families: pairFamilies[0],
      rumbleData: rumbleData(40),
    }),
    character(pairIds[1], 'DEX', {
      name: pairNames[1],
      families: pairFamilies[1],
      rumbleData: rumbleData(39),
    }),
    ...Array.from({ length: 8 }, (_, index) =>
      character(300 + index, 'QCK', {
        name: `Rumble Filler ${index}`,
        families: [`Rumble Filler ${index}`],
        rumbleData: rumbleData(index),
      }),
    ),
  ]);

  return [...result.activeSlots, ...result.benchSlots].map((slot) => slot.unit.character.id);
}

describe('Rumble builder - one character per team, by families', () => {
  it('fields Luffy or "Lucy", never both', () => {
    const ids = rumbleTeamIds(
      [LUFFY, LUCY],
      [['Monkey D. Luffy'], ['Monkey D. Luffy']],
      ['Monkey D. Luffy', 'Lucy - Corrida Coliseum'],
    );

    expect(ids).toHaveLength(8);
    expect(ids.filter((id) => id === LUFFY || id === LUCY)).toHaveLength(1);
  });

  it('fields "Donquixote Doflamingo: Neo" and "Pica: Neo" together', () => {
    const ids = rumbleTeamIds(
      [DOFLAMINGO_NEO, PICA_NEO],
      [['Donquixote Doflamingo', 'Doffy'], ['Pica']],
      ['Donquixote Doflamingo: Neo', 'Pica: Neo'],
    );

    expect(ids).toEqual(expect.arrayContaining([DOFLAMINGO_NEO, PICA_NEO]));
  });
});
