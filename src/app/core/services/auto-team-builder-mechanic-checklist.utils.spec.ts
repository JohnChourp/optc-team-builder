import { describe, expect, it } from 'vitest';

import { type AutoBuildEnemyMechanicRequirement } from '../models/auto-team-builder-ability.models';
import { type AutoBuildSlot } from '../models/auto-team-builder.models';
import {
  buildMechanicChecklist,
  inferMechanicsFromAbilityRequirements,
} from './auto-team-builder-mechanic-checklist.utils';

/*
 * 869f1935z. `869f127g5`'s gate: "a checklist that reports false coverage is worse than none."
 * Every test here is about one of the three ways this surface could lie - claiming cover it does
 * not have, claiming partial cover counts, or telling the reader to go and find a unit for a
 * mechanic that no shipped ability answers.
 */

function slot(name: string, abilityKeys: string[], minTurnsByKey: Record<string, number> = {}): AutoBuildSlot {
  return {
    role: 'sub',
    reasonChips: [],
    character: {
      id: 1,
      name,
      detail: {
        builderAbilities: abilityKeys.map((key) => ({
          key,
          label: key,
          minTurns: minTurnsByKey[key] ?? null,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'specialText',
        })),
      },
    },
  } as unknown as AutoBuildSlot;
}

function mechanic(
  overrides: Partial<AutoBuildEnemyMechanicRequirement> = {},
): AutoBuildEnemyMechanicRequirement {
  return {
    mechanicKey: 'crew_despair',
    category: 'crewDebuff',
    minTurns: null,
    requiredCharacterCount: 1,
    triggerTags: [],
    responseTags: [],
    conditionTags: [],
    derivedAbilityKey: 'remove_despair',
    ...overrides,
  } as AutoBuildEnemyMechanicRequirement;
}

describe('buildMechanicChecklist', () => {
  it('marks a mechanic covered and names the slot that answers it', () => {
    const summary = buildMechanicChecklist(
      [mechanic()],
      [slot('Nobody', []), slot('Hancock', ['remove_despair'])],
    );

    expect(summary.entries[0]).toMatchObject({
      state: 'covered',
      coveringSlots: [2],
      coveringCharacterNames: ['Hancock'],
    });
    expect(summary.coveredCount).toBe(1);
  });

  it('marks a mechanic not covered when no character answers it', () => {
    const summary = buildMechanicChecklist([mechanic()], [slot('Nobody', ['remove_bind'])]);

    expect(summary.entries[0]?.state).toBe('notCovered');
    expect(summary.notCoveredCount).toBe(1);
  });

  it('reports an UNANSWERABLE mechanic as its own state, not as not-covered', () => {
    /*
     * The whole reason for three states. Fourteen of the 38 catalogue mechanics derive no ability
     * requirement, so no shipped unit can ever answer them. "Not covered" would send the reader
     * hunting for a character that does not exist, and the Final team report cannot say anything
     * at all because these produce no rule.
     */
    const summary = buildMechanicChecklist(
      [mechanic({ mechanicKey: 'orb_shuffle', category: 'orbControl', derivedAbilityKey: null })],
      [slot('Anyone', ['remove_despair', 'remove_bind'])],
    );

    expect(summary.entries[0]).toMatchObject({
      state: 'unanswerable',
      coveringSlots: [],
      coveringCharacterNames: [],
    });
    expect(summary.unanswerableCount).toBe(1);
    expect(summary.notCoveredCount).toBe(0);
  });

  it('does NOT count partial cover as cover', () => {
    // A stage that applies despair twice needs two answers. One is not the job done.
    const summary = buildMechanicChecklist(
      [mechanic({ requiredCharacterCount: 2 })],
      [slot('Hancock', ['remove_despair']), slot('Nobody', [])],
    );

    expect(summary.entries[0]).toMatchObject({ state: 'notCovered', coveringSlots: [1] });
  });

  it('counts cover once the required number of characters is there', () => {
    const summary = buildMechanicChecklist(
      [mechanic({ requiredCharacterCount: 2 })],
      [slot('Hancock', ['remove_despair']), slot('Boa', ['remove_despair'])],
    );

    expect(summary.entries[0]).toMatchObject({ state: 'covered', coveringSlots: [1, 2] });
  });

  it('respects the mechanic minimum turn count, through the engine own matcher', () => {
    /*
     * Coverage is decided by `matchesAbilityRequirement`, not by a second comparison written in
     * the checklist. A 2-turn remover does not answer a 5-turn despair, and if the checklist ever
     * disagreed with the engine about that, the checklist would be the wrong one.
     */
    const tooShort = buildMechanicChecklist(
      [mechanic({ minTurns: 5 })],
      [slot('Hancock', ['remove_despair'], { remove_despair: 2 })],
    );
    const longEnough = buildMechanicChecklist(
      [mechanic({ minTurns: 5 })],
      [slot('Hancock', ['remove_despair'], { remove_despair: 5 })],
    );

    expect(tooShort.entries[0]?.state).toBe('notCovered');
    expect(longEnough.entries[0]?.state).toBe('covered');
  });

  it('returns nothing when the reader ticked no mechanic', () => {
    expect(buildMechanicChecklist([], [slot('Anyone', ['remove_bind'])]).entries).toEqual([]);
  });

  it('keeps the reader own order, so the list matches the panel they ticked', () => {
    const summary = buildMechanicChecklist(
      [
        mechanic({ mechanicKey: 'crew_bind', derivedAbilityKey: 'remove_bind' }),
        mechanic({ mechanicKey: 'crew_despair', derivedAbilityKey: 'remove_despair' }),
      ],
      [slot('Hancock', ['remove_despair'])],
    );

    expect(summary.entries.map((entry) => entry.mechanicKey)).toEqual([
      'crew_bind',
      'crew_despair',
    ]);
  });
});

