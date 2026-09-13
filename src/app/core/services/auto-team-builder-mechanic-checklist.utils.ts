import {
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from '../models/auto-team-builder-ability.models';
import { type AutoBuildSlot } from '../models/auto-team-builder.models';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';

/**
 * 869f1935z. The checklist every beginner guide describes and this app never rendered: bind,
 * despair, paralysis, barriers, orb problems, interrupts - covered or not, against the team that
 * was just built.
 *
 * **Why this is not the Final team report saying the same thing twice.** The report speaks in the
 * rules the SEARCH used. Fourteen of the catalogue's 38 mechanics carry `derivedAbilityKey: null`,
 * so ticking one produces no ability requirement, therefore no rule, therefore no report row - the
 * report is structurally incapable of mentioning them. The engine already documents this in
 * `auto-team-builder.utils.ts`, where ticking an unmapped mechanic once returned no team at all.
 * That bug is fixed; what replaced it is silence. This is the only surface that can break it.
 *
 * **Three states, not two.** `869f127g5`'s gate is that *"a checklist that reports false coverage
 * is worse than none"*, and a two-state checklist has to lie about the fourteen: `notCovered` reads
 * as "go and find a unit for it" when in fact no shipped ability answers it, and `covered` would be
 * an outright falsehood. So `unanswerable` is its own state and says so in as many words.
 *
 * Coverage is decided by the engine's OWN matcher over the engine's OWN derived requirement, not by
 * a second comparison written here. If the two ever disagree the checklist is wrong, and there is
 * no version of that which is acceptable on a surface whose whole purpose is to be trusted.
 */

export type MechanicCoverageState = 'covered' | 'notCovered' | 'unanswerable';

export interface MechanicChecklistEntry {
  mechanicKey: string;
  category: string;
  state: MechanicCoverageState;
  /** Player-facing slot numbers (1-based) whose character answers this mechanic. */
  coveringSlots: number[];
  coveringCharacterNames: string[];
  /** How many characters the mechanic asked for, when it asked for more than one. */
  requiredCharacterCount: number;
}

export interface MechanicChecklistSummary {
  entries: MechanicChecklistEntry[];
  coveredCount: number;
  notCoveredCount: number;
  unanswerableCount: number;
}

/**
 * The requirement a single mechanic derives, built the same way the engine builds it so the two
 * cannot drift. Kept local rather than calling `deriveAbilityRequirementsFromEnemyMechanics`,
 * because that function MERGES requirements across mechanics - correct for the search, and wrong
 * here, where each mechanic needs its own answer.
 */
function toRequirement(
  mechanic: AutoBuildEnemyMechanicRequirement,
): AutoBuildAbilityRequirement | null {
  if (!mechanic.derivedAbilityKey) {
    return null;
  }

  return {
    abilityKey: mechanic.derivedAbilityKey,
    minTurns: mechanic.minTurns ?? null,
    slotTokens: [],
    requiredCharacterCount: mechanic.requiredCharacterCount ?? 1,
  } as AutoBuildAbilityRequirement;
}

function slotAnswers(slot: AutoBuildSlot, requirement: AutoBuildAbilityRequirement): boolean {
  return (slot.character.detail.builderAbilities ?? []).some((ability) =>
    matchesAbilityRequirement(ability, requirement),
  );
}

export function buildMechanicChecklist(
  mechanics: readonly AutoBuildEnemyMechanicRequirement[],
  slots: readonly AutoBuildSlot[],
): MechanicChecklistSummary {
  const entries: MechanicChecklistEntry[] = mechanics.map((mechanic) => {
    const requirement = toRequirement(mechanic);
    const requiredCharacterCount = mechanic.requiredCharacterCount ?? 1;

    if (!requirement) {
      return {
        mechanicKey: mechanic.mechanicKey,
        category: mechanic.category,
        state: 'unanswerable' as const,
        coveringSlots: [],
        coveringCharacterNames: [],
        requiredCharacterCount,
      };
    }

    const coveringSlots: number[] = [];
    const coveringCharacterNames: string[] = [];

    slots.forEach((slot, index) => {
      if (slotAnswers(slot, requirement)) {
        coveringSlots.push(index + 1);
        coveringCharacterNames.push(slot.character.name);
      }
    });

    /*
     * A mechanic can ask for more than one character - two despair removers for a stage that
     * applies it twice. Partial coverage is NOT coverage: reporting a tick because one of the two
     * is present is the false positive this surface must not produce.
     */
    const state: MechanicCoverageState =
      coveringSlots.length >= requiredCharacterCount ? 'covered' : 'notCovered';

    return {
      mechanicKey: mechanic.mechanicKey,
      category: mechanic.category,
      state,
      coveringSlots,
      coveringCharacterNames,
      requiredCharacterCount,
    };
  });

  return {
    entries,
    coveredCount: entries.filter((entry) => entry.state === 'covered').length,
    notCoveredCount: entries.filter((entry) => entry.state === 'notCovered').length,
    unanswerableCount: entries.filter((entry) => entry.state === 'unanswerable').length,
  };
}
