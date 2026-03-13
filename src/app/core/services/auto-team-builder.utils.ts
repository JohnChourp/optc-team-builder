import {
  type AutoBuildBurstRole,
  type AutoBuildCandidate,
  type AutoBuildConsistencyRole,
  type AutoBuildCoverageSummary,
  type AutoBuildEffectTags,
  type AutoBuildInput,
  type AutoBuildResult,
  type AutoBuildSlot,
  type AutoBuildUtilityRole,
  type AutoTeamBuilderType,
} from "../models/auto-team-builder.models";
import { type CharacterDetailRecord } from "../models/optc.models";

const CAPTAIN_ATK_PATTERN = /atk(?:[^.]{0,120})?by\s+(\d+(?:\.\d+)?)x/gi;
const CAPTAIN_HP_PATTERN = /hp(?:[^.]{0,120})?by\s+(\d+(?:\.\d+)?)x/gi;
const TYPE_MATCH_PATTERNS = {
  DEX: ["[dex]", " dex ", "dex characters", "dex units"],
  STR: ["[str]", " str ", "str characters", "str units"],
  QCK: ["[qck]", " qck ", "qck characters", "qck units"],
  PSY: ["[psy]", " psy ", "psy characters", "psy units"],
  INT: ["[int]", " int ", "int characters", "int units"],
} as const;

const CHIP_LABELS = {
  atkBoost: "ATK boost",
  atkDown: "ATK Down clear",
  bind: "Bind clear",
  chainBoost: "Chain boost",
  colorAffinity: "Color affinity",
  conditional: "Conditional damage",
  cooldownReduction: "Cooldown help",
  damageReduction: "Damage reduction clear",
  defenseDown: "Defense down",
  despair: "Despair clear",
  matchingOrbs: "Matching orbs",
  matchesClass: "Class fit",
  orbBoost: "Orb boost",
  orbChange: "Orb control",
  paralysis: "Paralysis clear",
  threshold: "Threshold clear",
} as const;

interface TeamCoverageState {
  burst: Set<AutoBuildBurstRole>;
  consistency: Set<AutoBuildConsistencyRole>;
  utility: Set<AutoBuildUtilityRole>;
  selectedClasses: Set<string>;
  selectedTypes: Set<AutoTeamBuilderType>;
}

export function buildAutoTeamResult(
  records: CharacterDetailRecord[],
  input: AutoBuildInput,
): AutoBuildResult | null {
  const usableRecords = records.filter((record) => hasReadableEffectText(record));

  if (!usableRecords.length) {
    return null;
  }

  const candidates = usableRecords.map((record, index) =>
    buildAutoBuildCandidate(record, input, index, usableRecords.length),
  );
  const captain = selectCaptain(candidates);

  if (!captain) {
    return null;
  }

  const subs = selectSubs(candidates, captain, input);

  if (subs.length < 4) {
    return null;
  }

  const coverage = summarizeCoverage([captain, ...subs], input);

  if (!coverage.coversAllSelectedClasses || !coverage.coversAllSelectedTypes) {
    return null;
  }

  const slots: AutoBuildSlot[] = [
    { role: "captain", character: captain.character, reasonChips: captain.reasonChips },
    { role: "friendCaptain", character: captain.character, reasonChips: captain.reasonChips },
    ...subs.map((candidate) => ({
      role: "sub" as const,
      character: candidate.character,
      reasonChips: candidate.reasonChips,
    })),
  ];

  return {
    input,
    candidateCount: candidates.length,
    slots,
    coverage,
  };
}

export function buildAutoBuildCandidate(
  record: CharacterDetailRecord,
  input: AutoBuildInput,
  index: number,
  total: number,
): AutoBuildCandidate {
  const captainText = normalizeText(record.detail.captainAbility);
  const specialText = normalizeText(record.detail.specialText);
  const sailorText = normalizeText(record.detail.sailorAbilities.join(" "));
  const combinedText = [captainText, specialText, sailorText].filter(Boolean).join(" ");
  const matchedSelectedClasses = resolveMatchedSelectedClasses(record, input.selectedClasses);
  const matchedSelectedTypes = resolveMatchedSelectedTypes(record, input.types);
  const tags = parseEffectTags(input, captainText, specialText, sailorText);

  return {
    character: record,
    captainText,
    specialText,
    sailorText,
    combinedText,
    matchesSelectedClass: matchedSelectedClasses.length > 0,
    matchedSelectedClasses,
    matchedSelectedTypes,
    tags,
    reasonChips: buildReasonChips(input, tags, matchedSelectedClasses.length > 0),
    recencyScore: total <= 1 ? 1 : 1 - index / (total - 1),
  };
}

