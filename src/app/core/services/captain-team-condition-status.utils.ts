import {
  type AutoBuildCaptainAbilityCoverageMode,
  type AutoBuildCaptainBranchMode,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import {
  captainTagBranchesSatisfied,
  countCaptainTagBranchMatches,
  parseCaptainTagConditionBranches,
} from './captain-tag-conditions.utils';
import {
  resolveCaptainCoverage,
  resolveRequiredCaptainCoverageBranchTexts,
} from './captain-coverage.utils';

export type CaptainTeamConditionLeaderRole = 'captain' | 'friendCaptain';
export type CaptainTeamConditionState = 'pending' | 'full' | 'partial' | 'none';

export interface CaptainTeamConditionLeaderInput {
  role: CaptainTeamConditionLeaderRole;
  label: string;
  character: CharacterDetailRecord | null;
  branchMode?: AutoBuildCaptainBranchMode | null;
}

export interface CaptainTeamConditionStatusOptions {
  expectedSlotCount: number;
  coverageMode?: AutoBuildCaptainAbilityCoverageMode;
  leaders: readonly CaptainTeamConditionLeaderInput[];
  slotLabels: readonly string[];
  slots: readonly (CharacterDetailRecord | null)[];
}

export interface CaptainTeamConditionLeaderStatus {
  role: CaptainTeamConditionLeaderRole;
  label: string;
  characterId: number | null;
  characterName: string | null;
  hasCaptainAbility: boolean;
  matchesAllSlots: boolean;
  matchingSlotCount: number;
  missingSlotLabels: string[];
  tagConditionsSatisfied: boolean;
  tagConditionCount: number;
  passed: boolean;
}

export interface CaptainTeamConditionStatus {
  state: CaptainTeamConditionState;
  expectedSlotCount: number;
  filledSlotCount: number;
  isComplete: boolean;
  leaderStatuses: CaptainTeamConditionLeaderStatus[];
  passedLeaderLabels: string[];
  failedLeaderLabels: string[];
}

export function resolveCaptainTeamConditionStatus(
  options: CaptainTeamConditionStatusOptions,
): CaptainTeamConditionStatus {
  const slots = options.slots.slice(0, options.expectedSlotCount);
  const filledSlots = slots.filter((slot): slot is CharacterDetailRecord => slot !== null);
  const isComplete =
    slots.length === options.expectedSlotCount && filledSlots.length === options.expectedSlotCount;
  const coverageMode = options.coverageMode ?? 'fullAbilityCoverage';
  const leaderStatuses = options.leaders.map((leader) =>
    resolveLeaderTeamConditionStatus(leader, filledSlots, options.slotLabels, coverageMode),
  );
  const passedLeaderLabels = leaderStatuses
    .filter((status) => status.passed)
    .map((status) => status.label);
  const failedLeaderLabels = leaderStatuses
    .filter((status) => !status.passed)
    .map((status) => status.label);

  return {
    state: resolveTeamConditionState(isComplete, leaderStatuses),
    expectedSlotCount: options.expectedSlotCount,
    filledSlotCount: filledSlots.length,
    isComplete,
    leaderStatuses,
    passedLeaderLabels,
    failedLeaderLabels,
  };
}

function resolveLeaderTeamConditionStatus(
  leader: CaptainTeamConditionLeaderInput,
  slots: readonly CharacterDetailRecord[],
  slotLabels: readonly string[],
  coverageMode: AutoBuildCaptainAbilityCoverageMode,
): CaptainTeamConditionLeaderStatus {
  const captainBranches = leader.character
    ? resolveRequiredCaptainCoverageBranchTextsForMode(leader.character, leader.branchMode ?? null)
    : [];
  const tagConditionBranches =
    coverageMode === 'fullAbilityCoverage'
      ? captainBranches.flatMap((branch) => parseCaptainTagConditionBranches(branch.text))
      : [];
  const slotCoverage = leader.character
    ? slots.map((slot) =>
        resolveCaptainCoverage(leader.character!, slot as CharacterListItem, {
          coverageMode,
          branchMode: leader.branchMode ?? null,
          targetCharacterTags: slot.detail.characterTags,
          includeTeamTagClauses: false,
        }),
      )
    : [];
  const missingSlotLabels = slotCoverage
    .map((coverage, index) =>
      coverage.matches ? null : (slotLabels[index] ?? `Slot ${index + 1}`),
    )
    .filter((label): label is string => label !== null);
  const tagConditionsSatisfied =
    tagConditionBranches.length === 0 || captainTagBranchesSatisfied(slots, tagConditionBranches);
  const hasCaptainAbility = captainBranches.length > 0;

  return {
    role: leader.role,
    label: leader.label,
    characterId: leader.character?.id ?? null,
    characterName: leader.character?.name ?? null,
    hasCaptainAbility,
    matchesAllSlots: slots.length > 0 && missingSlotLabels.length === 0,
    matchingSlotCount: slotCoverage.filter((coverage) => coverage.matches).length,
    missingSlotLabels,
    tagConditionsSatisfied,
    tagConditionCount: tagConditionBranches.filter(
      (branch) => countCaptainTagBranchMatches(slots, branch) >= branch.requiredCount,
    ).length,
    passed: hasCaptainAbility && missingSlotLabels.length === 0 && tagConditionsSatisfied,
  };
}

function resolveRequiredCaptainCoverageBranchTextsForMode(
  captain: CharacterDetailRecord,
  branchMode: AutoBuildCaptainBranchMode | null,
) {
  const branches = resolveRequiredCaptainCoverageBranchTexts(captain);

  if ((branchMode === 'character1' || branchMode === 'character2') && branches.length === 2) {
    return [branches[branchMode === 'character1' ? 0 : 1]!];
  }

  return branches;
}

function resolveTeamConditionState(
  isComplete: boolean,
  leaderStatuses: readonly CaptainTeamConditionLeaderStatus[],
): CaptainTeamConditionState {
  if (!isComplete || leaderStatuses.length === 0) {
    return 'pending';
  }

  const passedCount = leaderStatuses.filter((status) => status.passed).length;

  if (passedCount === leaderStatuses.length) {
    return 'full';
  }

  if (passedCount > 0) {
    return 'partial';
  }

  return 'none';
}