describe('inferMechanicsFromAbilityRequirements', () => {
  /*
   * 869f1935z. Readers describe the same enemy two ways. A real Saved Enemy that prompted this
   * carried SIX ability requirements and ZERO mechanics, five of which named a catalogue mechanic
   * exactly - and the checklist saw none of it.
   */
  const ability = (abilityKey: string, overrides = {}) =>
    ({ abilityKey, minTurns: null, slotTokens: [], requiredCharacterCount: 1, ...overrides }) as never;

  it('recognises a mechanic from the ability that answers it', () => {
    const inferred = inferMechanicsFromAbilityRequirements([ability('remove_paralysis')], []);

    expect(inferred.map((entry) => entry.mechanicKey)).toEqual(['crew_paralysis']);
    expect(inferred[0]?.derivedAbilityKey).toBe('remove_paralysis');
  });

  it('REFUSES an ability key that two mechanics produce, rather than guessing which was meant', () => {
    /*
     * `remove_damage_reduction` is produced by Enemy Damage Reduction AND Percent Damage Reduction.
     * Picking one would put a mechanic on the checklist the reader never asked about - the same
     * class of false report the three states exist to prevent.
     */
    expect(inferMechanicsFromAbilityRequirements([ability('remove_damage_reduction')], [])).toEqual(
      [],
    );
  });

  it('ignores an ability that names no mechanic at all', () => {
    expect(
      inferMechanicsFromAbilityRequirements([ability('ignore_normal_attack_only')], []),
    ).toEqual([]);
  });

  it('does not duplicate a mechanic the reader already ticked', () => {
    const ticked = [mechanic({ mechanicKey: 'crew_despair', derivedAbilityKey: 'remove_despair' })];

    expect(inferMechanicsFromAbilityRequirements([ability('remove_despair')], ticked)).toEqual([]);
  });

  it('carries the requirement own turns and count, not the mechanic defaults', () => {
    const inferred = inferMechanicsFromAbilityRequirements(
      [ability('remove_bind', { minTurns: 5, requiredCharacterCount: 2 })],
      [],
    );

    expect(inferred[0]).toMatchObject({ minTurns: 5, requiredCharacterCount: 2 });
  });

  it('recognises each mechanic once, however many requirements name it', () => {
    const inferred = inferMechanicsFromAbilityRequirements(
      [ability('remove_burn'), ability('remove_burn', { minTurns: 3 })],
      [],
    );

    expect(inferred).toHaveLength(1);
  });
});

describe('buildMechanicChecklist with ability requirements', () => {
  const ability = (abilityKey: string) =>
    ({ abilityKey, minTurns: null, slotTokens: [], requiredCharacterCount: 1 }) as never;

  it('builds a checklist for an enemy that has NO ticked mechanics at all', () => {
    // The exact shape of the Saved Enemy that prompted this: abilities only, no mechanics.
    const summary = buildMechanicChecklist(
      [],
      [slot('Hancock', ['remove_despair'])],
      [ability('remove_despair'), ability('remove_burn')],
    );

    expect(summary.entries.map((entry) => [entry.mechanicKey, entry.state, entry.source])).toEqual([
      ['crew_despair', 'covered', 'inferred'],
      ['crew_burn', 'notCovered', 'inferred'],
    ]);
  });

  it('keeps ticked mechanics first and marks each row source', () => {
    const summary = buildMechanicChecklist(
      [mechanic({ mechanicKey: 'crew_bind', derivedAbilityKey: 'remove_bind' })],
      [slot('Nobody', [])],
      [ability('remove_burn')],
    );

    expect(summary.entries.map((entry) => [entry.mechanicKey, entry.source])).toEqual([
      ['crew_bind', 'ticked'],
      ['crew_burn', 'inferred'],
    ]);
  });

  it('changes nothing when no ability requirement names a mechanic', () => {
    const summary = buildMechanicChecklist(
      [mechanic()],
      [slot('Hancock', ['remove_despair'])],
      [ability('ignore_normal_attack_only')],
    );

    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0]?.source).toBe('ticked');
  });
});
