import {
  AUTO_TEAM_BUILDER_TYPES,
  resolveAutoBuildAvoidMode,
  type AutoBuildAvoidMode,
  type AutoBuildAvoidPreferRules,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { normalizeCharacterFacetSelection } from './character-facet-filter.utils';

/**
 * 869f63gma. One reader and one writer for a Saved Enemy's avoid and prefer rules.
 *
 * The five fields travel through storage (`UserStateService.normalizeSavedEnemy`), the Saved
 * Enemies file (`saved-enemies-transfer.utils.ts`), the Auto Team Builder preset
 * (`auto-team-builder-export.utils.ts`), the page and the search input. Each of those had its own
 * copy of "trim, de-duplicate, keep the known types" for the fields that came before; five more
 * copies is how one of them drifts, so every one of them reads and writes through here.
 */

export function createEmptyAvoidPreferRules(): AutoBuildAvoidPreferRules {
  return {
    avoidedTypes: [],
    avoidedClasses: [],
    avoidMode: 'hard',
    preferredTypes: [],
    preferredClasses: [],
  };
}

/**
 * Reads the five fields off anything - a stored enemy, a file, a preset's filters - and never
 * throws. A type is upper-cased and kept only when it is one of the five; a class is trimmed and
 * de-duplicated case-insensitively in the case it was written, as `selectedClasses` is. Both go
 * through `normalizeCharacterFacetSelection`, the normaliser every type and class filter shares.
 * A mode that is not `soft` is `hard`.
 */
export function normalizeAvoidPreferRules(value: unknown): AutoBuildAvoidPreferRules {
  const record =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    avoidedTypes: normalizeRuleTypes(record['avoidedTypes']),
    avoidedClasses: normalizeRuleClasses(record['avoidedClasses']),
    avoidMode: resolveAutoBuildAvoidMode({
      avoidMode: record['avoidMode'] as AutoBuildAvoidMode | undefined,
    }),
    preferredTypes: normalizeRuleTypes(record['preferredTypes']),
    preferredClasses: normalizeRuleClasses(record['preferredClasses']),
  };
}

export function hasAvoidRules(
  rules: Pick<AutoBuildAvoidPreferRules, 'avoidedTypes' | 'avoidedClasses'>,
): boolean {
  return rules.avoidedTypes.length > 0 || rules.avoidedClasses.length > 0;
}

export function hasAvoidPreferRules(rules: AutoBuildAvoidPreferRules): boolean {
  return (
    hasAvoidRules(rules) || rules.preferredTypes.length > 0 || rules.preferredClasses.length > 0
  );
}

/**
 * The same rules with every empty field left out, and `avoidMode` only beside an avoided value.
 *
 * Sparse on purpose, wherever they are written. A Saved Enemy, a preset or a search input without
 * a rule then stays byte-identical to what it was before the rules existed - and that is what
 * keeps an older Drive backup and this device agreeing: the sync review compares each enemy key by
 * key, so one empty `avoidedTypes: []` would list every saved enemy as changed.
 */
export function toSparseAvoidPreferFields(
  rules: AutoBuildAvoidPreferRules,
): Partial<AutoBuildAvoidPreferRules> {
  return {
    ...(rules.avoidedTypes.length ? { avoidedTypes: [...rules.avoidedTypes] } : {}),
    ...(rules.avoidedClasses.length ? { avoidedClasses: [...rules.avoidedClasses] } : {}),
    ...(hasAvoidRules(rules) ? { avoidMode: rules.avoidMode } : {}),
    ...(rules.preferredTypes.length ? { preferredTypes: [...rules.preferredTypes] } : {}),
    ...(rules.preferredClasses.length ? { preferredClasses: [...rules.preferredClasses] } : {}),
  };
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function normalizeRuleTypes(value: unknown): AutoTeamBuilderType[] {
  return normalizeCharacterFacetSelection('type', {
    values: readStrings(value),
    matchMode: 'any',
  }).values.filter((type): type is AutoTeamBuilderType =>
    AUTO_TEAM_BUILDER_TYPES.includes(type as AutoTeamBuilderType),
  );
}

function normalizeRuleClasses(value: unknown): string[] {
  return normalizeCharacterFacetSelection('class', {
    values: readStrings(value),
    matchMode: 'any',
  }).values;
}
