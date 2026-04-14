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
const COST_UPPER_BOUND_PATTERN = /\bcost\s+(\d+)\s+or\s+(?:less|lower)\b/i;
const HIGH_COST_PENALTY_PATTERN =
  /\b(?:reduces?|decreases?|cuts?|lowers?|weakens?)\b[^.]*\bcost\s+\d+\s+or\s+higher\b/i;
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
const EXTRA_DROP_LEADER_ABILITY_KEY_SET = new Set(['extra_drop_any', 'extra_drop_guaranteed']);
const CHARACTER_NAME_KEY_ALIASES: Record<string, string[]> = {
  aokiji: ['kuzan'],
  akainu: ['sakazuki'],
  'big mom': ['charlotte linlin'],
  blackbeard: ['marshall d teach'],
  'bon clay': ['bentham'],
  corazon: ['donquixote rosinante'],
  'cat viper': ['nekomamushi'],
  dogstorm: ['inuarashi'],
  fujitora: ['issho'],
  kizaru: ['borsalino'],
  komurasaki: ['kozuki hiyori'],
  'mr 1': ['daz bones'],
  'mr 2 bon clay': ['bentham'],
  'mr 3': ['galdino'],
  'mr 4': ['babe'],
  'mr 5': ['gem'],
  'miss doublefinger': ['zala'],
  'miss goldenweek': ['marianne'],
  'miss merry christmas': ['drophy'],
  'miss valentine': ['mikita'],
  'tenguyama hitetsu': ['kozuki sukiyaki'],
  whitebeard: ['edward newgate'],
  violet: ['viola'],
  z: ['zephyr'],
};

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

function resolvePowerFirstCostBucket(cost: number): number {
  return cost >= 1 && cost <= 65 ? 0 : 1;
}

function compareCharactersByPowerPreference(
  left: Pick<CharacterDetailRecord, 'cost' | 'id'>,
  right: Pick<CharacterDetailRecord, 'cost' | 'id'>,
): number {
  const bucketDifference =
    resolvePowerFirstCostBucket(left.cost) - resolvePowerFirstCostBucket(right.cost);

  if (bucketDifference !== 0) {
    return bucketDifference;
  }

  if (resolvePowerFirstCostBucket(left.cost) === 0 && left.cost !== right.cost) {
    return right.cost - left.cost;
  }

  return right.id - left.id;
}

function compareCandidatesByPowerPreference(
  left: AutoBuildCandidate,
  right: AutoBuildCandidate,
): number {
  return compareCharactersByPowerPreference(left.character, right.character);
}

function compareCaptainsBySelectionPreference(
  left: AutoBuildCandidate,
  right: AutoBuildCandidate,
  input: AutoBuildInput,
): number {
  const powerPreferenceDifference = compareCandidatesByPowerPreference(left, right);

  if (powerPreferenceDifference !== 0) {
    return powerPreferenceDifference;
  }

  return scoreCaptain(right, input) - scoreCaptain(left, input);
}

