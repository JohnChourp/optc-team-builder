import {
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildCaptainAbilityCoverageMode,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import {
  type CaptainTagConditionBranch,
  normalizeCaptainTagKey,
  parseCaptainTagConditionBranches,
} from './captain-tag-conditions.utils';
import { normalizeHtmlToText } from './html-text.utils';

export type CaptainCoverageChipKind = 'class' | 'cost' | 'self' | 'tag' | 'type' | 'universal';

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

export interface CaptainCoverageOptions {
  coverageMode?: AutoBuildCaptainAbilityCoverageMode;
  targetCharacterTags?: readonly string[];
  includeTeamTagClauses?: boolean;
}

interface CostScope {
  label: string;
  matches: boolean;
}

const UNIVERSAL_SCOPE_PATTERN = /\b(?:all characters|all units|all crewmates|crew)\b/i;
const SELF_SCOPE_PATTERN = /\b(?:this character|own attacks|their own attacks)\b/i;
const TARGETABLE_CHARACTER_EFFECT_PATTERN =
  /\b(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b/i;
const BRANCH_LABEL_PATTERN =
  /\b(?:Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
const CAPTAIN_BRANCH_PATTERN =
  /\b(Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
const CLAUSE_BOUNDARY_PATTERN =
  /(?:[.;]\s+|,\s+(?=(?:and\s+)?(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)|\s+and\s+(?=(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b))/gi;
const DEFAULT_CAPTAIN_BRANCH_LABELS = new Set([
  'always active',
  'standard captain',
  'captain ability',
  'base captain ability',
  'llb base captain ability',
]);
const CAPTAIN_EFFECT_CLAUSE_SEPARATOR =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)|\s+and\s+(?=(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)/gi;

export function resolveCaptainCoverage(
  captain: CharacterDetailRecord,
  target: CharacterListItem,
  options: CaptainCoverageOptions = {},
): CaptainCoverageResult {
  const captainText = normalizeHtmlToText(captain.detail.captainAbility);
  const coverageMode = options.coverageMode ?? 'fullAbilityCoverage';

  if (!captainText) {
    return createEmptyCoverageResult(captainText);
  }

  const tagConditionBranches =
    coverageMode === 'fullAbilityCoverage' && options.includeTeamTagClauses !== false
      ? parseCaptainTagConditionBranches(captainText)
      : [];
  const captainClauses =
    coverageMode === 'simpleBoostScope'
      ? extractDefaultCaptainBoostClauses(extractDefaultCaptainBoostText(captainText))
      : splitCaptainCoverageClauses(captainText);
  const resolvedClauses = [
    ...captainClauses.map((clause) => resolveCaptainCoverageClause(captain, target, clause)),
    ...resolveCaptainTagCoverageClauses(target, tagConditionBranches, options),
  ];
  const hasNonSelfOnlyTargetableClause = resolvedClauses.some(
    (clause) => clause.status !== 'neutral' && !isUnmatchedSelfOnlyClause(clause),
  );
  const clauses = hasNonSelfOnlyTargetableClause
    ? resolvedClauses.map((clause) =>
        isUnmatchedSelfOnlyClause(clause)
          ? {
              ...clause,
              status: 'neutral' as const,
            }
          : clause,
      )
    : resolvedClauses;
  const targetableClauses = clauses.filter((clause) => clause.status !== 'neutral');
  const uncoveredClauses = targetableClauses
    .filter((clause) => clause.status === 'uncovered')
    .map((clause) => clause.text);
  const coveredClauses = targetableClauses
    .filter((clause) => clause.status === 'covered')
    .map((clause) => clause.text);

  return {
    boosts: resolveCaptainCoverageBoosts(captain, target, captainText),
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

function resolveCaptainCoverageBoosts(
  captain: CharacterDetailRecord,
  target: CharacterListItem,
  captainText: string,
): CaptainCoverageBoosts {
  return extractDefaultCaptainBoostClauses(extractDefaultCaptainBoostText(captainText)).reduce(
    (boosts, clause) => {
      const coverage = resolveCaptainCoverageClause(captain, target, clause);

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

function resolveCaptainTagCoverageClauses(
  target: CharacterListItem,
  branches: readonly CaptainTagConditionBranch[],
  options: CaptainCoverageOptions,
): CaptainCoverageClauseResult[] {
  if (!branches.length) {
    return [];
  }

  const targetTagKeys = resolveTargetCaptainTagKeys(target, options);
  const matchedLabels = [
    ...new Set(
      branches.flatMap((branch) =>
        branch.labels.filter((label) => targetTagKeys.includes(normalizeCaptainTagKey(label))),
      ),
    ),
  ];
  const matches = matchedLabels.length > 0;

  return [
    {
      text: `requires ${branches.map((branch) => branch.text).join(' or ')}`,
      status: matches ? 'covered' : 'uncovered',
      chips: matchedLabels.map((label) => ({
        kind: 'tag',
        label,
      })),
    },
  ];
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
  captain: CharacterDetailRecord,
  target: CharacterListItem,
  clause: string,
): CaptainCoverageClauseResult {
  const normalizedClause = normalizeCoverageClause(clause);
  const chips: CaptainCoverageChip[] = [];

  if (!TARGETABLE_CHARACTER_EFFECT_PATTERN.test(normalizedClause)) {
    return {
      text: normalizedClause,
      status: 'neutral',
      chips,
    };
  }

  const isSelfScoped = SELF_SCOPE_PATTERN.test(normalizedClause);
  const isUniversal = !isSelfScoped && UNIVERSAL_SCOPE_PATTERN.test(normalizedClause);
  const matchingTypes = resolveMatchingTypeScopes(normalizedClause, target);
  const matchingClasses = resolveMatchingClassScopes(normalizedClause, target);
  const costScopes = resolveCostScopes(normalizedClause, target);
  const hasTypeScope = extractAllowedTypes(normalizedClause).length > 0;
  const hasClassScope = extractAllowedClasses(normalizedClause).length > 0;
  const hasCostScope = costScopes.length > 0;

  if (isSelfScoped) {
    chips.push({
      kind: 'self',
      label: 'Self',
    });
  }

  if (isUniversal) {
    chips.push({
      kind: 'universal',
      label: 'Universal',
    });
  }

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
  costScopes
    .filter((scope) => scope.matches)
    .forEach((scope) =>
      chips.push({
        kind: 'cost',
        label: scope.label,
      }),
    );

  const hasTargetScope =
    isSelfScoped || isUniversal || hasTypeScope || hasClassScope || hasCostScope;

  if (!hasTargetScope) {
    return {
      text: normalizedClause,
      status: 'neutral',
      chips,
    };
  }

  const selfMatches = isSelfScoped ? captain.id === target.id : false;
  const typeMatches = hasTypeScope ? matchingTypes.length > 0 : false;
  const classMatches = hasClassScope ? matchingClasses.length > 0 : false;
  const costMatches = hasCostScope ? costScopes.some((scope) => scope.matches) : false;
  const covered = isUniversal || selfMatches || typeMatches || classMatches || costMatches;

  return {
    text: normalizedClause,
    status: covered ? 'covered' : 'uncovered',
    chips: dedupeCoverageChips(chips),
  };
}

function splitCaptainCoverageClauses(captainText: string): string[] {
  return captainText
    .replace(BRANCH_LABEL_PATTERN, '. ')
    .split(CLAUSE_BOUNDARY_PATTERN)
    .map(normalizeCoverageClause)
    .filter(Boolean);
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
  return splitCaptainEffectClauses(text).filter(
    (clause) =>
      !isConditionalCaptainBoostClause(clause) &&
      /\bboosts?\b/i.test(clause) &&
      /\b(?:atk|hp)\b/i.test(clause) &&
      /\bby\s+\d+(?:\.\d+)?x\b/i.test(clause),
  );
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
  return /^(?:if|when)\b/i.test(clause.trim());
}

function extractCaptainBoost(clause: string, stat: 'atk' | 'hp'): number {
  const pattern = new RegExp(`\\b${stat}\\b[^.;]*?\\bby\\s+(\\d+(?:\\.\\d+)?)x`, 'gi');

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
  const allowedTypes = extractAllowedTypes(clause);

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

function extractAllowedTypes(clause: string): AutoTeamBuilderType[] {
  return AUTO_TEAM_BUILDER_TYPES.filter((type) => textMatchesTypeScope(clause, type));
}

function textMatchesTypeScope(clause: string, type: AutoTeamBuilderType): boolean {
  return new RegExp(`(?:\\[${type}\\]|\\b${type}\\b)`, 'i').test(clause);
}

function resolveMatchingClassScopes(clause: string, target: CharacterListItem): string[] {
  const targetClasses = target.classes.map((characterClass) => characterClass.toLowerCase());

  return extractAllowedClasses(clause).filter((characterClass) =>
    targetClasses.includes(characterClass.toLowerCase()),
  );
}

function extractAllowedClasses(clause: string): string[] {
  return AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    new RegExp(`\\b${escapeRegExp(characterClass)}\\b`, 'i').test(clause),
  );
}

function resolveCostScopes(clause: string, target: CharacterListItem): CostScope[] {
  const scopes: CostScope[] = [];

  for (const match of clause.matchAll(/\bcost\s+(\d+)\s+or\s+(?:less|lower|below)\b/gi)) {
    const maxCost = Number(match[1]);

    if (Number.isFinite(maxCost)) {
      scopes.push({
        label: `Cost <= ${maxCost}`,
        matches: target.cost <= maxCost,
      });
    }
  }

  for (const match of clause.matchAll(/\bcost\s+(\d+)\s+or\s+(?:higher|more)\b/gi)) {
    const minCost = Number(match[1]);

    if (Number.isFinite(minCost)) {
      scopes.push({
        label: `Cost >= ${minCost}`,
        matches: target.cost >= minCost,
      });
    }
  }

  return scopes;
}

function isUnmatchedSelfOnlyClause(clause: CaptainCoverageClauseResult): boolean {
  return (
    clause.status === 'uncovered' &&
    SELF_SCOPE_PATTERN.test(clause.text) &&
    !UNIVERSAL_SCOPE_PATTERN.test(clause.text) &&
    extractAllowedTypes(clause.text).length === 0 &&
    extractAllowedClasses(clause.text).length === 0 &&
    !hasCostScope(clause.text)
  );
}

function hasCostScope(clause: string): boolean {
  return /\bcost\s+\d+\s+or\s+(?:less|lower|below|higher|more)\b/i.test(clause);
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
