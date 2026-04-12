import {
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildAbilityCoverageState,
  type AutoBuildBurstRole,
  type AutoBuildCandidate,
  type AutoBuildConsistencyRole,
  type AutoBuildCoreResult,
  type AutoBuildCoverageSummary,
  type AutoBuildEffectTags,
  type AutoBuildInput,
  type AutoBuildLeaderCriteriaSummary,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildSpecialScope,
  type AutoBuildSpecialSupportSummary,
  type AutoBuildSlot,
  type AutoBuildUtilityRole,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import {
  type AutoBuildAbilityRequirement,
} from '../models/auto-team-builder-ability.models';
import conflictOverrideCatalog from '../data/auto-team-builder-party-conflict-overrides.json';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import {
  matchesAbilityRequirement,
} from './auto-team-builder-ability-match.utils';

const CAPTAIN_ATK_PATTERN = /atk(?:[^.]{0,120})?by\s+(\d+(?:\.\d+)?)x/gi;
const CAPTAIN_HP_PATTERN = /hp(?:[^.]{0,120})?by\s+(\d+(?:\.\d+)?)x/gi;
const SCOPE_CLAUSE_PATTERN = /\b(?:of|for)\s+([^.;]{1,160}?)\s+(?:characters|units)\b/g;
const TYPE_MATCH_PATTERNS = {
  DEX: ['[dex]', ' dex ', 'dex characters', 'dex units'],
  STR: ['[str]', ' str ', 'str characters', 'str units'],
  QCK: ['[qck]', ' qck ', 'qck characters', 'qck units'],
  PSY: ['[psy]', ' psy ', 'psy characters', 'psy units'],
  INT: ['[int]', ' int ', 'int characters', 'int units'],
} as const;

const CHIP_LABELS = {
  atkBoost: 'ATK boost',
  atkDown: 'ATK Down clear',
  bind: 'Bind clear',
  chainBoost: 'Chain boost',
  colorAffinity: 'Color affinity',
  conditional: 'Conditional damage',
  cooldownReduction: 'Cooldown help',
  damageReduction: 'Damage reduction clear',
  defenseDown: 'Defense down',
  despair: 'Despair clear',
  matchingOrbs: 'Matching orbs',
  matchesClass: 'Class fit',
  orbBoost: 'Orb boost',
  orbChange: 'Orb control',
  paralysis: 'Paralysis clear',
  threshold: 'Threshold clear',
} as const;
const TEAM_SUB_SLOT_COUNT = 4;
const GLOBAL_LEADER_OPTION_LIMIT = 8;
const LOCKED_REASON_CHIP = 'Manual lock';
const TEAMWIDE_SPECIAL_REASON_CHIP = 'Teamwide special';

interface TeamCoverageState {
  burst: Set<AutoBuildBurstRole>;
  consistency: Set<AutoBuildConsistencyRole>;
  utility: Set<AutoBuildUtilityRole>;
  selectedClasses: Set<string>;
  selectedTypes: Set<AutoTeamBuilderType>;
}

type ActiveLeaderCriteria = Omit<
  AutoBuildLeaderCriteriaSummary,
  'matchingSlots' | 'totalSlots' | 'allSlotsMatch'
>;

interface LeaderPairOption {
  captain: AutoBuildCandidate;
  friendCaptain: AutoBuildCandidate;
  score: number;
}

type PartyConflictCharacter = Pick<CharacterListItem, 'id' | 'name'> &
  Partial<Pick<CharacterDetailRecord, 'detail'>>;

const PARTY_CONFLICT_KEY_OVERRIDES = new Map<number, string[]>(
  Object.entries(conflictOverrideCatalog).map(([characterId, keys]) => [
    Number(characterId),
    Array.isArray(keys) ? keys.map((value) => String(value)) : [],
  ]),
);

function candidateMatchesAbilityRequirement(
  candidate: AutoBuildCandidate,
  requirement: AutoBuildAbilityRequirement,
): boolean {
  return candidate.character.detail.builderAbilities.some((ability) =>
    matchesAbilityRequirement(ability, requirement),
  );
}

function cloneAbilityRequirement(
  requirement: AutoBuildAbilityRequirement,
): AutoBuildAbilityRequirement {
  return {
    ...requirement,
    slotTokens: [...requirement.slotTokens],
  };
}

export function normalizePartyConflictKey(name: string): string {
  const trimmedName = name.replace(/^[^A-Za-z0-9]+/, '').replace(/\s+/g, ' ').trim();

  return trimmedName.toLowerCase();
}

export function resolveCharacterBaseNameKey(name: string): string {
  const trimmedName = name.replace(/^[^A-Za-z0-9]+/, '').replace(/\s+/g, ' ').trim();
  const [baseName = trimmedName] = trimmedName.split(' - ', 1);

  return normalizePartyConflictKey(baseName);
}

export function resolveNameDerivedPartyConflictKeys(name: string): string[] {
  const primaryKey = resolveCharacterBaseNameKey(name);

  if (!primaryKey.length) {
    return [];
  }

  const keys = new Set<string>([primaryKey]);

  if (primaryKey.includes('&')) {
    primaryKey
      .split('&')
      .map((value) => normalizePartyConflictKey(value))
      .filter((value) => value.length > 0)
      .forEach((value) => keys.add(value));
  }

  return [...keys];
}

export function resolveCharacterPartyConflictKeys(character: PartyConflictCharacter): string[] {
  const explicitKeys = Array.isArray(character.detail?.partyConflictKeys)
    ? character.detail.partyConflictKeys
    : [];
  const overrideKeys = PARTY_CONFLICT_KEY_OVERRIDES.get(character.id) ?? [];

  return [
    ...new Set(
      [...resolveNameDerivedPartyConflictKeys(character.name), ...explicitKeys, ...overrideKeys]
        .map((value) => normalizePartyConflictKey(String(value ?? '')))
        .filter((value) => value.length > 0),
    ),
  ];
}

function resolveCandidatePartyConflictKeys(candidate: AutoBuildCandidate): string[] {
  return resolveCharacterPartyConflictKeys(candidate.character);
}

function hasAnyPartyConflictKey(
  candidate: AutoBuildCandidate,
  usedPartyConflictKeys: Set<string>,
): boolean {
  return resolveCandidatePartyConflictKeys(candidate).some((key) => usedPartyConflictKeys.has(key));
}

function addCandidatePartyConflictKeys(
  usedPartyConflictKeys: Set<string>,
  candidate: AutoBuildCandidate,
): void {
  resolveCandidatePartyConflictKeys(candidate).forEach((key) => usedPartyConflictKeys.add(key));
}

function countMatchingAbilityRequirementSlots(
  candidates: AutoBuildCandidate[],
  requirement: AutoBuildAbilityRequirement,
): number {
  return candidates.filter((candidate) => candidateMatchesAbilityRequirement(candidate, requirement))
    .length;
}

function resolveAbilityCoverage(
  candidates: AutoBuildCandidate[],
  requirements: AutoBuildAbilityRequirement[],
): AutoBuildAbilityCoverageState & { matchesAll: boolean } {
  if (!requirements.length) {
    return {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    };
  }

  const matched = requirements.filter(
    (requirement) =>
      countMatchingAbilityRequirementSlots(candidates, requirement) >=
      requirement.requiredCharacterCount,
  );
  const missing = requirements.filter(
    (requirement) =>
      countMatchingAbilityRequirementSlots(candidates, requirement) <
      requirement.requiredCharacterCount,
  );

  return {
    requested: requirements.map((requirement) => cloneAbilityRequirement(requirement)),
    matched: matched.map((requirement) => cloneAbilityRequirement(requirement)),
    missing: missing.map((requirement) => cloneAbilityRequirement(requirement)),
    matchesAll: missing.length === 0,
  };
}

export function buildAutoTeamResult(
  records: CharacterDetailRecord[],
  input: AutoBuildInput,
): AutoBuildCoreResult | null {
  const usableRecords = records.filter((record) => hasReadableEffectText(record));

  if (!usableRecords.length) {
    return null;
  }

  const candidates = usableRecords.map((record, index) =>
    buildAutoBuildCandidate(record, input, index, usableRecords.length),
  );
  const candidateById = new Map(candidates.map((candidate) => [candidate.character.id, candidate]));
  const manualSlotCandidateMap = resolveManualSlotCandidateMap(input.manualSlots, candidateById);

  if (!manualSlotCandidateMap) {
    return null;
  }
  const manualCharacterIdSet = new Set(input.manualSlots.flatMap((slot) => slot.characterIds));
  const captainOptions = resolveLeaderCandidateOptions(
    manualSlotCandidateMap.get('captain') ?? [],
    candidates,
    input,
  );
  const friendCaptainOptions = resolveLeaderCandidateOptions(
    manualSlotCandidateMap.get('friendCaptain') ?? [],
    candidates,
    input,
  );

  if (!captainOptions.length || !friendCaptainOptions.length) {
    return null;
  }

  const leaderPairOptions = buildLeaderPairOptions(captainOptions, friendCaptainOptions, input);

  for (const leaderPair of leaderPairOptions) {
    const leaders = resolveUniqueCandidates([leaderPair.captain, leaderPair.friendCaptain]);
    const leaderCriteria = resolveActiveLeaderCriteria(
      leaders,
      leaderPair.captain.character.id,
      leaderPair.friendCaptain.character.id,
    );
    const constrainedSubSelections = resolveConstrainedSubSelections(
      manualSlotCandidateMap,
      leaders,
      input,
      leaderCriteria,
    );

    if (!constrainedSubSelections) {
      continue;
    }

    const constrainedSubs = AUTO_BUILD_MANUAL_SUB_SLOT_ROLES
      .map((role) => constrainedSubSelections.get(role))
      .filter((candidate): candidate is AutoBuildCandidate => Boolean(candidate));
    const selectedSubs = selectSubs(candidates, leaders, input, leaderCriteria, constrainedSubs);

    if (selectedSubs.length < TEAM_SUB_SLOT_COUNT) {
      continue;
    }

    const orderedSubs = orderSelectedSubCandidates(constrainedSubSelections, selectedSubs);
    const teamCandidates = [leaderPair.captain, leaderPair.friendCaptain, ...orderedSubs];
    const coverage = summarizeCoverage(teamCandidates, input, leaderCriteria);

    if (input.requireAllSelectedTypesInTeam && !coverage.coversAllSelectedTypes) {
      continue;
    }

    if (input.requireAllSpecialsSupportTeam && !coverage.specialSupport.allSlotsMatch) {
      continue;
    }

    if (input.requiredAbilities.length && !coverage.abilityRequirements.matchesAll) {
      continue;
    }

    const slots: AutoBuildSlot[] = [
      {
        role: 'captain',
        character: leaderPair.captain.character,
        reasonChips: resolveSlotReasonChips(
          leaderPair.captain.reasonChips,
          manualCharacterIdSet.has(leaderPair.captain.character.id),
          input.requireAllSpecialsSupportTeam &&
            supportsTeamWithSpecial(leaderPair.captain, teamCandidates),
        ),
      },
      {
        role: 'friendCaptain',
        character: leaderPair.friendCaptain.character,
        reasonChips: resolveSlotReasonChips(
          leaderPair.friendCaptain.reasonChips,
          manualCharacterIdSet.has(leaderPair.friendCaptain.character.id),
          input.requireAllSpecialsSupportTeam &&
            supportsTeamWithSpecial(leaderPair.friendCaptain, teamCandidates),
        ),
      },
      ...orderedSubs.map((candidate) => ({
        role: 'sub' as const,
        character: candidate.character,
        reasonChips: resolveSlotReasonChips(
          candidate.reasonChips,
          manualCharacterIdSet.has(candidate.character.id),
          input.requireAllSpecialsSupportTeam && supportsTeamWithSpecial(candidate, teamCandidates),
        ),
      })),
    ];

    return {
      input,
      candidateCount: candidates.length,
      slots,
      coverage,
    };
  }

  return null;
}

function resolveManualSlotCandidateMap(
  manualSlots: AutoBuildManualSlotSelection[],
  candidateById: Map<number, AutoBuildCandidate>,
): Map<AutoBuildManualSlotRole, AutoBuildCandidate[]> | null {
  const slotCandidateMap = new Map<AutoBuildManualSlotRole, AutoBuildCandidate[]>();

  for (const slot of manualSlots) {
    const candidates = slot.characterIds
      .map((characterId) => candidateById.get(characterId))
      .filter((candidate): candidate is AutoBuildCandidate => Boolean(candidate));

    if (candidates.length !== slot.characterIds.length) {
      return null;
    }

    slotCandidateMap.set(slot.role, candidates);
  }

  return slotCandidateMap;
}

function resolveLeaderCandidateOptions(
  slotCandidates: AutoBuildCandidate[],
  candidates: AutoBuildCandidate[],
  input: AutoBuildInput,
): AutoBuildCandidate[] {
  const candidatePool = (slotCandidates.length ? slotCandidates : candidates).filter(
    (candidate) =>
      candidate.tags.readableCaptainText &&
      (!input.requireAllSelectedClassesPerCharacter || candidate.matchesAllSelectedClasses),
  );

  if (!slotCandidates.length) {
    return [...candidatePool]
      .sort((left, right) => scoreCaptain(right, input) - scoreCaptain(left, input))
      .slice(0, GLOBAL_LEADER_OPTION_LIMIT);
  }

  return candidatePool;
}

function buildLeaderPairOptions(
  captainOptions: AutoBuildCandidate[],
  friendCaptainOptions: AutoBuildCandidate[],
  input: AutoBuildInput,
): LeaderPairOption[] {
  const leaderPairs: LeaderPairOption[] = [];

  captainOptions.forEach((captain, captainIndex) => {
    friendCaptainOptions.forEach((friendCaptain, friendCaptainIndex) => {
      if (
        input.requireSameCaptainAndFriendCaptain &&
        captain.character.id !== friendCaptain.character.id
      ) {
        return;
      }

      leaderPairs.push({
        captain,
        friendCaptain,
        score:
          scoreCaptain(captain, input) +
          scoreCaptain(friendCaptain, input) +
          (captainOptions.length - captainIndex) / 100 +
          (friendCaptainOptions.length - friendCaptainIndex) / 100,
      });
    });
  });

  return leaderPairs.sort((left, right) => right.score - left.score);
}

function resolveConstrainedSubSelections(
  manualSlotCandidateMap: Map<AutoBuildManualSlotRole, AutoBuildCandidate[]>,
  leaders: AutoBuildCandidate[],
  input: AutoBuildInput,
  leaderCriteria: ActiveLeaderCriteria,
): Map<AutoBuildManualSlotRole, AutoBuildCandidate> | null {
  const leaderCandidates = resolveUniqueCandidates(leaders);
  const leaderCharacterIdSet = new Set(leaderCandidates.map((candidate) => candidate.character.id));
  const leaderPartyConflictKeySet =
    input.requireUniqueBaseCharacterNames && leaderCandidates[0]
      ? new Set(resolveCandidatePartyConflictKeys(leaderCandidates[0]))
      : new Set<string>();
  const coverage = createTeamCoverageState(leaderCandidates);
  const constrainedRoles = AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.filter(
    (role) => (manualSlotCandidateMap.get(role) ?? []).length > 0,
  );

  const searchSelections = (
    roleIndex: number,
    selectedSubMap: Map<AutoBuildManualSlotRole, AutoBuildCandidate>,
    selectedSubs: AutoBuildCandidate[],
    selectedIds: Set<number>,
    selectedPartyConflictKeys: Set<string>,
    currentCoverage: TeamCoverageState,
  ): Map<AutoBuildManualSlotRole, AutoBuildCandidate> | null => {
    if (roleIndex >= constrainedRoles.length) {
      return selectedSubMap;
    }

    const role = constrainedRoles[roleIndex];
    const slotCandidates = manualSlotCandidateMap.get(role) ?? [];
    const rankedCandidates = slotCandidates
      .map((candidate, index) => ({
        candidate,
        index,
      }))
      .filter(({ candidate }) => {
        return !(
          leaderCharacterIdSet.has(candidate.character.id) ||
          selectedIds.has(candidate.character.id) ||
          (input.requireUniqueBaseCharacterNames &&
            (hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) ||
              hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys))) ||
          (input.requireAllSelectedClassesPerCharacter && !candidate.matchesAllSelectedClasses) ||
          !matchesActiveLeaderCriteria(candidate, leaderCriteria) ||
          !matchesMutualSpecialCompatibility(
            candidate,
            [...leaderCandidates, ...selectedSubs],
            input.requireAllSpecialsSupportTeam,
          )
        );
      })
      .sort((left, right) => {
        const leftScore =
          scoreSubCandidate(
            left.candidate,
            leaderCandidates,
            currentCoverage,
            selectedSubs,
            input,
          ) +
          (slotCandidates.length - left.index) / 100;
        const rightScore =
          scoreSubCandidate(
            right.candidate,
            leaderCandidates,
            currentCoverage,
            selectedSubs,
            input,
          ) +
          (slotCandidates.length - right.index) / 100;

        return rightScore - leftScore;
      });

    for (const { candidate } of rankedCandidates) {
      const nextSelectedSubs = [...selectedSubs, candidate];
      const nextSelectedSubMap = new Map(selectedSubMap);
      const nextSelectedIds = new Set(selectedIds);
      const nextSelectedPartyConflictKeys = new Set(selectedPartyConflictKeys);
      const nextCoverage = cloneTeamCoverageState(currentCoverage);

      nextSelectedSubMap.set(role, candidate);
      nextSelectedIds.add(candidate.character.id);

      if (input.requireUniqueBaseCharacterNames) {
        addCandidatePartyConflictKeys(nextSelectedPartyConflictKeys, candidate);
      }

      applyCandidateCoverage(nextCoverage, candidate);

      const result = searchSelections(
        roleIndex + 1,
        nextSelectedSubMap,
        nextSelectedSubs,
        nextSelectedIds,
        nextSelectedPartyConflictKeys,
        nextCoverage,
      );

      if (result) {
        return result;
      }
    }

    return null;
  };

  return searchSelections(0, new Map(), [], new Set<number>(), new Set<string>(), coverage);
}