export function hasReadableEffectText(record: CharacterDetailRecord): boolean {
  return Boolean(
    normalizeText(record.detail.captainAbility) ||
      normalizeText(record.detail.specialText) ||
      normalizeText(record.detail.sailorAbilities.join(" ")),
  );
}

function selectCaptain(candidates: AutoBuildCandidate[]): AutoBuildCandidate | null {
  const captainPool = candidates.filter((candidate) => candidate.tags.readableCaptainText);
  const classCaptains = captainPool.filter((candidate) => candidate.matchesSelectedClass);
  const scopedPool = classCaptains.length ? classCaptains : captainPool;
  const universalCaptains = scopedPool.filter((candidate) => candidate.tags.captainScope.allCharacters);
  const fullCoverageCaptains = scopedPool.filter(
    (candidate) =>
      candidate.tags.captainScope.coversAllSelectedClasses && candidate.tags.captainScope.coversAllSelectedTypes,
  );
  const fullTypeCoverageCaptains = scopedPool.filter((candidate) => candidate.tags.captainScope.coversAllSelectedTypes);
  const fullClassCoverageCaptains = scopedPool.filter(
    (candidate) => candidate.tags.captainScope.coversAllSelectedClasses,
  );
  const partialCoverageCaptains = scopedPool.filter(
    (candidate) =>
      candidate.tags.captainScope.matchedSelectedTypeCount > 0 ||
      candidate.tags.captainScope.matchedSelectedClassCount > 0,
  );

  if (!scopedPool.length) {
    return null;
  }

  const preferredPool = universalCaptains.length
    ? universalCaptains
    : fullCoverageCaptains.length
      ? fullCoverageCaptains
      : fullTypeCoverageCaptains.length
        ? fullTypeCoverageCaptains
        : fullClassCoverageCaptains.length
          ? fullClassCoverageCaptains
          : partialCoverageCaptains.length
            ? partialCoverageCaptains
            : scopedPool;

  return preferredPool.reduce((best, current) =>
    scoreCaptain(current) > scoreCaptain(best) ? current : best,
  );
}

function selectSubs(
  candidates: AutoBuildCandidate[],
  captain: AutoBuildCandidate,
  input: AutoBuildInput,
): AutoBuildCandidate[] {
  const selected: AutoBuildCandidate[] = [];
  const coverage = createTeamCoverageState(captain);
  const pool = candidates.filter((candidate) => candidate.character.id !== captain.character.id);

  while (selected.length < 4) {
    const next = pool
      .filter((candidate) => !selected.some((entry) => entry.character.id === candidate.character.id))
      .reduce<AutoBuildCandidate | null>((best, current) => {
        if (!best) {
          return current;
        }

        return scoreSubCandidate(current, captain, coverage, selected, input) >
          scoreSubCandidate(best, captain, coverage, selected, input)
          ? current
          : best;
      }, null);

    if (!next) {
      break;
    }

    selected.push(next);
    applyCandidateCoverage(coverage, next);
  }

  return selected;
}

