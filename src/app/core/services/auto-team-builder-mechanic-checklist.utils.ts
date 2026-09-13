import {
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from '../models/auto-team-builder-ability.models';
import { type AutoBuildSlot } from '../models/auto-team-builder.models';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import { flattenBattleRequiredCharacterGroups } from './auto-team-builder-battle.utils';
import { getEnemyMechanicCatalogItems } from './enemy-mechanic-draft.utils';

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

/**
 * Where the row came from. `ticked` is a mechanic the reader selected in the mechanics panel;
 * `inferred` is one recognised from a plain ability requirement they set instead.
 *
 * Kept distinct and shown as such, because a checklist that silently presents an inference as the
 * reader's own selection is claiming they asked for something they did not.
 */
export type MechanicChecklistSource = 'ticked' | 'inferred';

export interface MechanicChecklistEntry {
  mechanicKey: string;
  category: string;
  source: MechanicChecklistSource;
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

/**
 * `derivedAbilityKey` -> the ONE mechanic that produces it.
 *
 * Deliberately one, not a list. `remove_damage_reduction` is produced by two catalogue mechanics -
 * Enemy Damage Reduction and Percent Damage Reduction - so an ability requirement for it cannot say
 * which the reader meant. Guessing would put a mechanic on the checklist they never asked about,
 * which is the same class of false report the three states exist to prevent, so an ambiguous key
 * maps to nothing and stays with the Final team report where it came from.
 */
function buildUnambiguousMechanicIndex(): Map<string, { key: string; category: string }> {
  const byAbilityKey = new Map<string, { key: string; category: string } | null>();

  for (const item of getEnemyMechanicCatalogItems()) {
    if (!item.derivedAbilityKey) {
      continue;
    }

    // Second sighting of a key marks it ambiguous; it never becomes unambiguous again.
    byAbilityKey.set(
      item.derivedAbilityKey,
      byAbilityKey.has(item.derivedAbilityKey)
        ? null
        : { key: item.key, category: item.category },
    );
  }

  const resolved = new Map<string, { key: string; category: string }>();

  for (const [abilityKey, mechanic] of byAbilityKey) {
    if (mechanic) {
      resolved.set(abilityKey, mechanic);
    }
  }

  return resolved;
}

/**
 * Mechanics recognised from plain ability requirements.
 *
 * Readers describe the same enemy two ways: by ticking a mechanic, or by picking the ability that
 * answers it. The second is common - a real Saved Enemy that prompted this carried six ability
 * requirements and zero mechanics, five of which named a catalogue mechanic exactly - and the
 * checklist saw none of it.
 *
 * The requirement's own `minTurns` and `requiredCharacterCount` are carried across, so an inferred
 * row is judged by exactly what the reader asked for rather than by the mechanic's defaults.
 */
export function inferMechanicsFromAbilityRequirements(
  requiredAbilities: readonly AutoBuildAbilityRequirement[],
  alreadyTicked: readonly AutoBuildEnemyMechanicRequirement[],
): AutoBuildEnemyMechanicRequirement[] {
  const index = buildUnambiguousMechanicIndex();
  const tickedKeys = new Set(alreadyTicked.map((mechanic) => mechanic.mechanicKey));
  const seen = new Set<string>();
  const inferred: AutoBuildEnemyMechanicRequirement[] = [];

  for (const requirement of requiredAbilities) {
    const mechanic = index.get(requirement.abilityKey);

    // A mechanic the reader ticked outright wins: their own row must not be duplicated by an
    // inference of the same thing.
    if (!mechanic || tickedKeys.has(mechanic.key) || seen.has(mechanic.key)) {
      continue;
    }

    seen.add(mechanic.key);
    inferred.push({
      mechanicKey: mechanic.key,
      category: mechanic.category,
      minTurns: requirement.minTurns ?? null,
      requiredCharacterCount: requirement.requiredCharacterCount ?? 1,
      triggerTags: [],
      responseTags: [],
      conditionTags: [],
      derivedAbilityKey: requirement.abilityKey,
    } as AutoBuildEnemyMechanicRequirement);
  }

  return inferred;
}

/**
 * Every ability the reader asked for, wherever the input happens to carry it.
 *
 * `requiredAbilities` is only one of two places. A Saved Enemy loaded as a preset arrives with its
 * abilities already expanded into battle requirement groups and `requiredAbilities` EMPTY - which
 * is exactly the enemy that prompted this, so reading the obvious field alone would have missed
 * the whole case.
 */
export function collectRequestedAbilityRequirements(input: {
  requiredAbilities?: readonly AutoBuildAbilityRequirement[];
  battleRequirements?: readonly AutoBuildBattleRequirement[];
}): AutoBuildAbilityRequirement[] {
  return [
    ...(input.requiredAbilities ?? []),
    ...flattenBattleRequiredCharacterGroups(input.battleRequirements ?? []).flatMap(
      (group) => group.abilities,
    ),
  ];
}

export function buildMechanicChecklist(
  mechanics: readonly AutoBuildEnemyMechanicRequirement[],
  slots: readonly AutoBuildSlot[],
  requiredAbilities: readonly AutoBuildAbilityRequirement[] = [],
): MechanicChecklistSummary {
  const inferred = inferMechanicsFromAbilityRequirements(requiredAbilities, mechanics);
  const inferredKeys = new Set(inferred.map((mechanic) => mechanic.mechanicKey));
  /*
   * Ticked first, inferred after. The reader's own list stays where they put it, and everything
   * the app worked out for them sits below it rather than interleaved.
   */
  const entries: MechanicChecklistEntry[] = [...mechanics, ...inferred].map((mechanic) => {
    const requirement = toRequirement(mechanic);
    const requiredCharacterCount = mechanic.requiredCharacterCount ?? 1;

    if (!requirement) {
      return {
        mechanicKey: mechanic.mechanicKey,
        category: mechanic.category,
        source: inferredKeys.has(mechanic.mechanicKey)
          ? ('inferred' as const)
          : ('ticked' as const),
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
      source: inferredKeys.has(mechanic.mechanicKey) ? ('inferred' as const) : ('ticked' as const),
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
