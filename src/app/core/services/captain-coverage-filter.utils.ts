import {
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';
import { type AutoBuildCaptainAbilityCoverageMode } from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
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
}

export const DEFAULT_CAPTAIN_COVERAGE_FILTER_STATE: CaptainCoverageFilterState = {
  requiredAbilityRequirements: [],
  requireSuperTandem: false,
  requireSuperTypesClasses: false,
  requireCaptainCoverage: true,
  requireFullCoverage: false,
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

  return {
    coverage,
    coverageMode,
    matches:
      matchesCaptainCoverage &&
      matchesRequiredAbilityFilters &&
      matchesSuperTandem &&
      matchesSuperTypesClasses,
    matchesCaptainCoverage,
    matchesRequiredAbilityFilters,
    matchesSuperTandem,
    matchesSuperTypesClasses,
  };
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