function scoreCaptain(candidate: AutoBuildCandidate): number {
  let score = 0;
  const matchedTypeCount = candidate.tags.captainScope.matchedSelectedTypeCount;
  const matchedClassCount = candidate.tags.captainScope.matchedSelectedClassCount;

  score += candidate.tags.captainAtkMultiplier * 42;
  score += candidate.tags.captainHpMultiplier * 12;
  score += candidate.matchedSelectedClasses.length * 18;
  score += matchedClassCount * 18;
  score += matchedTypeCount * 12;
  score += candidate.tags.captainScope.coversAllSelectedClasses ? 48 : 0;
  score += candidate.tags.captainScope.coversAllSelectedTypes ? 56 : 0;
  score += candidate.tags.captainScope.allCharacters ? 120 : 0;
  score += candidate.tags.consistencyRoles.includes("cooldownReduction") ? 10 : 0;
  score += candidate.tags.consistencyRoles.some((role) => role === "matchingOrbs" || role === "orbChange") ? 8 : 0;
  score += candidate.tags.utilityRoles.length ? 4 : 0;
  score += candidate.recencyScore * 18;

  if (!candidate.matchesSelectedClass) {
    score -= 24;
  }

  if (!candidate.tags.readableCaptainText) {
    score -= 100;
  }

  if (!matchedTypeCount && !candidate.tags.captainScope.allCharacters) {
    score -= 18;
  }

  if (!matchedClassCount && candidate.matchesSelectedClass) {
    score -= 6;
  }

  return score;
}

function scoreSubCandidate(
  candidate: AutoBuildCandidate,
  captain: AutoBuildCandidate,
  coverage: TeamCoverageState,
  selected: AutoBuildCandidate[],
  input: AutoBuildInput,
): number {
  let score = 0;

  const uncoveredSelectedClasses = input.selectedClasses.filter((selectedClass) => !coverage.selectedClasses.has(selectedClass));
  const uncoveredSelectedTypes = input.types.filter((type) => !coverage.selectedTypes.has(type));
  const newClassCoverage = candidate.matchedSelectedClasses.filter(
    (selectedClass) => !coverage.selectedClasses.has(selectedClass),
  ).length;
  const newTypeCoverage = candidate.matchedSelectedTypes.filter((type) => !coverage.selectedTypes.has(type)).length;
  const damageCoverageMissing =
    !coverage.burst.has("colorAffinity") && !coverage.burst.has("chainBoost") && !coverage.burst.has("conditional");
  const consistencyMissing = coverage.consistency.size === 0;
  const utilityMissing = coverage.utility.size === 0;

  score += newClassCoverage * 44;
  score += newTypeCoverage * 36;
  score += candidate.matchesSelectedClass ? 18 : -8;
  score += candidate.recencyScore * 10;
  score += captain.tags.captainScope.allCharacters ? 10 : 0;
  score += captain.tags.captainScope.matchesClass && candidate.matchesSelectedClass ? 12 : 0;
  score += captain.tags.captainScope.coversAllSelectedClasses ? 8 : 0;
  score += captain.tags.captainScope.coversAllSelectedTypes ? 6 : 0;
  score += captain.tags.captainScope.matchedSelectedTypeCount > 0 ? 3 : 0;

  if (newClassCoverage && newTypeCoverage) {
    score += 12;
  }

  if (uncoveredSelectedClasses.length > 0 && newClassCoverage === 0) {
    score -= 18;
  }

  if (uncoveredSelectedTypes.length > 0 && newTypeCoverage === 0) {
    score -= 16;
  }

  score += scoreRolePresence(candidate.tags.burstRoles, "atkBoost", coverage.burst.has("atkBoost"), 28, 4);
  score += scoreRolePresence(candidate.tags.burstRoles, "orbBoost", coverage.burst.has("orbBoost"), 24, 4);
  score += scoreGroupedDamage(candidate, damageCoverageMissing);
  score += scoreConsistency(candidate, consistencyMissing);
  score += scoreUtility(candidate, utilityMissing);

  if (candidate.tags.utilityRoles.includes("defenseDown") && damageCoverageMissing) {
    score += 8;
  }

  if (!candidate.matchesSelectedClass && countSelectedClassMatches(selected) < 2) {
    score -= 12;
  }

  if (addsNoNewCoverage(candidate, coverage)) {
    score -= candidate.matchesSelectedClass ? 6 : 14;
  }

  if (countSharedBurstRoles(candidate, selected) >= 2) {
    score -= 8;
  }

  if (!candidate.matchesSelectedClass && input.selectedClasses.length) {
    score -= 4;
  }

  return score;
}

