import {
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';
import {
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildCaptainAbilityCoverageMode,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import {
  type CaptainCoverageTeamCondition,
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../models/optc.models';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import {
  type CaptainCoverageResult,
  resolveCaptainCoverage,
} from './captain-coverage.utils';

export interface CaptainCoverageFilterState {
  requiredAbilityRequirements: AutoBuildAbilityRequirement[];
  requireSuperTandem: boolean;
  requireSuperTypesClasses: boolean;
  requireCaptainCoverage: boolean;
  requireFullCoverage: boolean;
  requiredTiers: number[];
}

export interface CaptainCoverageFilterTarget {
  character: CharacterListItem;
  detail?: CharacterDetailRecord | null;
}

export interface CaptainCoverageFilterResult {
  coverage: CaptainCoverageResult;
  coverageMode: AutoBuildCaptainAbilityCoverageMode;
  matches: boolean;
  matchesCaptainCoverage: boolean;
  matchesRequiredAbilityFilters: boolean;
  matchesSuperTandem: boolean;
  matchesSuperTypesClasses: boolean;
  matchesRequiredTiers: boolean;
}

const DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE: CaptainCoverageFilterState = {
  requiredAbilityRequirements: [],
  requireSuperTandem: false,
  requireSuperTypesClasses: false,
  requireCaptainCoverage: true,
  requireFullCoverage: false,
  requiredTiers: [],
};

export function createCaptainCoverageFilterState(
  overrides: Partial<CaptainCoverageFilterState> = {},
): CaptainCoverageFilterState {
  return {
    requiredAbilityRequirements: [
      ...(overrides.requiredAbilityRequirements ??
        DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE.requiredAbilityRequirements),
    ],
    requireSuperTandem:
      overrides.requireSuperTandem ?? DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE.requireSuperTandem,
    requireSuperTypesClasses:
      overrides.requireSuperTypesClasses ??
      DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE.requireSuperTypesClasses,
    requireCaptainCoverage:
      overrides.requireCaptainCoverage ??
      DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE.requireCaptainCoverage,
    requireFullCoverage:
      overrides.requireFullCoverage ?? DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE.requireFullCoverage,
    requiredTiers: [
      ...(overrides.requiredTiers ?? DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE.requiredTiers),
    ],
  };
}

export function resolveCaptainCoverageFilterResult(
  captain: CharacterDetailRecord,
  target: CaptainCoverageFilterTarget,
  state: CaptainCoverageFilterState = DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE,
): CaptainCoverageFilterResult {
  const filterState = createCaptainCoverageFilterState(state);
  const coverageMode = resolveCaptainCoverageFilterCoverageMode(filterState);
  const coverage = resolveCaptainCoverage(captain, target.character, {
    coverageMode,
    includeTeamTagClauses: filterState.requireFullCoverage,
    targetCharacterTags: target.detail?.detail.characterTags ?? [],
  });
  const matchesCaptainCoverage = filterState.requireCaptainCoverage ? coverage.matches : true;
  const matchesRequiredAbilityFilters = matchesCaptainCoverageRequiredAbilityFilters(
    target.detail?.detail.builderAbilities ?? [],
    filterState.requiredAbilityRequirements,
  );
  const matchesSuperTandem =
    !filterState.requireSuperTandem || hasCaptainCoverageSuperTandemData(target.detail);
  const matchesSuperTypesClasses =
    !filterState.requireSuperTypesClasses || hasCaptainCoverageSuperTypesClassesData(target.detail);
  const matchesRequiredTiers = matchesCaptainCoverageRequiredTiers(
    captain,
    target.character,
    filterState.requiredTiers,
  );

  return {
    coverage,
    coverageMode,
    matches:
      matchesCaptainCoverage &&
      matchesRequiredAbilityFilters &&
      matchesSuperTandem &&
      matchesSuperTypesClasses &&
      matchesRequiredTiers,
    matchesCaptainCoverage,
    matchesRequiredAbilityFilters,
    matchesSuperTandem,
    matchesSuperTypesClasses,
    matchesRequiredTiers,
  };
}

export function getCaptainCoverageTiers(
  captain: CharacterDetailRecord | null | undefined,
): CharacterCaptainAbilityCoverageTier[] {
  if (!captain) {
    return [];
  }
  const entries = captain.detail.captainAbilityCoverage?.entries ?? [];
  if (entries.length === 0) {
    return [];
  }
  // Use the first variant's tiers — dual-base captains are handled by their respective entries
  // but the tier toggle UI operates on the canonical first variant.
  return entries[0]?.tiers ?? [];
}

export function getCaptainCoverageAvailableTierNumbers(
  captain: CharacterDetailRecord | null | undefined,
): number[] {
  return getCaptainCoverageTiers(captain).map((tier) => tier.tier);
}

export function matchesCaptainCoverageRequiredTiers(
  captain: CharacterDetailRecord,
  target: CharacterListItem,
  requiredTiers: readonly number[],
): boolean {
  if (!requiredTiers.length) {
    return true;
  }
  const tiers = getCaptainCoverageTiers(captain);
  if (!tiers.length) {
    // Leader has no tier data — keep behaviour unchanged (no extra restriction).
    return true;
  }
  const subsetTiers = filterSubsetCaptainCoverageTiers(tiers);
  return requiredTiers.some((tierNumber) => {
    const tier = tiers.find((entry) => entry.tier === tierNumber);
    if (!tier) {
      return false;
    }
    return matchesCaptainCoverageTier(tier, target, subsetTiers);
  });
}

export function targetMatchesAnyApplicableCaptainCoverageTier(
  captain: CharacterDetailRecord | null | undefined,
  target: CharacterListItem,
): boolean {
  const tiers = getCaptainCoverageTiers(captain);
  if (!tiers.length) {
    return true;
  }
  const subsetTiers = filterSubsetCaptainCoverageTiers(tiers);
  const applicableTiers = tiers.filter(
    (tier) => !isCaptainCoverageTierNotApplicableForTeamCoverage(tier),
  );
  if (!applicableTiers.length) {
    return true;
  }
  return applicableTiers.some((tier) => matchesCaptainCoverageTier(tier, target, subsetTiers));
}

interface CaptainAllTierCoverageTierResult {
  tier: CharacterCaptainAbilityCoverageTier;
  matchingCandidateCount: number;
  matches: boolean;
  // True when the tier cannot be covered by any team slot (e.g. self-only tiers that only the
  // captain itself satisfies) — these are treated as not-applicable for team coverage purposes.
  notApplicable: boolean;
}

export interface CaptainAllTierCoverageResult {
  matches: boolean;
  totalTierCount: number;
  matchedTierCount: number;
  applicableTierCount: number;
  tierResults: CaptainAllTierCoverageTierResult[];
  uncoveredTierLabels: string[];
}

export function resolveCaptainAllTierCoverage(
  captain: CharacterDetailRecord | null | undefined,
  candidates: readonly { character: CharacterListItem }[],
): CaptainAllTierCoverageResult {
  const tiers = getCaptainCoverageTiers(captain);
  if (tiers.length === 0) {
    return {
      matches: true,
      totalTierCount: 0,
      matchedTierCount: 0,
      applicableTierCount: 0,
      tierResults: [],
      uncoveredTierLabels: [],
    };
  }
  const subsetTiers = filterSubsetCaptainCoverageTiers(tiers);
  const members = candidates.map((candidate) => candidate.character);
  const tierResults = tiers.map<CaptainAllTierCoverageTierResult>((tier) => {
    if (isCaptainCoverageTierNotApplicableForTeamCoverage(tier)) {
      return {
        tier,
        matchingCandidateCount: 0,
        matches: true,
        notApplicable: true,
      };
    }
    if (!teamSatisfiesCaptainCoverageTeamConditions(tier.teamConditions, members)) {
      return {
        tier,
        matchingCandidateCount: 0,
        matches: false,
        notApplicable: false,
      };
    }
    const matchingCandidateCount = candidates.filter((candidate) =>
      matchesCaptainCoverageTier(tier, candidate.character, subsetTiers),
    ).length;
    return {
      tier,
      matchingCandidateCount,
      matches: matchingCandidateCount > 0,
      notApplicable: false,
    };
  });
  const applicableResults = tierResults.filter((result) => !result.notApplicable);
  const matchedTierCount = applicableResults.filter((result) => result.matches).length;
  const uncoveredTierLabels = applicableResults
    .filter((result) => !result.matches)
    .map((result) => `Tier ${result.tier.tier}`);
  return {
    matches: matchedTierCount === applicableResults.length,
    totalTierCount: tierResults.length,
    matchedTierCount,
    applicableTierCount: applicableResults.length,
    tierResults,
    uncoveredTierLabels,
  };
}

function filterSubsetCaptainCoverageTiers(
  tiers: readonly CharacterCaptainAbilityCoverageTier[],
): CharacterCaptainAbilityCoverageTier[] {
  // Fallback ("all other characters") tiers match a target iff that target does NOT satisfy any
  // more-specific subset tier in the same entry. The reference list must contain only tiers with
  // explicit subset constraints — universal-only conditional tiers (no types/classes/tags/cost/
  // rarity/dominantType) would otherwise return `true` for every target inside
  // `matchesTierCharacterConditionsInner`, making the fallback tier match nothing.
  return tiers.filter((tier) => {
    if (tier.characterConditions.fallbackOther) {
      return false;
    }
    const conditions = tier.characterConditions;
    return (
      conditions.types.length > 0 ||
      conditions.classes.length > 0 ||
      conditions.characterTags.length > 0 ||
      conditions.costRange !== undefined ||
      conditions.rarityRange !== undefined ||
      conditions.dominantType === true
    );
  });
}

function isCaptainCoverageTierNotApplicableForTeamCoverage(
  tier: CharacterCaptainAbilityCoverageTier,
): boolean {
  // Self-only tiers ("Boosts ATK of this character by 12x") only target the captain itself, so
  // they can never be covered by another team slot — treat as not-applicable.
  const conditions = tier.characterConditions;
  const hasSubsetCondition =
    conditions.types.length > 0 ||
    conditions.classes.length > 0 ||
    conditions.characterTags.length > 0 ||
    conditions.costRange !== undefined ||
    conditions.rarityRange !== undefined ||
    conditions.dominantType === true;

  if (
    tier.scope === 'none' &&
    !conditions.universal &&
    !conditions.fallbackOther &&
    !conditions.selfOnly &&
    !hasSubsetCondition
  ) {
    return true;
  }

  return (
    conditions.selfOnly &&
    !conditions.universal &&
    !conditions.fallbackOther &&
    !conditions.dominantType &&
    !hasSubsetCondition
  );
}

export function matchesCaptainCoverageTier(
  tier: CharacterCaptainAbilityCoverageTier,
  target: CharacterListItem,
  subsetTiersInEntry: readonly CharacterCaptainAbilityCoverageTier[],
): boolean {
  const conditions = tier.characterConditions;

  // Negative team conditions ("there are no [PSY] or [INT] characters on your crew") narrow
  // which targets can appear in a team that satisfies this tier — a PSY character cannot share
  // the team with a tier that demands no PSY, so we exclude them up front.
  if (targetMatchesTeamExclusion(tier, target)) {
    return false;
  }

  // Fallback tier: target matches iff it does NOT satisfy any more-specific subset tier in the
  // same entry. This is the natural complement reading of "all other characters".
  if (conditions.fallbackOther) {
    return !subsetTiersInEntry.some((subset) => matchesTierCharacterConditionsInner(subset, target));
  }

  return matchesTierCharacterConditionsInner(tier, target);
}

export function teamSatisfiesCaptainCoverageTeamConditions(
  teamConditions: readonly CaptainCoverageTeamCondition[],
  members: readonly CharacterListItem[],
): boolean {
  const groupedConditions = new Map<string, CaptainCoverageTeamCondition[]>();
  const ungroupedConditions: CaptainCoverageTeamCondition[] = [];

  for (const condition of teamConditions) {
    const group = condition.conditionGroup?.trim();
    if (!group) {
      ungroupedConditions.push(condition);
      continue;
    }
    groupedConditions.set(group, [...(groupedConditions.get(group) ?? []), condition]);
  }

  return (
    ungroupedConditions.every((condition) =>
      captainCoverageTeamConditionSatisfied(condition, members),
    ) &&
    [...groupedConditions.values()].every((conditions) =>
      conditions.some((condition) => captainCoverageTeamConditionSatisfied(condition, members)),
    )
  );
}

function captainCoverageTeamConditionSatisfied(
  condition: CaptainCoverageTeamCondition,
  members: readonly CharacterListItem[],
): boolean {
  if (condition.kind === 'requires-captain' || condition.kind === 'requires-friend-captain') {
    return true;
  }
  if (condition.kind === 'crew-composition' || condition.kind === 'crew-count') {
    return crewCompositionSatisfied(condition, members);
  }
  if (condition.kind === 'crew-exclusion') {
    return crewExclusionSatisfied(condition, members);
  }
  return true;
}

function crewExclusionSatisfied(
  condition: CaptainCoverageTeamCondition,
  members: readonly CharacterListItem[],
): boolean {
  const excludedTypes = condition.types ?? [];
  const excludedClasses = condition.classes ?? [];
  const excludedTags = condition.characterTags ?? [];
  if (excludedTypes.length + excludedClasses.length + excludedTags.length === 0) {
    return true;
  }
  return !members.some((member) =>
    memberSatisfiesCompositionCondition(member, excludedTypes, excludedClasses, excludedTags),
  );
}

function crewCompositionSatisfied(
  condition: CaptainCoverageTeamCondition,
  members: readonly CharacterListItem[],
): boolean {
  if (condition.sameType) {
    return sameTypeCrewCompositionSatisfied(condition, members);
  }

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

function sameTypeCrewCompositionSatisfied(
  condition: CaptainCoverageTeamCondition,
  members: readonly CharacterListItem[],
): boolean {
  const allowedTypes = resolveConditionTypes(condition.types ?? []);
  const counts = new Map<AutoTeamBuilderType, number>();

  for (const member of members) {
    for (const type of resolveMemberTypes(member)) {
      if (allowedTypes.includes(type)) {
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
    }
  }

  if (typeof condition.exactCount === 'number' && condition.exactCount > 0) {
    const exactCount = condition.exactCount;

    return [...counts.values()].some((count) => count === exactCount);
  }
  if (typeof condition.minCount === 'number' && condition.minCount > 0) {
    const minCount = condition.minCount;

    return [...counts.values()].some((count) => count >= minCount);
  }
  return [...counts.values()].some((count) => count > 0);
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
    .filter((entry): entry is AutoTeamBuilderType =>
      AUTO_TEAM_BUILDER_TYPES.includes(entry as AutoTeamBuilderType),
    );
}

function targetMatchesTeamExclusion(
  tier: CharacterCaptainAbilityCoverageTier,
  target: CharacterListItem,
): boolean {
  const exclusionConditions = tier.teamConditions.filter(
    (condition) => condition.kind === 'crew-exclusion',
  );
  if (exclusionConditions.length === 0) {
    return false;
  }
  const targetTypes = target.type.split(',').map((entry) => entry.trim().toUpperCase());
  const targetTags =
    (target as CharacterListItem & { detail?: { characterTags?: string[] } }).detail
      ?.characterTags ?? [];
  return exclusionConditions.some((condition) => {
    const excludedTypes = condition.types ?? [];
    const excludedClasses = condition.classes ?? [];
    const excludedTags = condition.characterTags ?? [];
    if (excludedTypes.some((type) => targetTypes.includes(type.toUpperCase()))) {
      return true;
    }
    if (
      excludedClasses.some((characterClass) =>
        target.classes.some(
          (memberClass) => memberClass.toLowerCase() === characterClass.toLowerCase(),
        ),
      )
    ) {
      return true;
    }
    if (
      excludedTags.some((tag) =>
        targetTags.some((memberTag) => memberTag.toLowerCase() === tag.toLowerCase()),
      )
    ) {
      return true;
    }
    return false;
  });
}

function matchesTierCharacterConditionsInner(
  tier: CharacterCaptainAbilityCoverageTier,
  target: CharacterListItem,
): boolean {
  const conditions = tier.characterConditions;
  const hasSubsetCondition =
    conditions.types.length > 0 ||
    conditions.classes.length > 0 ||
    conditions.characterTags.length > 0 ||
    conditions.costRange !== undefined ||
    conditions.rarityRange !== undefined ||
    conditions.dominantType === true;

  // When a tier has any explicit subset condition (cost / type / class / tag), characters must
  // satisfy that subset to "fully qualify" for the tier — the tier-defining boost only applies to
  // that subset, even if shared crew-wide effects like HP also live in the same tier. When no
  // subset condition exists and the tier is universal, all targets qualify.
  if (!hasSubsetCondition) {
    if (conditions.universal) {
      return true;
    }
    if (conditions.selfOnly) {
      return false;
    }
    return false;
  }

  const targetTypes = target.type.split(',').map((entry) => entry.trim().toUpperCase());
  if (
    conditions.dominantType === true &&
    targetTypes.some((type) =>
      ['DEX', 'STR', 'QCK', 'PSY', 'INT'].includes(type.toUpperCase()),
    )
  ) {
    return true;
  }

  if (conditions.types.length > 0 && conditions.types.some((type) => targetTypes.includes(type))) {
    return true;
  }

  if (
    conditions.classes.length > 0 &&
    conditions.classes.some((characterClass) =>
      target.classes.some(
        (targetClass) => targetClass.toLowerCase() === characterClass.toLowerCase(),
      ),
    )
  ) {
    return true;
  }

  if (conditions.characterTags.length > 0) {
    const targetTags = (target as CharacterListItem & { detail?: { characterTags?: string[] } })
      .detail?.characterTags;
    if (
      Array.isArray(targetTags) &&
      conditions.characterTags.some((tag) =>
        targetTags.some((targetTag) => targetTag.toLowerCase() === tag.toLowerCase()),
      )
    ) {
      return true;
    }
  }

  if (conditions.costRange) {
    const { min, max } = conditions.costRange;
    const meetsMin = min === undefined || target.cost >= min;
    const meetsMax = max === undefined || target.cost <= max;
    if (meetsMin && meetsMax) {
      return true;
    }
  }

  if (conditions.rarityRange) {
    const { min, max } = conditions.rarityRange;
    const meetsMin = min === undefined || target.stars >= min;
    const meetsMax = max === undefined || target.stars <= max;
    if (meetsMin && meetsMax) {
      return true;
    }
  }

  return false;
}

function resolveCaptainCoverageFilterCoverageMode(
  state: Pick<CaptainCoverageFilterState, 'requireFullCoverage'>,
): AutoBuildCaptainAbilityCoverageMode {
  return state.requireFullCoverage ? 'fullAbilityCoverage' : 'simpleBoostScope';
}

export function matchesCaptainCoverageRequiredAbilityFilters(
  abilities: readonly NormalizedBuilderAbility[],
  requirements: readonly AutoBuildAbilityRequirement[],
): boolean {
  if (!requirements.length) {
    return true;
  }

  const captainAbilities = abilities.filter((ability) => ability.source === 'captainAbility');

  return captainAbilities.some((ability) =>
    requirements.some((requirement) => matchesAbilityRequirement(ability, requirement)),
  );
}

export function hasCaptainCoverageSuperTandemData(
  characterDetail: CharacterDetailRecord | null | undefined,
): boolean {
  const superTandemData = characterDetail?.detail.superTandemData;

  return typeof superTandemData === 'object' && superTandemData !== null;
}

export function hasCaptainCoverageSuperTypesClassesData(
  characterDetail: CharacterDetailRecord | null | undefined,
): boolean {
  const superType = characterDetail?.detail.superType;
  const superClass = characterDetail?.detail.superClass;

  return (
    (typeof superType === 'object' && superType !== null) ||
    (typeof superClass === 'object' && superClass !== null)
  );
}
