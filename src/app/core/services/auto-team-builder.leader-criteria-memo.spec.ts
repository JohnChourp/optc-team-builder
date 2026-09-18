import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterDetailRecord } from '../models/optc.models';
import { AutoTeamBuilderService } from './auto-team-builder.service';

/**
 * 869f333ey (D7). Whether a team member is inside a leader pair's scope does not depend on the rest
 * of the team, yet the sub search used to ask it again at every leaf - and every ask re-parsed the
 * Captain's text. On the real dataset that was 186 s of a 186 s build (issue #523's request with no
 * Captain pinned); with one memo per leader pair it is 3.6 s, for the same team.
 *
 * This test holds that shape: it counts how often a Captain's text is resolved against a member
 * during a search that has to look at many teams. Without the memo the count grows with the teams
 * visited; with it, it grows with the members. Proven red by disabling the memo.
 */

const resolveCaptainCoverageCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('./captain-coverage.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./captain-coverage.utils')>();

  return {
    ...actual,
    resolveCaptainCoverage: (...args: Parameters<typeof actual.resolveCaptainCoverage>) => {
      resolveCaptainCoverageCalls.count += 1;
      return actual.resolveCaptainCoverage(...args);
    },
  };
});

function character(id: number, type: string, captainAbility: string | null, specialText: string | null): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
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
    stats: { min: { hp: 1000, atk: 400, rcv: 120 }, max: { hp: 3900, atk: 1900, rcv: 340 }, growth: 3 },
    regionArtwork: { exactLocal: true, thumbnailGlobal: true, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText,
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
      rumbleData: null,
    },
  } as unknown as CharacterDetailRecord;
}

describe('leader-criteria memo (869f333ey, D7)', () => {
  it('resolves each member against a leader pair a bounded number of times, not once per team visited', async () => {
    const special = 'Boosts ATK of all characters by 2x for 1 turn.';
    // Two Captains that each boost one type and fourteen members: the exact search fails and the
    // fallbacks visit many teams before one is kept, and every team asks about all six members.
    const records = [
      character(1, 'DEX', 'Boosts ATK of [DEX] characters by 3x and their HP by 1.2x.', special),
      character(2, 'STR', 'Boosts ATK of [STR] characters by 3x and their HP by 1.2x.', special),
      ...Array.from({ length: 14 }, (_, index) => character(10 + index, index < 6 ? 'DEX' : 'STR', null, special)),
    ];
    const service = new AutoTeamBuilderService({
      getAutoBuilderCandidates: async () => records,
      getShips: async () => [],
    } as never);

    resolveCaptainCoverageCalls.count = 0;
    const result = await service.buildTeam(['Striker'], ['DEX', 'STR'], {}, { workerCount: 1 });

    expect(result).not.toBeNull();
    /* Without the memo every team visited asks again about all six members. */
    expect(resolveCaptainCoverageCalls.count).toBeLessThan(MEMOISED_CALL_CEILING);
  });
});

/* Measured 2026-09-18: 96 calls with the memo, 498 with it disabled (same team). */
const MEMOISED_CALL_CEILING = 200;
