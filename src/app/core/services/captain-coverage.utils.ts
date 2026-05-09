import {
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildCaptainAbilityCoverageMode,
  type AutoBuildCaptainBranchMode,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import {
  type CharacterCaptainAbilityVariant,
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../models/optc.models';
import { normalizeCaptainTagKey } from './captain-tag-conditions.utils';
import { normalizeHtmlToText } from './html-text.utils';

export type CaptainCoverageChipKind = 'class' | 'tag' | 'type';

export interface CaptainCoverageChip {
  kind: CaptainCoverageChipKind;
  label: string;
}

export interface CaptainCoverageClauseResult {
  text: string;
  status: 'covered' | 'neutral' | 'uncovered';
  chips: CaptainCoverageChip[];
}

export interface CaptainCoverageBoosts {
  hp: number;
  atk: number;
}

export interface CaptainCoverageResult {
  boosts: CaptainCoverageBoosts;
  captainText: string;
  chips: CaptainCoverageChip[];
  clauses: CaptainCoverageClauseResult[];
  coveredClauses: string[];
  matches: boolean;
  neutralNotes: string[];
  targetableClauseCount: number;
  uncoveredClauses: string[];
}

export interface CaptainAbilityCoverageSummary {
  captainCoverageClauses: string[];
  fullCoverageClauses: string[];
}

export interface CaptainBoostScopeSummary {
  clauses: string[];
  allCharacters: boolean;
  allowedClasses: string[];
  allowedTypes: AutoTeamBuilderType[];
  allowedCharacterTags: string[];
}

export interface CaptainCoverageOptions {
  coverageMode?: AutoBuildCaptainAbilityCoverageMode;
  branchMode?: AutoBuildCaptainBranchMode | null;
  targetCharacterTags?: readonly string[];
  includeTeamTagClauses?: boolean;
}

export interface CaptainCoverageBranchText {
  key: string;
  label: string;
  text: string;
}

export type CaptainCoverageSingleBranchMode = Exclude<AutoBuildCaptainBranchMode, 'both'>;

export interface CaptainCoverageBranchOption extends CaptainCoverageBranchText {
  mode: CaptainCoverageSingleBranchMode;
  displayName: string;
}

const UNIVERSAL_SCOPE_PATTERN = /\b(?:all|all characters|all units|all crewmates|crew)\b/i;
const FALLBACK_OTHER_SCOPE_PATTERN = /\ball other (?:characters|units|crewmates)\b/i;
const SELF_SCOPE_PATTERN = /\b(?:this character|own attacks|their own attacks)\b/i;
const BRANCH_LABEL_PATTERN =
  /\b(?:Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
const CAPTAIN_BRANCH_PATTERN =
  /\b(Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
const DEFAULT_CAPTAIN_BRANCH_LABELS = new Set([
  'always active',
  'standard captain',
  'captain ability',
  'base captain ability',
  'llb base captain ability',
]);
const CAPTAIN_EFFECT_CLAUSE_SEPARATOR =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)|\s+and\s+(?=(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)/gi;
const CONDITIONAL_CAPTAIN_BOOST_PREFIX_PATTERN =
  /^(?:(?:and|or|also|additionally|furthermore|then|otherwise)\b,?\s*)*(?:if|when)\b/i;
const CAPTAIN_MULTIPLIER_PATTERN =
  /\bby\s+(?:a\s+further\s+|an?\s+additional\s+|another\s+)?\d+(?:\.\d+)?x\b/i;
const INLINE_CONDITIONAL_BOOST_RIDER_PATTERN =
  /,\s*(?:or\s+)?by\s+\d+(?:\.\d+)?x\s+instead\b[^,.;]*/gi;
const BRACKETED_LABEL_PATTERN = /\[([^\]]+)\]/g;
const BOOST_TARGET_FRAGMENT_PATTERNS = [
  /\b(?:of|for)\s+([^.;]{1,220}?)\s+(?:characters|units)\b/gi,
  /\b(?:of|for)\s+(crew)\b/gi,
  /\bboosts?\s+([^.;]{1,220}?)\s+(?:characters|units)(?:'|’)?\s+(?:atk|hp)\b/gi,
  /\bboosts?\s+(crew)(?:'|’)?s?\s+(?:atk|hp)\b/gi,
] as const;

export function summarizeCaptainAbilityCoverageText(
  captainText: string | null | undefined,
): CaptainAbilityCoverageSummary {
  const normalizedCaptainText = normalizeHtmlToText(captainText);

  if (!normalizedCaptainText) {
    return {
      captainCoverageClauses: [],
      fullCoverageClauses: [],
    };
  }

  const captainCoverageClauses = resolveCaptainBoostScope(
    normalizedCaptainText,
    'simpleBoostScope',
  ).clauses;
  const fullCoverageClauses = resolveCaptainBoostScope(
    normalizedCaptainText,
    'fullAbilityCoverage',
  ).clauses;

  return {
    captainCoverageClauses,
    fullCoverageClauses,
  };
}

export function resolveCaptainBoostScope(
  captainText: string | null | undefined,
  coverageMode: AutoBuildCaptainAbilityCoverageMode = 'fullAbilityCoverage',
): CaptainBoostScopeSummary {
  const normalizedCaptainText = normalizeHtmlToText(captainText);

  if (!normalizedCaptainText) {
    return createEmptyCaptainBoostScope();
  }

  const clauses =
    coverageMode === 'simpleBoostScope'
      ? extractDefaultCaptainBoostClauses(extractDefaultCaptainBoostText(normalizedCaptainText))
      : extractCaptainBoostScopeClauses(normalizedCaptainText, true);

  return clauses.reduce<CaptainBoostScopeSummary>((scope, clause) => {
    const normalizedClause = normalizeCoverageClause(clause);
    const allowedTypes = extractAllowedTypesFromBoostClause(normalizedClause);
    const allowedClasses = extractAllowedClassesFromBoostClause(normalizedClause);
    const allowedCharacterTags = extractAllowedCharacterTagsFromBoostClause(normalizedClause);

    return {
      clauses: [...scope.clauses, normalizedClause],
      allCharacters: scope.allCharacters || boostClauseHasUniversalScope(normalizedClause),
      allowedClasses: mergeUniqueValues(scope.allowedClasses, allowedClasses),
      allowedTypes: mergeOrderedValues(AUTO_TEAM_BUILDER_TYPES, scope.allowedTypes, allowedTypes),
      allowedCharacterTags: mergeUniqueValues(scope.allowedCharacterTags, allowedCharacterTags),
    };
  }, createEmptyCaptainBoostScope());
}

export function resolveCaptainCoverage(
  captain: CharacterDetailRecord,
  target: CharacterListItem,
  options: CaptainCoverageOptions = {},
): CaptainCoverageResult {
  const branches = resolveRequiredCaptainCoverageBranchTexts(captain);

  if (!branches.length) {
    return createEmptyCoverageResult('');
  }

  const forcedBranch = resolveCaptainCoverageBranchForMode(branches, options.branchMode);

  if (forcedBranch) {
    return resolveCaptainCoverageForText(forcedBranch.text, target, options);
  }

  const branchResults = branches.map((branch) =>
    resolveCaptainCoverageForText(branch.text, target, options),
  );

  if (branchResults.length === 1) {
    return branchResults[0]!;
  }

  if (
    options.branchMode !== 'both' &&
    shouldUseAlternativeCaptainCoverageBranches(captain, branches)
  ) {
    return mergeCaptainCoverageAlternativeBranchResults(branchResults);
  }

  return mergeCaptainCoverageBranchResults(branchResults);
}

function resolveCaptainCoverageForText(
  captainText: string,
  target: CharacterListItem,
  options: CaptainCoverageOptions = {},
): CaptainCoverageResult {
  const coverageMode = options.coverageMode ?? 'fullAbilityCoverage';
  const resolvedClauses = resolveCaptainBoostScope(captainText, coverageMode).clauses.map(
    (clause) => resolveCaptainCoverageClause(target, clause, options),
  );
  const clauses = resolvedClauses;
  const targetableClauses = clauses.filter((clause) => clause.status !== 'neutral');
  const uncoveredClauses = targetableClauses
    .filter((clause) => clause.status === 'uncovered')
    .map((clause) => clause.text);
  const coveredClauses = targetableClauses
    .filter((clause) => clause.status === 'covered')
    .map((clause) => clause.text);

  return {
    boosts: resolveCaptainCoverageBoosts(target, captainText, options),
    captainText,
    chips: dedupeCoverageChips(targetableClauses.flatMap((clause) => clause.chips)),
    clauses,
    coveredClauses,
    matches: targetableClauses.length > 0 && uncoveredClauses.length === 0,
    neutralNotes: clauses
      .filter((clause) => clause.status === 'neutral')
      .map((clause) => clause.text),
    targetableClauseCount: targetableClauses.length,
    uncoveredClauses,
  };
}

export function resolveRequiredCaptainCoverageBranchTexts(
  captain: CharacterDetailRecord,
): CaptainCoverageBranchText[] {
  const dualBaseVariants = resolveDualBaseCaptainAbilityVariants(
    captain.detail.captainAbilityVariants,
  );

  if (dualBaseVariants.length === 2) {
    return dualBaseVariants;
  }

  const captainText = normalizeHtmlToText(captain.detail.captainAbility);

  return captainText
    ? [
        {
          key: 'captain',
          label: 'Captain Ability',
          text: captainText,
        },
      ]
    : [];
}

export function resolveCaptainCoverageBranchOptions(
  captain: CharacterDetailRecord,
): CaptainCoverageBranchOption[] {
  const branches = resolveDualBaseCaptainAbilityVariants(captain.detail.captainAbilityVariants);

  return branches.map((branch, index) => {
    const mode = index === 0 ? 'character1' : 'character2';

    return {
      ...branch,
      mode,
      displayName: resolveCaptainCoverageBranchDisplayName(captain, mode, branch.label),
    };
  });
}

export function hasCaptainCoverageBranchOptions(captain: CharacterDetailRecord): boolean {
  return resolveCaptainCoverageBranchOptions(captain).length === 2;
}

export function isVsCaptainCoverageBranchCaptain(captain: CharacterDetailRecord): boolean {
  const branches = resolveRequiredCaptainCoverageBranchTexts(captain);

  return shouldUseAlternativeCaptainCoverageBranches(captain, branches);
}

export function resolveCaptainCoverageBranchDisplay(
  captain: CharacterDetailRecord,
  mode: AutoBuildCaptainBranchMode,
): { label: string; displayName: string } {
  if (mode === 'both') {
    return {
      label: 'Both Captain Ability branches',
      displayName: 'Both',
    };
  }

  const branch = resolveCaptainCoverageBranchOptions(captain).find(
    (option) => option.mode === mode,
  );

  return {
    label: branch?.label ?? resolveCaptainCoverageBranchFallbackLabel(mode),
    displayName:
      branch?.displayName ?? resolveCaptainCoverageBranchDisplayName(captain, mode, branch?.label),
  };
}

export function hasSelfOnlyCaptainCoverageText(
  captain: CharacterDetailRecord,
  options: Pick<CaptainCoverageOptions, 'branchMode'> = {},
): boolean {
  const branches = resolveRequiredCaptainCoverageBranchTexts(captain);
  const forcedBranch = resolveCaptainCoverageBranchForMode(branches, options.branchMode);
  const targetBranches = forcedBranch ? [forcedBranch] : branches;

  return targetBranches.some((branch) =>
    splitCaptainEffectClauses(branch.text).some((clause) => {
      const normalizedClause = normalizeCoverageClause(clause);

      return (
        /\bboosts?\b/i.test(normalizedClause) &&
        /\b(?:atk|hp)\b/i.test(normalizedClause) &&
        CAPTAIN_MULTIPLIER_PATTERN.test(normalizedClause) &&
        isSelfOnlyCaptainBoostMatch(normalizedClause)
      );
    }),
  );
}

function resolveDualBaseCaptainAbilityVariants(
  variants: readonly CharacterCaptainAbilityVariant[],
): CaptainCoverageBranchText[] {
  const character1 = variants.find((variant) => isDualBaseCaptainAbilityVariant(variant, 1));
  const character2 = variants.find((variant) => isDualBaseCaptainAbilityVariant(variant, 2));

  if (!character1 || !character2) {
    return [];
  }

  const branches = [character1, character2]
    .map((variant) => ({
      key: variant.key,
      label: variant.label,
      text: normalizeHtmlToText(variant.text),
    }))
    .filter((variant) => variant.text.length > 0);

  return branches.length === 2 ? branches : [];
}

function resolveCaptainCoverageBranchForMode(
  branches: readonly CaptainCoverageBranchText[],
  mode: AutoBuildCaptainBranchMode | null | undefined,
): CaptainCoverageBranchText | null {
  if (!mode || mode === 'both' || branches.length !== 2) {
    return null;
  }

  return branches[mode === 'character1' ? 0 : 1] ?? null;
}

function isDualBaseCaptainAbilityVariant(
  variant: CharacterCaptainAbilityVariant,
  characterNumber: 1 | 2,
): boolean {
  const key = normalizeVariantIdentity(variant.key);
  const label = normalizeVariantIdentity(variant.label);
  const characterToken = `character${characterNumber}`;

  return key === characterToken || label.includes(characterToken);
}

function normalizeVariantIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveCaptainCoverageBranchDisplayName(
  captain: CharacterDetailRecord,
  mode: CaptainCoverageSingleBranchMode,
  fallbackLabel: string | undefined,
): string {
  const sideNames = resolveCaptainCoverageSideNames(captain);
  const sideName = sideNames[mode === 'character1' ? 0 : 1];

  if (sideName) {
    return sideName;
  }

  return (
    normalizeCaptainCoverageBranchLabel(fallbackLabel) ??
    resolveCaptainCoverageBranchFallbackLabel(mode)
  );
}

function resolveCaptainCoverageSideNames(captain: CharacterDetailRecord): string[] {
  const baseName = captain.name
    .split(/\s+-\s+/)[0]
    ?.trim()
    .replace(/\s+/g, ' ');

  if (!baseName) {
    return [];
  }

  const vsNames = baseName
    .split(/\s+VS\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (vsNames.length === 2) {
    return vsNames;
  }

  const pairedNames = baseName
    .split(/\s+(?:&|\+|\/)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return pairedNames.length === 2 ? pairedNames : [];
}

function normalizeCaptainCoverageBranchLabel(label: string | undefined): string | null {
  if (!label) {
    return null;
  }

  if (/\bcharacter\s*1\b/i.test(label)) {
    return 'Character 1';
  }

  if (/\bcharacter\s*2\b/i.test(label)) {
    return 'Character 2';
  }

  const normalizedLabel = label.trim().replace(/\s+/g, ' ');

  return normalizedLabel || null;
}

function resolveCaptainCoverageBranchFallbackLabel(mode: CaptainCoverageSingleBranchMode): string {
  return mode === 'character1' ? 'Character 1' : 'Character 2';
}

function mergeCaptainCoverageBranchResults(
  branchResults: readonly CaptainCoverageResult[],
): CaptainCoverageResult {
  const clauses = branchResults.flatMap((result) => result.clauses);
  const targetableClauses = clauses.filter((clause) => clause.status !== 'neutral');

  return {
    boosts: mergeCaptainCoverageBranchBoosts(branchResults),
    captainText: branchResults.map((result) => result.captainText).join('. '),
    chips: dedupeCoverageChips(targetableClauses.flatMap((clause) => clause.chips)),
    clauses,
    coveredClauses: branchResults.flatMap((result) => result.coveredClauses),
    matches: branchResults.every((result) => result.matches),
    neutralNotes: branchResults.flatMap((result) => result.neutralNotes),
    targetableClauseCount: targetableClauses.length,
    uncoveredClauses: branchResults.flatMap((result) => result.uncoveredClauses),
  };
}

function mergeCaptainCoverageAlternativeBranchResults(
  branchResults: readonly CaptainCoverageResult[],
): CaptainCoverageResult {
  const matchingBranchResults = branchResults.filter((result) => result.matches);
  const selectedBranchResults = matchingBranchResults.length
    ? matchingBranchResults
    : branchResults;
  const clauses = selectedBranchResults.flatMap((result) => result.clauses);
  const targetableClauses = clauses.filter((clause) => clause.status !== 'neutral');

  return {
    boosts: matchingBranchResults.length
      ? mergeCaptainCoverageAlternativeBranchBoosts(matchingBranchResults)
      : { hp: 0, atk: 0 },
    captainText: branchResults.map((result) => result.captainText).join('. '),
    chips: dedupeCoverageChips(targetableClauses.flatMap((clause) => clause.chips)),
    clauses,
    coveredClauses: selectedBranchResults.flatMap((result) => result.coveredClauses),
    matches: matchingBranchResults.length > 0,
    neutralNotes: selectedBranchResults.flatMap((result) => result.neutralNotes),
    targetableClauseCount: targetableClauses.length,
    uncoveredClauses: matchingBranchResults.length
      ? []
      : selectedBranchResults.flatMap((result) => result.uncoveredClauses),
  };
}

function shouldUseAlternativeCaptainCoverageBranches(
  captain: CharacterDetailRecord,
  branches: readonly CaptainCoverageBranchText[],
): boolean {
  if (branches.length < 2) {
    return false;
  }

  const identityText = [captain.name, captain.searchText, ...branches.map((branch) => branch.text)]
    .filter(Boolean)
    .join(' ');

  return /\bvs\b/i.test(identityText) || /\bVS Gauge\b/i.test(identityText);
}

function mergeCaptainCoverageBranchBoosts(
  branchResults: readonly CaptainCoverageResult[],
): CaptainCoverageBoosts {
  return {
    hp: resolveLowestPositiveBranchBoost(branchResults.map((result) => result.boosts.hp)),
    atk: resolveLowestPositiveBranchBoost(branchResults.map((result) => result.boosts.atk)),
  };
}

function mergeCaptainCoverageAlternativeBranchBoosts(
  branchResults: readonly CaptainCoverageResult[],
): CaptainCoverageBoosts {
  return {
    hp: Math.max(0, ...branchResults.map((result) => result.boosts.hp)),
    atk: Math.max(0, ...branchResults.map((result) => result.boosts.atk)),
  };
}

function resolveLowestPositiveBranchBoost(values: readonly number[]): number {
  return values.length > 0 && values.every((value) => value > 0) ? Math.min(...values) : 0;
}

function resolveCaptainCoverageBoosts(
  target: CharacterListItem,
  captainText: string,
  options: CaptainCoverageOptions = {},
): CaptainCoverageBoosts {
  return resolveCaptainBoostScope(captainText, 'simpleBoostScope').clauses.reduce(
    (boosts, clause) => {
      const coverage = resolveCaptainCoverageClause(target, clause, options);

      if (coverage.status !== 'covered') {
        return boosts;
      }

      return {
        hp: Math.max(boosts.hp, extractCaptainBoost(clause, 'hp')),
        atk: Math.max(boosts.atk, extractCaptainBoost(clause, 'atk')),
      };
    },
    { hp: 0, atk: 0 },
  );
}

function resolveTargetCaptainTagKeys(
  target: CharacterListItem,
  options: CaptainCoverageOptions,
): string[] {
  const maybeDetailedTarget = target as CharacterListItem & Partial<CharacterDetailRecord>;
  const tags = options.targetCharacterTags ?? maybeDetailedTarget.detail?.characterTags ?? [];

  return [...new Set(tags.map((tag) => normalizeCaptainTagKey(tag)).filter(Boolean))];
}

function resolveCaptainCoverageClause(
  target: CharacterListItem,
  clause: string,
  options: CaptainCoverageOptions,
): CaptainCoverageClauseResult {
  const normalizedClause = normalizeCoverageClause(clause);
  const chips: CaptainCoverageChip[] = [];

  const isUniversal = boostClauseHasUniversalScope(normalizedClause);
  const matchingTypes = resolveMatchingTypeScopes(normalizedClause, target);
  const matchingClasses = resolveMatchingClassScopes(normalizedClause, target);
  const matchingTags = resolveMatchingCharacterTagScopes(normalizedClause, target, options);
  const hasTypeScope = extractAllowedTypesFromBoostClause(normalizedClause).length > 0;
  const hasClassScope = extractAllowedClassesFromBoostClause(normalizedClause).length > 0;
  const hasCharacterTagScope =
    extractAllowedCharacterTagsFromBoostClause(normalizedClause).length > 0;

  matchingTypes.forEach((type) =>
    chips.push({
      kind: 'type',
      label: type,
    }),
  );
  matchingClasses.forEach((characterClass) =>
    chips.push({
      kind: 'class',
      label: characterClass,
    }),
  );
  matchingTags.forEach((tag) =>
    chips.push({
      kind: 'tag',
      label: tag,
    }),
  );

  const hasTargetScope = isUniversal || hasTypeScope || hasClassScope || hasCharacterTagScope;

  if (!hasTargetScope) {
    return {
      text: normalizedClause,
      status: 'neutral',
      chips,
    };
  }

  const typeMatches = hasTypeScope ? matchingTypes.length > 0 : false;
  const classMatches = hasClassScope ? matchingClasses.length > 0 : false;
  const tagMatches = hasCharacterTagScope ? matchingTags.length > 0 : false;
  const covered = isUniversal || typeMatches || classMatches || tagMatches;

  return {
    text: normalizedClause,
    status: covered ? 'covered' : 'uncovered',
    chips: dedupeCoverageChips(chips),
  };
}

function extractDefaultCaptainBoostText(captainText: string): string {
  const branches = extractCaptainBranches(captainText);

  if (!branches.length) {
    return captainText;
  }

  const defaultBranches = branches
    .filter((branch) => DEFAULT_CAPTAIN_BRANCH_LABELS.has(branch.label))
    .map((branch) => branch.text)
    .filter(Boolean);

  return defaultBranches.length ? defaultBranches.join('. ') : (branches[0]?.text ?? captainText);
}

function extractCaptainBranches(text: string): Array<{ label: string; text: string }> {
  const matches = [...text.matchAll(CAPTAIN_BRANCH_PATTERN)];

  return matches
    .map((match, index) => {
      const nextMatch = matches[index + 1] ?? null;
      const start = (match.index ?? 0) + match[0].length;
      const end = nextMatch?.index ?? text.length;

      return {
        label: String(match[1] ?? '').toLowerCase(),
        text: text.slice(start, end).trim(),
      };
    })
    .filter((branch) => branch.text.length > 0);
}

function extractDefaultCaptainBoostClauses(text: string): string[] {
  return extractCaptainBoostScopeClauses(text, false);
}

function extractCaptainBoostScopeClauses(text: string, includeConditional: boolean): string[] {
  return splitCaptainEffectClauses(text.replace(BRANCH_LABEL_PATTERN, '. '))
    .map(stripInlineConditionalBoostRiders)
    .filter(
      (clause) =>
        (includeConditional || !isConditionalCaptainBoostClause(clause)) &&
        isCaptainBoostScopeClause(clause),
    );
}

function isCaptainBoostScopeClause(clause: string): boolean {
  const normalizedClause = normalizeCoverageClause(clause);

  return (
    /\bboosts?\b/i.test(normalizedClause) &&
    /\b(?:atk|hp)\b/i.test(normalizedClause) &&
    CAPTAIN_MULTIPLIER_PATTERN.test(normalizedClause) &&
    !SELF_SCOPE_PATTERN.test(normalizedClause) &&
    !FALLBACK_OTHER_SCOPE_PATTERN.test(normalizedClause) &&
    (boostClauseHasUniversalScope(normalizedClause) ||
      extractAllowedTypesFromBoostClause(normalizedClause).length > 0 ||
      extractAllowedClassesFromBoostClause(normalizedClause).length > 0 ||
      extractAllowedCharacterTagsFromBoostClause(normalizedClause).length > 0)
  );
}

function stripInlineConditionalBoostRiders(clause: string): string {
  return normalizeCoverageClause(clause.replace(INLINE_CONDITIONAL_BOOST_RIDER_PATTERN, ''));
}

function splitCaptainEffectClauses(text: string): string[] {
  return splitCaptainSentences(text)
    .flatMap((clause) =>
      isConditionalCaptainBoostClause(clause)
        ? [clause]
        : clause.split(CAPTAIN_EFFECT_CLAUSE_SEPARATOR),
    )
    .map(normalizeCoverageClause)
    .filter(Boolean);
}

function splitCaptainSentences(text: string): string[] {
  const clauses: string[] = [];
  let current = '';

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const previousCharacter = text[index - 1] ?? '';
    const nextCharacter = text[index + 1] ?? '';
    const isDecimalPoint =
      character === '.' && /\d/.test(previousCharacter) && /\d/.test(nextCharacter);

    if ((character === '.' && !isDecimalPoint) || character === ';') {
      clauses.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  clauses.push(current);

  return clauses;
}

function isConditionalCaptainBoostClause(clause: string): boolean {
  return CONDITIONAL_CAPTAIN_BOOST_PREFIX_PATTERN.test(clause.trim());
}

function extractCaptainBoost(clause: string, stat: 'atk' | 'hp'): number {
  const pattern = new RegExp(
    `\\b${stat}\\b[^.;]*?\\bby\\s+(?:a\\s+further\\s+|an?\\s+additional\\s+|another\\s+)?(\\d+(?:\\.\\d+)?)x`,
    'gi',
  );

  return [...clause.matchAll(pattern)].reduce((highest, match) => {
    if (isSelfOnlyCaptainBoostMatch(match[0])) {
      return highest;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) && value > highest ? value : highest;
  }, 0);
}

function isSelfOnlyCaptainBoostMatch(text: string): boolean {
  return SELF_SCOPE_PATTERN.test(text) && !UNIVERSAL_SCOPE_PATTERN.test(text);
}

function normalizeCoverageClause(clause: string): string {
  return clause
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\s]+/, '')
    .replace(/[,.;:\s]+$/, '')
    .trim();
}

function resolveMatchingTypeScopes(
  clause: string,
  target: CharacterListItem,
): AutoTeamBuilderType[] {
  const targetTypes = resolveCharacterTypeTokens(target.type);
  const allowedTypes = extractAllowedTypesFromBoostClause(clause);

  if (!targetTypes.length || !targetTypes.every((type) => allowedTypes.includes(type))) {
    return [];
  }

  return AUTO_TEAM_BUILDER_TYPES.filter(
    (type) => targetTypes.includes(type) && allowedTypes.includes(type),
  );
}

function resolveCharacterTypeTokens(typeValue: string): AutoTeamBuilderType[] {
  return [...new Set(typeValue.split(',').map((entry) => entry.trim().toUpperCase()))].filter(
    (entry): entry is AutoTeamBuilderType =>
      AUTO_TEAM_BUILDER_TYPES.includes(entry as AutoTeamBuilderType),
  );
}

function extractAllowedTypesFromBoostClause(clause: string): AutoTeamBuilderType[] {
  const fragments = extractBoostTargetFragments(clause);

  return AUTO_TEAM_BUILDER_TYPES.filter((type) =>
    fragments.some((fragment) => textMatchesTypeScope(fragment, type)),
  );
}

function textMatchesTypeScope(clause: string, type: AutoTeamBuilderType): boolean {
  return new RegExp(`(?:\\[${type}\\]|\\b${type}\\b)`, 'i').test(clause);
}

function resolveMatchingClassScopes(clause: string, target: CharacterListItem): string[] {
  const targetClasses = target.classes.map((characterClass) => characterClass.toLowerCase());

  return extractAllowedClassesFromBoostClause(clause).filter((characterClass) =>
    targetClasses.includes(characterClass.toLowerCase()),
  );
}

function extractAllowedClassesFromBoostClause(clause: string): string[] {
  const fragments = extractBoostTargetFragments(clause);

  return AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    fragments.some((fragment) =>
      new RegExp(`\\b${escapeRegExp(characterClass)}\\b`, 'i').test(fragment),
    ),
  );
}

function resolveMatchingCharacterTagScopes(
  clause: string,
  target: CharacterListItem,
  options: CaptainCoverageOptions,
): string[] {
  const targetTagKeys = resolveTargetCaptainTagKeys(target, options);

  return extractAllowedCharacterTagsFromBoostClause(clause).filter((tag) =>
    targetTagKeys.includes(normalizeCaptainTagKey(tag)),
  );
}

function extractAllowedCharacterTagsFromBoostClause(clause: string): string[] {
  return [
    ...new Set(
      extractBoostTargetFragments(clause)
        .flatMap((fragment) =>
          [...fragment.matchAll(BRACKETED_LABEL_PATTERN)].map((match) =>
            String(match[1] ?? '').trim(),
          ),
        )
        .filter((label) => label.length > 0)
        .filter(
          (label) =>
            !AUTO_TEAM_BUILDER_TYPES.some(
              (type) => normalizeCaptainTagKey(type) === normalizeCaptainTagKey(label),
            ),
        )
        .filter(
          (label) =>
            !AUTO_TEAM_BUILDER_CLASSES.some(
              (characterClass) =>
                normalizeCaptainTagKey(characterClass) === normalizeCaptainTagKey(label),
            ),
        ),
    ),
  ];
}

function extractBoostTargetFragments(clause: string): string[] {
  return [
    ...new Set(
      BOOST_TARGET_FRAGMENT_PATTERNS.flatMap((pattern) =>
        [...clause.matchAll(pattern)].map((match) => normalizeCoverageClause(match[1] ?? '')),
      ).filter(Boolean),
    ),
  ];
}

function boostClauseHasUniversalScope(clause: string): boolean {
  if (FALLBACK_OTHER_SCOPE_PATTERN.test(clause)) {
    return false;
  }

  return extractBoostTargetFragments(clause).some((fragment) =>
    UNIVERSAL_SCOPE_PATTERN.test(fragment),
  );
}

function createEmptyCaptainBoostScope(): CaptainBoostScopeSummary {
  return {
    clauses: [],
    allCharacters: false,
    allowedClasses: [],
    allowedTypes: [],
    allowedCharacterTags: [],
  };
}

function mergeUniqueValues<T extends string>(existing: T[], incoming: readonly T[]): T[] {
  return [...existing, ...incoming].filter(
    (value, index, values) =>
      values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index,
  );
}

function mergeOrderedValues<T extends string>(
  orderedValues: readonly T[],
  existing: T[],
  incoming: readonly T[],
): T[] {
  const selected = new Set([...existing, ...incoming]);

  return orderedValues.filter((value) => selected.has(value));
}

function dedupeCoverageChips(chips: CaptainCoverageChip[]): CaptainCoverageChip[] {
  const seen = new Set<string>();

  return chips.filter((chip) => {
    const key = `${chip.kind}:${chip.label.toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createEmptyCoverageResult(captainText: string): CaptainCoverageResult {
  return {
    boosts: { hp: 0, atk: 0 },
    captainText,
    chips: [],
    clauses: [],
    coveredClauses: [],
    matches: false,
    neutralNotes: [],
    targetableClauseCount: 0,
    uncoveredClauses: [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
