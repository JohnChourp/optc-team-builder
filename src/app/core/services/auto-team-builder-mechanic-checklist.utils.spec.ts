import { describe, expect, it } from 'vitest';

import { type AutoBuildEnemyMechanicRequirement } from '../models/auto-team-builder-ability.models';
import { type AutoBuildSlot } from '../models/auto-team-builder.models';
import { buildMechanicChecklist } from './auto-team-builder-mechanic-checklist.utils';

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