function orderSelectedSubCandidates(
  constrainedSubSelections: Map<AutoBuildManualSlotRole, AutoBuildCandidate>,
  selectedSubs: AutoBuildCandidate[],
): AutoBuildCandidate[] {
  const constrainedIds = new Set(
    [...constrainedSubSelections.values()].map((candidate) => candidate.character.id),
  );
  const autoSelectedSubs = selectedSubs.filter(
    (candidate) => !constrainedIds.has(candidate.character.id),
  );

  return AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.map((role) => {
    const constrainedCandidate = constrainedSubSelections.get(role);

    if (constrainedCandidate) {
      return constrainedCandidate;
    }

    const [nextAutoSelectedSub] = autoSelectedSubs.splice(0, 1);

    return nextAutoSelectedSub;
  }).filter((candidate): candidate is AutoBuildCandidate => Boolean(candidate));
}

export function buildAutoBuildCandidate(
  record: CharacterDetailRecord,
  input: AutoBuildInput,
  index: number,
  total: number,
): AutoBuildCandidate {
  const captainText = normalizeText(record.detail.captainAbility);
  const specialText = normalizeText(record.detail.specialText);
  const sailorText = normalizeText(record.detail.sailorAbilities.join(' '));
  const combinedText = [captainText, specialText, sailorText].filter(Boolean).join(' ');
  const matchedSelectedClasses = resolveMatchedSelectedClasses(record, input.selectedClasses);
  const matchesAllSelectedClasses = resolveMatchesAllSelectedClasses(record, input.selectedClasses);
  const matchedSelectedTypes = resolveMatchedSelectedTypes(record, input.types);
  const tags = parseEffectTags(input, captainText, specialText, sailorText);

  return {
    character: record,
    captainText,
    specialText,
    sailorText,
    combinedText,
    matchesSelectedClass: matchedSelectedClasses.length > 0,
    matchesAllSelectedClasses,
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
    normalizeText(record.detail.sailorAbilities.join(' ')),
  );
}