function scoreGroupedDamage(candidate: AutoBuildCandidate, damageCoverageMissing: boolean): number {
  let score = 0;

  score += scoreRolePresence(candidate.tags.burstRoles, "colorAffinity", false, damageCoverageMissing ? 20 : 8, 4);
  score += scoreRolePresence(candidate.tags.burstRoles, "chainBoost", false, damageCoverageMissing ? 16 : 8, 4);
  score += scoreRolePresence(candidate.tags.burstRoles, "conditional", false, damageCoverageMissing ? 14 : 7, 4);

  return score;
}

function scoreConsistency(candidate: AutoBuildCandidate, consistencyMissing: boolean): number {
  let score = 0;

  score += scoreRolePresence(
    candidate.tags.consistencyRoles,
    "matchingOrbs",
    false,
    consistencyMissing ? 16 : 6,
    3,
  );
  score += scoreRolePresence(candidate.tags.consistencyRoles, "orbChange", false, consistencyMissing ? 12 : 5, 3);
  score += scoreRolePresence(
    candidate.tags.consistencyRoles,
    "cooldownReduction",
    false,
    consistencyMissing ? 10 : 5,
    2,
  );

  return score;
}

function scoreUtility(candidate: AutoBuildCandidate, utilityMissing: boolean): number {
  if (!candidate.tags.utilityRoles.length) {
    return 0;
  }

  return (utilityMissing ? 18 : 8) + candidate.tags.utilityRoles.length * 2;
}

function scoreRolePresence<T extends string>(
  roles: readonly T[],
  target: T,
  alreadyCovered: boolean,
  missingWeight: number,
  coveredWeight: number,
): number {
  if (!roles.includes(target)) {
    return 0;
  }

  return alreadyCovered ? coveredWeight : missingWeight;
}

function parseEffectTags(
  input: AutoBuildInput,
  captainText: string,
  specialText: string,
  sailorText: string,
): AutoBuildEffectTags {
  const selectedClasses = input.selectedClasses;
  const selectedTypes = input.types;
  const combinedText = [captainText, specialText, sailorText].filter(Boolean).join(" ");
  const burstRoles = uniqueRoles<AutoBuildBurstRole>([
    textHasAtkBoost(combinedText) ? "atkBoost" : null,
    includesAny(combinedText, ["orb effects", "slot effect"]) ? "orbBoost" : null,
    combinedText.includes("color affinity") ? "colorAffinity" : null,
    includesAny(combinedText, ["boosts the chain multiplier", "boost chain", "chain multiplier by +"]) ? "chainBoost" : null,
    includesAny(combinedText, ["conditional", "against enemies with", "if the enemy is"]) ? "conditional" : null,
  ]);
  const consistencyRoles = uniqueRoles<AutoBuildConsistencyRole>([
    combinedText.includes("matching orbs") ? "matchingOrbs" : null,
    combinedText.includes("changes") && combinedText.includes("orbs") ? "orbChange" : null,
    combinedText.includes("special cooldown") ? "cooldownReduction" : null,
  ]);
  const utilityRoles = uniqueRoles<AutoBuildUtilityRole>([
    combinedText.includes("bind") ? "bind" : null,
    combinedText.includes("despair") ? "despair" : null,
    combinedText.includes("paralysis") ? "paralysis" : null,
    combinedText.includes("atk down") ? "atkDown" : null,
    includesAny(combinedText, ["damage reduction"]) ? "damageReduction" : null,
    includesAny(combinedText, ["threshold damage reduction"]) ? "threshold" : null,
    includesAny(combinedText, ["defense down", "reduces the defense"]) ? "defenseDown" : null,
  ]);
  const matchedSelectedClasses = selectedClasses.filter((selectedClass) => textMatchesClassScope(captainText, selectedClass));
  const matchedSelectedTypes = selectedTypes.filter((type) => textMatchesTypeScope(captainText, type));

  return {
    captainScope: {
      allCharacters: includesAny(captainText, ["all characters", "all units"]),
      matchedSelectedClasses,
      matchedSelectedClassCount: matchedSelectedClasses.length,
      coversAllSelectedClasses: selectedClasses.length > 0 && matchedSelectedClasses.length === selectedClasses.length,
      matchedSelectedTypes,
      matchedSelectedTypeCount: matchedSelectedTypes.length,
      coversAllSelectedTypes: selectedTypes.length > 0 && matchedSelectedTypes.length === selectedTypes.length,
      matchesClass: matchedSelectedClasses.length > 0,
    },
    burstRoles,
    consistencyRoles,
    utilityRoles,
    captainAtkMultiplier: extractHighestMultiplier(captainText, CAPTAIN_ATK_PATTERN),
    captainHpMultiplier: extractHighestMultiplier(captainText, CAPTAIN_HP_PATTERN),
    readableCaptainText: captainText.length > 0,
    readableSpecialText: specialText.length > 0,
    readableSailorText: sailorText.length > 0,
  };
}

