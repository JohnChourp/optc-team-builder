import { describe, expect, it } from 'vitest';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
import {
  AUTO_TEAM_BUILDER_RESULT_KEY,
  buildAutoTeamBuilderResultSnapshot,
  parseAutoTeamBuilderResultSnapshot,
  restoreAutoTeamBuilderResult,
  snapshotCharacterIds,
} from './auto-team-builder-result-snapshot.utils';

function createCharacter(id: number, name: string): CharacterDetailRecord {
  return {
    id,
    name,
    detail: { characterId: id },
    detailImageUrl: `detail-${id}.png`,
    imageUrl: `thumb-${id}.png`,
  } as unknown as CharacterDetailRecord;
}

function createResult(
  slots: { role: 'captain' | 'friendCaptain' | 'sub'; character: CharacterDetailRecord }[],
): AutoBuildResult {
  return {
    candidateCount: 42,
    coverage: { abilityRequirements: { matchesAll: true } },
    relaxation: { relaxed: [] },
    shipSelection: null,
    input: { types: ['STR'] },
    requestedInput: { types: ['STR'] },
    slots: slots.map(({ role, character }) => ({
      role,
      character,
      reasonChips: [`chip-${character.id}`],
      explanation: {
        primaryReason: { code: 'bestCoverage' },
        reasons: [],
        fallbackReasons: [],
        rejectedCandidates: [{ characterId: 999, characterName: 'Someone', reasons: [] }],
      },
    })),
  } as unknown as AutoBuildResult;
}

describe('auto team builder result snapshot', () => {
  const luffy = createCharacter(1001, 'Luffy');
  const zoro = createCharacter(1002, 'Zoro');

  it('keeps the key versioned, because the shape can change', () => {
    expect(AUTO_TEAM_BUILDER_RESULT_KEY).toBe('autoTeamBuilderResultV1');
  });

  it('stores characters as ids and keeps everything else the report needs', () => {
    const snapshot = buildAutoTeamBuilderResultSnapshot(
      createResult([
        { role: 'captain', character: luffy },
        { role: 'sub', character: zoro },
      ]),
      '2026-09-14T10:00:00.000Z',
    );

    expect(snapshot.version).toBe(1);
    expect(snapshot.savedAt).toBe('2026-09-14T10:00:00.000Z');
    expect(snapshot.result.slots.map((slot) => slot.characterId)).toEqual([1001, 1002]);
    // The heavy record is gone; the light explanation the report renders is not.
    expect(JSON.stringify(snapshot)).not.toContain('detail-1001.png');
    expect(snapshot.result.slots[0].reasonChips).toEqual(['chip-1001']);
    expect(snapshot.result.slots[0].explanation?.rejectedCandidates).toHaveLength(1);
    expect(snapshot.result.candidateCount).toBe(42);
  });

  it('round-trips through JSON back to the same team', () => {
    const original = createResult([
      { role: 'captain', character: luffy },
      { role: 'sub', character: zoro },
    ]);
    const parsed = parseAutoTeamBuilderResultSnapshot(
      JSON.parse(JSON.stringify(buildAutoTeamBuilderResultSnapshot(original))),
    );

    expect(parsed).not.toBeNull();

    const restored = restoreAutoTeamBuilderResult(
      parsed!,
      new Map([
        [1001, luffy],
        [1002, zoro],
      ]),
    );

    expect(restored?.slots.map((slot) => slot.character.id)).toEqual([1001, 1002]);
    expect(restored?.slots[0].character.name).toBe('Luffy');
    expect(restored?.candidateCount).toBe(42);
  });

  /*
   * The Captain and the Friend Captain may legally be the same character, so one record has to
   * fill two slots. A zip of two lists would drop one of them.
   */
  it('fills both leader seats from one record when they are the same character', () => {
    const snapshot = buildAutoTeamBuilderResultSnapshot(
      createResult([
        { role: 'captain', character: luffy },
        { role: 'friendCaptain', character: luffy },
      ]),
    );

    expect(snapshotCharacterIds(snapshot)).toEqual([1001]);

    const restored = restoreAutoTeamBuilderResult(snapshot, new Map([[1001, luffy]]));

    expect(restored?.slots).toHaveLength(2);
    expect(restored?.slots.map((slot) => slot.role)).toEqual(['captain', 'friendCaptain']);
    expect(restored?.slots.every((slot) => slot.character.id === 1001)).toBe(true);
  });

  /*
   * A five-member team the builder never produced is worse than no team, because it looks like a
   * result. Character data moves at every dataset release, so this case is real.
   */
  it('abandons the whole snapshot when one character has left the dataset', () => {
    const snapshot = buildAutoTeamBuilderResultSnapshot(
      createResult([
        { role: 'captain', character: luffy },
        { role: 'sub', character: zoro },
      ]),
    );

    expect(restoreAutoTeamBuilderResult(snapshot, new Map([[1001, luffy]]))).toBeNull();
  });

  it('re-reads the character, so a restored team is never stale', () => {
    const snapshot = buildAutoTeamBuilderResultSnapshot(
      createResult([{ role: 'captain', character: createCharacter(1001, 'Luffy') }]),
    );
    const renamedUpstream = createCharacter(1001, 'Luffy - Gear 5');

    const restored = restoreAutoTeamBuilderResult(snapshot, new Map([[1001, renamedUpstream]]));

    expect(restored?.slots[0].character.name).toBe('Luffy - Gear 5');
  });

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['a wrong version', { version: 2, savedAt: '2026-09-14', result: { slots: [{ characterId: 1, role: 'captain' }] } }],
    ['no savedAt', { version: 1, result: { slots: [{ characterId: 1, role: 'captain' }] } }],
    ['no result', { version: 1, savedAt: '2026-09-14' }],
    ['no slots', { version: 1, savedAt: '2026-09-14', result: {} }],
    ['empty slots', { version: 1, savedAt: '2026-09-14', result: { slots: [] } }],
    [
      'a slot with no character id',
      { version: 1, savedAt: '2026-09-14', result: { slots: [{ role: 'captain' }] } },
    ],
    [
      'a slot whose character id is not a number',
      { version: 1, savedAt: '2026-09-14', result: { slots: [{ characterId: '1001', role: 'captain' }] } },
    ],
  ])('rejects %s', (_label, value) => {
    expect(parseAutoTeamBuilderResultSnapshot(value)).toBeNull();
  });
});
