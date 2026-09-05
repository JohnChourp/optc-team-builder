import {
  type CaptainCoverageTierKind,
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../models/optc.models';
import {
  AUTO_TEAM_BUILDER_TYPES,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import {
  getCaptainCoverageTiers,
  matchesCaptainCoverageTier,
  teamSatisfiesCaptainCoverageTeamConditions,
} from './captain-coverage-filter.utils';
import {
  buildCaptainCoverageTierView,
  type CaptainCoverageTierScopeToken,
} from './captain-coverage-tier-view.utils';

type TeamCoverageCaptureSource = 'both' | 'captain-only' | 'friend-only' | 'none';

interface TeamTierCoverageStatus {
  tier: number;
  kind: CaptainCoverageTierKind | null;
  scopeLabel: string;
  scopeLabelTokens: CaptainCoverageTierScopeToken[];
  conditionLines: string[];
  /** The same lines, in pieces, so a template can translate the structural parts. */
  conditionLineTokens: CaptainCoverageTierScopeToken[][];
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
    const referenceTierView = referenceTier ? buildCaptainCoverageTierView(referenceTier) : null;

    const capturedByCaptain =
      captainTier !== undefined &&
      teamCoversTier(captainTier, captainTiers, nonNullMembers, isComplete);
    const capturedByFriendCaptain =
      friendTier !== undefined &&
      teamCoversTier(friendTier, friendTiers, nonNullMembers, isComplete);

    return {
      tier: tierNumber,
      kind: referenceTierView?.kind ?? null,
      scopeLabel: referenceTierView?.scopeLabel ?? `Tier ${tierNumber}`,
      // Same fallback as the label above, in the shape a template can translate.
      scopeLabelTokens: referenceTierView?.scopeLabelTokens ?? [
        { key: 'captainTiers.scope.tierFallback', params: { tier: tierNumber } },
      ],
      conditionLines: referenceTierView?.conditionLines ?? [],
      conditionLineTokens: referenceTierView?.conditionLineTokens ?? [],
      effectsSummary: referenceTierView?.effectClauses ?? [],
      capturedByCaptain,
      capturedByFriendCaptain,
      captureSource: resolveCaptureSource(capturedByCaptain, capturedByFriendCaptain),
      pendingFieldConditions:
        referenceTier?.fieldConditions.map((condition) => condition.rawClause).filter(Boolean) ??
        [],
      pendingTriggerConditions:
        referenceTier?.triggerConditions.map((condition) => condition.rawClause).filter(Boolean) ??
        [],
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
  if (
    tier.characterConditions.dominantType &&
    !allMembersShareOneType(resolveDominantConditionTypes(tier), members)
  ) {
    return false;
  }
  if (!teamSatisfiesCaptainCoverageTeamConditions(tier.teamConditions, members)) {
    return false;
  }
  if (tierHasOnlyTeamTargeting(tier)) {
    return true;
  }
  const subsetTiers = allTiersInEntry.filter((entry) => !entry.characterConditions.fallbackOther);
  const everyMemberQualifies = members.every((member) =>
    matchesCaptainCoverageTier(tier, member, subsetTiers),
  );
  if (!everyMemberQualifies) {
    return false;
  }
  return true;
}

function tierHasOnlyTeamTargeting(tier: CharacterCaptainAbilityCoverageTier): boolean {
  const conditions = tier.characterConditions;
  const hasSubsetCondition =
    conditions.types.length > 0 ||
    conditions.classes.length > 0 ||
    conditions.characterTags.length > 0 ||
    conditions.costRange !== undefined ||
    conditions.rarityRange !== undefined ||
    conditions.dominantType === true;

  return (
    tier.teamConditions.length > 0 &&
    tier.scope === 'none' &&
    !conditions.universal &&
    !conditions.fallbackOther &&
    !conditions.selfOnly &&
    !hasSubsetCondition
  );
}

function allMembersShareOneType(
  allowedTypes: readonly AutoTeamBuilderType[],
  members: readonly CharacterListItem[],
): boolean {
  return allowedTypes.some((type) =>
    members.every((member) => resolveMemberTypes(member).includes(type)),
  );
}

function resolveDominantConditionTypes(
  tier: CharacterCaptainAbilityCoverageTier,
): AutoTeamBuilderType[] {
  const explicitTeamTypes = tier.teamConditions
    .filter((condition) => condition.sameType)
    .flatMap((condition) => condition.types ?? []);
  const explicitCharacterTypes = tier.characterConditions.types;

  return resolveConditionTypes([...explicitTeamTypes, ...explicitCharacterTypes]);
}

function resolveConditionTypes(types: readonly string[]): AutoTeamBuilderType[] {
  const normalizedTypes = types
    .map((type) => type.trim().toUpperCase())
    .filter((type): type is AutoTeamBuilderType =>
      AUTO_TEAM_BUILDER_TYPES.includes(type as AutoTeamBuilderType),
    );

  return normalizedTypes.length ? normalizedTypes : [...AUTO_TEAM_BUILDER_TYPES];
}

function memberSatisfiesCompositionCondition(
  member: CharacterListItem,
  requiredTypes: readonly string[],
  requiredClasses: readonly string[],
  requiredTags: readonly string[],
): boolean {
  const memberTypes = resolveMemberTypes(member);
  const normalizedRequiredTypes = requiredTypes.length ? resolveConditionTypes(requiredTypes) : [];
  const typeMatch =
    normalizedRequiredTypes.length === 0
      ? false
      : normalizedRequiredTypes.some((type) => memberTypes.includes(type));
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

function resolveMemberTypes(member: CharacterListItem): AutoTeamBuilderType[] {
  return member.type
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((type): type is AutoTeamBuilderType =>
      AUTO_TEAM_BUILDER_TYPES.includes(type as AutoTeamBuilderType),
    );
}
