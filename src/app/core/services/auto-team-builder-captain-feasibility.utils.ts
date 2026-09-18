import type {
  AutoBuildAbilityRequirement,
  AutoBuildBattleRequirement,
  AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';
import type { AutoTeamBuilderType } from '../models/auto-team-builder.models';
import type { CharacterDetailRecord } from '../models/optc.models';

import {
  collectAutoBuildRequirementGroups,
  type AutoBuildRequirementGroupSubject,
} from './auto-team-builder-infeasibility.utils';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import { resolveCharacterTypeTokens } from './auto-team-builder.utils';

/**
 * 869f333ey (D2). Whether a pinned Captain PROVABLY cannot lead the crew the reader asked for.
 *
 * Issue #523 pinned Loki, whose captain ability boosts [QCK] and Driven characters in two tiers and
 * [QCK] alone in the third, over a pool of DEX, STR and PSY Strikers with "both leaders fully cover
 * the team" on. Not one character in that pool was inside Loki's scope, so no attempt that kept Loki
 * AND kept the coverage could ever succeed - yet the search ran all of them, and the only team it
 * could return dropped the coverage the reader had asked for.
 *
 * The answer here is a proof, never a guess, because it decides whether the builder may go looking
 * for another Captain. It reads the pool the search itself would use - the candidates the pinned
 * leaders cover, from `AutoTeamBuilderService.resolveCaptainCoveredCandidateRecords`, the same
 * function that scopes the real search - and fails only on conditions no team drawn from that pool
 * can meet:
 *
 * - fewer covered characters than there are sub slots;
 * - a type the reader asked the team to contain that no covered character carries;
 * - a requirement group - a battle's, a character group's or a standalone ability - that no covered
 *   character satisfies, or fewer satisfy than it asks for.
 *
 * Anything subtler (two covered characters sharing a base name, a cost cap) is left to the search:
 * this is a sufficient condition for impossibility, not a necessary one, so a Captain that passes
 * here can still fail, and nothing changes for a Captain that can do the job.
 */

/** The four sub seats. The two leader seats are the pinned leaders themselves. */
const SUB_SLOT_COUNT = 4;

export type AutoBuildPinnedCaptainImpossibility =
  | {
      kind: 'selectedTypeOutsideCaptainScope';
      /** Types the team must contain that nobody inside the Captain's scope carries. */
      types: AutoTeamBuilderType[];
    }
  | {
      kind: 'requirementOutsideCaptainScope';
      subject: AutoBuildRequirementGroupSubject;
      /** Characters inside the scope that satisfy the group: 0, or fewer than it asks for. */
      coveredMatchCount: number;
      requiredCharacterCount: number;
    }
  | {
      kind: 'tooFewCoveredCandidates';
      /** Characters inside the scope other than the pinned leaders. */
      coveredCandidateCount: number;
    };

export interface AutoBuildPinnedCaptainFeasibilityInput {
  /** The pool the search would use for this Captain: every candidate the pinned leaders cover. */
  coveredRecords: readonly CharacterDetailRecord[];
  /** The pinned Captain and, when the reader pinned one, the Friend Captain. */
  pinnedLeaderIds: readonly number[];
  types: readonly AutoTeamBuilderType[];
  /** False when the reader did not ask the team to contain every selected type, or the types are neutral. */
  requireEveryType: boolean;
  requiredAbilities?: AutoBuildAbilityRequirement[];
  requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
}

function recordSatisfiesGroup(
  record: CharacterDetailRecord,
  abilities: readonly AutoBuildAbilityRequirement[],
): boolean {
  const recordAbilities = record.detail?.builderAbilities ?? [];

  return abilities.every((requirement) =>
    recordAbilities.some((ability) => matchesAbilityRequirement(ability, requirement)),
  );
}

/**
 * Every reason the pinned Captain cannot lead this crew, most useful to the reader first. An empty
 * list means the proof found nothing - which is NOT a promise that a team exists.
 */
export function resolvePinnedCaptainImpossibility(
  input: AutoBuildPinnedCaptainFeasibilityInput,
): AutoBuildPinnedCaptainImpossibility[] {
  const reasons: AutoBuildPinnedCaptainImpossibility[] = [];
  const pinned = new Set(input.pinnedLeaderIds);

  if (input.requireEveryType) {
    const carried = new Set(
      input.coveredRecords.flatMap((record) => resolveCharacterTypeTokens(String(record.type ?? ''))),
    );
    const missing = input.types.filter((type) => !carried.has(type));

    if (missing.length) {
      reasons.push({ kind: 'selectedTypeOutsideCaptainScope', types: [...missing] });
    }
  }

  const subjects = collectAutoBuildRequirementGroups({
    requiredAbilities: input.requiredAbilities,
    requiredCharacterGroups: input.requiredCharacterGroups,
    battleRequirements: input.battleRequirements,
  });

  for (const subject of subjects) {
    const requiredCharacterCount = Math.max(
      ...subject.abilities.map((requirement) => requirement.requiredCharacterCount ?? 1),
      1,
    );
    const coveredMatchCount = input.coveredRecords.filter((record) =>
      recordSatisfiesGroup(record, subject.abilities),
    ).length;

    if (coveredMatchCount < requiredCharacterCount) {
      reasons.push({
        kind: 'requirementOutsideCaptainScope',
        subject,
        coveredMatchCount,
        requiredCharacterCount,
      });
    }
  }

  const coveredCandidateCount = input.coveredRecords.filter((record) => !pinned.has(record.id)).length;

  if (coveredCandidateCount < SUB_SLOT_COUNT) {
    reasons.push({ kind: 'tooFewCoveredCandidates', coveredCandidateCount });
  }

  return reasons;
}

/**
 * 869f333ey (D8). The same proof, asked of many would-be Captains against one pool - cheaply.
 *
 * Scoping the whole pool costs a captain-ability resolution per character, and most Captains fail
 * long before that: in #523 only two characters in the pool carried the battle group, so a Captain
 * that covers neither is rejected after two checks instead of a thousand. So the precondition is
 * asked of the few characters that can matter first - the holders of each requirement group, then
 * one carrier per required type - and only a Captain that survives both pays for the full proof.
 *
 * `covers` must be the predicate the real search scopes with, or this proves the wrong thing; the
 * service builds it from the same function that scopes the search.
 */
export function createPinnedCaptainProver(
  input: Omit<AutoBuildPinnedCaptainFeasibilityInput, 'coveredRecords' | 'pinnedLeaderIds'> & {
    records: readonly CharacterDetailRecord[];
  },
): (covers: (record: CharacterDetailRecord) => boolean, pinnedLeaderIds: readonly number[]) => boolean {
  const groups = collectAutoBuildRequirementGroups({
    requiredAbilities: input.requiredAbilities,
    requiredCharacterGroups: input.requiredCharacterGroups,
    battleRequirements: input.battleRequirements,
  }).map((subject) => ({
    requiredCharacterCount: Math.max(
      ...subject.abilities.map((requirement) => requirement.requiredCharacterCount ?? 1),
      1,
    ),
    holders: input.records.filter((record) => recordSatisfiesGroup(record, subject.abilities)),
  }));
  const carriersByType = new Map(
    (input.requireEveryType ? input.types : []).map((type) => [
      type,
      input.records.filter((record) =>
        resolveCharacterTypeTokens(String(record.type ?? '')).includes(type),
      ),
    ]),
  );

  return (covers, pinnedLeaderIds) => {
    for (const group of groups) {
      if (group.holders.filter(covers).length < group.requiredCharacterCount) {
        return false;
      }
    }

    for (const carriers of carriersByType.values()) {
      if (!carriers.some(covers)) {
        return false;
      }
    }

    return (
      resolvePinnedCaptainImpossibility({
        ...input,
        coveredRecords: input.records.filter(covers),
        pinnedLeaderIds,
      }).length === 0
    );
  };
}
