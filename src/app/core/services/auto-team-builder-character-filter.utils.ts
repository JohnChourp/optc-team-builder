import { type CharacterDetailRecord, type NormalizedSuperSpecialCriteria } from '../models/optc.models';
import {
  resolveCaptainBoostScope,
  resolveRequiredCaptainCoverageBranchTexts,
} from './captain-coverage.utils';
import {
  normalizeCaptainTagKey,
  parseCaptainTagConditionBranches,
} from './captain-tag-conditions.utils';
import { normalizeAutoBuildCharacterMatchKey } from './auto-team-builder.utils';

export interface AutoBuildCharacterRequirementFilters {
  characterNames: string[];
  characterTags: string[];
}

export function extractAutoBuildCharacterRequirementFilters(
  character: CharacterDetailRecord,
): AutoBuildCharacterRequirementFilters {
  const tagValues = new Map<string, string>();
  const nameValues = new Map<string, string>();
  const addTag = (tag: string): void => {
    const normalizedTag = normalizeCaptainTagKey(tag);

    if (normalizedTag.length > 0 && !tagValues.has(normalizedTag)) {
      tagValues.set(normalizedTag, tag.trim().replace(/^\[([^\]]+)\]$/, '$1'));
    }
  };
  const addName = (name: string): void => {
    const normalizedName = normalizeAutoBuildCharacterMatchKey(name);

    if (normalizedName.length > 0 && !nameValues.has(normalizedName)) {
      nameValues.set(normalizedName, name.trim().replace(/^\[([^\]]+)\]$/, '$1'));
    }
  };

  resolveCaptainBoostScope(character.detail.captainAbility, 'fullAbilityCoverage')
    .allowedCharacterTags.forEach(addTag);
  resolveRequiredCaptainCoverageBranchTexts(character).forEach((branch) =>
    parseCaptainTagConditionBranches(branch.text).forEach((tagBranch) =>
      tagBranch.labels.forEach(addTag),
    ),
  );
  collectCriteriaFilters(character.detail.superSpecialCriteria, addTag, addName);
  collectCriteriaFilters(character.detail.superTandemData?.criteria, addTag, addName);

  return {
    characterNames: [...nameValues.values()],
    characterTags: [...tagValues.values()],
  };
}

export function hasAutoBuildCharacterRequirementFilters(character: CharacterDetailRecord): boolean {
  const filters = extractAutoBuildCharacterRequirementFilters(character);

  return filters.characterNames.length > 0 || filters.characterTags.length > 0;
}

function collectCriteriaFilters(
  criteria: NormalizedSuperSpecialCriteria | null | undefined,
  addTag: (tag: string) => void,
  addName: (name: string) => void,
): void {
  if (!criteria) {
    return;
  }

  criteria.rosterBranches.forEach((branch) => {
    if (branch.branchType !== 'character_count_any') {
      return;
    }

    branch.options.forEach((option) => {
      if (/^\s*\[[^\]]+\]\s*$/.test(option.label)) {
        addTag(option.label);
      } else {
        addName(option.label);
      }
    });
  });
}
