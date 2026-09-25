import { describe, expect, it } from 'vitest';

import {
  type AutoBuildInput,
  type AutoBuildResult,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type ShipRecord } from '../models/optc.models';
import { resolveAutoBuildShipSelection } from './auto-team-builder-ship.utils';

/*
 * 869f6td3n. A class- or type-scoped ship counts the slots its BOOST CLAUSE names.
 *
 * The scope used to be read from the whole description and then had to match on class AND type, so
 * words that were not the scope narrowed it: White Tiger's "[PSY] and [INT] orbs" made six STR
 * Shooters read "0/6 slots", and Queen Mama Chanter's Captain condition ("If your Captain is a
 * Powerhouse or Driven character") left a team its boost reaches at "1/6". Of the 28 ships whose
 * boost clause names a class or type, those two under-counted; Polar Tang did too, unseen by the
 * census, because "Slashers" is a plural.
 *
 * The descriptions below are the shipped ones, verbatim, because the defect lived in their wording.
 */
const WHITE_TIGER = createShip(
  64,
  'White Tiger',
  'Reduces cooldown of all specials by 1 turn, boosts ATK of Shooter characters by 1.6x, their HP by 1.25x, makes [PSY] and [INT] orbs beneficial for all characters, and makes PERFECT easier to hit.',
);
const QUEEN_MAMA_CHANTER = createShip(
  43,
  'Queen Mama Chanter',
  'Boosts chances of getting Matching orbs, Boosts HP of all characters by 1.25x. If your Captain is a Powerhouse or Driven character, boosts ATK of [STR], [DEX] and [QCK] characters by 1.5x at the start of the chain, by 1.65x after 3 consecutive PERFECTs. Special: Changes bottom right orb into [RCV] (Cooldown: 6 turns). (currently only boosts by 1.5x unconditionally, 1.65x boost is a WIP)',
);
const POLAR_TANG = createShip(
  25,
  'Polar Tang',
  'Boosts ATK of Slashers and Free Spirit characters by 1.5x and their HP by 1.25x. Makes PERFECTs easier to Hit. Special: Heals for 10k when under 20% HP. (cooldown MAX: 18 turns)',
);
const STRIKER = createShip(
  12,
  'Striker',
  'Boosts ATK of Shooter characters by 1.5x and their HP by 1.3x, reduces cooldown of Shooter specials by 1 turn at the start of the fight',
);
const MEGALO = createShip(
  47,
  'Megalo',
  "Boosts HP of all characters by 1.25x. If your Captain is a [PSY] or [INT] character, boosts ATK of all characters by 1.5x, boosts captain's RCV by 200 and reduces damage received by 10%. Special: Locks all orbs for 1 turn (Cooldown: 8 turns).",
);

