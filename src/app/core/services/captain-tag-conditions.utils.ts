import {
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';

export interface CaptainTagConditionBranch {
  requiredCount: number;
  labels: string[];
  acceptedKeys: string[];
  text: string;
}

const CREW_TAG_CONDITION_PATTERN =
  /\b(?:if|when)?\s*(?:your\s+)?crew\s+has\s+(\d+)\s*(?:\+|or\s+more)?\s+(.{0,240}?)\s+characters?\b/gi;
const BRACKETED_LABEL_PATTERN = /\[([^\]]+)\]/g;

const NON_TAG_LABEL_KEYS = new Set([
  ...AUTO_TEAM_BUILDER_TYPES.map(normalizeCaptainTagKey),
  ...AUTO_TEAM_BUILDER_CLASSES.map(normalizeCaptainTagKey),
]);

export function parseCaptainTagConditionBranches(text: string): CaptainTagConditionBranch[] {
  return [...text.matchAll(CREW_TAG_CONDITION_PATTERN)]
    .map((match) => {
      const requiredCount = Number(match[1]);
      const rawTargetText = String(match[2] ?? '').trim();
      const labels = extractTagLabels(rawTargetText);
      const acceptedKeys = labels.map(normalizeCaptainTagKey);

      return {
        requiredCount,
        labels,
        acceptedKeys,
        text: `crew has ${match[1]} ${labels.map((label) => `[${label}]`).join(' / ')} characters`,
      };
    })
    .filter(
      (branch) =>
        Number.isInteger(branch.requiredCount) &&
        branch.requiredCount > 0 &&
        branch.acceptedKeys.length > 0,
    );
}

export function normalizeCaptainTagKey(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/^\[([^\]]+)\]$/, '$1')
    .replace(/\bcharacters?\b$/i, '')
    .replace(/\bunits?\b$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function resolveCharacterCaptainTagKeys(
  character: Pick<CharacterDetailRecord, 'detail'>,
): string[] {
  const characterTags = Array.isArray(character.detail.characterTags)
    ? character.detail.characterTags
    : [];

  return [
    ...new Set(
      characterTags.map((tag) => normalizeCaptainTagKey(tag)).filter((tag) => tag.length > 0),
    ),
  ];
}

export function characterMatchesCaptainTagBranch(
  character: Pick<CharacterDetailRecord, 'detail'>,
  branch: CaptainTagConditionBranch,
): boolean {
  const tagKeys = resolveCharacterCaptainTagKeys(character);

  return branch.acceptedKeys.some((key) => tagKeys.includes(key));
}

export function characterMatchesAnyCaptainTagBranch(
  character: Pick<CharacterDetailRecord, 'detail'>,
  branches: readonly CaptainTagConditionBranch[],
): boolean {
  return branches.some((branch) => characterMatchesCaptainTagBranch(character, branch));
}

export function countCaptainTagBranchMatches(
  characters: readonly Pick<CharacterDetailRecord, 'detail'>[],
  branch: CaptainTagConditionBranch,
): number {
  return characters.filter((character) => characterMatchesCaptainTagBranch(character, branch))
    .length;
}

export function captainTagBranchesSatisfied(
  characters: readonly Pick<CharacterDetailRecord, 'detail'>[],
  branches: readonly CaptainTagConditionBranch[],
): boolean {
  return (
    branches.length === 0 ||
    branches.some(
      (branch) => countCaptainTagBranchMatches(characters, branch) >= branch.requiredCount,
    )
  );
}

function extractTagLabels(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(BRACKETED_LABEL_PATTERN)]
        .map((match) => String(match[1] ?? '').trim())
        .filter((label) => label.length > 0)
        .filter((label) => !NON_TAG_LABEL_KEYS.has(normalizeCaptainTagKey(label))),
    ),
  ];
}
