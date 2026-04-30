import {
  type AutoBuildAbilityCoverageBreakdown,
  type AutoBuildAbilityCoverageBreakdownItem,
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
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';
import conflictOverrideCatalog from '../data/auto-team-builder-party-conflict-overrides.json';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import { normalizeHtmlToText } from './html-text.utils';
import { cloneRequiredCharacterGroup } from './required-character-groups.utils';

const CAPTAIN_BRANCH_PATTERN =
  /\b(always active|standard captain|powered up captain|rampage captain)\s*:\s*/gi;
const CAPTAIN_EFFECT_CLAUSE_SEPARATOR =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)|\s+\band\s+(?=(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)/gi;
const SCOPE_CLAUSE_PATTERN = /\b(?:of|for)\s+([^.;]{1,160}?)\s+(?:characters|units)\b/g;
const SUPER_EFFECT_SCOPE_CLAUSE_PATTERN =
  /\b(?:changes?|transforms?)\s+([^.;]{1,160}?)\s+(?:characters|units)\s+(?:to|into)\s+(?:a\s+|an\s+)?super\b/gi;
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
const DEFAULT_CAPTAIN_BRANCH_LABELS = new Set(['always active', 'standard captain']);

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
const MANUAL_PICK_REASON_CHIP = 'Manual pick';
const EXTRA_DROP_LEADER_ABILITY_KEY_SET = new Set(['extra_drop_any', 'extra_drop_guaranteed']);
const CHARACTER_NAME_KEY_ALIASES: Record<string, string[]> = {
  aokiji: ['kuzan'],
  akainu: ['sakazuki'],
  'big mom': ['charlotte linlin'],
  blackbeard: ['marshall d teach'],
  'bon clay': ['bentham'],
  cora: ['corazon', 'donquixote rosinante'],
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

interface ActiveLeaderSuperEffectScope {
  derivedAllowedClasses: string[];
  derivedAllowedTypes: AutoTeamBuilderType[];
  hasClassRestriction: boolean;
  hasTypeRestriction: boolean;
  isParseable: boolean;
  hasSuperEffects: boolean;
}

interface LeaderPairOption {
  captain: AutoBuildCandidate;
  captainIndex: number;
  friendCaptain: AutoBuildCandidate;
  friendCaptainIndex: number;
}

interface AutoTeamBuildAttemptOptions {
  requireLeadersWithoutSuperEffects?: boolean;
  friendCaptainRecords?: CharacterDetailRecord[];
  autoFillCharacterIds?: number[];
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
}

type PartyConflictCharacter = Pick<CharacterListItem, 'id' | 'name'> &
  Partial<Pick<CharacterDetailRecord, 'detail'>>;

const PARTY_CONFLICT_KEY_OVERRIDES = new Map<number, string[]>(
  Object.entries(conflictOverrideCatalog).map(([characterId, keys]) => [
    Number(characterId),
    Array.isArray(keys) ? keys.map((value) => String(value)) : [],
  ]),
);

function resolvePowerScoreCostBucket(cost: number): number {
  return cost >= 1 && cost <= 65 ? 0 : 1;
}

function compareCharactersByNewestId(
  left: Pick<CharacterDetailRecord, 'id'>,
  right: Pick<CharacterDetailRecord, 'id'>,
): number {
  return right.id - left.id;
}

function compareCandidatesByNewestId(left: AutoBuildCandidate, right: AutoBuildCandidate): number {
  return compareCharactersByNewestId(left.character, right.character);
}

export function resolveAutoBuildCharacterPowerPreferenceScore(
  character: Pick<CharacterDetailRecord, 'cost' | 'id'>,
): number {
  const { cost, id } = character;

  if (resolvePowerScoreCostBucket(cost) === 0) {
    return cost + id / 1_000_000;
  }

  return -Math.max(cost - 65, 1) + id / 1_000_000;
}

export function resolveAutoBuildTeamPowerPreferenceScore(
  characters: Array<Pick<CharacterDetailRecord, 'cost' | 'id'>>,
): number {
  return characters.reduce(
    (total, character) => total + resolveAutoBuildCharacterPowerPreferenceScore(character),
    0,
  );
}

function candidateMatchesAbilityRequirement(
  candidate: AutoBuildCandidate,
  requirement: AutoBuildAbilityRequirement,
): boolean {
  return candidate.character.detail.builderAbilities.some((ability) =>
    matchesAbilityRequirement(ability, requirement),
  );
}

function cloneRequiredCharacterGroupsForCoverage(
  groups: AutoBuildRequiredCharacterGroup[],
): AutoBuildRequiredCharacterGroup[] {
  return groups.map((group) => cloneRequiredCharacterGroup(group));
}

function cloneAbilityRequirement(
  requirement: AutoBuildAbilityRequirement,
): AutoBuildAbilityRequirement {
  const slotScope = normalizeAbilityRequirementSlotScope(requirement.slotScope);
  const nextRequirement: AutoBuildAbilityRequirement = {
    ...requirement,
    slotTokens: [...requirement.slotTokens],
  };

  if (slotScope === 'any') {
    delete nextRequirement.slotScope;
  } else {
    nextRequirement.slotScope = slotScope;
  }

  return nextRequirement;
}

export function buildAutoBuildAbilityCoverageBreakdown(
  characters: CharacterDetailRecord[],
): AutoBuildAbilityCoverageBreakdown {
  const abilityMap = new Map<string, AutoBuildAbilityCoverageBreakdownItem>();

  characters.forEach((character) => {
    character.detail.builderAbilities.forEach((ability) => {
      const existing = abilityMap.get(ability.key);

      if (existing) {
        if (!existing.characterIds.includes(character.id)) {
          existing.characterIds.push(character.id);
          existing.count += 1;
        }
        return;
      }

      abilityMap.set(ability.key, {
        key: ability.key,
        label: ability.label,
        count: 1,
        characterIds: [character.id],
      });
    });
  });

  const sortedAbilities = [...abilityMap.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });

  return {
    distinctAbilityCount: sortedAbilities.length,
    allAbilities: sortedAbilities,
    uniqueAbilities: sortedAbilities.filter((ability) => ability.count === 1),
    duplicateAbilities: sortedAbilities.filter((ability) => ability.count > 1),
  };
}

export function normalizePartyConflictKey(name: string): string {
  const trimmedName = name
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return trimmedName.toLowerCase();
}

export function resolveCharacterBaseNameKey(name: string): string {
  const trimmedName = name
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function normalizeSuperCriteriaKey(value: string): string {
  return normalizePartyConflictKey(
    value
      .replace(/^\[([^\]]+)\]$/, '$1')
      .replace(/\bcharacters?\b$/i, '')
      .replace(/\bunits?\b$/i, ''),
  );
}

function resolveCandidateSuperCriteriaKeys(candidate: AutoBuildCandidate): string[] {
  const characterTags = Array.isArray(candidate.character.detail.characterTags)
    ? candidate.character.detail.characterTags
    : [];
  const searchableText = [
    candidate.character.name,
    candidate.character.searchText ?? '',
    candidate.character.primaryClass,
    candidate.character.secondaryClass ?? '',
    candidate.character.type,
    ...candidate.character.classes,
    ...characterTags,
  ];

  return [
    ...new Set(
      [...resolveCandidatePartyConflictKeys(candidate), ...searchableText]
        .flatMap((value) =>
          String(value ?? '')
            .split(',')
            .map((entry) => normalizeSuperCriteriaKey(entry)),
        )
        .filter((value) => value.length > 0),
    ),
  ];
}

function candidateMatchesSuperCriteriaCharacterOption(
  candidate: AutoBuildCandidate,
  option: { acceptedKeys: string[] },
): boolean {
  const candidateKeys = resolveCandidateSuperCriteriaKeys(candidate);

  return option.acceptedKeys.some((acceptedKey) => {
    const normalizedAcceptedKey = normalizeSuperCriteriaKey(acceptedKey);

    return candidateKeys.some(
      (candidateKey) =>
        candidateKey === normalizedAcceptedKey || candidateKey.includes(normalizedAcceptedKey),
    );
  });
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
      allowedClasses.some(
        (allowedClass) => allowedClass.toLowerCase() === characterClass.toLowerCase(),
      ),
    );
  const characterTypes = resolveCharacterTypeTokens(candidate.character.type);
  const matchesType =
    allowedTypes.length > 0
      ? characterTypes.some((type) =>
          allowedTypes.some((allowedType) => allowedType.toLowerCase() === type.toLowerCase()),
        )
      : false;

  return matchesClass || matchesType;
}

