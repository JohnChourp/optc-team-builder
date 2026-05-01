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
      characterTags: overrides.characterTags ?? [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      limitBreak: [],
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
