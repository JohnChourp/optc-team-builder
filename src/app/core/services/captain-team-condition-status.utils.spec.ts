import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../models/optc.models';
import { resolveCaptainTeamConditionStatus } from './captain-team-condition-status.utils';

describe('resolveCaptainTeamConditionStatus', () => {
  it('marks a complete single-captain team as full when every slot is covered', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const slots = [captain, createCharacter({ id: 1002 }), createCharacter({ id: 1003 })];

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1', 'Sub 2'],
      slots,
    });

    expect(status.state).toBe('full');
    expect(status.passedLeaderLabels).toEqual(['Captain']);
    expect(status.leaderStatuses[0]).toMatchObject({
      passed: true,
      matchingSlotCount: 3,
      tagConditionsSatisfied: true,
    });
  });

  it('marks a single-captain team as none when one filled slot misses captain scope', () => {
    const captain = createCharacter({
      id: 1001,
      type: 'DEX',
      captainAbility: 'Boosts ATK of [DEX] characters by 5x.',
    });
    const slots = [
      captain,
      createCharacter({ id: 1002, type: 'DEX' }),
      createCharacter({ id: 1003, type: 'STR' }),
    ];

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1', 'Sub 2'],
      slots,
    });

    expect(status.state).toBe('none');
    expect(status.failedLeaderLabels).toEqual(['Captain']);
    expect(status.leaderStatuses[0]?.missingSlotLabels).toEqual(['Sub 2']);
  });

  it('marks a dual-leader team as full when both leaders cover every slot', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const friendCaptain = createCharacter({
      id: 1002,
      captainAbility: 'Boosts HP of all characters by 1.3x.',
    });
    const slots = [captain, friendCaptain, createCharacter({ id: 1003 })];

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [
        { role: 'captain', label: 'Captain', character: captain },
        { role: 'friendCaptain', label: 'Friend Captain', character: friendCaptain },
      ],
      slotLabels: ['Captain', 'Friend Captain', 'Sub 1'],
      slots,
    });

    expect(status.state).toBe('full');
    expect(status.passedLeaderLabels).toEqual(['Captain', 'Friend Captain']);
  });

  it('marks a dual-leader team as partial when only the captain covers every slot', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const friendCaptain = createCharacter({
      id: 1002,
      type: 'DEX',
      captainAbility: 'Boosts HP of [DEX] characters by 1.3x.',
    });
    const slots = [captain, friendCaptain, createCharacter({ id: 1003, type: 'STR' })];

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [
        { role: 'captain', label: 'Captain', character: captain },
        { role: 'friendCaptain', label: 'Friend Captain', character: friendCaptain },
      ],
      slotLabels: ['Captain', 'Friend Captain', 'Sub 1'],
      slots,
    });

    expect(status.state).toBe('partial');
    expect(status.passedLeaderLabels).toEqual(['Captain']);
    expect(status.failedLeaderLabels).toEqual(['Friend Captain']);
  });

  it('marks a dual-leader team as partial when only the friend captain covers every slot', () => {
    const captain = createCharacter({
      id: 1001,
      type: 'DEX',
      captainAbility: 'Boosts ATK of [DEX] characters by 5x.',
    });
    const friendCaptain = createCharacter({
      id: 1002,
      captainAbility: 'Boosts HP of all characters by 1.3x.',
    });
    const slots = [captain, friendCaptain, createCharacter({ id: 1003, type: 'STR' })];

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [
        { role: 'captain', label: 'Captain', character: captain },
        { role: 'friendCaptain', label: 'Friend Captain', character: friendCaptain },
      ],
      slotLabels: ['Captain', 'Friend Captain', 'Sub 1'],
      slots,
    });

    expect(status.state).toBe('partial');
    expect(status.passedLeaderLabels).toEqual(['Friend Captain']);
    expect(status.failedLeaderLabels).toEqual(['Captain']);
  });

  it('marks a dual-leader team as none when neither leader covers every slot', () => {
    const captain = createCharacter({
      id: 1001,
      type: 'DEX',
      captainAbility: 'Boosts ATK of [DEX] characters by 5x.',
    });
    const friendCaptain = createCharacter({
      id: 1002,
      type: 'PSY',
      captainAbility: 'Boosts HP of [PSY] characters by 1.3x.',
    });
    const slots = [captain, friendCaptain, createCharacter({ id: 1003, type: 'STR' })];

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [
        { role: 'captain', label: 'Captain', character: captain },
        { role: 'friendCaptain', label: 'Friend Captain', character: friendCaptain },
      ],
      slotLabels: ['Captain', 'Friend Captain', 'Sub 1'],
      slots,
    });

    expect(status.state).toBe('none');
    expect(status.passedLeaderLabels).toEqual([]);
  });

  it('requires both base branches of a dual-character captain to cover every slot', () => {
    const character1Text =
      'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x and boosts HP of [QCK], Fighter and Powerhouse characters by 1.35x.';
    const character2Text =
      'Boosts ATK of [DEX], Fighter and Powerhouse characters by 4.75x and boosts HP of [DEX], Fighter and Powerhouse characters by 1.35x.';
    const captain = createCharacter({
      id: 4521,
      type: 'QCK,DEX',
      captainAbility: character1Text,
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: character1Text,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: character2Text,
        },
        {
          key: 'combined',
          label: 'Captain Ability (Combined)',
          text: 'Boosts ATK and HP of all characters by 5.75x.',
        },
      ],
    });

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1', 'Sub 2'],
      slots: [
        captain,
        createCharacter({ id: 4522, type: 'PSY', classes: ['Fighter', 'Cerebral'] }),
        createCharacter({ id: 4523, type: 'DEX', classes: ['Shooter', 'Cerebral'] }),
      ],
    });

    expect(status.state).toBe('none');
    expect(status.leaderStatuses[0]?.missingSlotLabels).toEqual(['Sub 2']);
  });

  it('marks a type-only captain as missing a dual friend captain branch outside its type scope', () => {
    const kuma = createCharacter({
      id: 4306,
      type: 'STR',
      classes: ['Powerhouse', 'Shooter'],
      captainAbility:
        'Boosts ATK of [STR] and [DEX] characters by 5x and boosts HP of [STR] and [DEX] characters by 2x.',
    });
    const character1Text =
      'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x and boosts HP of [QCK], Fighter and Powerhouse characters by 1.35x.';
    const character2Text =
      'Boosts ATK of [DEX], Fighter and Powerhouse characters by 4.75x and boosts HP of [DEX], Fighter and Powerhouse characters by 1.35x.';
    const garpCoby = createCharacter({
      id: 4521,
      type: 'QCK,DEX',
      classes: ['Fighter', 'Powerhouse'],
      captainAbility: character1Text,
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: character1Text,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: character2Text,
        },
        {
          key: 'combined',
          label: 'Captain Ability (Combined)',
          text: 'Boosts ATK and HP of all characters by 5.75x.',
        },
      ],
    });
    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [
        { role: 'captain', label: 'Captain', character: kuma },
        { role: 'friendCaptain', label: 'Friend Captain', character: garpCoby },
      ],
      slotLabels: ['Captain', 'Friend Captain', 'Sub 1'],
      slots: [kuma, garpCoby, createCharacter({ id: 4307, type: 'DEX', classes: ['Fighter'] })],
    });

    expect(status.state).toBe('partial');
    expect(status.failedLeaderLabels).toEqual(['Captain']);
    expect(status.leaderStatuses[0]?.missingSlotLabels).toEqual(['Friend Captain']);
    expect(status.leaderStatuses[1]?.passed).toBe(true);
  });

  it('uses dual captain branch text for visible team-count tag conditions', () => {
    const character1Text =
      'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x and boosts HP by 1.35x. If your crew has 4+ [Egghead Arc] or [Navy] characters, boosts ATK by 5.75x instead.';
    const character2Text =
      'Boosts ATK of [DEX], Fighter and Powerhouse characters by 4.75x and boosts HP by 1.35x. If your crew has 4+ [Egghead Arc] or [Navy] characters, boosts ATK by 5.75x instead.';
    const captain = createCharacter({
      id: 4521,
      type: 'QCK,DEX',
      classes: ['Fighter', 'Powerhouse'],
      captainAbility: 'Boosts ATK of all characters by 5x.',
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: character1Text,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: character2Text,
        },
        {
          key: 'combined',
          label: 'Captain Ability (Combined)',
          text: 'Boosts ATK and HP of all characters by 5.75x.',
        },
      ],
      characterTags: ['Navy'],
    });
    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 4,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1', 'Sub 2', 'Sub 3'],
      slots: [
        captain,
        createCharacter({ id: 4522, type: 'PSY', classes: ['Fighter'], characterTags: ['Navy'] }),
        createCharacter({
          id: 4523,
          type: 'STR',
          classes: ['Powerhouse'],
          characterTags: ['Egghead Arc'],
        }),
        createCharacter({ id: 4524, type: 'INT', classes: ['Fighter'] }),
      ],
    });

    expect(status.state).toBe('none');
    expect(status.leaderStatuses[0]?.matchesAllSlots).toBe(true);
    expect(status.leaderStatuses[0]?.tagConditionsSatisfied).toBe(false);
    expect(status.leaderStatuses[0]?.passed).toBe(false);
  });

  it('requires Blackbeard full coverage slots to satisfy Free Spirit and tag cooldown scopes', () => {
    const captainAbility =
      'Launches the following effect at start of fight: reduces Special Cooldown of [Blackbeard Pirates], [Four Emperors] and [Worst Generation] characters by 5 turns, reduces Special Cooldown of [QCK] and Free Spirit characters by 2 turns. Boosts ATK of [QCK] and Free Spirit characters by 6x, boosts HP of [QCK] and Free Spirit characters by 1.3x. If your crew has 6+ Free Spirit characters and field has Territory: [QCK], boosts ATK of Free Spirit characters by 7x instead.';
    const captain = createCharacter({
      id: 4561,
      type: 'QCK',
      classes: ['Free Spirit', 'Driven'],
      captainAbility,
      characterTags: ['Blackbeard Pirates'],
    });
    const baseSlots = [
      captain,
      createCharacter({
        id: 456101,
        classes: ['Free Spirit', 'Striker'],
        characterTags: ['Worst Generation'],
      }),
      createCharacter({
        id: 456102,
        classes: ['Free Spirit', 'Cerebral'],
        characterTags: ['Four Emperors'],
      }),
      createCharacter({
        id: 456103,
        classes: ['Free Spirit', 'Shooter'],
        characterTags: ['Blackbeard Pirates'],
      }),
      createCharacter({
        id: 456104,
        classes: ['Free Spirit', 'Powerhouse'],
        characterTags: ['Worst Generation'],
      }),
      createCharacter({
        id: 456105,
        classes: ['Free Spirit', 'Slasher'],
        characterTags: ['Four Emperors'],
      }),
    ];
    const slotLabels = ['Captain', 'Sub 1', 'Sub 2', 'Sub 3', 'Sub 4', 'Sub 5'];

    const passingStatus = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 6,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels,
      slots: baseSlots,
    });
    const untaggedStatus = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 6,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels,
      slots: [
        ...baseSlots.slice(0, 3),
        createCharacter({ id: 456106, classes: ['Free Spirit', 'Shooter'] }),
        ...baseSlots.slice(4),
      ],
    });
    const nonFreeSpiritStatus = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 6,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels,
      slots: [
        ...baseSlots.slice(0, 4),
        createCharacter({
          id: 456107,
          type: 'QCK',
          classes: ['Driven', 'Powerhouse'],
          characterTags: ['Blackbeard Pirates'],
        }),
        ...baseSlots.slice(5),
      ],
    });

    expect(passingStatus.state).toBe('full');
    expect(untaggedStatus.state).toBe('none');
    expect(untaggedStatus.leaderStatuses[0]?.missingSlotLabels).toEqual(['Sub 3']);
    expect(nonFreeSpiritStatus.state).toBe('none');
    expect(nonFreeSpiritStatus.leaderStatuses[0]?.missingSlotLabels).toEqual(['Sub 4']);
  });

  it('keeps incomplete teams pending even when the filled slots are covered', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1', 'Sub 2'],
      slots: [captain, null, createCharacter({ id: 1003 })],
    });

    expect(status.state).toBe('pending');
    expect(status.filledSlotCount).toBe(2);
  });

  it('requires crew tag count conditions to be satisfied at team level', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility:
        'Boosts ATK of all characters by 5x. If your crew has 2 [Straw Hat Pirates] characters, reduces Despair duration by 10 turns.',
      characterTags: ['Straw Hat Pirates'],
    });

    const passingStatus = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1', 'Sub 2'],
      slots: [
        captain,
        createCharacter({ id: 1002, characterTags: ['Straw Hat Pirates'] }),
        createCharacter({ id: 1003 }),
      ],
    });
    const failingStatus = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 3,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1', 'Sub 2'],
      slots: [captain, createCharacter({ id: 1002 }), createCharacter({ id: 1003 })],
    });

    expect(passingStatus.state).toBe('full');
    expect(passingStatus.leaderStatuses[0]?.tagConditionsSatisfied).toBe(true);
    expect(failingStatus.state).toBe('none');
    expect(failingStatus.leaderStatuses[0]?.tagConditionsSatisfied).toBe(false);
  });

  it('does not mark leaders with missing captain ability as passing', () => {
    const captain = createCharacter({ id: 1001, captainAbility: null });

    const status = resolveCaptainTeamConditionStatus({
      expectedSlotCount: 2,
      leaders: [{ role: 'captain', label: 'Captain', character: captain }],
      slotLabels: ['Captain', 'Sub 1'],
      slots: [captain, createCharacter({ id: 1002 })],
    });

    expect(status.state).toBe('none');
    expect(status.leaderStatuses[0]).toMatchObject({
      hasCaptainAbility: false,
      passed: false,
    });
  });
});

function createCharacter(
  overrides: Partial<CharacterDetailRecord> & {
    captainAbility?: string | null;
    captainAbilityVariants?: CharacterDetailRecord['detail']['captainAbilityVariants'];
    characterTags?: string[];
    classes?: string[];
    cost?: number;
    id: number;
    type?: string;
  },
): CharacterDetailRecord {
  const classes = overrides.classes ?? ['Fighter', 'Slasher'];
  const type = overrides.type ?? 'DEX';

  return {
    id: overrides.id,
    name: overrides.name ?? `Character ${overrides.id}`,
    searchText: '',
    isIncomplete: false,
    type,
    classes,
    primaryClass: classes[0] ?? 'Fighter',
    secondaryClass: classes[1] ?? null,
    stars: 5,
    cost: overrides.cost ?? 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionAvailability: {
      exactLocal: false,
      thumbnailGlobal: false,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: overrides.id,
      captainAbility: overrides.captainAbility ?? null,
      captainAbilityVariants: overrides.captainAbilityVariants ?? [],
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: overrides.characterTags ?? [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  };
}