function buildReasonChips(input: AutoBuildInput, tags: AutoBuildEffectTags, matchesSelectedClass: boolean): string[] {
  const chips: string[] = [];

  if (matchesSelectedClass) {
    chips.push(CHIP_LABELS.matchesClass);
  }

  if (tags.captainScope.allCharacters) {
    chips.push("Universal captain");
  } else if (tags.captainScope.matchedSelectedTypeCount) {
    chips.push(resolveTypeCaptainLabel(input.types, tags.captainScope.matchedSelectedTypes));
  }

  pushChips(chips, tags.burstRoles);
  pushChips(chips, tags.consistencyRoles);
  pushChips(chips, tags.utilityRoles);

  return chips.slice(0, 4);
}

function pushChips(
  chips: string[],
  roles: readonly AutoBuildBurstRole[] | readonly AutoBuildConsistencyRole[] | readonly AutoBuildUtilityRole[],
): void {
  roles.forEach((role) => {
    const label = CHIP_LABELS[role];

    if (label && !chips.includes(label)) {
      chips.push(label);
    }
  });
}

function summarizeCoverage(candidates: AutoBuildCandidate[], input: AutoBuildInput): AutoBuildCoverageSummary {
  const burst = new Set<AutoBuildBurstRole>();
  const consistency = new Set<AutoBuildConsistencyRole>();
  const utility = new Set<AutoBuildUtilityRole>();
  const coveredSelectedClasses = new Set<string>();
  const coveredSelectedTypes = new Set<AutoTeamBuilderType>();

  candidates.forEach((candidate) => {
    candidate.tags.burstRoles.forEach((role) => burst.add(role));
    candidate.tags.consistencyRoles.forEach((role) => consistency.add(role));
    candidate.tags.utilityRoles.forEach((role) => utility.add(role));
    candidate.matchedSelectedClasses.forEach((selectedClass) => coveredSelectedClasses.add(selectedClass));
    candidate.matchedSelectedTypes.forEach((type) => coveredSelectedTypes.add(type));
  });

  const coveredClassesList = input.selectedClasses.filter((selectedClass) => coveredSelectedClasses.has(selectedClass));
  const coveredTypesList = input.types.filter((type) => coveredSelectedTypes.has(type));

  return {
    burst: [...burst].map((role) => CHIP_LABELS[role]),
    consistency: [...consistency].map((role) => CHIP_LABELS[role]),
    utility: [...utility].map((role) => CHIP_LABELS[role]),
    coveredSelectedClasses: coveredClassesList,
    coveredSelectedTypes: coveredTypesList,
    coversAllSelectedClasses:
      input.selectedClasses.length === 0 || coveredClassesList.length === input.selectedClasses.length,
    coversAllSelectedTypes: input.types.length === 0 || coveredTypesList.length === input.types.length,
    selectedClassMatches:
      candidates.filter((candidate) => candidate.matchesSelectedClass).length + (candidates[0]?.matchesSelectedClass ? 1 : 0),
    selectedTypeMatches:
      candidates.filter((candidate) => candidate.matchedSelectedTypes.length > 0).length +
      (candidates[0]?.matchedSelectedTypes.length ? 1 : 0),
  };
}

