import {
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';
import { type AutoBuildCaptainAbilityCoverageMode } from '../models/auto-team-builder.models';
import {
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../models/optc.models';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import {
  type CaptainCoverageResult,
  resolveCaptainCoverage,
} from './captain-coverage.utils';

export type CaptainCoverageFilterKey =
  | 'required'
  | 'superTandem'
  | 'superTypesClasses'
  | 'captainCoverage'
  | 'fullCoverage';

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

export const DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE: CaptainCoverageFilterState = {
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
  const subsetTiers = tiers.filter((tier) => !tier.characterConditions.fallbackOther);
  return requiredTiers.some((tierNumber) => {
    const tier = tiers.find((entry) => entry.tier === tierNumber);
    if (!tier) {
      return false;
    }
    return matchesCaptainCoverageTier(tier, target, subsetTiers);
  });
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

  return false;
}

export function resolveCaptainCoverageFilterCoverageMode(
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