function countSatisfiedCharacterOptions(
  candidates: AutoBuildCandidate[],
  branch: Extract<
    NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>['rosterBranches'][number],
    { branchType: 'character_count_any' }
  >,
): number {
  const options = branch.options;

  if (branch.matchMode === 'any_candidate') {
    return candidates.filter((candidate) =>
      options.some((option) => candidateMatchesSuperCriteriaCharacterOption(candidate, option)),
    ).length;
  }

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
      if (
        branch.requiredTypes.some(
          (requiredType) => requiredType.toLowerCase() === type.toLowerCase(),
        )
      ) {
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
  branch: NonNullable<
    CharacterDetailRecord['detail']['superSpecialCriteria']
  >['rosterBranches'][number],
  candidates: AutoBuildCandidate[],
): boolean {
  if (branch.branchType === 'character_count_any') {
    return countSatisfiedCharacterOptions(candidates, branch) >= branch.requiredCount;
  }

  if (branch.branchType === 'class_or_type_count_any') {
    return countMatchingSuperCriteriaBranchCandidates(candidates, branch) >= branch.requiredCount;
  }

  return (
    countSatisfiedPresenceRequirements(candidates, branch) >=
    branch.requiredClasses.length + branch.requiredTypes.length
  );
}

function superCriteriaSatisfied(
  superUnit: AutoBuildCandidate,
  candidates: AutoBuildCandidate[],
  isLeader: boolean,
): boolean {
  const criteria = superUnit.character.detail.superSpecialCriteria;

  if (!criteria) {
    return true;
  }

  if (criteria.parserStatus === 'non_roster_only' || criteria.parserStatus === 'unsupported') {
    return false;
  }

  if (criteria.requiresCaptain && !isLeader) {
    return false;
  }

  const eligibleCandidates = criteria.excludesSelf
    ? candidates.filter((candidate) => candidate.character.id !== superUnit.character.id)
    : candidates;

  return criteria.rosterBranches.some((branch) =>
    branchSatisfiedByCandidates(branch, eligibleCandidates),
  );
}

function areActiveSuperCriteriaSatisfied(
  leaderSlots: AutoBuildCandidate[],
  teamCandidates: AutoBuildCandidate[],
  enabled: boolean,
): boolean {
  if (!enabled) {
    return true;
  }

  const leaderIds = new Set(leaderSlots.map((leader) => leader.character.id));

  return resolveUniqueCandidates(teamCandidates)
    .filter((candidate) => hasCandidateSuperEffects(candidate))
    .every((candidate) =>
      superCriteriaSatisfied(candidate, teamCandidates, leaderIds.has(candidate.character.id)),
    );
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

function isExtraDropLeaderAbilityRequirement(requirement: AutoBuildAbilityRequirement): boolean {
  return EXTRA_DROP_LEADER_ABILITY_KEY_SET.has(requirement.abilityKey);
}

function isLeaderScopedAbilityRequirement(requirement: AutoBuildAbilityRequirement): boolean {
  return (
    normalizeAbilityRequirementSlotScope(requirement.slotScope) === 'leader' ||
    isExtraDropLeaderAbilityRequirement(requirement)
  );
}

function resolveAbilityRequirementCandidatePool(
  candidates: AutoBuildCandidate[],
  requirement: AutoBuildAbilityRequirement,
  leaderCandidates: AutoBuildCandidate[],
): AutoBuildCandidate[] {
  if (isLeaderScopedAbilityRequirement(requirement)) {
    return leaderCandidates;
  }

  if (normalizeAbilityRequirementSlotScope(requirement.slotScope) !== 'sub') {
    return candidates;
  }

  return candidates.filter((candidate) => !leaderCandidates.includes(candidate));
}

function candidateCanSatisfyAbilityRequirementInSlot(
  candidate: AutoBuildCandidate,
  requirement: AutoBuildAbilityRequirement,
  leaderCandidates: AutoBuildCandidate[],
): boolean {
  if (!candidateMatchesAbilityRequirement(candidate, requirement)) {
    return false;
  }

  const isLeader = leaderCandidates.includes(candidate);

  if (isLeaderScopedAbilityRequirement(requirement)) {
    return isLeader;
  }

  if (normalizeAbilityRequirementSlotScope(requirement.slotScope) === 'sub') {
    return !isLeader;
  }

  return true;
}

function candidateMatchesRequiredCharacterGroup(
  candidate: AutoBuildCandidate,
  group: AutoBuildRequiredCharacterGroup,
  leaderCandidates: AutoBuildCandidate[],
): boolean {
  return (
    group.abilities.length > 0 &&
    group.abilities.every((requirement) =>
      candidateCanSatisfyAbilityRequirementInSlot(candidate, requirement, leaderCandidates),
    )
  );
}

function resolveMatchedRequiredCharacterGroupIndexes(
  candidates: AutoBuildCandidate[],
  groups: AutoBuildRequiredCharacterGroup[],
  leaderCandidates: AutoBuildCandidate[],
): Set<number> {
  const groupOrder = groups
    .map((group, index) => ({ group, index }))
    .sort(
      (left, right) =>
        right.group.abilities.length - left.group.abilities.length || left.index - right.index,
    );
  const candidateAssignment = new Map<number, number>();

  const assignGroup = (groupOrderIndex: number, visitedCandidateIndexes: Set<number>): boolean => {
    const groupEntry = groupOrder[groupOrderIndex];

    if (!groupEntry) {
      return false;
    }

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      if (visitedCandidateIndexes.has(candidateIndex)) {
        continue;
      }

      const candidate = candidates[candidateIndex];

      if (
        !candidate ||
        !candidateMatchesRequiredCharacterGroup(candidate, groupEntry.group, leaderCandidates)
      ) {
        continue;
      }

      visitedCandidateIndexes.add(candidateIndex);
      const assignedGroupIndex = candidateAssignment.get(candidateIndex);

      if (
        assignedGroupIndex === undefined ||
        assignGroup(assignedGroupIndex, visitedCandidateIndexes)
      ) {
        candidateAssignment.set(candidateIndex, groupOrderIndex);
        return true;
      }
    }

    return false;
  };

  for (let groupOrderIndex = 0; groupOrderIndex < groupOrder.length; groupOrderIndex += 1) {
    assignGroup(groupOrderIndex, new Set<number>());
  }

  return new Set(
    [...candidateAssignment.values()].map((groupOrderIndex) => groupOrder[groupOrderIndex]!.index),
  );
}

function splitExtraDropAbilityRequirements(requirements: AutoBuildAbilityRequirement[]): {
  leaderOnlyRequirements: AutoBuildAbilityRequirement[];
  teamRequirements: AutoBuildAbilityRequirement[];
} {
  return {
    leaderOnlyRequirements: requirements.filter((requirement) =>
      isExtraDropLeaderAbilityRequirement(requirement),
    ),
    teamRequirements: requirements.filter(
      (requirement) => !isExtraDropLeaderAbilityRequirement(requirement),
    ),
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
  return (
    leaders.length > 0 &&
    leaders.every((leader) => leaderSatisfiesAbilityRequirement(leader, requirement))
  );
}

interface AbilityRequirementDemand {
  requirement: AutoBuildAbilityRequirement;
  requirementIndex: number;
  demandIndex: number;
}

function buildAbilityRequirementDemandGroupKey(requirement: AutoBuildAbilityRequirement): string {
  return `${requirement.abilityKey.trim()}|${normalizeAbilityRequirementSlotScope(requirement.slotScope)}`;
}

function compareAbilityRequirementDemandStrictness(
  left: AbilityRequirementDemand,
  right: AbilityRequirementDemand,
): number {
  const leftTurns = left.requirement.minTurns ?? 0;
  const rightTurns = right.requirement.minTurns ?? 0;

  return (
    rightTurns - leftTurns ||
    right.requirement.slotTokens.length - left.requirement.slotTokens.length ||
    right.requirement.slotTokens.join(',').localeCompare(left.requirement.slotTokens.join(',')) ||
    left.requirementIndex - right.requirementIndex ||
    left.demandIndex - right.demandIndex
  );
}

function resolveMatchedAbilityDemandIndexes(
  demands: AbilityRequirementDemand[],
  candidates: AutoBuildCandidate[],
): Set<number> {
  const orderedDemands = [...demands].sort(compareAbilityRequirementDemandStrictness);
  const candidateAssignment = new Map<number, number>();

  const assignDemand = (
    demandOrderIndex: number,
    visitedCandidateIndexes: Set<number>,
  ): boolean => {
    const demand = orderedDemands[demandOrderIndex];

    if (!demand) {
      return false;
    }

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      if (visitedCandidateIndexes.has(candidateIndex)) {
        continue;
      }

      const candidate = candidates[candidateIndex];

      if (!candidate || !candidateMatchesAbilityRequirement(candidate, demand.requirement)) {
        continue;
      }

      visitedCandidateIndexes.add(candidateIndex);
      const assignedDemandIndex = candidateAssignment.get(candidateIndex);

      if (
        assignedDemandIndex === undefined ||
        assignDemand(assignedDemandIndex, visitedCandidateIndexes)
      ) {
        candidateAssignment.set(candidateIndex, demandOrderIndex);
        return true;
      }
    }

    return false;
  };

  for (let demandOrderIndex = 0; demandOrderIndex < orderedDemands.length; demandOrderIndex += 1) {
    assignDemand(demandOrderIndex, new Set<number>());
  }

  return new Set(
    [...candidateAssignment.values()].map((demandOrderIndex) => {
      const demand = orderedDemands[demandOrderIndex]!;

      return demand.demandIndex;
    }),
  );
}

function resolveMatchedTeamAbilityRequirementIndexes(
  candidates: AutoBuildCandidate[],
  requirements: AutoBuildAbilityRequirement[],
  leaderCandidates: AutoBuildCandidate[],
): Set<number> {
  const demandGroups = new Map<string, AbilityRequirementDemand[]>();
  let demandIndex = 0;

  requirements.forEach((requirement, requirementIndex) => {
    const groupKey = buildAbilityRequirementDemandGroupKey(requirement);
    const demands = demandGroups.get(groupKey) ?? [];

    for (let index = 0; index < requirement.requiredCharacterCount; index += 1) {
      demands.push({
        requirement,
        requirementIndex,
        demandIndex,
      });
      demandIndex += 1;
    }

    demandGroups.set(groupKey, demands);
  });

  const matchedRequirementIndexes = new Set<number>();

  for (const demands of demandGroups.values()) {
    const [firstDemand] = demands;

    if (!firstDemand) {
      continue;
    }

    const candidatePool = resolveAbilityRequirementCandidatePool(
      candidates,
      firstDemand.requirement,
      leaderCandidates,
    );
    const matchedDemandIndexes = resolveMatchedAbilityDemandIndexes(demands, candidatePool);
    const matchedCountsByRequirement = new Map<number, number>();

    for (const demand of demands) {
      if (!matchedDemandIndexes.has(demand.demandIndex)) {
        continue;
      }

      matchedCountsByRequirement.set(
        demand.requirementIndex,
        (matchedCountsByRequirement.get(demand.requirementIndex) ?? 0) + 1,
      );
    }

    for (const demand of demands) {
      if (
        (matchedCountsByRequirement.get(demand.requirementIndex) ?? 0) >=
        demand.requirement.requiredCharacterCount
      ) {
        matchedRequirementIndexes.add(demand.requirementIndex);
      }
    }
  }

  return matchedRequirementIndexes;
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

  const teamRequirementIndexes = requirements
    .map((requirement, index) => ({ requirement, index }))
    .filter(({ requirement }) => !isExtraDropLeaderAbilityRequirement(requirement));
  const matchedTeamRequirementIndexes = resolveMatchedTeamAbilityRequirementIndexes(
    candidates,
    teamRequirementIndexes.map(({ requirement }) => requirement),
    leaderCandidates,
  );
  const matchedRequirementIndexes = new Set<number>();

  requirements.forEach((requirement, requirementIndex) => {
    if (isExtraDropLeaderAbilityRequirement(requirement)) {
      if (leadersSatisfyAbilityRequirement(leaderCandidates, requirement)) {
        matchedRequirementIndexes.add(requirementIndex);
      }

      return;
    }

    const teamRequirementIndex = teamRequirementIndexes.findIndex(
      ({ index }) => index === requirementIndex,
    );

    if (matchedTeamRequirementIndexes.has(teamRequirementIndex)) {
      matchedRequirementIndexes.add(requirementIndex);
    }
  });
  const matched = requirements.filter((_, index) => matchedRequirementIndexes.has(index));
  const missing = requirements.filter((_, index) => !matchedRequirementIndexes.has(index));

  return {
    requested: requirements.map((requirement) => cloneAbilityRequirement(requirement)),
    matched: matched.map((requirement) => cloneAbilityRequirement(requirement)),
    missing: missing.map((requirement) => cloneAbilityRequirement(requirement)),
    matchesAll: missing.length === 0,
  };
}

function resolveRequiredCharacterGroupCoverage(
  candidates: AutoBuildCandidate[],
  groups: AutoBuildRequiredCharacterGroup[],
  leaderCandidates: AutoBuildCandidate[] = [],
): AutoBuildCoverageSummary['requiredCharacterGroups'] {
  if (!groups.length) {
    return {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    };
  }

  const matchedIndexes = resolveMatchedRequiredCharacterGroupIndexes(
    candidates,
    groups,
    leaderCandidates,
  );
  const matched = groups.filter((_, index) => matchedIndexes.has(index));
  const missing = groups.filter((_, index) => !matchedIndexes.has(index));

  return {
    requested: cloneRequiredCharacterGroupsForCoverage(groups),
    matched: cloneRequiredCharacterGroupsForCoverage(matched),
    missing: cloneRequiredCharacterGroupsForCoverage(missing),
    matchesAll: missing.length === 0,
  };
}

export function buildAutoTeamResult(
  records: CharacterDetailRecord[],
  input: AutoBuildInput,
  options: AutoTeamBuildAttemptOptions = {},
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
  const manualCharacterIdSet = new Set(input.manualSlots.flatMap((slot) => slot.characterIds));
  const ignoredOverflowLockedCharacterIdSet =
    input.lockedCharacterIds.length > manualCharacterIdSet.size && manualCharacterIdSet.size > 0
      ? new Set(
          input.lockedCharacterIds.filter((characterId) => !manualCharacterIdSet.has(characterId)),
        )
      : input.lockedCharacterIds.length > TEAM_SUB_SLOT_COUNT + 1
        ? new Set(input.lockedCharacterIds.slice(TEAM_SUB_SLOT_COUNT + 1))
        : null;
  const leaderAutoFillCandidateIdSet = options.leaderAutoFillCharacterIds
    ? new Set(options.leaderAutoFillCharacterIds)
    : options.autoFillCharacterIds
      ? new Set(options.autoFillCharacterIds)
      : null;
  const subAutoFillCandidateIdSet = options.subAutoFillCharacterIds
    ? new Set(options.subAutoFillCharacterIds)
    : options.autoFillCharacterIds
      ? new Set(options.autoFillCharacterIds)
      : null;
  const leaderAutoFillCandidates = (
    leaderAutoFillCandidateIdSet
      ? candidates.filter((candidate) => leaderAutoFillCandidateIdSet.has(candidate.character.id))
      : candidates
  ).filter((candidate) => !ignoredOverflowLockedCharacterIdSet?.has(candidate.character.id));
  const subAutoFillCandidates = (
    subAutoFillCandidateIdSet
      ? candidates.filter((candidate) => subAutoFillCandidateIdSet.has(candidate.character.id))
      : candidates
  ).filter((candidate) => !ignoredOverflowLockedCharacterIdSet?.has(candidate.character.id));
  const manualFriendCaptainCandidates = manualSlotCandidateMap.get('friendCaptain') ?? [];
  const friendCaptainCandidates = resolveFriendCaptainCandidatePool(
    input,
    leaderAutoFillCandidates,
    options.friendCaptainRecords ?? [],
    leaderAutoFillCandidateIdSet,
  );
  const captainOptions = resolveLeaderCandidateOptions(
    manualSlotCandidateMap.get('captain') ?? [],
    leaderAutoFillCandidates,
    input,
    options,
  );
  const friendCaptainOptions = resolveLeaderCandidateOptions(
    manualFriendCaptainCandidates,
    friendCaptainCandidates,
    input,
    options,
  );

  if (!captainOptions.length || !friendCaptainOptions.length) {
    return null;
  }

  const leaderPairOptions = buildLeaderPairOptions(captainOptions, friendCaptainOptions, {
    preserveCaptainOrder: (manualSlotCandidateMap.get('captain') ?? []).length > 0,
    preserveFriendCaptainOrder: manualFriendCaptainCandidates.length > 0,
  });

  for (const leaderPair of leaderPairOptions) {
    const leaderSlots = [leaderPair.captain, leaderPair.friendCaptain];
    const leaders = resolveUniqueCandidates(leaderSlots);
    const leaderCriteria = resolveActiveLeaderCriteria(
      leaders,
      leaderPair.captain.character.id,
      leaderPair.friendCaptain.character.id,
    );
    const leaderSuperEffectScope = resolveActiveLeaderSuperEffectScope(leaders);
    const requiredLeaderSuperEffectMatchingSlots =
      resolveRequiredLeaderSuperEffectMatchingSlots(input);

    if (
      requiredLeaderSuperEffectMatchingSlots !== null &&
      (!leaderSuperEffectScope.isParseable ||
        leaders.some((leader) => !matchesLeaderSuperEffectScope(leader, leaderSuperEffectScope)))
    ) {
      continue;
    }

    if (
      !canStillReachLeaderSuperEffectRequirement(
        countLeaderSuperEffectScopeMatches(leaderSlots, leaderSuperEffectScope),
        TEAM_SUB_SLOT_COUNT,
        requiredLeaderSuperEffectMatchingSlots,
      )
    ) {
      continue;
    }

    const constrainedSubSelectionOptions = resolveConstrainedSubSelectionOptions(
      manualSlotCandidateMap,
      leaders,
      leaderSlots,
      input,
      leaderCriteria,
      leaderSuperEffectScope,
    );

    for (const constrainedSubSelections of constrainedSubSelectionOptions) {
      const constrainedSubs = AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.map((role) =>
        constrainedSubSelections.get(role),
      ).filter((candidate): candidate is AutoBuildCandidate => Boolean(candidate));
      const selectedSubs = selectSubs(
        subAutoFillCandidates,
        leaders,
        leaderSlots,
        input,
        leaderCriteria,
        leaderSuperEffectScope,
        constrainedSubs,
      );

      if (selectedSubs.length < TEAM_SUB_SLOT_COUNT) {
        continue;
      }

      const orderedSubs = orderSelectedSubCandidates(constrainedSubSelections, selectedSubs);
      const teamCandidates = [...leaderSlots, ...orderedSubs];
      const activeSuperEffectScope = resolveActiveLeaderSuperEffectScope(teamCandidates);

      if (
        requiredLeaderSuperEffectMatchingSlots !== null &&
        (!activeSuperEffectScope.isParseable ||
          countLeaderSuperEffectScopeMatches(teamCandidates, activeSuperEffectScope) <
            requiredLeaderSuperEffectMatchingSlots)
      ) {
        continue;
      }

      const coverage = summarizeCoverage(teamCandidates, input, leaderCriteria, leaderSlots);

      if (input.requireAllSelectedTypesInTeam && !coverage.coversAllSelectedTypes) {
        continue;
      }

      if (
        input.requireLeaderSuperSpecialCriteria &&
        !areActiveSuperCriteriaSatisfied(
          leaderSlots,
          teamCandidates,
          input.requireLeaderSuperSpecialCriteria,
        )
      ) {
        continue;
      }

      if (
        (input.requiredAbilities.length && !coverage.abilityRequirements.matchesAll) ||
        (input.requiredCharacterGroups.length && !coverage.requiredCharacterGroups.matchesAll)
      ) {
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
  }

  return null;
}

function resolveFriendCaptainCandidatePool(
  input: AutoBuildInput,
  candidates: AutoBuildCandidate[],
  friendCaptainRecords: CharacterDetailRecord[],
  leaderAutoFillCandidateIdSet: Set<number> | null,
): AutoBuildCandidate[] {
  if (!input.allowAnyFriendCaptainAutoFill || friendCaptainRecords.length === 0) {
    return candidates;
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.character.id, candidate]));
  const usableFriendCaptainRecords = friendCaptainRecords.filter(
    (record) =>
      hasReadableEffectText(record) &&
      (!leaderAutoFillCandidateIdSet || leaderAutoFillCandidateIdSet.has(record.id)),
  );

  usableFriendCaptainRecords.forEach((record, index) => {
    if (candidateById.has(record.id)) {
      return;
    }

    candidateById.set(
      record.id,
      buildAutoBuildCandidate(record, input, index, usableFriendCaptainRecords.length),
    );
  });

  return [...candidateById.values()];
}

function resolveManualSlotCandidateMap(
  manualSlots: AutoBuildManualSlotSelection[],
  candidateById: Map<number, AutoBuildCandidate>,
): Map<AutoBuildManualSlotRole, AutoBuildCandidate[]> {
  const slotCandidateMap = new Map<AutoBuildManualSlotRole, AutoBuildCandidate[]>();

  for (const slot of manualSlots) {
    const candidates = slot.characterIds
      .map((characterId) => candidateById.get(characterId))
      .filter((candidate): candidate is AutoBuildCandidate => Boolean(candidate));

    slotCandidateMap.set(slot.role, candidates);
  }

  return slotCandidateMap;
}

function resolveLeaderCandidateOptions(
  slotCandidates: AutoBuildCandidate[],
  candidates: AutoBuildCandidate[],
  input: AutoBuildInput,
  options: AutoTeamBuildAttemptOptions,
): AutoBuildCandidate[] {
  const { leaderOnlyRequirements } = splitExtraDropAbilityRequirements(input.requiredAbilities);
  const manualCandidateIdSet = new Set(slotCandidates.map((candidate) => candidate.character.id));
  const candidateMatchesLeaderConstraints = (
    candidate: AutoBuildCandidate,
    applyAutoFillLeaderRanges: boolean,
  ): boolean =>
    Boolean(
      candidate.tags.readableCaptainText &&
      (!applyAutoFillLeaderRanges || candidateMatchesLeaderBoostRanges(candidate, input)) &&
      (!options.requireLeadersWithoutSuperEffects || !hasCandidateSuperEffects(candidate)) &&
      leaderOnlyRequirements.every((requirement) =>
        leaderSatisfiesAbilityRequirement(candidate, requirement),
      ) &&
      (!input.requireAllSelectedClassesPerCharacter || candidate.matchesAllSelectedClasses),
    );
  const manualCandidatePool = slotCandidates.filter((candidate) =>
    candidateMatchesLeaderConstraints(candidate, false),
  );
  const autoCandidatePool = candidates
    .filter((candidate) => !manualCandidateIdSet.has(candidate.character.id))
    .filter((candidate) => candidateMatchesLeaderConstraints(candidate, true))
    .sort(compareCandidatesByNewestId)
    .slice(0, GLOBAL_LEADER_OPTION_LIMIT);

  return [...manualCandidatePool, ...autoCandidatePool];
}

function candidateMatchesLeaderBoostRanges(
  candidate: AutoBuildCandidate,
  input: AutoBuildInput,
): boolean {
  return (
    captainBoostMatchesRange(candidate.character.captainAtkBoost, input.leaderBoostRanges.ATK) &&
    captainBoostMatchesRange(candidate.character.captainHpBoost, input.leaderBoostRanges.HP)
  );
}

function captainBoostMatchesRange(
  boost: number,
  range: { min: number | null; max: number | null },
): boolean {
  const hasActiveRange = range.min !== null || range.max !== null;

  if (!hasActiveRange) {
    return true;
  }

  if (!Number.isFinite(boost) || boost <= 0) {
    return false;
  }

  if (range.min !== null && boost < range.min) {
    return false;
  }

  if (range.max !== null && boost > range.max) {
    return false;
  }

  return true;
}

function buildLeaderPairOptions(
  captainOptions: AutoBuildCandidate[],
  friendCaptainOptions: AutoBuildCandidate[],
  orderOptions: {
    preserveCaptainOrder: boolean;
    preserveFriendCaptainOrder: boolean;
  },
): LeaderPairOption[] {
  const leaderPairs: LeaderPairOption[] = [];

  captainOptions.forEach((captain, captainIndex) => {
    friendCaptainOptions.forEach((friendCaptain, friendCaptainIndex) => {
      leaderPairs.push({
        captain,
        captainIndex,
        friendCaptain,
        friendCaptainIndex,
      });
    });
  });

  return leaderPairs.sort((left, right) => {
    const captainDifference = orderOptions.preserveCaptainOrder
      ? left.captainIndex - right.captainIndex
      : compareCandidatesByNewestId(left.captain, right.captain);

    if (captainDifference !== 0) {
      return captainDifference;
    }

    const friendCaptainDifference = orderOptions.preserveFriendCaptainOrder
      ? left.friendCaptainIndex - right.friendCaptainIndex
      : compareCandidatesByNewestId(left.friendCaptain, right.friendCaptain);

    if (friendCaptainDifference !== 0) {
      return friendCaptainDifference;
    }

    return 0;
  });
}

function* resolveConstrainedSubSelectionOptions(
  manualSlotCandidateMap: Map<AutoBuildManualSlotRole, AutoBuildCandidate[]>,
  leaders: AutoBuildCandidate[],
  leaderSlots: AutoBuildCandidate[],
  input: AutoBuildInput,
  leaderCriteria: ActiveLeaderCriteria,
  leaderSuperEffectScope: ActiveLeaderSuperEffectScope,
): Generator<Map<AutoBuildManualSlotRole, AutoBuildCandidate>> {
  const leaderCandidates = resolveUniqueCandidates(leaders);
  const requiredLeaderSuperEffectMatchingSlots =
    resolveRequiredLeaderSuperEffectMatchingSlots(input);
  const leaderSuperEffectMatchCount = countLeaderSuperEffectScopeMatches(
    leaderSlots,
    leaderSuperEffectScope,
  );
  const leaderCharacterIdSet = new Set(leaderCandidates.map((candidate) => candidate.character.id));
  const leaderPartyConflictKeySet =
    input.requireUniqueBaseCharacterNames && leaderCandidates[0]
      ? new Set(resolveCandidatePartyConflictKeys(leaderCandidates[0]))
      : new Set<string>();
  const coverage = createTeamCoverageState(leaderCandidates);
  const constrainedRoles = AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.filter(
    (role) => (manualSlotCandidateMap.get(role) ?? []).length > 0,
  );

  function* searchSelections(
    roleIndex: number,
    selectedSubMap: Map<AutoBuildManualSlotRole, AutoBuildCandidate>,
    selectedSubs: AutoBuildCandidate[],
    selectedIds: Set<number>,
    selectedPartyConflictKeys: Set<string>,
    currentCoverage: TeamCoverageState,
  ): Generator<Map<AutoBuildManualSlotRole, AutoBuildCandidate>> {
    if (roleIndex >= constrainedRoles.length) {
      yield selectedSubMap;
      return;
    }

    const role = constrainedRoles[roleIndex];
    const slotCandidates = manualSlotCandidateMap.get(role) ?? [];
    const rankedCandidates = slotCandidates
      .map((candidate, index) => ({
        candidate,
        index,
      }))
      .filter(({ candidate }) => {
        const currentMatchedSuperEffectSlots =
          leaderSuperEffectMatchCount +
          countLeaderSuperEffectScopeMatches(selectedSubs, leaderSuperEffectScope);
        const nextMatchedSuperEffectSlots =
          currentMatchedSuperEffectSlots +
          (matchesLeaderSuperEffectScope(candidate, leaderSuperEffectScope) ? 1 : 0);
        const remainingSlotsAfterPick = TEAM_SUB_SLOT_COUNT - (selectedSubs.length + 1);
        const nextTeamPrefix = [...leaderSlots, ...selectedSubs, candidate];

        return !(
          leaderCharacterIdSet.has(candidate.character.id) ||
          selectedIds.has(candidate.character.id) ||
          (input.requireUniqueBaseCharacterNames &&
            (hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) ||
              hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys))) ||
          (input.requireAllSelectedClassesPerCharacter && !candidate.matchesAllSelectedClasses) ||
          !matchesLeaderBuildScope(candidate, leaderCriteria) ||
          !matchesActiveSuperEffectScopePrefix(
            nextTeamPrefix,
            requiredLeaderSuperEffectMatchingSlots,
          ) ||
          !canStillReachLeaderSuperEffectRequirement(
            nextMatchedSuperEffectSlots,
            remainingSlotsAfterPick,
            requiredLeaderSuperEffectMatchingSlots,
          )
        );
      })
      .sort((left, right) => compareCandidatesByNewestId(left.candidate, right.candidate));

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

      yield* searchSelections(
        roleIndex + 1,
        nextSelectedSubMap,
        nextSelectedSubs,
        nextSelectedIds,
        nextSelectedPartyConflictKeys,
        nextCoverage,
      );
    }

    yield* searchSelections(
      roleIndex + 1,
      selectedSubMap,
      selectedSubs,
      selectedIds,
      selectedPartyConflictKeys,
      currentCoverage,
    );
  }

  yield* searchSelections(0, new Map(), [], new Set<number>(), new Set<string>(), coverage);
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
  leaderSlots: AutoBuildCandidate[],
  input: AutoBuildInput,
  leaderCriteria: ActiveLeaderCriteria,
  leaderSuperEffectScope: ActiveLeaderSuperEffectScope,
  lockedSubs: AutoBuildCandidate[] = [],
): AutoBuildCandidate[] {
  const selected = resolveUniqueCandidates(lockedSubs);
  const leaderCandidates = resolveUniqueCandidates(leaders);
  const requiredLeaderSuperEffectMatchingSlots =
    resolveRequiredLeaderSuperEffectMatchingSlots(input);
  const leaderSuperEffectMatchCount = countLeaderSuperEffectScopeMatches(
    leaderSlots,
    leaderSuperEffectScope,
  );
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

  if (selected.some((candidate) => !matchesLeaderBuildScope(candidate, leaderCriteria))) {
    return [];
  }

  if (
    !canStillReachLeaderSuperEffectRequirement(
      leaderSuperEffectMatchCount +
        countLeaderSuperEffectScopeMatches(selected, leaderSuperEffectScope),
      TEAM_SUB_SLOT_COUNT - selected.length,
      requiredLeaderSuperEffectMatchingSlots,
    )
  ) {
    return [];
  }

  if (
    !matchesActiveSuperEffectScopePrefix(
      [...leaderSlots, ...selected],
      requiredLeaderSuperEffectMatchingSlots,
    )
  ) {
    return [];
  }

  const selectedIds = new Set(selected.map((candidate) => candidate.character.id));
  const pool = candidates
    .filter((candidate) => {
      return (
        !leaderCharacterIdSet.has(candidate.character.id) &&
        !selectedIds.has(candidate.character.id) &&
        (!input.requireUniqueBaseCharacterNames ||
          (!hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) &&
            !hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys))) &&
        matchesLeaderBuildScope(candidate, leaderCriteria) &&
        matchesActiveSuperEffectScopePrefix(
          [...leaderSlots, ...selected, candidate],
          requiredLeaderSuperEffectMatchingSlots,
        ) &&
        (!input.requireAllSelectedClassesPerCharacter || candidate.matchesAllSelectedClasses)
      );
    })
    .sort(compareCandidatesByNewestId);

  const isCompleteSelectionValid = (nextSelection: AutoBuildCandidate[]): boolean => {
    const teamCandidates = [...leaderSlots, ...nextSelection];
    const activeSuperEffectScope = resolveActiveLeaderSuperEffectScope(teamCandidates);

    if (
      requiredLeaderSuperEffectMatchingSlots !== null &&
      (!activeSuperEffectScope.isParseable ||
        countLeaderSuperEffectScopeMatches(teamCandidates, activeSuperEffectScope) <
          requiredLeaderSuperEffectMatchingSlots)
    ) {
      return false;
    }

    const nextCoverage = summarizeCoverage(teamCandidates, input, leaderCriteria, leaderSlots);

    if (input.requireAllSelectedTypesInTeam && !nextCoverage.coversAllSelectedTypes) {
      return false;
    }

    if (
      input.requireLeaderSuperSpecialCriteria &&
      !areActiveSuperCriteriaSatisfied(
        leaderSlots,
        teamCandidates,
        input.requireLeaderSuperSpecialCriteria,
      )
    ) {
      return false;
    }

    if (
      (input.requiredAbilities.length && !nextCoverage.abilityRequirements.matchesAll) ||
      (input.requiredCharacterGroups.length && !nextCoverage.requiredCharacterGroups.matchesAll)
    ) {
      return false;
    }

    return true;
  };

  const findNewestValidSelection = (
    startIndex: number,
    currentSelection: AutoBuildCandidate[],
    currentSelectedIds: Set<number>,
    currentPartyConflictKeys: Set<string>,
  ): AutoBuildCandidate[] | null => {
    if (currentSelection.length === TEAM_SUB_SLOT_COUNT) {
      return isCompleteSelectionValid(currentSelection) ? currentSelection : null;
    }

    const remainingSlots = TEAM_SUB_SLOT_COUNT - currentSelection.length;

    if (pool.length - startIndex < remainingSlots) {
      return null;
    }

    for (let index = startIndex; index < pool.length; index += 1) {
      const candidate = pool[index];

      if (!candidate) {
        continue;
      }

      if (
        currentSelectedIds.has(candidate.character.id) ||
        !canStillReachLeaderSuperEffectRequirement(
          leaderSuperEffectMatchCount +
            countLeaderSuperEffectScopeMatches(currentSelection, leaderSuperEffectScope) +
            (matchesLeaderSuperEffectScope(candidate, leaderSuperEffectScope) ? 1 : 0),
          TEAM_SUB_SLOT_COUNT - (currentSelection.length + 1),
          requiredLeaderSuperEffectMatchingSlots,
        ) ||
        !matchesActiveSuperEffectScopePrefix(
          [...leaderSlots, ...currentSelection, candidate],
          requiredLeaderSuperEffectMatchingSlots,
        ) ||
        (input.requireUniqueBaseCharacterNames &&
          (hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) ||
            hasAnyPartyConflictKey(candidate, currentPartyConflictKeys)))
      ) {
        continue;
      }

      const nextSelection = [...currentSelection, candidate];
      const nextSelectedIds = new Set(currentSelectedIds);
      const nextPartyConflictKeys = new Set(currentPartyConflictKeys);

      nextSelectedIds.add(candidate.character.id);

      if (input.requireUniqueBaseCharacterNames) {
        addCandidatePartyConflictKeys(nextPartyConflictKeys, candidate);
      }

      const result = findNewestValidSelection(
        index + 1,
        nextSelection,
        nextSelectedIds,
        nextPartyConflictKeys,
      );

      if (result) {
        return result;
      }
    }

    return null;
  };

  return findNewestValidSelection(0, selected, selectedIds, selectedPartyConflictKeys) ?? selected;
}

