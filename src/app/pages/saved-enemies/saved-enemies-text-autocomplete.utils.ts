import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type AutoBuildEnemyMechanicCatalogItem,
  type AutoBuildEnemyMechanicCategory,
} from '../../core/models/auto-team-builder-ability.models';

type EnemyTextAutocompleteSuggestionSource = 'mechanic' | 'ability';

export interface EnemyTextAutocompleteSuggestion {
  id: string;
  source: EnemyTextAutocompleteSuggestionSource;
  label: string;
  insertText: string;
  category: AutoBuildEnemyMechanicCategory | AutoBuildAbilityCategory;
  hint: string | null;
  matchedKeyword: string | null;
  replaceStartOffset: number;
  score: number;
}

export interface EnemyTextAutocompleteToken {
  lineContent: string;
  start: number;
  end: number;
}

export interface BuildAutocompleteSuggestionsOptions {
  token: EnemyTextAutocompleteToken;
  mechanics: readonly AutoBuildEnemyMechanicCatalogItem[];
  abilities: readonly AutoBuildAbilityCatalogItem[];
  maxResults?: number;
  minTokenLength?: number;
}

const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_MIN_TOKEN_LENGTH = 2;
const BULLET_PREFIX_PATTERN = /^[\s>\-*•·]+/;

export function extractAutocompleteToken(
  value: string,
  caretIndex: number,
): EnemyTextAutocompleteToken | null {
  if (!value) {
    return null;
  }

  const clampedCaret = Math.max(0, Math.min(caretIndex, value.length));
  const lineStart = findLineStart(value, clampedCaret);
  const rawSegment = value.slice(lineStart, clampedCaret);
  const bulletMatch = rawSegment.match(BULLET_PREFIX_PATTERN);
  const bulletOffset = bulletMatch ? bulletMatch[0].length : 0;
  const tokenStart = lineStart + bulletOffset;
  const lineContent = value.slice(tokenStart, clampedCaret);

  if (lineContent.trim().length === 0) {
    return null;
  }

  return {
    lineContent,
    start: tokenStart,
    end: clampedCaret,
  };
}

export function buildAutocompleteSuggestions(
  options: BuildAutocompleteSuggestionsOptions,
): EnemyTextAutocompleteSuggestion[] {
  const minLength = options.minTokenLength ?? DEFAULT_MIN_TOKEN_LENGTH;
  const lineContent = options.token.lineContent;

  if (lineContent.trim().length < minLength) {
    return [];
  }

  const collected = new Map<string, EnemyTextAutocompleteSuggestion>();

  options.mechanics.forEach((item) => {
    const match = scoreMechanic(item, lineContent, minLength);

    if (!match) {
      return;
    }

    upsertSuggestion(collected, {
      id: `mechanic:${item.key}`,
      source: 'mechanic',
      label: item.label,
      insertText: item.label,
      category: item.category,
      hint: match.matchedKeyword,
      matchedKeyword: match.matchedKeyword,
      replaceStartOffset: match.replaceStartOffset,
      score: match.score,
    });
  });

  options.abilities.forEach((item) => {
    if (!item.category) {
      return;
    }

    const match = scoreAbility(item, lineContent, minLength);

    if (!match) {
      return;
    }

    upsertSuggestion(collected, {
      id: `ability:${item.key}`,
      source: 'ability',
      label: item.label,
      insertText: item.label,
      category: item.category,
      hint: item.groupLabel ?? null,
      matchedKeyword: null,
      replaceStartOffset: match.replaceStartOffset,
      score: match.score,
    });
  });

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

  return [...collected.values()].sort(compareSuggestions).slice(0, maxResults);
}

export function applyAutocompleteSelection(
  value: string,
  token: EnemyTextAutocompleteToken,
  suggestion: EnemyTextAutocompleteSuggestion,
): { value: string; caret: number } {
  const replaceStart = token.start + suggestion.replaceStartOffset;
  const before = value.slice(0, replaceStart);
  const after = value.slice(token.end);
  const needsTrailingSpace = !after.startsWith(' ') && !after.startsWith('\n');
  const insertion = needsTrailingSpace ? `${suggestion.insertText} ` : suggestion.insertText;
  const nextValue = `${before}${insertion}${after}`;
  const caret = before.length + insertion.length;

  return { value: nextValue, caret };
}

