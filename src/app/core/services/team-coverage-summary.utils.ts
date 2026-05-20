import {
  type CaptainCoverageTeamCondition,
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../models/optc.models';
import {
  getCaptainCoverageTiers,
  matchesCaptainCoverageTier,
} from './captain-coverage-filter.utils';

export type TeamCoverageCaptureSource = 'both' | 'captain-only' | 'friend-only' | 'none';

export interface TeamTierCoverageStatus {
  tier: number;
  scopeLabel: string;
  effectsSummary: string[];
  capturedByCaptain: boolean;
  capturedByFriendCaptain: boolean;
  captureSource: TeamCoverageCaptureSource;
  pendingFieldConditions: string[];
  pendingTriggerConditions: string[];
  pendingTeamConditions: string[];
}

export interface TeamCoverageSummary {
  isComplete: boolean;
  tiers: TeamTierCoverageStatus[];
}

export interface TeamCoverageInput {
  captain: CharacterDetailRecord | null | undefined;
  friendCaptain: CharacterDetailRecord | null | undefined;
  members: ReadonlyArray<CharacterListItem | null | undefined>;
}

export function resolveTeamCoverageSummary(input: TeamCoverageInput): TeamCoverageSummary {
  const nonNullMembers = input.members.filter(
    (member): member is CharacterListItem => member !== null && member !== undefined,
  );
  const isComplete = nonNullMembers.length === 6;

  const captainTiers = getCaptainCoverageTiers(input.captain);
  const friendTiers = getCaptainCoverageTiers(input.friendCaptain);

  // We use whichever captain has more tiers as the canonical tier list — typically the same
  // structure when both are the same character, but a different captain might surface a tier the
  // friend doesn't cover (or vice versa).
  const canonicalTiers = mergeTiersByNumber(captainTiers, friendTiers);

  const statuses: TeamTierCoverageStatus[] = canonicalTiers.map((tierNumber) => {
    const captainTier = captainTiers.find((tier) => tier.tier === tierNumber);
    const friendTier = friendTiers.find((tier) => tier.tier === tierNumber);
    const referenceTier = captainTier ?? friendTier ?? null;

    const capturedByCaptain =
      captainTier !== undefined &&
      teamCoversTier(captainTier, captainTiers, nonNullMembers, isComplete);
    const capturedByFriendCaptain =
      friendTier !== undefined &&
      teamCoversTier(friendTier, friendTiers, nonNullMembers, isComplete);

    return {
      tier: tierNumber,
      scopeLabel: referenceTier ? buildTierScopeLabel(referenceTier) : `Tier ${tierNumber}`,
      effectsSummary: referenceTier?.clauses ?? [],
      capturedByCaptain,
      capturedByFriendCaptain,
      captureSource: resolveCaptureSource(capturedByCaptain, capturedByFriendCaptain),
      pendingFieldConditions:
        referenceTier?.fieldConditions.map((condition) => condition.rawClause).filter(Boolean) ??
        [],
      pendingTriggerConditions:
        referenceTier?.triggerConditions
          .map((condition) => condition.rawClause)
          .filter(Boolean) ?? [],
      pendingTeamConditions:
        referenceTier?.teamConditions.map((condition) => condition.rawClause).filter(Boolean) ?? [],
    };
  });

  return {
    isComplete,
    tiers: statuses,
  };
}

function mergeTiersByNumber(
  captainTiers: readonly CharacterCaptainAbilityCoverageTier[],
  friendTiers: readonly CharacterCaptainAbilityCoverageTier[],
): number[] {
  const numbers = new Set<number>();
  for (const tier of captainTiers) {
    numbers.add(tier.tier);
  }
  for (const tier of friendTiers) {
    numbers.add(tier.tier);
  }
  return [...numbers].sort((a, b) => a - b);
}

function resolveCaptureSource(
  capturedByCaptain: boolean,
  capturedByFriendCaptain: boolean,
): TeamCoverageCaptureSource {
  if (capturedByCaptain && capturedByFriendCaptain) {
    return 'both';
  }
  if (capturedByCaptain) {
    return 'captain-only';
  }
  if (capturedByFriendCaptain) {
    return 'friend-only';
  }
  return 'none';
}

function teamCoversTier(
  tier: CharacterCaptainAbilityCoverageTier,
  allTiersInEntry: readonly CharacterCaptainAbilityCoverageTier[],
  members: readonly CharacterListItem[],
  isComplete: boolean,
): boolean {
  if (!isComplete) {
    return false;
  }
  const subsetTiers = allTiersInEntry.filter((entry) => !entry.characterConditions.fallbackOther);
  const everyMemberQualifies = members.every((member) =>
    matchesCaptainCoverageTier(tier, member, subsetTiers),
  );
  if (!everyMemberQualifies) {
    return false;
  }
  return teamSatisfiesTeamConditions(tier.teamConditions, members);
}

function teamSatisfiesTeamConditions(
  teamConditions: readonly CaptainCoverageTeamCondition[],
  members: readonly CharacterListItem[],
): boolean {
  // `requires-captain` / `requires-friend-captain` are about whether the captain is *this*
  // character — that role is already implicit in how we use this util (captain vs friend tier
  // coverage). Treat those as satisfied here.
  return teamConditions.every((condition) => {
    if (condition.kind === 'requires-captain' || condition.kind === 'requires-friend-captain') {
      return true;
    }
    if (condition.kind === 'crew-composition' || condition.kind === 'crew-count') {
      return crewCompositionSatisfied(condition, members);
    }
    return true;
  });
}

function crewCompositionSatisfied(
  condition: CaptainCoverageTeamCondition,
  members: readonly CharacterListItem[],
): boolean {
  const requiredTypes = condition.types ?? [];
  const requiredClasses = condition.classes ?? [];
  const requiredTags = condition.characterTags ?? [];
  const matchCount = members.filter((member) =>
    memberSatisfiesCompositionCondition(member, requiredTypes, requiredClasses, requiredTags),
  ).length;

  if (typeof condition.exactCount === 'number' && condition.exactCount > 0) {
    return matchCount === condition.exactCount;
  }
  if (typeof condition.minCount === 'number' && condition.minCount > 0) {
    return matchCount >= condition.minCount;
  }
  return true;
}

function memberSatisfiesCompositionCondition(
  member: CharacterListItem,
  requiredTypes: readonly string[],
  requiredClasses: readonly string[],
  requiredTags: readonly string[],
): boolean {
  const memberTypes = member.type.split(',').map((entry) => entry.trim().toUpperCase());
  const typeMatch =
    requiredTypes.length === 0
      ? false
      : requiredTypes.some((type) => memberTypes.includes(type.toUpperCase()));
  const classMatch =
    requiredClasses.length === 0
      ? false
      : requiredClasses.some((characterClass) =>
          member.classes.some(
            (memberClass) => memberClass.toLowerCase() === characterClass.toLowerCase(),
          ),
        );
  const detailTags = (member as CharacterListItem & { detail?: { characterTags?: string[] } })
    .detail?.characterTags;
  const tagMatch =
    requiredTags.length === 0
      ? false
      : Array.isArray(detailTags)
        ? requiredTags.some((tag) =>
            detailTags.some((memberTag) => memberTag.toLowerCase() === tag.toLowerCase()),
          )
        : false;

  if (requiredTypes.length + requiredClasses.length + requiredTags.length === 0) {
    return false;
  }
  return typeMatch || classMatch || tagMatch;
}

function buildTierScopeLabel(tier: CharacterCaptainAbilityCoverageTier): string {
  const fragments: string[] = [];
  const conditions = tier.characterConditions;

  if (conditions.fallbackOther) {
    fragments.push('all other characters');
  } else if (conditions.universal) {
    fragments.push('all characters');
  }
  if (conditions.costRange?.min !== undefined) {
    fragments.push(`Cost ${conditions.costRange.min}+`);
  }
  if (conditions.costRange?.max !== undefined) {
    fragments.push(`Cost ≤ ${conditions.costRange.max}`);
  }
  if (conditions.types.length > 0) {
    fragments.push(conditions.types.map((type) => `[${type}]`).join(' / '));
  }
  if (conditions.classes.length > 0) {
    fragments.push(conditions.classes.join(' / '));
  }
  if (conditions.characterTags.length > 0) {
    fragments.push(conditions.characterTags.map((tag) => `[${tag}]`).join(' / '));
  }

  return fragments.length > 0 ? fragments.join(' · ') : `Tier ${tier.tier}`;
}