function resolveTypeCaptainLabel(
  selectedTypes: AutoBuildInput["types"],
  matchedSelectedTypes: AutoTeamBuilderType[],
): string {
  const typesToDisplay = matchedSelectedTypes.length ? matchedSelectedTypes : selectedTypes;
  return `${typesToDisplay.join(" / ")} captain`;
}

function createTeamCoverageState(captain: AutoBuildCandidate): TeamCoverageState {
  const coverage: TeamCoverageState = {
    burst: new Set<AutoBuildBurstRole>(),
    consistency: new Set<AutoBuildConsistencyRole>(),
    utility: new Set<AutoBuildUtilityRole>(),
    selectedClasses: new Set<string>(),
    selectedTypes: new Set<AutoTeamBuilderType>(),
  };

  applyCandidateCoverage(coverage, captain);
  return coverage;
}

function applyCandidateCoverage(coverage: TeamCoverageState, candidate: AutoBuildCandidate): void {
  candidate.tags.burstRoles.forEach((role) => coverage.burst.add(role));
  candidate.tags.consistencyRoles.forEach((role) => coverage.consistency.add(role));
  candidate.tags.utilityRoles.forEach((role) => coverage.utility.add(role));
  candidate.matchedSelectedClasses.forEach((selectedClass) => coverage.selectedClasses.add(selectedClass));
  candidate.matchedSelectedTypes.forEach((type) => coverage.selectedTypes.add(type));
}

function addsNoNewCoverage(candidate: AutoBuildCandidate, coverage: TeamCoverageState): boolean {
  return (
    candidate.tags.burstRoles.every((role) => coverage.burst.has(role)) &&
    candidate.tags.consistencyRoles.every((role) => coverage.consistency.has(role)) &&
    candidate.tags.utilityRoles.every((role) => coverage.utility.has(role)) &&
    candidate.matchedSelectedClasses.every((selectedClass) => coverage.selectedClasses.has(selectedClass)) &&
    candidate.matchedSelectedTypes.every((type) => coverage.selectedTypes.has(type))
  );
}

function countSelectedClassMatches(selected: AutoBuildCandidate[]): number {
  return selected.filter((candidate) => candidate.matchesSelectedClass).length;
}

function countSharedBurstRoles(candidate: AutoBuildCandidate, selected: AutoBuildCandidate[]): number {
  return selected.reduce((count, entry) => {
    const shared = candidate.tags.burstRoles.filter((role) => entry.tags.burstRoles.includes(role));
    return count + shared.length;
  }, 0);
}

function resolveMatchedSelectedClasses(record: CharacterDetailRecord, selectedClasses: string[]): string[] {
  if (!selectedClasses.length) {
    return [];
  }

  const normalizedRecordClasses = record.classes.map((characterClass) => characterClass.toLowerCase());

  return selectedClasses.filter((selectedClass) => normalizedRecordClasses.includes(selectedClass.toLowerCase()));
}

function resolveMatchedSelectedTypes(
  record: CharacterDetailRecord,
  selectedTypes: AutoTeamBuilderType[],
): AutoTeamBuilderType[] {
  return selectedTypes.filter((type) => type === record.type);
}

function textMatchesClassScope(text: string, selectedClass: string): boolean {
  const normalizedSelectedClass = normalizeText(selectedClass);
  return normalizedSelectedClass.length > 0 && text.includes(normalizedSelectedClass);
}

function extractHighestMultiplier(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].reduce((highest, match) => {
    const value = Number(match[1]);
    return Number.isFinite(value) && value > highest ? value : highest;
  }, 0);
}

function textHasAtkBoost(text: string): boolean {
  return includesAny(text, ["boosts atk", "atk by", "atk of"]);
}

function textMatchesTypeScope(text: string, type: AutoTeamBuilderType): boolean {
  const normalizedType = type.toLowerCase();
  const escapedType = normalizedType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return (
    includesAny(text, [...TYPE_MATCH_PATTERNS[type]]) ||
    new RegExp(`(?:^|[^a-z])${escapedType}(?:[^a-z]|$)`, "i").test(text)
  );
}

function uniqueRoles<T extends string>(roles: Array<T | null>): T[] {
  return [...new Set(roles.filter((role): role is T => Boolean(role)))];
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