function resolveCandidatePowerPreferenceScore(candidate: AutoBuildCandidate): number {
  const { cost, id } = candidate.character;

  if (resolvePowerFirstCostBucket(cost) === 0) {
    return cost + id / 1_000_000;
  }

  return -Math.max(cost - 65, 1) + id / 1_000_000;
}

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
  const baseNameWithoutParentheses = normalizePartyConflictKey(
    name.split(' - ', 1)[0]?.replace(/\([^)]*\)/g, ' ') ?? '',
  );

  if (baseNameWithoutParentheses.length > 0) {
    keys.add(baseNameWithoutParentheses);
  }

  const parentheticalKeys = [...name.matchAll(/\(([^)]+)\)/g)]
    .map((match) => normalizePartyConflictKey(match[1]))
    .filter((value) => value.length > 0);

  parentheticalKeys.forEach((value) => keys.add(value));

  if (primaryKey.includes('&')) {
    primaryKey
      .split('&')
      .map((value) => normalizePartyConflictKey(value))
      .filter((value) => value.length > 0)
      .forEach((value) => keys.add(value));
  }

  const baseNameParts = baseNameWithoutParentheses
    .split(' ')
    .map((value) => normalizePartyConflictKey(value))
    .filter((value) => value.length > 0);
  const [lastBaseNamePart = ''] = baseNameParts.slice(-1);

  if (baseNameParts.length >= 2 && lastBaseNamePart.length > 1) {
    keys.add(lastBaseNamePart);
  }

  for (const key of [...keys]) {
    (CHARACTER_NAME_KEY_ALIASES[key] ?? []).forEach((alias) => keys.add(alias));
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

function candidateMatchesSuperCriteriaCharacterOption(
  candidate: AutoBuildCandidate,
  option: { acceptedKeys: string[] },
): boolean {
  const candidateKeys = resolveCandidatePartyConflictKeys(candidate);

  return option.acceptedKeys.some((acceptedKey) => candidateKeys.includes(acceptedKey));
}

function candidateMatchesSuperCriteriaClassOrTypeBranch(
  candidate: AutoBuildCandidate,
  branch: {
    allowedClasses?: string[];
    allowedTypes?: string[];
    requiredClasses?: string[];
    requiredTypes?: string[];
  },
): boolean {
  const allowedClasses = branch.allowedClasses ?? branch.requiredClasses ?? [];
  const allowedTypes = branch.allowedTypes ?? branch.requiredTypes ?? [];
  const matchesClass =
    allowedClasses.length > 0 &&
    candidate.character.classes.some((characterClass) =>
      allowedClasses.some((allowedClass) => allowedClass.toLowerCase() === characterClass.toLowerCase()),
    );
  const characterTypes = resolveCharacterTypeTokens(candidate.character.type);
  const matchesType = allowedTypes.length > 0
    ? characterTypes.some((type) =>
        allowedTypes.some((allowedType) => allowedType.toLowerCase() === type.toLowerCase()),
      )
    : false;

  return matchesClass || matchesType;
}

function countSatisfiedCharacterOptions(
  candidates: AutoBuildCandidate[],
  options: Array<{ acceptedKeys: string[] }>,
): number {
  const remainingOptions = [...options];
  let matches = 0;

  for (const candidate of candidates) {
    const matchIndex = remainingOptions.findIndex((option) =>
      candidateMatchesSuperCriteriaCharacterOption(candidate, option),
    );

    if (matchIndex === -1) {
      continue;
    }

    remainingOptions.splice(matchIndex, 1);
    matches += 1;
  }

  return matches;
}

function countMatchingSuperCriteriaBranchCandidates(
  candidates: AutoBuildCandidate[],
  branch: Extract<
    NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>['rosterBranches'][number],
    { branchType: 'class_or_type_count_any' }
  >,
): number {
  return candidates.filter((candidate) =>
    candidateMatchesSuperCriteriaClassOrTypeBranch(candidate, branch),
  ).length;
}

function countSatisfiedPresenceRequirements(
  candidates: AutoBuildCandidate[],
  branch: Extract<
    NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>['rosterBranches'][number],
    { branchType: 'class_or_type_presence_all' }
  >,
): number {
  const satisfiedClasses = new Set<string>();
  const satisfiedTypes = new Set<string>();

  candidates.forEach((candidate) => {
    candidate.character.classes.forEach((characterClass) => {
      if (
        branch.requiredClasses.some(
          (requiredClass) => requiredClass.toLowerCase() === characterClass.toLowerCase(),
        )
      ) {
        satisfiedClasses.add(characterClass.toLowerCase());
      }
    });
    resolveCharacterTypeTokens(candidate.character.type).forEach((type) => {
      if (branch.requiredTypes.some((requiredType) => requiredType.toLowerCase() === type.toLowerCase())) {
        satisfiedTypes.add(type.toLowerCase());
      }
    });
  });

  const matchedClassCount = branch.requiredClasses.filter((requiredClass) =>
    satisfiedClasses.has(requiredClass.toLowerCase()),
  ).length;
  const matchedTypeCount = branch.requiredTypes.filter((requiredType) =>
    satisfiedTypes.has(requiredType.toLowerCase()),
  ).length;

  return matchedClassCount + matchedTypeCount;
}

function branchSatisfiedByCandidates(
  branch: NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>['rosterBranches'][number],
  candidates: AutoBuildCandidate[],
): boolean {
  if (branch.branchType === 'character_count_any') {
    return countSatisfiedCharacterOptions(candidates, branch.options) >= branch.requiredCount;
  }

  if (branch.branchType === 'class_or_type_count_any') {
    return countMatchingSuperCriteriaBranchCandidates(candidates, branch) >= branch.requiredCount;
  }

  return (
    countSatisfiedPresenceRequirements(candidates, branch) >=
    branch.requiredClasses.length + branch.requiredTypes.length
  );
}

function resolveSuperCriteriaBranchProgress(
  branch: NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>['rosterBranches'][number],
  candidates: AutoBuildCandidate[],
): number {
  if (branch.branchType === 'character_count_any') {
    return Math.min(branch.requiredCount, countSatisfiedCharacterOptions(candidates, branch.options));
  }

  if (branch.branchType === 'class_or_type_count_any') {
    return Math.min(
      branch.requiredCount,
      countMatchingSuperCriteriaBranchCandidates(candidates, branch),
    );
  }

  return Math.min(
    branch.requiredClasses.length + branch.requiredTypes.length,
    countSatisfiedPresenceRequirements(candidates, branch),
  );
}

function leaderSuperCriteriaSatisfied(
  leader: AutoBuildCandidate,
  candidates: AutoBuildCandidate[],
): boolean {
  const criteria = leader.character.detail.superSpecialCriteria;

  if (!criteria) {
    return true;
  }

  if (criteria.parserStatus === 'non_roster_only' || criteria.parserStatus === 'unsupported') {
    return false;
  }

  if (criteria.requiresCaptain) {
    // This validation only runs for selected leaders, so the captain requirement is already met.
  }

  return criteria.rosterBranches.some((branch) => branchSatisfiedByCandidates(branch, candidates));
}

function resolveLeaderSuperCriteriaContribution(
  candidate: AutoBuildCandidate,
  leaders: AutoBuildCandidate[],
  selectedCandidates: AutoBuildCandidate[],
): number {
  const nextCandidates = [...leaders, ...selectedCandidates, candidate];

  return leaders.reduce((total, leader) => {
    const criteria = leader.character.detail.superSpecialCriteria;

    if (
      !criteria ||
      criteria.parserStatus === 'non_roster_only' ||
      criteria.parserStatus === 'unsupported' ||
      leaderSuperCriteriaSatisfied(leader, [...leaders, ...selectedCandidates])
    ) {
      return total;
    }

    const currentProgress = criteria.rosterBranches.reduce(
      (bestProgress, branch) =>
        Math.max(bestProgress, resolveSuperCriteriaBranchProgress(branch, [...leaders, ...selectedCandidates])),
      0,
    );
    const nextProgress = criteria.rosterBranches.reduce(
      (bestProgress, branch) =>
        Math.max(bestProgress, resolveSuperCriteriaBranchProgress(branch, nextCandidates)),
      0,
    );

    return total + Math.max(nextProgress - currentProgress, 0);
  }, 0);
}

function areLeaderSuperCriteriaSatisfied(
  leaders: AutoBuildCandidate[],
  teamCandidates: AutoBuildCandidate[],
  enabled: boolean,
): boolean {
  if (!enabled) {
    return true;
  }

  return leaders.every((leader) => leaderSuperCriteriaSatisfied(leader, teamCandidates));
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

function isLeaderOnlyAbilityRequirement(requirement: AutoBuildAbilityRequirement): boolean {
  return EXTRA_DROP_LEADER_ABILITY_KEY_SET.has(requirement.abilityKey);
}

function splitAbilityRequirementsByScope(requirements: AutoBuildAbilityRequirement[]): {
  leaderOnlyRequirements: AutoBuildAbilityRequirement[];
  teamRequirements: AutoBuildAbilityRequirement[];
} {
  return {
    leaderOnlyRequirements: requirements.filter((requirement) =>
      isLeaderOnlyAbilityRequirement(requirement),
    ),
    teamRequirements: requirements.filter((requirement) => !isLeaderOnlyAbilityRequirement(requirement)),
  };
}

function leaderSatisfiesAbilityRequirement(
  leader: AutoBuildCandidate,
  requirement: AutoBuildAbilityRequirement,
): boolean {
  return candidateMatchesAbilityRequirement(leader, requirement);
}

function leadersSatisfyAbilityRequirement(
  leaders: AutoBuildCandidate[],
  requirement: AutoBuildAbilityRequirement,
): boolean {
  return leaders.length > 0 && leaders.every((leader) => leaderSatisfiesAbilityRequirement(leader, requirement));
}

function resolveAbilityCoverage(
  candidates: AutoBuildCandidate[],
  requirements: AutoBuildAbilityRequirement[],
  leaderCandidates: AutoBuildCandidate[] = [],
): AutoBuildAbilityCoverageState & { matchesAll: boolean } {
  if (!requirements.length) {
    return {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    };
  }

  const matched = requirements.filter((requirement) =>
    isLeaderOnlyAbilityRequirement(requirement)
      ? leadersSatisfyAbilityRequirement(leaderCandidates, requirement)
      : countMatchingAbilityRequirementSlots(candidates, requirement) >=
        requirement.requiredCharacterCount,
  );
  const missing = requirements.filter((requirement) =>
    isLeaderOnlyAbilityRequirement(requirement)
      ? !leadersSatisfyAbilityRequirement(leaderCandidates, requirement)
      : countMatchingAbilityRequirementSlots(candidates, requirement) <
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
    const leaderSlots = [leaderPair.captain, leaderPair.friendCaptain];
    const teamCandidates = [...leaderSlots, ...orderedSubs];
    const coverage = summarizeCoverage(teamCandidates, input, leaderCriteria, leaderSlots);

    if (input.requireAllSelectedTypesInTeam && !coverage.coversAllSelectedTypes) {
      continue;
    }

    if (
      input.requireLeaderSuperSpecialCriteria &&
      !areLeaderSuperCriteriaSatisfied(leaders, teamCandidates, input.requireLeaderSuperSpecialCriteria)
    ) {
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
        ),
      },
      {
        role: 'friendCaptain',
        character: leaderPair.friendCaptain.character,
        reasonChips: resolveSlotReasonChips(
          leaderPair.friendCaptain.reasonChips,
          manualCharacterIdSet.has(leaderPair.friendCaptain.character.id),
        ),
      },
      ...orderedSubs.map((candidate) => ({
        role: 'sub' as const,
        character: candidate.character,
        reasonChips: resolveSlotReasonChips(
          candidate.reasonChips,
          manualCharacterIdSet.has(candidate.character.id),
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
  const { leaderOnlyRequirements } = splitAbilityRequirementsByScope(input.requiredAbilities);
  const candidatePool = (slotCandidates.length ? slotCandidates : candidates).filter(
    (candidate) =>
      candidate.tags.readableCaptainText &&
      leaderOnlyRequirements.every((requirement) =>
        leaderSatisfiesAbilityRequirement(candidate, requirement),
      ) &&
      (!input.requireAllSelectedClassesPerCharacter || candidate.matchesAllSelectedClasses),
  );

  if (!slotCandidates.length) {
    return [...candidatePool]
      .sort((left, right) => compareCaptainsBySelectionPreference(left, right, input))
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

  return leaderPairs.sort((left, right) => {
    const captainDifference = compareCaptainsBySelectionPreference(left.captain, right.captain, input);

    if (captainDifference !== 0) {
      return captainDifference;
    }

    const friendCaptainDifference = compareCaptainsBySelectionPreference(
      left.friendCaptain,
      right.friendCaptain,
      input,
    );

    if (friendCaptainDifference !== 0) {
      return friendCaptainDifference;
    }

    return right.score - left.score;
  });
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
          !matchesActiveLeaderCriteria(candidate, leaderCriteria)
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

        const scoreDifference = rightScore - leftScore;

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return compareCandidatesByPowerPreference(left.candidate, right.candidate);
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
              !hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys)))
        );
      })
      .reduce<AutoBuildCandidate | null>((best, current) => {
        if (!best) {
          return current;
        }

        const currentScore = scoreSubCandidate(current, leaderCandidates, coverage, selected, input);
        const bestScore = scoreSubCandidate(best, leaderCandidates, coverage, selected, input);

        if (currentScore !== bestScore) {
          return currentScore > bestScore ? current : best;
        }

        return compareCandidatesByPowerPreference(current, best) < 0 ? current : best;
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
): string[] {
  const nextChips = [...reasonChips];

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
    leaderSatisfiesAbilityRequirement(candidate, requirement),
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
  const { teamRequirements } = splitAbilityRequirementsByScope(input.requiredAbilities);
  const missingAbilityRequirements = resolveAbilityCoverage(
    currentTeam,
    teamRequirements,
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
  score +=
    resolveLeaderSuperCriteriaContribution(candidate, leaders, selected) *
    (input.requireLeaderSuperSpecialCriteria ? 160 : 36);
  score += candidate.matchesSelectedClass ? 18 : -8;
  score += candidate.recencyScore * 10;
  score += resolveCandidatePowerPreferenceScore(candidate);
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
  const maxAllowedCost =
    allCharacters || !hasQualifyingEffect ? null : extractScopedMaxAllowedCost(specialText);
  const hasCostRestriction = maxAllowedCost !== null;
  const hasClassRestriction = !allCharacters && allowedClasses.length > 0;
  const hasTypeRestriction = !allCharacters && allowedTypes.length > 0;

  return {
    allCharacters,
    allowedClasses,
    allowedTypes,
    hasCostRestriction,
    maxAllowedCost,
    hasClassRestriction,
    hasTypeRestriction,
    hasExplicitTarget: allCharacters || hasClassRestriction || hasTypeRestriction || hasCostRestriction,
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
  const maxAllowedCost = extractCaptainMaxAllowedCost(captainText);
  const hasCostRestriction = maxAllowedCost !== null;
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
      hasCostRestriction,
      maxAllowedCost,
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
  leaderCandidates: AutoBuildCandidate[],
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
  const abilityRequirements = resolveAbilityCoverage(
    candidates,
    input.requiredAbilities,
    leaderCandidates,
  );

  return {
    leaderCriteria: summarizeLeaderCriteria(candidates, leaderCriteria),
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
  const matchesCostScope = specialScope.hasCostRestriction
    ? targetCandidate.character.cost <= (specialScope.maxAllowedCost ?? Number.POSITIVE_INFINITY)
    : true;

  return matchesClassScope && matchesTypeScope && matchesCostScope;
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
  const costScope = resolveIntersectedLeaderCostScope(uniqueLeaders);

  return {
    source: 'captainAbility',
    captainLeaderId,
    friendCaptainLeaderId,
    leaderIds: uniqueLeaders.map((leader) => leader.character.id),
    leaderNames: uniqueLeaders.map((leader) => leader.character.name),
    dualLeaderMode: uniqueLeaders.length > 1 ? 'intersection' : 'single',
    derivedAllowedClasses: classScope.values,
    derivedAllowedTypes: typeScope.values,
    hasCostRestriction: costScope.restricted,
    maxAllowedCost: costScope.maxAllowedCost,
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

function resolveIntersectedLeaderCostScope(
  leaders: AutoBuildCandidate[],
): { maxAllowedCost: number | null; restricted: boolean } {
  const costLimits = leaders
    .filter((leader) => leader.tags.captainScope.hasCostRestriction)
    .map((leader) => leader.tags.captainScope.maxAllowedCost)
    .filter((value): value is number => value !== null);

  if (!costLimits.length) {
    return {
      maxAllowedCost: null,
      restricted: false,
    };
  }

  return {
    maxAllowedCost: Math.min(...costLimits),
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
  const matchesCostScope = leaderCriteria.hasCostRestriction
    ? candidate.character.cost <= (leaderCriteria.maxAllowedCost ?? Number.POSITIVE_INFINITY)
    : true;

  return matchesClassScope && matchesTypeScope && matchesCostScope;
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

function extractCaptainMaxAllowedCost(text: string): number | null {
  const scopedMaxAllowedCost = extractScopedMaxAllowedCost(text);

  if (scopedMaxAllowedCost !== null) {
    return scopedMaxAllowedCost;
  }

  return HIGH_COST_PENALTY_PATTERN.test(text) ? extractPenalizedCostUpperBound(text) : null;
}

function extractScopedMaxAllowedCost(text: string): number | null {
  const costLimits = extractScopeClauses(text)
    .map((clause) => extractCostUpperBound(clause))
    .filter((value): value is number => value !== null);

  return costLimits.length ? Math.min(...costLimits) : null;
}

function extractScopeClauses(text: string): string[] {
  return [...text.matchAll(SCOPE_CLAUSE_PATTERN)]
    .map((match) => normalizeText(match[1]))
    .filter(Boolean);
}

function extractPenalizedCostUpperBound(text: string): number | null {
  const normalizedText = normalizeText(text);
  const match = normalizedText.match(/\bcost\s+(\d+)\s+or\s+higher\b/);

  if (!match) {
    return null;
  }

  const lowerBound = Number(match[1]);
  return Number.isFinite(lowerBound) ? lowerBound - 1 : null;
}

function extractCostUpperBound(text: string): number | null {
  const match = normalizeText(text).match(COST_UPPER_BOUND_PATTERN);

  if (!match) {
    return null;
  }

  const maxAllowedCost = Number(match[1]);
  return Number.isFinite(maxAllowedCost) ? maxAllowedCost : null;
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
