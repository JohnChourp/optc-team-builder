import type {
  AutoBuildAbilityRequirement,
  AutoBuildBattleRequirement,
  AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';
import type { CharacterDetailRecord } from '../models/optc.models';

import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import type { AutoBuildPinnedCaptainImpossibility } from './auto-team-builder-captain-feasibility.utils';

/**
 * Issue #523. After a failed search, which requirement was impossible - not which ones were asked for.
 *
 * The failure messages restate the request: "No flexible DEX/STR/PSY team could be built after
 * applying ability coverage for X and Y with 1 manual slot choice and the selected captain slot."
 * Every word of that is something the reader typed. The one thing they cannot see is which of those
 * settings had no candidate behind it, so the only way forward was to turn things off one at a time
 * and wait out another search.
 *
 * The report filed as issue #523 is the worked example. The pool was Striker characters of DEX, STR
 * or PSY; one battle group asked for a single character carrying both Remove ATK Down for 2+ turns
 * and Remove Enemy Barrier; the pinned Captain was Loki, whose captain ability boosts [QCK] and
 * Driven characters only, with "both leaders fully cover the team" on. Exactly two characters in
 * that pool carry the pair, and neither is QCK or Driven - so no team existed, and the search spent
 * 7.0 s proving it without ever saying that.
 *
 * This walks the pool ONCE per requirement group and answers three questions a search cannot:
 *
 * - is there any character at all in the pool that satisfies this group,
 * - are there fewer than the requirement asks for,
 * - and, when both leaders must cover the whole team, are all of them outside the leaders' boost
 *   scope.
 *
 * It is a diagnosis, never a gate: nothing here decides whether a team is legal, and a search that
 * succeeds never calls it. So a wrong answer here costs a misleading sentence, never a wrong team -
 * which is why the leader-scope reason is deliberately conservative and stays quiet unless EVERY
 * satisfier is outside EVERY tier of the leader's captain ability.
 */

/** A requirement group as the reader sees it: one character has to carry all of these at once. */
export interface AutoBuildRequirementGroupSubject {
  /** `battle:<id>:<groupId>`, `group:<groupId>`, or `ability:<key>` for a standalone requirement. */
  id: string;
  abilities: AutoBuildAbilityRequirement[];
  battleTitle: string | null;
  battleIndex: number | null;
}

export interface AutoBuildLeaderScope {
  characterId: number;
  name: string;
  /** Every tier's character conditions. A member must match all of them to be fully covered. */
  tiers: Array<{ universal: boolean; types: string[]; classes: string[]; characterTags: string[] }>;
}

export type AutoBuildInfeasibilityReason =
  | {
      kind: 'noCandidateForRequirement';
      subject: AutoBuildRequirementGroupSubject;
      poolMatchCount: 0;
    }
  | {
      kind: 'notEnoughCandidatesForRequirement';
      subject: AutoBuildRequirementGroupSubject;
      poolMatchCount: number;
      requiredCharacterCount: number;
    }
  | {
      kind: 'requirementOutsideLeaderScope';
      subject: AutoBuildRequirementGroupSubject;
      poolMatchCount: number;
      leader: AutoBuildLeaderScope;
    };

export interface AutoBuildInfeasibilityDiagnosis {
  reasons: AutoBuildInfeasibilityReason[];
  poolSize: number;
  /**
   * 869f333ey (D6). Present when the reader pinned a Captain that provably could not lead the crew:
   * why not, and how many other Captains from the same pool were tried and also found nothing. It
   * outranks `reasons` in the message, because it is the one thing the reader can change in one
   * click - and the search already tried the obvious alternative for them.
   */
  pinnedCaptain?: AutoBuildPinnedCaptainDiagnosis;
}

export interface AutoBuildPinnedCaptainDiagnosis {
  characterId: number;
  name: string;
  impossibility: AutoBuildPinnedCaptainImpossibility[];
  /** Other Captains from the same pool that passed the same proof and still found no team. */
  alternativeCaptainIds: number[];
}

/** Empty `types`, `classes` and `characterTags` on a tier means it names nobody in particular. */
function tierCoversRecord(
  tier: AutoBuildLeaderScope['tiers'][number],
  record: CharacterDetailRecord,
): boolean {
  if (tier.universal) {
    return true;
  }

  const hasCondition =
    tier.types.length > 0 || tier.classes.length > 0 || tier.characterTags.length > 0;

  if (!hasCondition) {
    return true;
  }

  const recordTypes = String(record.type ?? '')
    .split(/[,/]/u)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const recordClasses = (record.classes ?? []).map((value) => String(value).trim().toLowerCase());
  const recordTags = (record.detail?.characterTags ?? []).map((value) =>
    String(value).trim().toLowerCase(),
  );

  return (
    tier.types.some((type) => recordTypes.includes(String(type).trim().toUpperCase())) ||
    tier.classes.some((value) => recordClasses.includes(String(value).trim().toLowerCase())) ||
    tier.characterTags.some((value) => recordTags.includes(String(value).trim().toLowerCase()))
  );
}

function leaderCoversRecord(leader: AutoBuildLeaderScope, record: CharacterDetailRecord): boolean {
  return leader.tiers.every((tier) => tierCoversRecord(tier, record));
}

function recordSatisfiesGroup(
  record: CharacterDetailRecord,
  abilities: AutoBuildAbilityRequirement[],
): boolean {
  const recordAbilities = record.detail?.builderAbilities ?? [];

  return abilities.every((requirement) =>
    recordAbilities.some((ability) => matchesAbilityRequirement(ability, requirement)),
  );
}

/**
 * Every group the reader asked for, flattened to the thing a single character has to satisfy.
 *
 * Standalone `requiredAbilities` become one-ability groups, because the question is the same and
 * the answer reads the same way. A battle's groups carry the battle's own title, so the message can
 * say which battle rather than making the reader count.
 */
export function collectAutoBuildRequirementGroups({
  requiredAbilities = [],
  requiredCharacterGroups = [],
  battleRequirements = [],
}: {
  requiredAbilities?: AutoBuildAbilityRequirement[];
  requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
}): AutoBuildRequirementGroupSubject[] {
  const subjects: AutoBuildRequirementGroupSubject[] = [];

  battleRequirements.forEach((battle, battleIndex) => {
    for (const group of battle.requiredCharacterGroups ?? []) {
      if (group.abilities.length) {
        subjects.push({
          id: `battle:${battle.id}:${group.id}`,
          abilities: group.abilities,
          battleTitle: battle.title ?? null,
          battleIndex,
        });
      }
    }
  });

  for (const group of requiredCharacterGroups) {
    if (group.abilities.length) {
      subjects.push({
        id: `group:${group.id}`,
        abilities: group.abilities,
        battleTitle: null,
        battleIndex: null,
      });
    }
  }

  for (const requirement of requiredAbilities) {
    subjects.push({
      id: `ability:${requirement.abilityKey}`,
      abilities: [requirement],
      battleTitle: null,
      battleIndex: null,
    });
  }

  return subjects;
}

/**
 * The pool the search actually used, against the requirements it was given.
 *
 * Reasons come back worst first: a requirement nothing satisfies, then one whose only satisfiers the
 * leaders cannot cover, then one with fewer satisfiers than slots asked for. An empty list means the
 * requirements are individually satisfiable and the search failed on their combination - which this
 * cannot diagnose, and does not pretend to.
 */
export function diagnoseAutoBuildInfeasibility({
  poolRecords,
  requiredAbilities,
  requiredCharacterGroups,
  battleRequirements,
  leaderScopes = [],
}: {
  poolRecords: readonly CharacterDetailRecord[];
  requiredAbilities?: AutoBuildAbilityRequirement[];
  requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
  leaderScopes?: readonly AutoBuildLeaderScope[];
}): AutoBuildInfeasibilityDiagnosis {
  const subjects = collectAutoBuildRequirementGroups({
    requiredAbilities,
    requiredCharacterGroups,
    battleRequirements,
  });
  const missing: AutoBuildInfeasibilityReason[] = [];
  const outsideScope: AutoBuildInfeasibilityReason[] = [];
  const tooFew: AutoBuildInfeasibilityReason[] = [];

  for (const subject of subjects) {
    const matches = poolRecords.filter((record) => recordSatisfiesGroup(record, subject.abilities));

    if (matches.length === 0) {
      missing.push({ kind: 'noCandidateForRequirement', subject, poolMatchCount: 0 });
      continue;
    }

    for (const leader of leaderScopes) {
      if (!matches.some((record) => leaderCoversRecord(leader, record))) {
        outsideScope.push({
          kind: 'requirementOutsideLeaderScope',
          subject,
          poolMatchCount: matches.length,
          leader,
        });
        break;
      }
    }

    const requiredCharacterCount = Math.max(
      ...subject.abilities.map((requirement) => requirement.requiredCharacterCount ?? 1),
      1,
    );

    if (matches.length < requiredCharacterCount) {
      tooFew.push({
        kind: 'notEnoughCandidatesForRequirement',
        subject,
        poolMatchCount: matches.length,
        requiredCharacterCount,
      });
    }
  }

  return {
    reasons: [...missing, ...outsideScope, ...tooFew],
    poolSize: poolRecords.length,
  };
}

/**
 * The pinned leaders' boost scope, or an empty list when the reader did not ask for full coverage.
 *
 * Only a leader the reader pinned themselves is used. An auto-filled leader is the search's choice,
 * so "your captain cannot cover them" would be advice about a decision they never made.
 */
export function collectPinnedLeaderScopes({
  records,
  manualLeaderCharacterIds,
  requireFullCoverage,
}: {
  records: readonly CharacterDetailRecord[];
  manualLeaderCharacterIds: readonly number[];
  requireFullCoverage: boolean;
}): AutoBuildLeaderScope[] {
  if (!requireFullCoverage || manualLeaderCharacterIds.length === 0) {
    return [];
  }

  const scopes: AutoBuildLeaderScope[] = [];

  for (const characterId of manualLeaderCharacterIds) {
    const record = records.find((candidate) => candidate.id === characterId);
    const entries = record?.detail?.captainAbilityCoverage?.entries ?? [];
    const tiers = entries
      .flatMap((entry) => entry.tiers ?? [])
      .map((tier) => ({
        universal: Boolean(tier.characterConditions?.universal),
        types: tier.characterConditions?.types ?? [],
        classes: tier.characterConditions?.classes ?? [],
        characterTags: tier.characterConditions?.characterTags ?? [],
      }))
      .filter(
        (tier) =>
          tier.universal ||
          tier.types.length > 0 ||
          tier.classes.length > 0 ||
          tier.characterTags.length > 0,
      );

    if (record && tiers.length && !tiers.every((tier) => tier.universal)) {
      scopes.push({ characterId, name: record.name, tiers });
    }
  }

  return scopes;
}