function resolveSlotReasonChips(reasonChips: string[], isManualPick: boolean): string[] {
  const nextChips = [...reasonChips];

  if (isManualPick && !nextChips.includes(MANUAL_PICK_REASON_CHIP)) {
    nextChips.unshift(MANUAL_PICK_REASON_CHIP);
  }

  return nextChips.slice(0, 4);
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
    hasExplicitTarget:
      allCharacters || hasClassRestriction || hasTypeRestriction || hasCostRestriction,
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
  const defaultCaptainText = extractDefaultCaptainBoostText(captainText);
  const captainBoostScopeText = extractDefaultCaptainBoostClauses(defaultCaptainText).join('. ');
  const allowedClasses = extractAllowedCaptainClasses(captainBoostScopeText);
  const allowedTypes = extractAllowedCaptainTypes(captainBoostScopeText);
  const maxAllowedCost = extractCaptainMaxAllowedCost(captainBoostScopeText);
  const hasCostRestriction = maxAllowedCost !== null;
  const allCharacters =
    allowedClasses.length === 0 &&
    allowedTypes.length === 0 &&
    !hasCostRestriction &&
    includesAny(captainBoostScopeText, ['all characters', 'all units']);
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
    captainAtkMultiplier: extractCaptainMultiplier(captainText, 'atk'),
    captainHpMultiplier: extractCaptainMultiplier(captainText, 'hp'),
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
  const requiredCharacterGroups = resolveRequiredCharacterGroupCoverage(
    candidates,
    input.requiredCharacterGroups,
    leaderCandidates,
  );

  return {
    leaderCriteria: summarizeLeaderCriteria(candidates, leaderCriteria),
    abilityRequirements,
    requiredCharacterGroups,
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

export function resolveLeaderSuperEffectScopeFromEffectText(effectText: string): {
  allowedClasses: string[];
  allowedTypes: AutoTeamBuilderType[];
  isParseable: boolean;
} {
  const clauses = extractSuperEffectScopeClauses(effectText);
  const allowedClasses = extractAllowedScopeClassesFromClauses(clauses);
  const allowedTypes = extractAllowedScopeTypesFromClauses(clauses);

  return {
    allowedClasses,
    allowedTypes,
    isParseable: allowedClasses.length > 0 || allowedTypes.length > 0,
  };
}

function resolveCandidateSuperEffectScope(
  candidate: AutoBuildCandidate,
): ActiveLeaderSuperEffectScope {
  const effectTexts = resolveCandidateSuperEffectTexts(candidate);
  const allowedClasses = new Set<string>();
  const allowedTypes = new Set<AutoTeamBuilderType>();
  let isParseable = false;

  if (!effectTexts.length) {
    return {
      derivedAllowedClasses: [],
      derivedAllowedTypes: [],
      hasClassRestriction: false,
      hasTypeRestriction: false,
      isParseable: true,
      hasSuperEffects: false,
    };
  }

  effectTexts.forEach((effectText) => {
    const scope = resolveLeaderSuperEffectScopeFromEffectText(effectText);

    if (!scope.isParseable) {
      return;
    }

    isParseable = true;
    scope.allowedClasses.forEach((characterClass) => allowedClasses.add(characterClass));
    scope.allowedTypes.forEach((type) => allowedTypes.add(type));
  });

  return {
    derivedAllowedClasses: AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
      allowedClasses.has(characterClass),
    ),
    derivedAllowedTypes: AUTO_TEAM_BUILDER_TYPES.filter((type) => allowedTypes.has(type)),
    hasClassRestriction: allowedClasses.size > 0,
    hasTypeRestriction: allowedTypes.size > 0,
    isParseable,
    hasSuperEffects: true,
  };
}

function resolveActiveLeaderSuperEffectScope(
  candidates: AutoBuildCandidate[],
): ActiveLeaderSuperEffectScope {
  const activeSuperScopes = resolveUniqueCandidates(candidates)
    .map((candidate) => resolveCandidateSuperEffectScope(candidate))
    .filter((scope) => scope.hasSuperEffects);

  if (!activeSuperScopes.length) {
    return {
      derivedAllowedClasses: [],
      derivedAllowedTypes: [],
      hasClassRestriction: false,
      hasTypeRestriction: false,
      isParseable: true,
      hasSuperEffects: false,
    };
  }

  if (activeSuperScopes.some((scope) => !scope.isParseable)) {
    return {
      derivedAllowedClasses: [],
      derivedAllowedTypes: [],
      hasClassRestriction: false,
      hasTypeRestriction: false,
      isParseable: false,
      hasSuperEffects: true,
    };
  }

  const classScope = resolveIntersectedLeaderDimension(
    activeSuperScopes,
    AUTO_TEAM_BUILDER_CLASSES,
    (scope) => scope.derivedAllowedClasses,
    (scope) => scope.hasClassRestriction,
  );
  const typeScope = resolveIntersectedLeaderDimension(
    activeSuperScopes,
    AUTO_TEAM_BUILDER_TYPES,
    (scope) => scope.derivedAllowedTypes,
    (scope) => scope.hasTypeRestriction,
  );

  return {
    derivedAllowedClasses: classScope.values,
    derivedAllowedTypes: typeScope.values,
    hasClassRestriction: classScope.restricted,
    hasTypeRestriction: typeScope.restricted,
    isParseable: true,
    hasSuperEffects: true,
  };
}

function resolveRequiredLeaderSuperEffectMatchingSlots(input: AutoBuildInput): number | null {
  if (!input.requireAllSlotsInLeaderSuperEffectScope) {
    return null;
  }

  const requiredSlots = input.minimumLeaderSuperEffectMatchingSlots ?? TEAM_SUB_SLOT_COUNT + 2;
  return Math.max(2, Math.min(TEAM_SUB_SLOT_COUNT + 2, requiredSlots));
}

function resolveIntersectedLeaderDimension<T extends string, TSource>(
  leaders: TSource[],
  orderedValues: readonly T[],
  resolveAllowedValues: (leader: TSource) => readonly T[],
  hasRestriction: (leader: TSource) => boolean,
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

function resolveIntersectedLeaderCostScope(leaders: AutoBuildCandidate[]): {
  maxAllowedCost: number | null;
  restricted: boolean;
} {
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

function matchesLeaderSuperEffectScope(
  candidate: AutoBuildCandidate,
  leaderSuperEffectScope: ActiveLeaderSuperEffectScope,
): boolean {
  if (!leaderSuperEffectScope.isParseable) {
    return false;
  }

  const matchesClassScope = leaderSuperEffectScope.hasClassRestriction
    ? candidate.character.classes.some((characterClass) =>
        leaderSuperEffectScope.derivedAllowedClasses.some(
          (allowedClass) => allowedClass.toLowerCase() === characterClass.toLowerCase(),
        ),
      )
    : true;
  const characterTypes = resolveCharacterTypeTokens(candidate.character.type);
  const matchesTypeScope = leaderSuperEffectScope.hasTypeRestriction
    ? characterTypes.some((type) => leaderSuperEffectScope.derivedAllowedTypes.includes(type))
    : true;

  return matchesClassScope && matchesTypeScope;
}

function matchesLeaderBuildScope(
  candidate: AutoBuildCandidate,
  leaderCriteria: ActiveLeaderCriteria,
): boolean {
  return matchesActiveLeaderCriteria(candidate, leaderCriteria);
}

function countLeaderSuperEffectScopeMatches(
  candidates: AutoBuildCandidate[],
  leaderSuperEffectScope: ActiveLeaderSuperEffectScope,
): number {
  return candidates.filter((candidate) =>
    matchesLeaderSuperEffectScope(candidate, leaderSuperEffectScope),
  ).length;
}

function canStillReachLeaderSuperEffectRequirement(
  matchedSlots: number,
  remainingSlots: number,
  requiredSlots: number | null,
): boolean {
  return requiredSlots === null || matchedSlots + remainingSlots >= requiredSlots;
}

function matchesActiveSuperEffectScopePrefix(
  candidates: AutoBuildCandidate[],
  requiredSlots: number | null,
): boolean {
  if (requiredSlots === null) {
    return true;
  }

  const activeSuperEffectScope = resolveActiveLeaderSuperEffectScope(candidates);

  return (
    activeSuperEffectScope.isParseable &&
    candidates.every((candidate) =>
      matchesLeaderSuperEffectScope(candidate, activeSuperEffectScope),
    )
  );
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
  return extractAllowedScopeClassesFromClauses(extractScopeClauses(text));
}

function extractAllowedScopeTypes(text: string): AutoTeamBuilderType[] {
  return extractAllowedScopeTypesFromClauses(extractScopeClauses(text));
}

function extractAllowedScopeClassesFromClauses(clauses: string[]): string[] {
  return AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    clauses.some((clause) => textMatchesClassScope(clause, characterClass)),
  );
}

function extractAllowedScopeTypesFromClauses(clauses: string[]): AutoTeamBuilderType[] {
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

function extractSuperEffectScopeClauses(text: string): string[] {
  return [...text.matchAll(SUPER_EFFECT_SCOPE_CLAUSE_PATTERN)]
    .map((match) => normalizeText(match[1]))
    .filter(Boolean);
}

function resolveStructuredSuperEffectText(value: Record<string, unknown> | null): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const effectText = value['specialEffect'];
  return typeof effectText === 'string' ? effectText.trim() : '';
}

function resolveCandidateSuperEffectTexts(candidate: AutoBuildCandidate): string[] {
  const structuredEffectTexts = [
    candidate.character.detail.superType,
    candidate.character.detail.superClass,
  ]
    .map(resolveStructuredSuperEffectText)
    .filter((text): text is string => text.length > 0);
  const superSpecialText = normalizeText(candidate.character.detail.superSpecialText);

  return [
    ...structuredEffectTexts,
    ...(superSpecialText && /\bsuper\b/i.test(superSpecialText) ? [superSpecialText] : []),
  ];
}

function hasCandidateSuperEffects(candidate: AutoBuildCandidate): boolean {
  return resolveCandidateSuperEffectTexts(candidate).length > 0;
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

function extractCaptainMultiplier(text: string, stat: 'atk' | 'hp'): number {
  const defaultCaptainText = extractDefaultCaptainBoostText(text);
  const pattern = new RegExp(`\\b${stat}\\b[^.;]*?\\bby\\s+(\\d+(?:\\.\\d+)?)x`, 'gi');

  return extractDefaultCaptainBoostClauses(defaultCaptainText).reduce((highest, clause) => {
    return [...clause.matchAll(pattern)].reduce((clauseHighest, match) => {
      if (isSelfOnlyCaptainBoostMatch(match[0])) {
        return clauseHighest;
      }

      const value = Number(match[1]);
      return Number.isFinite(value) && value > clauseHighest ? value : clauseHighest;
    }, highest);
  }, 0);
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
    .map((clause) => clause.trim())
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

function extractDefaultCaptainBoostText(text: string): string {
  const branches = extractCaptainBranches(text);

  if (!branches.length) {
    return text;
  }

  const defaultBranches = branches
    .filter((branch) => DEFAULT_CAPTAIN_BRANCH_LABELS.has(branch.label))
    .map((branch) => branch.text)
    .filter(Boolean);

  return defaultBranches.length ? defaultBranches.join('. ') : (branches[0]?.text ?? text);
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

function isSelfOnlyCaptainBoostMatch(matchText: string): boolean {
  return (
    /\b(?:atk|hp)\b[^,.;]{0,80}\b(?:this character|self)\b/i.test(matchText) ||
    /\bown\s+(?:atk|hp)\b/i.test(matchText)
  );
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
  return normalizeHtmlToText(value).toLowerCase();
}