function selectSubs(
  candidates: AutoBuildCandidate[],
  leaders: AutoBuildCandidate[],
  input: AutoBuildInput,
  leaderCriteria: ActiveLeaderCriteria,
  lockedSubs: AutoBuildCandidate[] = [],
): AutoBuildCandidate[] {
  const selected = resolveUniqueCandidates(lockedSubs);
  const leaderCandidates = resolveUniqueCandidates(leaders);
  const leaderCharacterIdSet = new Set(leaderCandidates.map((candidate) => candidate.character.id));
  const leaderPartyConflictKeySet =
    input.requireUniqueBaseCharacterNames && leaderCandidates[0]
      ? new Set(resolveCandidatePartyConflictKeys(leaderCandidates[0]))
      : new Set<string>();

  if (selected.length > TEAM_SUB_SLOT_COUNT) {
    return [];
  }

  if (selected.some((candidate) => leaderCharacterIdSet.has(candidate.character.id))) {
    return [];
  }

  const selectedPartyConflictKeys = new Set<string>();

  if (input.requireUniqueBaseCharacterNames) {
    for (const candidate of selected) {
      if (
        hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) ||
        hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys)
      ) {
        return [];
      }

      addCandidatePartyConflictKeys(selectedPartyConflictKeys, candidate);
    }
  }

  if (
    input.requireAllSelectedClassesPerCharacter &&
    selected.some((candidate) => !candidate.matchesAllSelectedClasses)
  ) {
    return [];
  }

  if (selected.some((candidate) => !matchesActiveLeaderCriteria(candidate, leaderCriteria))) {
    return [];
  }

  if (
    input.requireAllSpecialsSupportTeam &&
    !areCandidatesMutuallySpecialCompatible([...leaderCandidates, ...selected])
  ) {
    return [];
  }

  const selectedIds = new Set(selected.map((candidate) => candidate.character.id));
  const coverage = createTeamCoverageState(leaderCandidates);
  selected.forEach((candidate) => applyCandidateCoverage(coverage, candidate));
  const pool = candidates.filter(
    (candidate) => {
      return (
        !leaderCharacterIdSet.has(candidate.character.id) &&
        !selectedIds.has(candidate.character.id) &&
        (!input.requireUniqueBaseCharacterNames ||
          (!hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) &&
            !hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys))) &&
        matchesActiveLeaderCriteria(candidate, leaderCriteria) &&
        matchesMutualSpecialCompatibility(
          candidate,
          [...leaderCandidates, ...selected],
          input.requireAllSpecialsSupportTeam,
        ) &&
        (!input.requireAllSelectedClassesPerCharacter || candidate.matchesAllSelectedClasses)
      );
    },
  );

  while (selected.length < TEAM_SUB_SLOT_COUNT) {
    const next = pool
      .filter((candidate) => {
        return (
          !selectedIds.has(candidate.character.id) &&
          (!input.requireUniqueBaseCharacterNames ||
            (!hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) &&
              !hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys))) &&
          matchesMutualSpecialCompatibility(
            candidate,
            [...leaderCandidates, ...selected],
            input.requireAllSpecialsSupportTeam,
          )
        );
      })
      .reduce<AutoBuildCandidate | null>((best, current) => {
        if (!best) {
          return current;
        }

        return scoreSubCandidate(current, leaderCandidates, coverage, selected, input) >
          scoreSubCandidate(best, leaderCandidates, coverage, selected, input)
          ? current
          : best;
      }, null);

    if (!next) {
      break;
    }

    selected.push(next);
    selectedIds.add(next.character.id);

    if (input.requireUniqueBaseCharacterNames) {
      addCandidatePartyConflictKeys(selectedPartyConflictKeys, next);
    }

    applyCandidateCoverage(coverage, next);
  }

  return selected;
}