describe('ship slot count reads the boost clause', () => {
  it('counts six STR Shooters for White Tiger (ship 64), whose orbs clause names PSY and INT', () => {
    const team = createTeam(6, { type: 'STR', classes: ['Shooter'] });

    expect(slotChip(WHITE_TIGER, team)).toBe('6/6 slots');
    expect(chipsFor(WHITE_TIGER, team)).toEqual(['Manual ship', 'ATK 1.6x', 'HP 1.25x', '6/6 slots']);
  });

  it('does not count PSY and INT units for White Tiger unless they are Shooters', () => {
    const team = [
      ...createTeam(3, { type: 'STR', classes: ['Shooter'] }),
      ...createTeam(3, { type: 'PSY', classes: ['Fighter'] }, 10),
    ];

    expect(slotChip(WHITE_TIGER, team)).toBe('3/6 slots');
    expect(slotChip(WHITE_TIGER, createTeam(6, { type: 'INT', classes: ['Slasher'] }))).toBe(
      '0/6 slots',
    );
  });

  it('counts STR, DEX and QCK units for Queen Mama Chanter (ship 43) without its Captain condition', () => {
    const team = [
      ...createTeam(2, { type: 'STR', classes: ['Fighter'] }),
      ...createTeam(2, { type: 'DEX', classes: ['Slasher'] }, 10),
      ...createTeam(2, { type: 'QCK', classes: ['Shooter'] }, 20),
    ];

    expect(slotChip(QUEEN_MAMA_CHANTER, team)).toBe('6/6 slots');
    expect(
      slotChip(QUEEN_MAMA_CHANTER, [
        ...team.slice(0, 5),
        createCharacter(99, { type: 'PSY', classes: ['Powerhouse'] }),
      ]),
    ).toBe('5/6 slots');
  });

  it('counts Slashers for Polar Tang (ship 25), whose boost clause names them in the plural', () => {
    expect(slotChip(POLAR_TANG, createTeam(6, { type: 'DEX', classes: ['Slasher'] }))).toBe(
      '6/6 slots',
    );
    expect(
      slotChip(POLAR_TANG, [
        ...createTeam(3, { type: 'DEX', classes: ['Free Spirit'] }),
        ...createTeam(3, { type: 'DEX', classes: ['Fighter'] }, 10),
      ]),
    ).toBe('3/6 slots');
  });

  it('now recommends White Tiger over Striker for six Shooters, since it counts them', () => {
    const selection = resolveAutoBuildShipSelection(
      createResult(createTeam(6, { type: 'STR', classes: ['Shooter'] })),
      [STRIKER, WHITE_TIGER],
    );

    expect(selection?.source).toBe('recommended');
    expect(selection?.ship.id).toBe(64);
  });

  it.each([
    [
      'a flat ATK boost for Shooters',
      createShip(3, 'Navy Ship', 'Boosts HP by 1.5x, boosts ATK of Shooter characters by 100'),
      { type: 'STR', classes: ['Shooter'] },
    ],
    [
      'an ATK and HP boost for Slashers',
      createShip(5, 'Coffin Boat', "Boosts ATK and HP of Slasher characters by 1.5x, reduces captain's RCV by 700"),
      { type: 'DEX', classes: ['Slasher'] },
    ],
    [
      'a boost for one type written without brackets',
      createShip(10, 'Bezan Black', 'Reduces cooldown of all specials by 1 turn at the start of the fight, boosts ATK of QCK characters by 1.5x and their HP by 1.3x'),
      { type: 'QCK', classes: ['Fighter'] },
    ],
    [
      'a boost that depends on how many units match',
      createShip(19, 'Sun Pirates Ship', 'Boosts ATK and HP of Fighter characters depending on the number of Fighters on the team. Sharply reduces ATK and HP of non-Fighter characters.'),
      { type: 'INT', classes: ['Fighter'] },
    ],
  ])('keeps counting %s as before', (_label, ship, member) => {
    expect(slotChip(ship, createTeam(6, member))).toBe('6/6 slots');
    expect(
      slotChip(ship, [
        ...createTeam(4, member),
        ...createTeam(2, { type: 'PSY', classes: ['Cerebral'] }, 10),
      ]),
    ).toBe('4/6 slots');
  });

  it('reads a boost that depends on a count from its own clause, not from an orbs clause after it', () => {
    // Made up on purpose: Sun Pirates Ship's wording with an orbs clause added, so the whole text
    // would narrow the Fighters to PSY Fighters the way White Tiger's did.
    const ship = createShip(
      9001,
      'Counted Fighters',
      'Boosts ATK and HP of Fighter characters depending on the number of Fighters on the team, makes [PSY] orbs beneficial for all characters.',
    );

    expect(slotChip(ship, createTeam(6, { type: 'INT', classes: ['Fighter'] }))).toBe('6/6 slots');
  });

  /*
   * Recorded, not endorsed. Megalo's boost clause names nobody ("all characters"); its PSY and INT
   * are a Captain condition. Ships like it keep reading their whole text, because changing that moves
   * the recommended ship for most teams - see the comment on the fallback in
   * auto-team-builder-ship.utils.ts. If this case goes red, that decision is being changed: make it
   * on purpose.
   */
  it('keeps the whole-text reading for a ship whose boost clause names no class or type', () => {
    expect(slotChip(MEGALO, createTeam(6, { type: 'PSY', classes: ['Fighter'] }))).toBe('6/6 slots');
    expect(slotChip(MEGALO, createTeam(6, { type: 'DEX', classes: ['Fighter'] }))).toBe('0/6 slots');
  });
});

function slotChip(ship: ShipRecord, team: CharacterDetailRecord[]): string | undefined {
  return chipsFor(ship, team).find((chip) => chip.endsWith(' slots'));
}

function chipsFor(ship: ShipRecord, team: CharacterDetailRecord[]): string[] {
  return resolveAutoBuildShipSelection(createResult(team, ship.id), [ship])?.reasonChips ?? [];
}

function createTeam(
  count: number,
  member: { type: string; classes: string[] },
  firstIdOffset = 0,
): CharacterDetailRecord[] {
  return Array.from({ length: count }, (_, index) =>
    createCharacter(1 + firstIdOffset + index, member),
  );
}

function createResult(
  characters: CharacterDetailRecord[],
  manualShipId: number | null = null,
): Pick<AutoBuildResult, 'slots' | 'input'> {
  return {
    input: {
      excludedShipIds: [],
      favoriteShipIds: [],
      favoriteShipsOnly: false,
      manualShipId,
      requireManualShip: false,
    } as unknown as AutoBuildInput,
    slots: characters.map((character, index) => ({
      role: index === 0 ? 'captain' : index === 1 ? 'friendCaptain' : 'sub',
      character,
      reasonChips: [],
    })),
  };
}

function createShip(id: number, name: string, description: string): ShipRecord {
  return { id, name, thumb: null, thumbUrl: null, description };
}

function createCharacter(
  id: number,
  { type, classes }: { type: string; classes: string[] },
): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    type,
    classes,
    primaryClass: classes[0] ?? '',
    secondaryClass: classes[1] ?? null,
    stars: 6,
    cost: 55,
    combo: 4,
    stats: {
      min: { hp: 1, atk: 1, rcv: 1 },
      max: { hp: 1000, atk: 1000, rcv: 1000 },
      growth: 1,
    },
    regionArtwork: { exactLocal: true, thumbnailGlobal: true, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: '/assets/test-character.png',
    detailImageUrl: '/assets/test-character-detail.png',
    detail: {
      characterId: id,
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
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
      superClass: null,
      rumbleData: null,
    },
    isIncomplete: false,
    captainHpBoost: 1.3,
    captainAtkBoost: 5,
    captainAverageBoost: 3.15,
  };
}
