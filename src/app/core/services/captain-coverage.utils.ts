import {
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import { normalizeHtmlToText } from './html-text.utils';

export type CaptainCoverageChipKind = 'class' | 'cost' | 'self' | 'type' | 'universal';

export interface CaptainCoverageChip {
  kind: CaptainCoverageChipKind;
  label: string;
}

export interface CaptainCoverageClauseResult {
  text: string;
  status: 'covered' | 'neutral' | 'uncovered';
  chips: CaptainCoverageChip[];
}

export interface CaptainCoverageResult {
  captainText: string;
  chips: CaptainCoverageChip[];
  clauses: CaptainCoverageClauseResult[];
  coveredClauses: string[];
  matches: boolean;
  neutralNotes: string[];
  targetableClauseCount: number;
  uncoveredClauses: string[];
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
const CLAUSE_BOUNDARY_PATTERN =
  /(?:[.;]\s+|,\s+(?=(?:and\s+)?(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)|\s+and\s+(?=(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b))/gi;

export function resolveCaptainCoverage(
  captain: CharacterDetailRecord,
  target: CharacterListItem,
): CaptainCoverageResult {
  const captainText = normalizeHtmlToText(captain.detail.captainAbility);

  if (!captainText) {
    return createEmptyCoverageResult(captainText);
  }

  const resolvedClauses = splitCaptainCoverageClauses(captainText).map((clause) =>
    resolveCaptainCoverageClause(captain, target, clause),
  );
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