function resolveSlotReasonChips(
  reasonChips: string[],
  isLocked: boolean,
  hasTeamwideSpecialSupport = false,
): string[] {
  const nextChips = [...reasonChips];

  if (hasTeamwideSpecialSupport && !nextChips.includes(TEAMWIDE_SPECIAL_REASON_CHIP)) {
    nextChips.unshift(TEAMWIDE_SPECIAL_REASON_CHIP);
  }

  if (isLocked && !nextChips.includes(LOCKED_REASON_CHIP)) {
    nextChips.unshift(LOCKED_REASON_CHIP);
  }

  return nextChips.slice(0, 4);
}

function scoreCaptain(candidate: AutoBuildCandidate, input: AutoBuildInput): number {
  let score = 0;
  const matchedTypeCount = candidate.tags.captainScope.matchedSelectedTypeCount;
  const matchedClassCount = candidate.tags.captainScope.matchedSelectedClassCount;
  const matchedRequiredAbilityCount = input.requiredAbilities.filter((requirement) =>
    candidateMatchesAbilityRequirement(candidate, requirement),
  ).length;

  score += candidate.tags.captainAtkMultiplier * 42;
  score += candidate.tags.captainHpMultiplier * 12;
  score += candidate.matchedSelectedClasses.length * 18;
  score += matchedClassCount * 18;
  score += matchedTypeCount * 12;
  score += candidate.tags.captainScope.coversAllSelectedClasses ? 48 : 0;
  score += candidate.tags.captainScope.coversAllSelectedTypes ? 56 : 0;
  score += candidate.tags.captainScope.allCharacters ? 120 : 0;
  score += candidate.tags.consistencyRoles.includes('cooldownReduction') ? 10 : 0;
  score += candidate.tags.consistencyRoles.some(
    (role) => role === 'matchingOrbs' || role === 'orbChange',
  )
    ? 8
    : 0;
  score += candidate.tags.utilityRoles.length ? 4 : 0;
  score += matchedRequiredAbilityCount * 28;
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

  if (input.requiredAbilities.length && matchedRequiredAbilityCount === 0) {
    score -= 18;
  }

  return score;
}