function findLineStart(value: string, caretIndex: number): number {
  const previousNewline = value.lastIndexOf('\n', caretIndex - 1);

  return previousNewline === -1 ? 0 : previousNewline + 1;
}

interface MechanicMatch {
  replaceStartOffset: number;
  matchedLength: number;
  matchedKeyword: string | null;
  score: number;
}

function scoreMechanic(
  item: AutoBuildEnemyMechanicCatalogItem,
  lineContent: string,
  minMatchLength: number,
): MechanicMatch | null {
  let best: MechanicMatch | null = null;

  const labelAnchor = findMatchAnchor(lineContent, item.label, minMatchLength);

  if (labelAnchor) {
    best = {
      replaceStartOffset: labelAnchor.offset,
      matchedLength: labelAnchor.matchedLength,
      matchedKeyword: null,
      score: labelAnchor.score + 1,
    };
  }

  item.keywords.forEach((keyword) => {
    const keywordAnchor = findMatchAnchor(lineContent, keyword, minMatchLength);

    if (!keywordAnchor) {
      return;
    }

    if (!best || keywordAnchor.score > best.score) {
      best = {
        replaceStartOffset: keywordAnchor.offset,
        matchedLength: keywordAnchor.matchedLength,
        matchedKeyword: keyword,
        score: keywordAnchor.score,
      };
    }
  });

  return best;
}

interface AbilityMatch {
  replaceStartOffset: number;
  matchedLength: number;
  score: number;
}

function scoreAbility(
  item: AutoBuildAbilityCatalogItem,
  lineContent: string,
  minMatchLength: number,
): AbilityMatch | null {
  const labelAnchor = findMatchAnchor(lineContent, item.label, minMatchLength);

  if (labelAnchor) {
    return {
      replaceStartOffset: labelAnchor.offset,
      matchedLength: labelAnchor.matchedLength,
      score: labelAnchor.score,
    };
  }

  if (item.groupLabel) {
    const groupAnchor = findMatchAnchor(lineContent, item.groupLabel, minMatchLength);

    if (groupAnchor) {
      return {
        replaceStartOffset: groupAnchor.offset,
        matchedLength: groupAnchor.matchedLength,
        score: groupAnchor.score - 1,
      };
    }
  }

  return null;
}

interface MatchAnchor {
  offset: number;
  matchedLength: number;
  score: number;
}

function findMatchAnchor(
  lineContent: string,
  candidate: string,
  minMatchLength: number,
): MatchAnchor | null {
  const normalizedLine = lineContent.toLowerCase();
  const normalizedCandidate = candidate.toLowerCase().trim();

  if (!normalizedCandidate) {
    return null;
  }

  const maxSuffixLength = Math.min(normalizedLine.length, normalizedCandidate.length);

  for (let length = maxSuffixLength; length >= minMatchLength; length--) {
    const startIndex = normalizedLine.length - length;

    if (!isAnchorWordBoundary(normalizedLine, startIndex)) {
      continue;
    }

    const suffix = normalizedLine.slice(startIndex);

    if (!normalizedCandidate.startsWith(suffix)) {
      continue;
    }

    const isExact = suffix === normalizedCandidate;
    const score = (isExact ? 100 : 0) + length;

    return { offset: startIndex, matchedLength: length, score };
  }

  return null;
}

function isAnchorWordBoundary(normalizedLine: string, startIndex: number): boolean {
  if (startIndex === 0) {
    return true;
  }

  const previousChar = normalizedLine[startIndex - 1];

  if (previousChar === undefined) {
    return true;
  }

  if (/\s/.test(previousChar)) {
    return true;
  }

  return /[,;:)\]]/.test(previousChar);
}

function upsertSuggestion(
  collected: Map<string, EnemyTextAutocompleteSuggestion>,
  suggestion: EnemyTextAutocompleteSuggestion,
): void {
  const key = suggestion.label.toLowerCase();
  const existing = collected.get(key);

  if (!existing || suggestion.score > existing.score) {
    collected.set(key, suggestion);
  }
}

function compareSuggestions(
  left: EnemyTextAutocompleteSuggestion,
  right: EnemyTextAutocompleteSuggestion,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.source !== right.source) {
    return left.source === 'mechanic' ? -1 : 1;
  }

  return left.label.localeCompare(right.label);
}