function scoreSubCandidate(
  candidate: AutoBuildCandidate,
  leaders: AutoBuildCandidate[],
  coverage: TeamCoverageState,
  selected: AutoBuildCandidate[],
  input: AutoBuildInput,
): number {
  let score = 0;
  const currentTeam = [...leaders, ...selected];
  const missingAbilityRequirements = resolveAbilityCoverage(
    currentTeam,
    input.requiredAbilities,
  ).missing;
  const matchedMissingAbilityCount = missingAbilityRequirements.filter((requirement) =>
    candidateMatchesAbilityRequirement(candidate, requirement),
  ).length;

  const uncoveredSelectedClasses = input.selectedClasses.filter(
    (selectedClass) => !coverage.selectedClasses.has(selectedClass),
  );
  const uncoveredSelectedTypes = input.types.filter((type) => !coverage.selectedTypes.has(type));
  const newClassCoverage = candidate.matchedSelectedClasses.filter(
    (selectedClass) => !coverage.selectedClasses.has(selectedClass),
  ).length;
  const newTypeCoverage = candidate.matchedSelectedTypes.filter(
    (type) => !coverage.selectedTypes.has(type),
  ).length;
  const damageCoverageMissing =
    !coverage.burst.has('colorAffinity') &&
    !coverage.burst.has('chainBoost') &&
    !coverage.burst.has('conditional');
  const consistencyMissing = coverage.consistency.size === 0;
  const utilityMissing = coverage.utility.size === 0;
  const hasUniversalLeader = leaders.some((leader) => leader.tags.captainScope.allCharacters);
  const hasClassScopedLeader = leaders.some((leader) => leader.tags.captainScope.matchesClass);
  const hasFullClassCoverageLeader = leaders.some(
    (leader) => leader.tags.captainScope.coversAllSelectedClasses,
  );
  const hasFullTypeCoverageLeader = leaders.some(
    (leader) => leader.tags.captainScope.coversAllSelectedTypes,
  );
  const hasTypeScopedLeader = leaders.some(
    (leader) => leader.tags.captainScope.matchedSelectedTypeCount > 0,
  );

  score += newClassCoverage * 44;
  score += newTypeCoverage * 36;
  score += matchedMissingAbilityCount * 58;
  score += candidate.matchesSelectedClass ? 18 : -8;
  score += candidate.recencyScore * 10;
  score += hasUniversalLeader ? 10 : 0;
  score += hasClassScopedLeader && candidate.matchesSelectedClass ? 12 : 0;
  score += hasFullClassCoverageLeader ? 8 : 0;
  score += hasFullTypeCoverageLeader ? 6 : 0;
  score += hasTypeScopedLeader ? 3 : 0;

  if (newClassCoverage && newTypeCoverage) {
    score += 12;
  }

  if (matchedMissingAbilityCount > 1) {
    score += 10;
  }

  if (
    input.requireAllSelectedClassesPerCharacter &&
    uncoveredSelectedClasses.length > 0 &&
    newClassCoverage === 0
  ) {
    score -= 18;
  }

  if (
    input.requireAllSelectedTypesInTeam &&
    uncoveredSelectedTypes.length > 0 &&
    newTypeCoverage === 0
  ) {
    score -= 16;
  }

  if (missingAbilityRequirements.length > 0 && matchedMissingAbilityCount === 0) {
    score -= 18;
  }

  score += scoreRolePresence(
    candidate.tags.burstRoles,
    'atkBoost',
    coverage.burst.has('atkBoost'),
    28,
    4,
  );
  score += scoreRolePresence(
    candidate.tags.burstRoles,
    'orbBoost',
    coverage.burst.has('orbBoost'),
    24,
    4,
  );
  score += scoreGroupedDamage(candidate, damageCoverageMissing);
  score += scoreConsistency(candidate, consistencyMissing);
  score += scoreUtility(candidate, utilityMissing);

  if (candidate.tags.utilityRoles.includes('defenseDown') && damageCoverageMissing) {
    score += 8;
  }

  if (!candidate.matchesSelectedClass && countSelectedClassMatches(selected) < 2) {
    score -= 12;
  }

  if (addsNoNewCoverage(candidate, coverage, missingAbilityRequirements)) {
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

  score += scoreRolePresence(
    candidate.tags.burstRoles,
    'colorAffinity',
    false,
    damageCoverageMissing ? 20 : 8,
    4,
  );
  score += scoreRolePresence(
    candidate.tags.burstRoles,
    'chainBoost',
    false,
    damageCoverageMissing ? 16 : 8,
    4,
  );
  score += scoreRolePresence(
    candidate.tags.burstRoles,
    'conditional',
    false,
    damageCoverageMissing ? 14 : 7,
    4,
  );

  return score;
}

function scoreConsistency(candidate: AutoBuildCandidate, consistencyMissing: boolean): number {
  let score = 0;

  score += scoreRolePresence(
    candidate.tags.consistencyRoles,
    'matchingOrbs',
    false,
    consistencyMissing ? 16 : 6,
    3,
  );
  score += scoreRolePresence(
    candidate.tags.consistencyRoles,
    'orbChange',
    false,
    consistencyMissing ? 12 : 5,
    3,
  );
  score += scoreRolePresence(
    candidate.tags.consistencyRoles,
    'cooldownReduction',
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

function resolveSpecialScope(specialText: string): AutoBuildSpecialScope {
  const hasQualifyingEffect = hasQualifyingSpecialEffect(specialText);
  const allCharacters =
    hasQualifyingEffect &&
    (includesAny(specialText, ['all characters', 'all units']) ||
      hasCrewWideSpecialTarget(specialText));
  const allowedClasses =
    allCharacters || !hasQualifyingEffect ? [] : extractAllowedSpecialClasses(specialText);
  const allowedTypes =
    allCharacters || !hasQualifyingEffect ? [] : extractAllowedSpecialTypes(specialText);
  const hasClassRestriction = !allCharacters && allowedClasses.length > 0;
  const hasTypeRestriction = !allCharacters && allowedTypes.length > 0;

  return {
    allCharacters,
    allowedClasses,
    allowedTypes,
    hasClassRestriction,
    hasTypeRestriction,
    hasExplicitTarget: allCharacters || hasClassRestriction || hasTypeRestriction,
    hasQualifyingEffect,
  };
}

function hasQualifyingSpecialEffect(specialText: string): boolean {
  return Boolean(
    specialText.length &&
    (textHasAtkBoost(specialText) ||
      includesAny(specialText, ['orb effects', 'slot effect']) ||
      specialText.includes('color affinity') ||
      includesAny(specialText, [
        'boosts the chain multiplier',
        'boost chain',
        'chain multiplier by +',
      ]) ||
      includesAny(specialText, ['conditional', 'against enemies with', 'if the enemy is']) ||
      specialText.includes('matching orbs') ||
      (specialText.includes('changes') && specialText.includes('orbs'))),
  );
}

function hasCrewWideSpecialTarget(specialText: string): boolean {
  return includesAny(specialText, [
    'changes crew orbs',
    'crew orbs into matching orbs',
    'boosts atk of crew',
    'boosts orb effects of crew',
    'boosts slot effect of crew',
    'boosts color affinity of crew',
    'boosts the chain multiplier of crew',
    'boost chain of crew',
    'conditional boost of crew',
  ]);
}

function parseEffectTags(
  input: AutoBuildInput,
  captainText: string,
  specialText: string,
  sailorText: string,
): AutoBuildEffectTags {
  const selectedClasses = input.selectedClasses;
  const selectedTypes = input.types;
  const combinedText = [captainText, specialText, sailorText].filter(Boolean).join(' ');
  const burstRoles = uniqueRoles<AutoBuildBurstRole>([
    textHasAtkBoost(combinedText) ? 'atkBoost' : null,
    includesAny(combinedText, ['orb effects', 'slot effect']) ? 'orbBoost' : null,
    combinedText.includes('color affinity') ? 'colorAffinity' : null,
    includesAny(combinedText, [
      'boosts the chain multiplier',
      'boost chain',
      'chain multiplier by +',
    ])
      ? 'chainBoost'
      : null,
    includesAny(combinedText, ['conditional', 'against enemies with', 'if the enemy is'])
      ? 'conditional'
      : null,
  ]);
  const consistencyRoles = uniqueRoles<AutoBuildConsistencyRole>([
    combinedText.includes('matching orbs') ? 'matchingOrbs' : null,
    combinedText.includes('changes') && combinedText.includes('orbs') ? 'orbChange' : null,
    combinedText.includes('special cooldown') ? 'cooldownReduction' : null,
  ]);
  const utilityRoles = uniqueRoles<AutoBuildUtilityRole>([
    combinedText.includes('bind') ? 'bind' : null,
    combinedText.includes('despair') ? 'despair' : null,
    combinedText.includes('paralysis') ? 'paralysis' : null,
    combinedText.includes('atk down') ? 'atkDown' : null,
    includesAny(combinedText, ['damage reduction']) ? 'damageReduction' : null,
    includesAny(combinedText, ['threshold damage reduction']) ? 'threshold' : null,
    includesAny(combinedText, ['defense down', 'reduces the defense']) ? 'defenseDown' : null,
  ]);
  const allCharacters = includesAny(captainText, ['all characters', 'all units']);
  const allowedClasses = allCharacters ? [] : extractAllowedCaptainClasses(captainText);
  const allowedTypes = allCharacters ? [] : extractAllowedCaptainTypes(captainText);
  const matchedSelectedClasses = allCharacters
    ? [...selectedClasses]
    : selectedClasses.filter((selectedClass) =>
        allowedClasses.some(
          (allowedClass) => allowedClass.toLowerCase() === selectedClass.toLowerCase(),
        ),
      );
  const matchedSelectedTypes = allCharacters
    ? [...selectedTypes]
    : selectedTypes.filter((type) => allowedTypes.includes(type));

  return {
    captainScope: {
      allCharacters,
      allowedClasses,
      allowedTypes,
      hasClassRestriction: !allCharacters && allowedClasses.length > 0,
      hasTypeRestriction: !allCharacters && allowedTypes.length > 0,
      matchedSelectedClasses,
      matchedSelectedClassCount: matchedSelectedClasses.length,
      coversAllSelectedClasses:
        selectedClasses.length > 0 && matchedSelectedClasses.length === selectedClasses.length,
      matchedSelectedTypes,
      matchedSelectedTypeCount: matchedSelectedTypes.length,
      coversAllSelectedTypes:
        selectedTypes.length > 0 && matchedSelectedTypes.length === selectedTypes.length,
      matchesClass: matchedSelectedClasses.length > 0,
    },
    specialScope: resolveSpecialScope(specialText),
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

function buildReasonChips(
  input: AutoBuildInput,
  tags: AutoBuildEffectTags,
  matchesSelectedClass: boolean,
): string[] {
  const chips: string[] = [];

  if (matchesSelectedClass) {
    chips.push(CHIP_LABELS.matchesClass);
  }

  if (tags.captainScope.allCharacters) {
    chips.push('Universal captain');
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
  roles:
    | readonly AutoBuildBurstRole[]
    | readonly AutoBuildConsistencyRole[]
    | readonly AutoBuildUtilityRole[],
): void {
  roles.forEach((role) => {
    const label = CHIP_LABELS[role];

    if (label && !chips.includes(label)) {
      chips.push(label);
    }
  });
}

function summarizeCoverage(
  candidates: AutoBuildCandidate[],
  input: AutoBuildInput,
  leaderCriteria: ActiveLeaderCriteria,
): AutoBuildCoverageSummary {
  const burst = new Set<AutoBuildBurstRole>();
  const consistency = new Set<AutoBuildConsistencyRole>();
  const utility = new Set<AutoBuildUtilityRole>();
  const coveredSelectedClasses = new Set<string>();
  const coveredSelectedTypes = new Set<AutoTeamBuilderType>();

  candidates.forEach((candidate) => {
    candidate.tags.burstRoles.forEach((role) => burst.add(role));
    candidate.tags.consistencyRoles.forEach((role) => consistency.add(role));
    candidate.tags.utilityRoles.forEach((role) => utility.add(role));
    candidate.matchedSelectedClasses.forEach((selectedClass) =>
      coveredSelectedClasses.add(selectedClass),
    );
    candidate.matchedSelectedTypes.forEach((type) => coveredSelectedTypes.add(type));
  });

  const coveredClassesList = input.selectedClasses.filter((selectedClass) =>
    coveredSelectedClasses.has(selectedClass),
  );
  const coveredTypesList = input.types.filter((type) => coveredSelectedTypes.has(type));
  const abilityRequirements = resolveAbilityCoverage(candidates, input.requiredAbilities);

  return {
    leaderCriteria: summarizeLeaderCriteria(candidates, leaderCriteria),
    specialSupport: summarizeSpecialSupport(candidates, input.requireAllSpecialsSupportTeam),
    abilityRequirements,
    burst: [...burst].map((role) => CHIP_LABELS[role]),
    consistency: [...consistency].map((role) => CHIP_LABELS[role]),
    utility: [...utility].map((role) => CHIP_LABELS[role]),
    coveredSelectedClasses: coveredClassesList,
    coveredSelectedTypes: coveredTypesList,
    coversAllSelectedClasses:
      input.selectedClasses.length === 0 ||
      coveredClassesList.length === input.selectedClasses.length,
    coversAllSelectedTypes:
      input.types.length === 0 || coveredTypesList.length === input.types.length,
    selectedClassMatches: candidates.filter((candidate) => candidate.matchesSelectedClass).length,
    selectedTypeMatches: candidates.filter((candidate) => candidate.matchedSelectedTypes.length > 0)
      .length,
  };
}

function resolveTypeCaptainLabel(
  selectedTypes: AutoBuildInput['types'],
  matchedSelectedTypes: AutoTeamBuilderType[],
): string {
  const typesToDisplay = matchedSelectedTypes.length ? matchedSelectedTypes : selectedTypes;
  return `${typesToDisplay.join(' / ')} captain`;
}

function createTeamCoverageState(leaders: AutoBuildCandidate[]): TeamCoverageState {
  const coverage: TeamCoverageState = {
    burst: new Set<AutoBuildBurstRole>(),
    consistency: new Set<AutoBuildConsistencyRole>(),
    utility: new Set<AutoBuildUtilityRole>(),
    selectedClasses: new Set<string>(),
    selectedTypes: new Set<AutoTeamBuilderType>(),
  };

  leaders.forEach((leader) => applyCandidateCoverage(coverage, leader));
  return coverage;
}

function cloneTeamCoverageState(coverage: TeamCoverageState): TeamCoverageState {
  return {
    burst: new Set(coverage.burst),
    consistency: new Set(coverage.consistency),
    utility: new Set(coverage.utility),
    selectedClasses: new Set(coverage.selectedClasses),
    selectedTypes: new Set(coverage.selectedTypes),
  };
}

function summarizeSpecialSupport(
  candidates: AutoBuildCandidate[],
  enabled: boolean,
): AutoBuildSpecialSupportSummary {
  const matchingSlots = candidates.filter((candidate) =>
    supportsTeamWithSpecial(candidate, candidates),
  ).length;

  return {
    source: 'specialText',
    enabled,
    matchingSlots,
    totalSlots: candidates.length,
    allSlotsMatch: matchingSlots === candidates.length,
  };
}

function areCandidatesMutuallySpecialCompatible(candidates: AutoBuildCandidate[]): boolean {
  return candidates.every((candidate) =>
    candidates.every((targetCandidate) => supportsCandidateWithSpecial(candidate, targetCandidate)),
  );
}

function matchesMutualSpecialCompatibility(
  candidate: AutoBuildCandidate,
  selectedCandidates: AutoBuildCandidate[],
  enabled: boolean,
): boolean {
  return !enabled || areCandidatesMutuallySpecialCompatible([...selectedCandidates, candidate]);
}

function supportsTeamWithSpecial(
  candidate: AutoBuildCandidate,
  teamCandidates: AutoBuildCandidate[],
): boolean {
  return teamCandidates.every((targetCandidate) =>
    supportsCandidateWithSpecial(candidate, targetCandidate),
  );
}

function supportsCandidateWithSpecial(
  sourceCandidate: AutoBuildCandidate,
  targetCandidate: AutoBuildCandidate,
): boolean {
  const { specialScope } = sourceCandidate.tags;

  if (!specialScope.hasQualifyingEffect) {
    return false;
  }

  if (specialScope.allCharacters) {
    return true;
  }

  if (!specialScope.hasExplicitTarget) {
    return false;
  }

  const matchesClassScope = specialScope.hasClassRestriction
    ? targetCandidate.character.classes.some((characterClass) =>
        specialScope.allowedClasses.some(
          (allowedClass) => allowedClass.toLowerCase() === characterClass.toLowerCase(),
        ),
      )
    : true;
  const targetTypes = resolveCharacterTypeTokens(targetCandidate.character.type);
  const matchesTypeScope = specialScope.hasTypeRestriction
    ? targetTypes.some((type) => specialScope.allowedTypes.includes(type))
    : true;

  return matchesClassScope && matchesTypeScope;
}

function resolveUniqueCandidates(candidates: AutoBuildCandidate[]): AutoBuildCandidate[] {
  return [...new Map(candidates.map((candidate) => [candidate.character.id, candidate])).values()];
}

function applyCandidateCoverage(coverage: TeamCoverageState, candidate: AutoBuildCandidate): void {
  candidate.tags.burstRoles.forEach((role) => coverage.burst.add(role));
  candidate.tags.consistencyRoles.forEach((role) => coverage.consistency.add(role));
  candidate.tags.utilityRoles.forEach((role) => coverage.utility.add(role));
  candidate.matchedSelectedClasses.forEach((selectedClass) =>
    coverage.selectedClasses.add(selectedClass),
  );
  candidate.matchedSelectedTypes.forEach((type) => coverage.selectedTypes.add(type));
}

function addsNoNewCoverage(
  candidate: AutoBuildCandidate,
  coverage: TeamCoverageState,
  missingAbilityRequirements: AutoBuildAbilityRequirement[],
): boolean {
  return (
    candidate.tags.burstRoles.every((role) => coverage.burst.has(role)) &&
    candidate.tags.consistencyRoles.every((role) => coverage.consistency.has(role)) &&
    candidate.tags.utilityRoles.every((role) => coverage.utility.has(role)) &&
    candidate.matchedSelectedClasses.every((selectedClass) =>
      coverage.selectedClasses.has(selectedClass),
    ) &&
    candidate.matchedSelectedTypes.every((type) => coverage.selectedTypes.has(type)) &&
    missingAbilityRequirements.every(
      (requirement) => !candidateMatchesAbilityRequirement(candidate, requirement),
    )
  );
}

function countSelectedClassMatches(selected: AutoBuildCandidate[]): number {
  return selected.filter((candidate) => candidate.matchesSelectedClass).length;
}

function countSharedBurstRoles(
  candidate: AutoBuildCandidate,
  selected: AutoBuildCandidate[],
): number {
  return selected.reduce((count, entry) => {
    const shared = candidate.tags.burstRoles.filter((role) => entry.tags.burstRoles.includes(role));
    return count + shared.length;
  }, 0);
}

function resolveMatchedSelectedClasses(
  record: CharacterDetailRecord,
  selectedClasses: string[],
): string[] {
  if (!selectedClasses.length) {
    return [];
  }

  const normalizedRecordClasses = record.classes.map((characterClass) =>
    characterClass.toLowerCase(),
  );

  return selectedClasses.filter((selectedClass) =>
    normalizedRecordClasses.includes(selectedClass.toLowerCase()),
  );
}

function resolveMatchesAllSelectedClasses(
  record: CharacterDetailRecord,
  selectedClasses: string[],
): boolean {
  if (!selectedClasses.length) {
    return true;
  }

  return resolveMatchedSelectedClasses(record, selectedClasses).length === selectedClasses.length;
}

function resolveMatchedSelectedTypes(
  record: CharacterDetailRecord,
  selectedTypes: AutoTeamBuilderType[],
): AutoTeamBuilderType[] {
  const recordTypes = resolveCharacterTypeTokens(record.type);

  return selectedTypes.filter((type) => recordTypes.includes(type));
}

export function resolveCharacterTypeTokens(typeValue: string): AutoTeamBuilderType[] {
  return [...new Set(typeValue.split(',').map((entry) => entry.trim()))].filter(
    (entry): entry is AutoTeamBuilderType =>
      AUTO_TEAM_BUILDER_TYPES.includes(entry as AutoTeamBuilderType),
  );
}

function resolveActiveLeaderCriteria(
  leaders: AutoBuildCandidate[],
  captainLeaderId: number | null,
  friendCaptainLeaderId: number | null,
): ActiveLeaderCriteria {
  const uniqueLeaders = resolveUniqueCandidates(leaders);
  const classScope = resolveIntersectedLeaderDimension(
    uniqueLeaders,
    AUTO_TEAM_BUILDER_CLASSES,
    (leader) => leader.tags.captainScope.allowedClasses,
    (leader) => leader.tags.captainScope.hasClassRestriction,
  );
  const typeScope = resolveIntersectedLeaderDimension(
    uniqueLeaders,
    AUTO_TEAM_BUILDER_TYPES,
    (leader) => leader.tags.captainScope.allowedTypes,
    (leader) => leader.tags.captainScope.hasTypeRestriction,
  );

  return {
    source: 'captainAbility',
    captainLeaderId,
    friendCaptainLeaderId,
    leaderIds: uniqueLeaders.map((leader) => leader.character.id),
    leaderNames: uniqueLeaders.map((leader) => leader.character.name),
    dualLeaderMode: uniqueLeaders.length > 1 ? 'intersection' : 'single',
    derivedAllowedClasses: classScope.values,
    derivedAllowedTypes: typeScope.values,
    hasClassRestriction: classScope.restricted,
    hasTypeRestriction: typeScope.restricted,
  };
}

function resolveIntersectedLeaderDimension<T extends string>(
  leaders: AutoBuildCandidate[],
  orderedValues: readonly T[],
  resolveAllowedValues: (leader: AutoBuildCandidate) => readonly T[],
  hasRestriction: (leader: AutoBuildCandidate) => boolean,
): { values: T[]; restricted: boolean } {
  const restrictedScopes = leaders
    .filter((leader) => hasRestriction(leader))
    .map((leader) => new Set(resolveAllowedValues(leader)));

  if (!restrictedScopes.length) {
    return {
      values: [],
      restricted: false,
    };
  }

  return {
    values: orderedValues.filter((value) => restrictedScopes.every((scope) => scope.has(value))),
    restricted: true,
  };
}

function summarizeLeaderCriteria(
  candidates: AutoBuildCandidate[],
  leaderCriteria: ActiveLeaderCriteria,
): AutoBuildLeaderCriteriaSummary {
  const matchingSlots = candidates.filter((candidate) =>
    matchesActiveLeaderCriteria(candidate, leaderCriteria),
  ).length;

  return {
    ...leaderCriteria,
    matchingSlots,
    totalSlots: candidates.length,
    allSlotsMatch: matchingSlots === candidates.length,
  };
}

function matchesActiveLeaderCriteria(
  candidate: AutoBuildCandidate,
  leaderCriteria: ActiveLeaderCriteria,
): boolean {
  const matchesClassScope = leaderCriteria.hasClassRestriction
    ? candidate.character.classes.some((characterClass) =>
        leaderCriteria.derivedAllowedClasses.some(
          (allowedClass) => allowedClass.toLowerCase() === characterClass.toLowerCase(),
        ),
      )
    : true;
  const characterTypes = resolveCharacterTypeTokens(candidate.character.type);
  const matchesTypeScope = leaderCriteria.hasTypeRestriction
    ? characterTypes.some((type) => leaderCriteria.derivedAllowedTypes.includes(type))
    : true;

  return matchesClassScope && matchesTypeScope;
}

function extractAllowedCaptainClasses(captainText: string): string[] {
  return extractAllowedScopeClasses(captainText);
}

function extractAllowedCaptainTypes(captainText: string): AutoTeamBuilderType[] {
  return extractAllowedScopeTypes(captainText);
}

function extractAllowedSpecialClasses(specialText: string): string[] {
  return extractAllowedScopeClasses(specialText);
}

function extractAllowedSpecialTypes(specialText: string): AutoTeamBuilderType[] {
  return extractAllowedScopeTypes(specialText);
}

function extractAllowedScopeClasses(text: string): string[] {
  const clauses = extractScopeClauses(text);

  return AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    clauses.some((clause) => textMatchesClassScope(clause, characterClass)),
  );
}

function extractAllowedScopeTypes(text: string): AutoTeamBuilderType[] {
  const clauses = extractScopeClauses(text);

  return AUTO_TEAM_BUILDER_TYPES.filter((type) =>
    clauses.some((clause) => textMatchesTypeScope(clause, type)),
  );
}

function extractScopeClauses(text: string): string[] {
  return [...text.matchAll(SCOPE_CLAUSE_PATTERN)]
    .map((match) => normalizeText(match[1]))
    .filter(Boolean);
}

function textMatchesClassScope(text: string, selectedClass: string): boolean {
  return textHasLabelToken(text, selectedClass);
}

function extractHighestMultiplier(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].reduce((highest, match) => {
    const value = Number(match[1]);
    return Number.isFinite(value) && value > highest ? value : highest;
  }, 0);
}

function textHasAtkBoost(text: string): boolean {
  return includesAny(text, ['boosts atk', 'atk by', 'atk of']);
}

function textMatchesTypeScope(text: string, type: AutoTeamBuilderType): boolean {
  const normalizedType = type.toLowerCase();
  const escapedType = normalizedType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return (
    includesAny(text, [...TYPE_MATCH_PATTERNS[type]]) ||
    new RegExp(`(?:^|[^a-z])${escapedType}(?:[^a-z]|$)`, 'i').test(text)
  );
}

function textHasLabelToken(text: string, value: string): boolean {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue.length) {
    return false;
  }

  const escapedValue = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z])${escapedValue}(?:[^a-z]|$)`, 'i').test(text);
}

function uniqueRoles<T extends string>(roles: Array<T | null>): T[] {
  return [...new Set(roles.filter((role): role is T => Boolean(role)))];
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
