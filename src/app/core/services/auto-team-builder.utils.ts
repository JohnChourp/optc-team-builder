import {
  type AutoBuildAbilityCoverageBreakdown,
  type AutoBuildAbilityCoverageBreakdownItem,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildCaptainAbilityCoverageMode,
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
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';
import conflictOverrideCatalog from '../data/auto-team-builder-party-conflict-overrides.json';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import {
  captainTagBranchesSatisfied,
  countCaptainTagBranchMatches,
  normalizeCaptainTagKey,
} from './captain-tag-conditions.utils';
import { resolveCaptainBoostScope, resolveCaptainCoverage } from './captain-coverage.utils';
import { normalizeHtmlToText } from './html-text.utils';
import { cloneRequiredCharacterGroup } from './required-character-groups.utils';
import { cloneBattleRequirements } from './auto-team-builder-battle.utils';

const CAPTAIN_BRANCH_PATTERN =
  /\b(always active|standard captain|powered up captain|rampage captain)\s*:\s*/gi;
const CAPTAIN_EFFECT_CLAUSE_SEPARATOR =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)|\s+\band\s+(?=(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)/gi;
const SCOPE_CLAUSE_PATTERN = /\b(?:of|for)\s+([^.;]{1,160}?)\s+(?:characters|units)\b/g;
const SUPER_EFFECT_SCOPE_CLAUSE_PATTERN =
  /\b(?:changes?|transforms?)\s+([^.;]{1,160}?)\s+(?:characters|units)\s+(?:to|into)\s+(?:a\s+|an\s+)?super\b/gi;
const COST_UPPER_BOUND_PATTERN = /\bcost\s+(\d+)\s+or\s+(?:less|lower)\b/i;
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
const AUTO_FILL_LEADER_OPTION_LIMIT = 8;
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
  franosuke: ['franky'],
  luffytaro: ['luffy', 'monkey d luffy'],
  onami: ['nami'],
  orobi: ['robin'],
  'soba mask': ['sanji'],
  'tenguyama hitetsu': ['kozuki sukiyaki'],
  usohachi: ['usopp'],
  whitebeard: ['edward newgate'],
  violet: ['viola'],
  z: ['zephyr'],
  zorojuro: ['zoro', 'roronoa zoro'],
};

interface TeamCoverageState {
  burst: Set<AutoBuildBurstRole>;
  consistency: Set<AutoBuildConsistencyRole>;
  utility: Set<AutoBuildUtilityRole>;
  selectedClasses: Set<string>;
  selectedTypes: Set<AutoTeamBuilderType>;
}

interface ActiveLeaderCriteria extends Omit<
  AutoBuildLeaderCriteriaSummary,
  'matchingSlots' | 'totalSlots' | 'allSlotsMatch'
> {
  leaders: AutoBuildCandidate[];
}

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

type BattleRequirementAssignmentMode = 'strict' | 'flexible';

interface AutoTeamBuildAttemptOptions {
  requireLeadersWithoutSuperEffects?: boolean;
  friendCaptainRecords?: CharacterDetailRecord[];
  friendCaptainContext?: PreparedAutoTeamBuildContext;
  autoFillCharacterIds?: number[];
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
  battleRequirementAssignmentMode?: BattleRequirementAssignmentMode;
}

interface SubAbilityDemandContext {
  requirements: AutoBuildAbilityRequirement[];
  battleRequirements: AutoBuildBattleRequirement[];
  leaderTagConditionSets: ActiveLeaderCriteria['tagConditionSets'];
  leaderTagConditionPrefix: AutoBuildCandidate[];
  battleAssignmentMode: BattleRequirementAssignmentMode;
}

export interface PreparedAutoBuildRecord {
  record: CharacterDetailRecord;
  index: number;
  total: number;
  captainText: string;
  specialText: string;
  sailorText: string;
  combinedText: string;
}

export interface PreparedAutoTeamBuildContext {
  records: PreparedAutoBuildRecord[];
  recordById: Map<number, PreparedAutoBuildRecord>;
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

function compareCandidatesByHighestCost(
  left: AutoBuildCandidate,
  right: AutoBuildCandidate,
): number {
  return right.character.cost - left.character.cost;
}

function resolveCaptainAbilityCoverageMode(
  input: Pick<AutoBuildInput, 'requireFullCaptainAbilityCoverage'>,
): AutoBuildCaptainAbilityCoverageMode {
  return input.requireFullCaptainAbilityCoverage ? 'fullAbilityCoverage' : 'simpleBoostScope';
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
  if (isIgnoredCaptainAbilityRequirement(requirement)) {
    return false;
  }

  return candidate.character.detail.builderAbilities.some((ability) =>
    ability.source !== 'captainAbility' &&
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
  const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);
  const nextRequirement: AutoBuildAbilityRequirement = {
    ...requirement,
    slotTokens: [...requirement.slotTokens],
  };

  if (slotScope === 'any') {
    delete nextRequirement.slotScope;
  } else {
    nextRequirement.slotScope = slotScope;
  }

  if (sourceScope) {
    nextRequirement.sourceScope = sourceScope;
  } else {
    delete nextRequirement.sourceScope;
  }

  return nextRequirement;
}

export function buildAutoBuildAbilityCoverageBreakdown(
  characters: CharacterDetailRecord[],
): AutoBuildAbilityCoverageBreakdown {
  const abilityMap = new Map<string, AutoBuildAbilityCoverageBreakdownItem>();

  characters.forEach((character) => {
    character.detail.builderAbilities
      .filter((ability) => ability.source !== 'captainAbility')
      .forEach((ability) => {
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

  if (!canCandidateSatisfyResolvableSuperCriteriaInSlot(superUnit, isLeader)) {
    return false;
  }

  if (!criteria) {
    return true;
  }

  const eligibleCandidates = criteria.excludesSelf
    ? candidates.filter((candidate) => candidate.character.id !== superUnit.character.id)
    : candidates;

  return criteria.rosterBranches.some((branch) =>
    branchSatisfiedByCandidates(branch, eligibleCandidates),
  );
}

function canCandidateSatisfyResolvableSuperCriteriaInSlot(
  candidate: AutoBuildCandidate,
  isLeader: boolean,
): boolean {
  const criteria = candidate.character.detail.superSpecialCriteria;

  if (!criteria) {
    return true;
  }

  if (criteria.parserStatus === 'non_roster_only' || criteria.parserStatus === 'unsupported') {
    return false;
  }

  if (criteria.requiresCaptain && !isLeader) {
    return false;
  }

  return criteria.rosterBranches.length > 0;
}

function canCandidateJoinStrictSuperCriteriaSearch(
  candidate: AutoBuildCandidate,
  leaderSlots: AutoBuildCandidate[],
  enabled: boolean,
): boolean {
  if (!enabled || !hasCandidateSuperEffects(candidate)) {
    return true;
  }

  const isLeader = leaderSlots.some((leader) => leader.character.id === candidate.character.id);

  return canCandidateSatisfyResolvableSuperCriteriaInSlot(candidate, isLeader);
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

function isIgnoredCaptainAbilityRequirement(requirement: AutoBuildAbilityRequirement): boolean {
  return normalizeAbilityRequirementSourceScope(requirement.sourceScope) === 'captainAbility';
}

function filterIgnoredCaptainAbilityRequirements(
  requirements: AutoBuildAbilityRequirement[],
): AutoBuildAbilityRequirement[] {
  return requirements.filter((requirement) => !isIgnoredCaptainAbilityRequirement(requirement));
}

function filterIgnoredCaptainAbilityRequirementGroups(
  groups: AutoBuildRequiredCharacterGroup[],
): AutoBuildRequiredCharacterGroup[] {
  return groups
    .map((group) => ({
      ...group,
      abilities: filterIgnoredCaptainAbilityRequirements(group.abilities),
    }))
    .filter((group) => group.abilities.length > 0);
}

function filterIgnoredCaptainAbilityBattleRequirements(
  battles: AutoBuildBattleRequirement[] | undefined,
): AutoBuildBattleRequirement[] {
  return cloneBattleRequirements(battles)
    .map((battle) => ({
      ...battle,
      requiredCharacterGroups: filterIgnoredCaptainAbilityRequirementGroups(
        battle.requiredCharacterGroups,
      ),
    }))
    .filter((battle) => battle.requiredCharacterGroups.length > 0);
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
  const abilities = filterIgnoredCaptainAbilityRequirements(group.abilities);

  return (
    abilities.length > 0 &&
    abilities.every((requirement) =>
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

function resolveLeaderScopedAbilityRequirements(
  requirements: AutoBuildAbilityRequirement[],
): AutoBuildAbilityRequirement[] {
  return filterIgnoredCaptainAbilityRequirements(requirements).filter((requirement) =>
    isLeaderScopedAbilityRequirement(requirement),
  );
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
  return `${requirement.abilityKey.trim()}|${normalizeAbilityRequirementSlotScope(requirement.slotScope)}|${normalizeAbilityRequirementSourceScope(requirement.sourceScope) ?? 'any'}`;
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
  const activeRequirements = filterIgnoredCaptainAbilityRequirements(requirements);

  if (!activeRequirements.length) {
    return {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    };
  }

  const teamRequirementIndexes = activeRequirements
    .map((requirement, index) => ({ requirement, index }))
    .filter(({ requirement }) => !isExtraDropLeaderAbilityRequirement(requirement));
  const matchedTeamRequirementIndexes = resolveMatchedTeamAbilityRequirementIndexes(
    candidates,
    teamRequirementIndexes.map(({ requirement }) => requirement),
    leaderCandidates,
  );
  const matchedRequirementIndexes = new Set<number>();

  activeRequirements.forEach((requirement, requirementIndex) => {
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
  const matched = activeRequirements.filter((_, index) => matchedRequirementIndexes.has(index));
  const missing = activeRequirements.filter((_, index) => !matchedRequirementIndexes.has(index));

  return {
    requested: activeRequirements.map((requirement) => cloneAbilityRequirement(requirement)),
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
  const activeGroups = filterIgnoredCaptainAbilityRequirementGroups(groups);

  if (!activeGroups.length) {
    return {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    };
  }

  const matchedIndexes = resolveMatchedRequiredCharacterGroupIndexes(
    candidates,
    activeGroups,
    leaderCandidates,
  );
  const matched = activeGroups.filter((_, index) => matchedIndexes.has(index));
  const missing = activeGroups.filter((_, index) => !matchedIndexes.has(index));

  return {
    requested: cloneRequiredCharacterGroupsForCoverage(activeGroups),
    matched: cloneRequiredCharacterGroupsForCoverage(matched),
    missing: cloneRequiredCharacterGroupsForCoverage(missing),
    matchesAll: missing.length === 0,
  };
}

function canAssignBattleGroups(
  candidates: AutoBuildCandidate[],
  groups: AutoBuildRequiredCharacterGroup[],
  leaderCandidates: AutoBuildCandidate[],
  globallyUsedCandidateIndexes: Set<number>,
  assignmentMode: BattleRequirementAssignmentMode,
): Set<number> | null {
  if (!groups.length) {
    return new Set<number>();
  }

  const orderedGroups = groups
    .map((group, index) => ({ group, index }))
    .sort(
      (left, right) =>
        right.group.abilities.length - left.group.abilities.length || left.index - right.index,
    );

  const assignGroup = (
    groupIndex: number,
    battleUsedCandidateIndexes: Set<number>,
  ): Set<number> | null => {
    const groupEntry = orderedGroups[groupIndex];

    if (!groupEntry) {
      return battleUsedCandidateIndexes;
    }

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      if (
        globallyUsedCandidateIndexes.has(candidateIndex) ||
        (assignmentMode === 'strict' && battleUsedCandidateIndexes.has(candidateIndex))
      ) {
        continue;
      }

      const candidate = candidates[candidateIndex];

      if (
        !candidate ||
        !candidateMatchesRequiredCharacterGroup(candidate, groupEntry.group, leaderCandidates)
      ) {
        continue;
      }

      const nextUsed = new Set(battleUsedCandidateIndexes);
      nextUsed.add(candidateIndex);
      const assigned = assignGroup(groupIndex + 1, nextUsed);

      if (assigned) {
        return assigned;
      }
    }

    return null;
  };

  return assignGroup(0, new Set<number>());
}

function resolveBattleRequirementCoverage(
  candidates: AutoBuildCandidate[],
  battles: AutoBuildBattleRequirement[] | undefined,
  leaderCandidates: AutoBuildCandidate[] = [],
  assignmentMode: BattleRequirementAssignmentMode = 'flexible',
): NonNullable<AutoBuildCoverageSummary['battleRequirements']> {
  const requested = filterIgnoredCaptainAbilityBattleRequirements(battles);

  if (!requested.length) {
    return {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    };
  }

  const matchedIndexes = new Set<number>();
  const globallyUsedCandidateIndexes = new Set<number>();

  requested.forEach((battle, battleIndex) => {
    const battleUsedIndexes = canAssignBattleGroups(
      candidates,
      battle.requiredCharacterGroups,
      leaderCandidates,
      globallyUsedCandidateIndexes,
      assignmentMode,
    );

    if (!battleUsedIndexes) {
      return;
    }

    matchedIndexes.add(battleIndex);
    battleUsedIndexes.forEach((candidateIndex) => globallyUsedCandidateIndexes.add(candidateIndex));
  });

  const matched = requested.filter((_, index) => matchedIndexes.has(index));
  const missing = requested.filter((_, index) => !matchedIndexes.has(index));

  return {
    requested,
    matched: cloneBattleRequirements(matched),
    missing: cloneBattleRequirements(missing),
    matchesAll: missing.length === 0,
  };
}

export function buildAutoTeamResult(
  records: CharacterDetailRecord[],
  input: AutoBuildInput,
  options: AutoTeamBuildAttemptOptions = {},
): AutoBuildCoreResult | null {
  return buildAutoTeamResultFromPreparedContext(
    prepareAutoTeamBuildContext(records),
    input,
    options,
  );
}

export function prepareAutoTeamBuildContext(
  records: CharacterDetailRecord[],
): PreparedAutoTeamBuildContext {
  const preparedRecords = records
    .map((record) => prepareAutoBuildRecordText(record))
    .filter((record): record is Omit<PreparedAutoBuildRecord, 'index' | 'total'> => Boolean(record))
    .map((record, index, values) => ({
      ...record,
      index,
      total: values.length,
    }));

  return {
    records: preparedRecords,
    recordById: new Map(preparedRecords.map((record) => [record.record.id, record] as const)),
  };
}

export function buildAutoTeamResultFromPreparedContext(
  context: PreparedAutoTeamBuildContext,
  input: AutoBuildInput,
  options: AutoTeamBuildAttemptOptions = {},
): AutoBuildCoreResult | null {
  const usableRecords = context.records;

  if (!usableRecords.length) {
    return null;
  }

  const candidates = usableRecords.map((record, index) =>
    buildAutoBuildCandidateFromPreparedRecord(record, input, index, usableRecords.length),
  );
  const candidateById = new Map(candidates.map((candidate) => [candidate.character.id, candidate]));
  const manualSlotCandidateMap = resolveManualSlotCandidateMap(input.manualSlots, candidateById);
  const requiredManualSlotCandidateMap = resolveRequiredManualSlotCandidateMap(
    input.manualSlots,
    candidateById,
  );

  if (!requiredManualSlotCandidateMap) {
    return null;
  }

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
    options.friendCaptainContext,
    leaderAutoFillCandidateIdSet,
  );
  const captainOptions = resolveLeaderCandidateOptions(
    requiredManualSlotCandidateMap.get('captain')
      ? [requiredManualSlotCandidateMap.get('captain')!]
      : (manualSlotCandidateMap.get('captain') ?? []),
    leaderAutoFillCandidates,
    input,
    options,
    !requiredManualSlotCandidateMap.has('captain'),
  );
  const friendCaptainOptions = resolveLeaderCandidateOptions(
    requiredManualSlotCandidateMap.get('friendCaptain')
      ? [requiredManualSlotCandidateMap.get('friendCaptain')!]
      : manualFriendCaptainCandidates,
    friendCaptainCandidates,
    input,
    input.allowAnyFriendCaptainAutoFill && manualFriendCaptainCandidates.length === 0
      ? {
          ...options,
          leaderAutoFillCharacterIds: friendCaptainCandidates.map(
            (candidate) => candidate.character.id,
          ),
        }
      : options,
    !requiredManualSlotCandidateMap.has('friendCaptain'),
  );

  if (!captainOptions.length || !friendCaptainOptions.length) {
    return null;
  }

  const leaderPairOptions = buildLeaderPairOptions(captainOptions, friendCaptainOptions, {
    preserveCaptainOrder: (manualSlotCandidateMap.get('captain') ?? []).length > 0,
    preserveFriendCaptainOrder: manualFriendCaptainCandidates.length > 0,
  });
  const battleRequirementAssignmentModes = resolveBattleRequirementAssignmentModes(input, options);

  for (const battleRequirementAssignmentMode of battleRequirementAssignmentModes) {
    for (const leaderPair of leaderPairOptions) {
      const leaderSlots = [leaderPair.captain, leaderPair.friendCaptain];
      const leaders = resolveUniqueCandidates(leaderSlots);
      const leaderCriteria = resolveActiveLeaderCriteria(
        leaders,
        leaderPair.captain.character.id,
        leaderPair.friendCaptain.character.id,
        input,
      );
      const leaderSuperEffectScope = resolveActiveLeaderSuperEffectScope(leaders);
      const requiredLeaderSuperEffectMatchingSlots =
        resolveRequiredLeaderSuperEffectMatchingSlots(input);

      if (!teamCostWithinBudget(input, leaderPair.captain, [])) {
        continue;
      }

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

      if (
        shouldEnforceCaptainAbilityCoverage(input) &&
        !canStillReachLeaderTagConditions(leaderSlots, TEAM_SUB_SLOT_COUNT, leaderCriteria)
      ) {
        continue;
      }

      if (
        shouldEnforceCaptainAbilityCoverage(input) &&
        leaderSlots.some((leader) => !matchesLeaderBuildScope(leader, leaderCriteria))
      ) {
        continue;
      }

      const constrainedSubSelectionOptions = resolveConstrainedSubSelectionOptions(
        manualSlotCandidateMap,
        requiredManualSlotCandidateMap,
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
          battleRequirementAssignmentMode,
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

        const coverage = summarizeCoverage(
          teamCandidates,
          input,
          leaderCriteria,
          leaderSlots,
          battleRequirementAssignmentMode,
        );

        if (shouldEnforceCaptainAbilityCoverage(input) && !coverage.leaderCriteria.allSlotsMatch) {
          continue;
        }

        if (
          shouldEnforceCaptainAbilityCoverage(input) &&
          !matchesActiveLeaderTagConditions(teamCandidates, leaderCriteria)
        ) {
          continue;
        }

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
          (input.requiredCharacterGroups.length && !coverage.requiredCharacterGroups.matchesAll) ||
          ((input.battleRequirements?.length ?? 0) > 0 && !coverage.battleRequirements?.matchesAll)
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
  }

  return null;
}

function resolveBattleRequirementAssignmentModes(
  input: AutoBuildInput,
  options: AutoTeamBuildAttemptOptions,
): BattleRequirementAssignmentMode[] {
  if (options.battleRequirementAssignmentMode) {
    return [options.battleRequirementAssignmentMode];
  }

  const hasMultiGroupBattle = filterIgnoredCaptainAbilityBattleRequirements(
    input.battleRequirements,
  ).some(
    (battle) => battle.requiredCharacterGroups.length > 1,
  );

  return hasMultiGroupBattle ? ['strict', 'flexible'] : ['strict'];
}

function resolveFriendCaptainCandidatePool(
  input: AutoBuildInput,
  candidates: AutoBuildCandidate[],
  friendCaptainRecords: CharacterDetailRecord[],
  friendCaptainContext: PreparedAutoTeamBuildContext | undefined,
  leaderAutoFillCandidateIdSet: Set<number> | null,
): AutoBuildCandidate[] {
  const preparedFriendCaptainRecords =
    friendCaptainContext?.records ?? prepareAutoTeamBuildContext(friendCaptainRecords).records;

  if (!input.allowAnyFriendCaptainAutoFill || preparedFriendCaptainRecords.length === 0) {
    return candidates;
  }

  const usableFriendCaptainRecords = preparedFriendCaptainRecords.filter(
    (record) => !leaderAutoFillCandidateIdSet || leaderAutoFillCandidateIdSet.has(record.record.id),
  );
  const candidateById = new Map<number, AutoBuildCandidate>();

  usableFriendCaptainRecords.forEach((record, index) => {
    candidateById.set(
      record.record.id,
      buildAutoBuildCandidateFromPreparedRecord(
        record,
        input,
        index,
        usableFriendCaptainRecords.length,
      ),
    );
  });
  candidates.forEach((candidate) => {
    if (!candidateById.has(candidate.character.id)) {
      candidateById.set(candidate.character.id, candidate);
    }
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

function resolveRequiredManualSlotCandidateMap(
  manualSlots: AutoBuildManualSlotSelection[],
  candidateById: Map<number, AutoBuildCandidate>,
): Map<AutoBuildManualSlotRole, AutoBuildCandidate> | null {
  const requiredCandidateMap = new Map<AutoBuildManualSlotRole, AutoBuildCandidate>();

  for (const slot of manualSlots) {
    if (!slot.requiredCharacterId) {
      continue;
    }

    if (!slot.characterIds.includes(slot.requiredCharacterId)) {
      return null;
    }

    const candidate = candidateById.get(slot.requiredCharacterId);

    if (!candidate) {
      return null;
    }

    requiredCandidateMap.set(slot.role, candidate);
  }

  return requiredCandidateMap;
}

function resolveLeaderCandidateOptions(
  slotCandidates: AutoBuildCandidate[],
  candidates: AutoBuildCandidate[],
  input: AutoBuildInput,
  options: AutoTeamBuildAttemptOptions,
  allowAutoFill = true,
): AutoBuildCandidate[] {
  const extraDropLeaderRequirements = input.requiredAbilities.filter((requirement) =>
    isExtraDropLeaderAbilityRequirement(requirement),
  );
  const manualCandidateIdSet = new Set(slotCandidates.map((candidate) => candidate.character.id));
  const candidateMatchesLeaderConstraints = (
    candidate: AutoBuildCandidate,
    applyAutoFillLeaderRanges: boolean,
  ): boolean =>
    Boolean(
      candidate.tags.readableCaptainText &&
      (!applyAutoFillLeaderRanges || candidateMatchesLeaderBoostRanges(candidate, input)) &&
      (!options.requireLeadersWithoutSuperEffects || !hasCandidateSuperEffects(candidate)) &&
      extraDropLeaderRequirements.every((requirement) =>
        leaderSatisfiesAbilityRequirement(candidate, requirement),
      ) &&
      (!input.requireAllSelectedClassesPerCharacter || candidate.matchesAllSelectedClasses),
    );
  const manualCandidatePool = slotCandidates.filter((candidate) =>
    candidateMatchesLeaderConstraints(candidate, false),
  );

  const autoCandidatePool = allowAutoFill
    ? candidates
        .filter((candidate) => !manualCandidateIdSet.has(candidate.character.id))
        .filter((candidate) => candidateMatchesLeaderConstraints(candidate, true))
        .sort((left, right) => compareAutoFillLeaderCandidates(left, right, input, options))
        .slice(0, AUTO_FILL_LEADER_OPTION_LIMIT)
    : [];

  return [...manualCandidatePool, ...autoCandidatePool];
}

function compareAutoFillLeaderCandidates(
  left: AutoBuildCandidate,
  right: AutoBuildCandidate,
  input: AutoBuildInput,
  options: AutoTeamBuildAttemptOptions,
): number {
  const preferredIdDifference = comparePreferredLeaderIdOrder(
    left.character.id,
    right.character.id,
    options.leaderAutoFillCharacterIds,
  );

  if (preferredIdDifference !== 0) {
    return preferredIdDifference;
  }

  const leaderRequirementDifference =
    resolveLeaderRequirementPriorityScore(right, input) -
    resolveLeaderRequirementPriorityScore(left, input);

  if (leaderRequirementDifference !== 0) {
    return leaderRequirementDifference;
  }

  const boostDifference =
    resolveLeaderBoostPriorityScore(right, input.leaderBoostFilters) -
    resolveLeaderBoostPriorityScore(left, input.leaderBoostFilters);

  if (boostDifference !== 0) {
    return boostDifference;
  }

  const idDifference = compareCandidatesByNewestId(left, right);

  if (idDifference !== 0) {
    return idDifference;
  }

  return compareCandidatesByHighestCost(left, right);
}

function resolveLeaderRequirementPriorityScore(
  candidate: AutoBuildCandidate,
  input: AutoBuildInput,
): number {
  return resolveLeaderScopedAbilityRequirements(input.requiredAbilities).reduce(
    (score, requirement) =>
      leaderSatisfiesAbilityRequirement(candidate, requirement)
        ? score + Math.max(1, requirement.requiredCharacterCount)
        : score,
    0,
  );
}

function comparePreferredLeaderIdOrder(
  leftId: number,
  rightId: number,
  preferredLeaderIds: number[] | undefined,
): number {
  if (!preferredLeaderIds?.length) {
    return 0;
  }

  const leftIndex = preferredLeaderIds.indexOf(leftId);
  const rightIndex = preferredLeaderIds.indexOf(rightId);

  if (leftIndex === -1 && rightIndex === -1) {
    return 0;
  }

  if (leftIndex === -1) {
    return 1;
  }

  if (rightIndex === -1) {
    return -1;
  }

  return leftIndex - rightIndex;
}

function resolveLeaderBoostPriorityScore(
  candidate: AutoBuildCandidate,
  filters: AutoBuildInput['leaderBoostFilters'],
): number {
  const selectedFilters = filters.length ? filters : ['HP', 'ATK'];

  if (selectedFilters.includes('HP') && selectedFilters.includes('ATK')) {
    return normalizeBoostScore(candidate.character.captainAverageBoost);
  }

  if (selectedFilters.includes('HP')) {
    return normalizeBoostScore(candidate.character.captainHpBoost);
  }

  if (selectedFilters.includes('ATK')) {
    return normalizeBoostScore(candidate.character.captainAtkBoost);
  }

  return normalizeBoostScore(candidate.character.captainAverageBoost);
}

function normalizeBoostScore(value: number): number {
  return Number.isFinite(value) ? value : 0;
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
    const captainDifference = left.captainIndex - right.captainIndex;

    if (captainDifference !== 0) {
      return captainDifference;
    }

    const friendCaptainDifference = left.friendCaptainIndex - right.friendCaptainIndex;

    if (friendCaptainDifference !== 0) {
      return friendCaptainDifference;
    }

    void orderOptions;

    return 0;
  });
}

function* resolveConstrainedSubSelectionOptions(
  manualSlotCandidateMap: Map<AutoBuildManualSlotRole, AutoBuildCandidate[]>,
  requiredManualSlotCandidateMap: Map<AutoBuildManualSlotRole, AutoBuildCandidate>,
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
    (role) =>
      requiredManualSlotCandidateMap.has(role) ||
      (manualSlotCandidateMap.get(role) ?? []).length > 0,
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
    const requiredCandidate = requiredManualSlotCandidateMap.get(role);
    const slotCandidates = requiredCandidate
      ? [requiredCandidate]
      : (manualSlotCandidateMap.get(role) ?? []);
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
          !matchesLeaderBuildScopeForAttempt(candidate, leaderCriteria, input) ||
          !canCandidateJoinStrictSuperCriteriaSearch(
            candidate,
            leaderSlots,
            input.requireLeaderSuperSpecialCriteria,
          ) ||
          !canAddSubWithinTeamCostBudget(input, leaderSlots[0], selectedSubs, candidate) ||
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
      .sort((left, right) => {
        if (input.allowPartialCaptainAbilityCoverage) {
          const leaderCoverageDifference =
            resolveLeaderCriteriaCoveragePreferenceScore(right.candidate, leaderCriteria) -
            resolveLeaderCriteriaCoveragePreferenceScore(left.candidate, leaderCriteria);

          if (leaderCoverageDifference !== 0) {
            return leaderCoverageDifference;
          }
        }

        return compareCandidatesByNewestId(left.candidate, right.candidate);
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

      yield* searchSelections(
        roleIndex + 1,
        nextSelectedSubMap,
        nextSelectedSubs,
        nextSelectedIds,
        nextSelectedPartyConflictKeys,
        nextCoverage,
      );
    }

    if (!requiredCandidate) {
      yield* searchSelections(
        roleIndex + 1,
        selectedSubMap,
        selectedSubs,
        selectedIds,
        selectedPartyConflictKeys,
        currentCoverage,
      );
    }
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

  return buildAutoBuildCandidateFromPreparedRecord(
    {
      record,
      index,
      total,
      captainText,
      specialText,
      sailorText,
      combinedText,
    },
    input,
    index,
    total,
  );
}

function prepareAutoBuildRecordText(
  record: CharacterDetailRecord,
): Omit<PreparedAutoBuildRecord, 'index' | 'total'> | null {
  const captainText = normalizeText(record.detail.captainAbility);
  const specialText = normalizeText(record.detail.specialText);
  const sailorText = normalizeText(record.detail.sailorAbilities.join(' '));
  const combinedText = [captainText, specialText, sailorText].filter(Boolean).join(' ');

  if (!combinedText) {
    return null;
  }

  return {
    record,
    captainText,
    specialText,
    sailorText,
    combinedText,
  };
}

function buildAutoBuildCandidateFromPreparedRecord(
  preparedRecord: PreparedAutoBuildRecord,
  input: AutoBuildInput,
  index = preparedRecord.index,
  total = preparedRecord.total,
): AutoBuildCandidate {
  const { record, captainText, specialText, sailorText, combinedText } = preparedRecord;
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
  battleRequirementAssignmentMode: BattleRequirementAssignmentMode,
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

  if (
    selected.some(
      (candidate) => !matchesLeaderBuildScopeForAttempt(candidate, leaderCriteria, input),
    )
  ) {
    return [];
  }

  if (
    selected.some(
      (candidate) =>
        !canCandidateJoinStrictSuperCriteriaSearch(
          candidate,
          leaderSlots,
          input.requireLeaderSuperSpecialCriteria,
        ),
    )
  ) {
    return [];
  }

  if (!teamCostWithinBudget(input, leaderSlots[0], selected)) {
    return [];
  }

  if (
    shouldEnforceCaptainAbilityCoverage(input) &&
    !canStillReachLeaderTagConditions(
      [...leaderSlots, ...selected],
      TEAM_SUB_SLOT_COUNT - selected.length,
      leaderCriteria,
    )
  ) {
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
  const subAbilityDemandContext = collectSubAbilityDemandContext(
    input,
    battleRequirementAssignmentMode,
    leaderCriteria,
    [...leaderSlots, ...selected],
  );
  const pool = candidates
    .filter((candidate) => {
      return (
        !leaderCharacterIdSet.has(candidate.character.id) &&
        !selectedIds.has(candidate.character.id) &&
        (!input.requireUniqueBaseCharacterNames ||
          (!hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) &&
            !hasAnyPartyConflictKey(candidate, selectedPartyConflictKeys))) &&
        matchesLeaderBuildScopeForAttempt(candidate, leaderCriteria, input) &&
        canCandidateJoinStrictSuperCriteriaSearch(
          candidate,
          leaderSlots,
          input.requireLeaderSuperSpecialCriteria,
        ) &&
        (!shouldEnforceCaptainAbilityCoverage(input) ||
          canStillReachLeaderTagConditions(
            [...leaderSlots, ...selected, candidate],
            TEAM_SUB_SLOT_COUNT - selected.length - 1,
            leaderCriteria,
          )) &&
        canAddSubWithinTeamCostBudget(input, leaderSlots[0], selected, candidate) &&
        matchesActiveSuperEffectScopePrefix(
          [...leaderSlots, ...selected, candidate],
          requiredLeaderSuperEffectMatchingSlots,
        ) &&
        (!input.requireAllSelectedClassesPerCharacter || candidate.matchesAllSelectedClasses)
      );
    })
    .sort((left, right) =>
      compareAutoFillSubCandidates(left, right, input, subAbilityDemandContext, leaderCriteria),
    );

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

    const nextCoverage = summarizeCoverage(
      teamCandidates,
      input,
      leaderCriteria,
      leaderSlots,
      battleRequirementAssignmentMode,
    );

    if (shouldEnforceCaptainAbilityCoverage(input) && !nextCoverage.leaderCriteria.allSlotsMatch) {
      return false;
    }

    if (
      shouldEnforceCaptainAbilityCoverage(input) &&
      !matchesActiveLeaderTagConditions(teamCandidates, leaderCriteria)
    ) {
      return false;
    }

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
      (input.requiredCharacterGroups.length && !nextCoverage.requiredCharacterGroups.matchesAll) ||
      ((input.battleRequirements?.length ?? 0) > 0 && !nextCoverage.battleRequirements?.matchesAll)
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
      return teamCostWithinBudget(input, leaderSlots[0], currentSelection) &&
        isCompleteSelectionValid(currentSelection)
        ? currentSelection
        : null;
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
        (shouldEnforceCaptainAbilityCoverage(input) &&
          !canStillReachLeaderTagConditions(
            [...leaderSlots, ...currentSelection, candidate],
            TEAM_SUB_SLOT_COUNT - (currentSelection.length + 1),
            leaderCriteria,
          )) ||
        !matchesActiveSuperEffectScopePrefix(
          [...leaderSlots, ...currentSelection, candidate],
          requiredLeaderSuperEffectMatchingSlots,
        ) ||
        !canCandidateJoinStrictSuperCriteriaSearch(
          candidate,
          leaderSlots,
          input.requireLeaderSuperSpecialCriteria,
        ) ||
        !canAddSubWithinTeamCostBudget(input, leaderSlots[0], currentSelection, candidate) ||
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

  const canAddCandidateToSelection = (
    candidate: AutoBuildCandidate,
    currentSelection: AutoBuildCandidate[],
    currentPartyConflictKeys: Set<string>,
  ): boolean => {
    return (
      currentSelection.length < TEAM_SUB_SLOT_COUNT &&
      canStillReachLeaderSuperEffectRequirement(
        leaderSuperEffectMatchCount +
          countLeaderSuperEffectScopeMatches(currentSelection, leaderSuperEffectScope) +
          (matchesLeaderSuperEffectScope(candidate, leaderSuperEffectScope) ? 1 : 0),
        TEAM_SUB_SLOT_COUNT - (currentSelection.length + 1),
        requiredLeaderSuperEffectMatchingSlots,
      ) &&
      (!shouldEnforceCaptainAbilityCoverage(input) ||
        canStillReachLeaderTagConditions(
          [...leaderSlots, ...currentSelection, candidate],
          TEAM_SUB_SLOT_COUNT - (currentSelection.length + 1),
          leaderCriteria,
        )) &&
      matchesActiveSuperEffectScopePrefix(
        [...leaderSlots, ...currentSelection, candidate],
        requiredLeaderSuperEffectMatchingSlots,
      ) &&
      canCandidateJoinStrictSuperCriteriaSearch(
        candidate,
        leaderSlots,
        input.requireLeaderSuperSpecialCriteria,
      ) &&
      canAddSubWithinTeamCostBudget(input, leaderSlots[0], currentSelection, candidate) &&
      (!input.requireUniqueBaseCharacterNames ||
        (!hasAnyPartyConflictKey(candidate, leaderPartyConflictKeySet) &&
          !hasAnyPartyConflictKey(candidate, currentPartyConflictKeys)))
    );
  };

  const appendCandidateToSelection = (
    candidate: AutoBuildCandidate,
    currentSelection: AutoBuildCandidate[],
    currentSelectedIds: Set<number>,
    currentPartyConflictKeys: Set<string>,
  ): {
    partyConflictKeys: Set<string>;
    selectedIds: Set<number>;
    selection: AutoBuildCandidate[];
  } => {
    const nextSelection = [...currentSelection, candidate];
    const nextSelectedIds = new Set(currentSelectedIds);
    const nextPartyConflictKeys = new Set(currentPartyConflictKeys);

    nextSelectedIds.add(candidate.character.id);

    if (input.requireUniqueBaseCharacterNames) {
      addCandidatePartyConflictKeys(nextPartyConflictKeys, candidate);
    }

    return {
      partyConflictKeys: nextPartyConflictKeys,
      selectedIds: nextSelectedIds,
      selection: nextSelection,
    };
  };

  const findCounterAnchoredValidSelection = (): AutoBuildCandidate[] | null => {
    const battleRequirements = filterIgnoredCaptainAbilityBattleRequirements(
      input.battleRequirements,
    );

    if (!battleRequirements.length) {
      return null;
    }

    const battleAssignmentCandidates = resolveUniqueCandidates([
      ...leaderSlots,
      ...selected,
      ...pool,
    ]);

    const assignBattle = (
      battleIndex: number,
      currentSelection: AutoBuildCandidate[],
      currentSelectedIds: Set<number>,
      currentPartyConflictKeys: Set<string>,
      globallyUsedCharacterIds: Set<number>,
    ): AutoBuildCandidate[] | null => {
      const battle = battleRequirements[battleIndex];

      if (!battle) {
        return findNewestValidSelection(
          0,
          currentSelection,
          currentSelectedIds,
          currentPartyConflictKeys,
        );
      }

      const groups = battle.requiredCharacterGroups
        .map((group, index) => ({ group, index }))
        .sort(
          (left, right) =>
            right.group.abilities.length - left.group.abilities.length || left.index - right.index,
        );

      const assignGroup = (
        groupIndex: number,
        battleUsedCharacterIds: Set<number>,
        nextSelection: AutoBuildCandidate[],
        nextSelectedIds: Set<number>,
        nextPartyConflictKeys: Set<string>,
      ): AutoBuildCandidate[] | null => {
        const groupEntry = groups[groupIndex];

        if (!groupEntry) {
          const nextGloballyUsedCharacterIds = new Set(globallyUsedCharacterIds);
          battleUsedCharacterIds.forEach((characterId) =>
            nextGloballyUsedCharacterIds.add(characterId),
          );

          return assignBattle(
            battleIndex + 1,
            nextSelection,
            nextSelectedIds,
            nextPartyConflictKeys,
            nextGloballyUsedCharacterIds,
          );
        }

        for (const candidate of battleAssignmentCandidates) {
          const characterId = candidate.character.id;

          if (
            globallyUsedCharacterIds.has(characterId) ||
            (battleRequirementAssignmentMode === 'strict' &&
              battleUsedCharacterIds.has(characterId)) ||
            !candidateMatchesRequiredCharacterGroup(candidate, groupEntry.group, leaderCandidates)
          ) {
            continue;
          }

          const candidateAlreadyAvailable =
            leaderCharacterIdSet.has(characterId) || nextSelectedIds.has(characterId);

          if (
            !candidateAlreadyAvailable &&
            !canAddCandidateToSelection(candidate, nextSelection, nextPartyConflictKeys)
          ) {
            continue;
          }

          const nextBattleUsedCharacterIds = new Set(battleUsedCharacterIds);
          nextBattleUsedCharacterIds.add(characterId);

          const assignmentState = candidateAlreadyAvailable
            ? {
                partyConflictKeys: nextPartyConflictKeys,
                selectedIds: nextSelectedIds,
                selection: nextSelection,
              }
            : appendCandidateToSelection(
                candidate,
                nextSelection,
                nextSelectedIds,
                nextPartyConflictKeys,
              );
          const result = assignGroup(
            groupIndex + 1,
            nextBattleUsedCharacterIds,
            assignmentState.selection,
            assignmentState.selectedIds,
            assignmentState.partyConflictKeys,
          );

          if (result) {
            return result;
          }
        }

        return null;
      };

      return assignGroup(
        0,
        new Set<number>(),
        currentSelection,
        currentSelectedIds,
        currentPartyConflictKeys,
      );
    };

    return assignBattle(0, selected, selectedIds, selectedPartyConflictKeys, new Set<number>());
  };

  const counterAnchoredSelection = findCounterAnchoredValidSelection();

  if (counterAnchoredSelection) {
    return counterAnchoredSelection;
  }

  if ((input.battleRequirements?.length ?? 0) > 0 && battleRequirementAssignmentMode === 'strict') {
    return [];
  }

  return findNewestValidSelection(0, selected, selectedIds, selectedPartyConflictKeys) ?? selected;
}

function compareAutoFillSubCandidates(
  left: AutoBuildCandidate,
  right: AutoBuildCandidate,
  input: AutoBuildInput,
  subAbilityDemandContext: SubAbilityDemandContext,
  leaderCriteria: ActiveLeaderCriteria,
): number {
  if (
    subAbilityDemandContext.requirements.length > 0 ||
    subAbilityDemandContext.battleRequirements.length > 0 ||
    subAbilityDemandContext.leaderTagConditionSets.length > 0
  ) {
    if (subAbilityDemandContext.battleAssignmentMode === 'strict') {
      const strictGroupPreferenceDifference =
        resolveStrictBattleGroupPreferenceScore(right, subAbilityDemandContext.battleRequirements) -
        resolveStrictBattleGroupPreferenceScore(left, subAbilityDemandContext.battleRequirements);

      if (strictGroupPreferenceDifference !== 0) {
        return strictGroupPreferenceDifference;
      }
    }

    const demandDifference =
      resolveSubAbilityDemandScore(right, subAbilityDemandContext) -
      resolveSubAbilityDemandScore(left, subAbilityDemandContext);

    if (demandDifference !== 0) {
      return demandDifference;
    }

    const leaderTagConditionDifference =
      resolveLeaderTagConditionDemandScore(right, subAbilityDemandContext) -
      resolveLeaderTagConditionDemandScore(left, subAbilityDemandContext);

    if (leaderTagConditionDifference !== 0) {
      return leaderTagConditionDifference;
    }

    if (subAbilityDemandContext.battleAssignmentMode === 'strict') {
      const battleGroupSpreadDifference =
        resolveStrictBattleGroupSpreadScore(left, subAbilityDemandContext.battleRequirements) -
        resolveStrictBattleGroupSpreadScore(right, subAbilityDemandContext.battleRequirements);

      if (battleGroupSpreadDifference !== 0) {
        return battleGroupSpreadDifference;
      }
    }

    const coverageDifference =
      resolveSubCoverageRoleScore(right) - resolveSubCoverageRoleScore(left);

    if (coverageDifference !== 0) {
      return coverageDifference;
    }
  }

  if (input.allowPartialCaptainAbilityCoverage) {
    const leaderCoverageDifference =
      resolveLeaderCriteriaCoveragePreferenceScore(right, leaderCriteria) -
      resolveLeaderCriteriaCoveragePreferenceScore(left, leaderCriteria);

    if (leaderCoverageDifference !== 0) {
      return leaderCoverageDifference;
    }
  }

  const selectedFilterDifference =
    resolveSubSelectedFilterScore(right, input) - resolveSubSelectedFilterScore(left, input);

  if (selectedFilterDifference !== 0) {
    return selectedFilterDifference;
  }

  return compareCandidatesByNewestId(left, right);
}

function collectSubAbilityDemandContext(
  input: AutoBuildInput,
  battleAssignmentMode: BattleRequirementAssignmentMode,
  leaderCriteria: ActiveLeaderCriteria,
  leaderTagConditionPrefix: AutoBuildCandidate[],
): SubAbilityDemandContext {
  const requirements = [
    ...filterIgnoredCaptainAbilityRequirements(input.requiredAbilities),
    ...filterIgnoredCaptainAbilityRequirementGroups(input.requiredCharacterGroups).flatMap(
      (group) => group.abilities,
    ),
  ];
  const battleRequirements = filterIgnoredCaptainAbilityBattleRequirements(input.battleRequirements);

  return {
    requirements:
      battleAssignmentMode === 'strict'
        ? filterSubAbilityDemands(requirements)
        : filterSubAbilityDemands([
            ...requirements,
            ...battleRequirements.flatMap((battle) =>
              battle.requiredCharacterGroups.flatMap((group) => group.abilities),
            ),
          ]),
    battleRequirements,
    leaderTagConditionSets: leaderCriteria.tagConditionSets,
    leaderTagConditionPrefix,
    battleAssignmentMode,
  };
}

function resolveSubAbilityDemandScore(
  candidate: AutoBuildCandidate,
  demandContext: SubAbilityDemandContext,
): number {
  const requirementScore = demandContext.requirements.reduce((score, demand) => {
    if (!candidateMatchesAbilityRequirement(candidate, demand)) {
      return score;
    }

    return score + Math.max(1, demand.requiredCharacterCount);
  }, 0);

  if (demandContext.battleAssignmentMode !== 'strict') {
    return requirementScore;
  }

  return (
    requirementScore +
    demandContext.battleRequirements.reduce(
      (score, battle) => score + resolveStrictBattleGroupDemandScore(candidate, battle),
      0,
    )
  );
}

function filterSubAbilityDemands(
  requirements: AutoBuildAbilityRequirement[],
): AutoBuildAbilityRequirement[] {
  return requirements.filter(
    (requirement) =>
      normalizeAbilityRequirementSlotScope(requirement.slotScope) !== 'leader' &&
      normalizeAbilityRequirementSourceScope(requirement.sourceScope) !== 'captainAbility',
  );
}

function resolveStrictBattleGroupDemandScore(
  candidate: AutoBuildCandidate,
  battle: AutoBuildBattleRequirement,
): number {
  return battle.requiredCharacterGroups.reduce((bestScore, group) => {
    if (!candidateMatchesRequiredCharacterGroup(candidate, group, [])) {
      return bestScore;
    }

    return Math.max(bestScore, group.abilities.length);
  }, 0);
}

function resolveLeaderTagConditionDemandScore(
  candidate: AutoBuildCandidate,
  demandContext: SubAbilityDemandContext,
): number {
  const prefixCharacters = demandContext.leaderTagConditionPrefix.map(
    (prefixCandidate) => prefixCandidate.character,
  );

  return demandContext.leaderTagConditionSets.reduce((score, set) => {
    if (
      set.branches.some(
        (branch) => countCaptainTagBranchMatches(prefixCharacters, branch) >= branch.requiredCount,
      )
    ) {
      return score;
    }

    return (
      score +
      set.branches.reduce((bestGain, branch) => {
        if (
          !branch.acceptedKeys.some((key) =>
            (candidate.character.detail.characterTags ?? [])
              .map((tag) => normalizeTagKeyForDemand(tag))
              .includes(key),
          )
        ) {
          return bestGain;
        }

        const currentMatches = countCaptainTagBranchMatches(prefixCharacters, branch);
        const currentDeficit = Math.max(0, branch.requiredCount - currentMatches);
        const nextDeficit = Math.max(0, branch.requiredCount - currentMatches - 1);

        return Math.max(bestGain, currentDeficit - nextDeficit);
      }, 0)
    );
  }, 0);
}

function normalizeTagKeyForDemand(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function resolveStrictBattleGroupSpreadScore(
  candidate: AutoBuildCandidate,
  battles: AutoBuildBattleRequirement[],
): number {
  return battles.reduce(
    (score, battle) =>
      score +
      battle.requiredCharacterGroups.filter((group) =>
        candidateMatchesRequiredCharacterGroup(candidate, group, []),
      ).length,
    0,
  );
}

function resolveStrictBattleGroupPreferenceScore(
  candidate: AutoBuildCandidate,
  battles: AutoBuildBattleRequirement[],
): number {
  const spreadScore = resolveStrictBattleGroupSpreadScore(candidate, battles);

  if (spreadScore === 1) {
    return 2;
  }

  return spreadScore > 1 ? 1 : 0;
}

function resolveSubCoverageRoleScore(candidate: AutoBuildCandidate): number {
  return (
    candidate.tags.burstRoles.length +
    candidate.tags.consistencyRoles.length +
    candidate.tags.utilityRoles.length
  );
}

function resolveSubSelectedFilterScore(
  candidate: AutoBuildCandidate,
  input: AutoBuildInput,
): number {
  return (
    candidate.matchedSelectedTypes.length +
    candidate.matchedSelectedClasses.length +
    (input.requireAllSelectedClassesPerCharacter && candidate.matchesAllSelectedClasses ? 1 : 0)
  );
}

function resolveCountedTeamCost(captain: AutoBuildCandidate, subs: AutoBuildCandidate[]): number {
  return (
    captain.character.cost + subs.reduce((total, candidate) => total + candidate.character.cost, 0)
  );
}

function teamCostWithinBudget(
  input: Pick<AutoBuildInput, 'maxTotalCost'>,
  captain: AutoBuildCandidate,
  subs: AutoBuildCandidate[],
): boolean {
  return input.maxTotalCost === null || resolveCountedTeamCost(captain, subs) <= input.maxTotalCost;
}

function canAddSubWithinTeamCostBudget(
  input: Pick<AutoBuildInput, 'maxTotalCost'>,
  captain: AutoBuildCandidate,
  selectedSubs: AutoBuildCandidate[],
  candidate: AutoBuildCandidate,
): boolean {
  return teamCostWithinBudget(input, captain, [...selectedSubs, candidate]);
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
  const abilityText = [specialText, sailorText].filter(Boolean).join(' ');
  const burstRoles = uniqueRoles<AutoBuildBurstRole>([
    textHasAtkBoost(abilityText) ? 'atkBoost' : null,
    includesAny(abilityText, ['orb effects', 'slot effect']) ? 'orbBoost' : null,
    abilityText.includes('color affinity') ? 'colorAffinity' : null,
    includesAny(abilityText, [
      'boosts the chain multiplier',
      'boost chain',
      'chain multiplier by +',
    ])
      ? 'chainBoost'
      : null,
    includesAny(abilityText, ['conditional', 'against enemies with', 'if the enemy is'])
      ? 'conditional'
      : null,
  ]);
  const consistencyRoles = uniqueRoles<AutoBuildConsistencyRole>([
    abilityText.includes('matching orbs') ? 'matchingOrbs' : null,
    abilityText.includes('changes') && abilityText.includes('orbs') ? 'orbChange' : null,
    abilityText.includes('special cooldown') ? 'cooldownReduction' : null,
  ]);
  const utilityRoles = uniqueRoles<AutoBuildUtilityRole>([
    abilityText.includes('bind') ? 'bind' : null,
    abilityText.includes('despair') ? 'despair' : null,
    abilityText.includes('paralysis') ? 'paralysis' : null,
    abilityText.includes('atk down') ? 'atkDown' : null,
    includesAny(abilityText, ['damage reduction']) ? 'damageReduction' : null,
    includesAny(abilityText, ['threshold damage reduction']) ? 'threshold' : null,
    includesAny(abilityText, ['defense down', 'reduces the defense']) ? 'defenseDown' : null,
  ]);
  const captainBoostScope = resolveCaptainBoostScope(captainText, 'simpleBoostScope');
  const allowedClasses = captainBoostScope.allowedClasses;
  const allowedTypes = captainBoostScope.allowedTypes;
  const allowedCharacterTags = captainBoostScope.allowedCharacterTags;
  const hasCostRestriction = false;
  const maxAllowedCost = null;
  const allCharacters = captainBoostScope.allCharacters;
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
      allowedCharacterTags,
      hasCostRestriction,
      maxAllowedCost,
      hasClassRestriction: !allCharacters && allowedClasses.length > 0,
      hasTypeRestriction: !allCharacters && allowedTypes.length > 0,
      hasCharacterTagRestriction: !allCharacters && allowedCharacterTags.length > 0,
      matchedSelectedClasses,
      matchedSelectedClassCount: matchedSelectedClasses.length,
      coversAllSelectedClasses:
        selectedClasses.length > 0 && matchedSelectedClasses.length === selectedClasses.length,
      matchedSelectedTypes,
      matchedSelectedTypeCount: matchedSelectedTypes.length,
      coversAllSelectedTypes:
        selectedTypes.length > 0 && matchedSelectedTypes.length === selectedTypes.length,
      matchesClass: matchedSelectedClasses.length > 0,
      tagConditionBranches: [],
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
  battleRequirementAssignmentMode: BattleRequirementAssignmentMode = 'flexible',
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
  const battleRequirements = resolveBattleRequirementCoverage(
    candidates,
    input.battleRequirements,
    leaderCandidates,
    battleRequirementAssignmentMode,
  );

  return {
    leaderCriteria: summarizeLeaderCriteria(candidates, leaderCriteria),
    abilityRequirements,
    requiredCharacterGroups,
    battleRequirements,
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
  input: AutoBuildInput,
): ActiveLeaderCriteria {
  const uniqueLeaders = resolveUniqueCandidates(leaders);
  const coverageMode = resolveCaptainAbilityCoverageMode(input);
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
  const characterTagScope = resolveIntersectedLeaderDimension(
    uniqueLeaders,
    resolveOrderedLeaderCharacterTags(uniqueLeaders),
    (leader) => leader.tags.captainScope.allowedCharacterTags,
    (leader) => leader.tags.captainScope.hasCharacterTagRestriction,
  );

  return {
    source: 'captainAbility',
    coverageMode,
    captainLeaderId,
    friendCaptainLeaderId,
    leaders: uniqueLeaders,
    leaderIds: uniqueLeaders.map((leader) => leader.character.id),
    leaderNames: uniqueLeaders.map((leader) => leader.character.name),
    dualLeaderMode: uniqueLeaders.length > 1 ? 'intersection' : 'single',
    derivedAllowedClasses: classScope.values,
    derivedAllowedTypes: typeScope.values,
    derivedAllowedCharacterTags: characterTagScope.values,
    hasCostRestriction: false,
    maxAllowedCost: null,
    hasClassRestriction: classScope.restricted,
    hasTypeRestriction: typeScope.restricted,
    hasCharacterTagRestriction: characterTagScope.restricted,
    tagConditionSets: [],
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

function resolveOrderedLeaderCharacterTags(leaders: AutoBuildCandidate[]): string[] {
  return leaders
    .flatMap((leader) => leader.tags.captainScope.allowedCharacterTags)
    .filter(
      (tag, index, values) =>
        values.findIndex(
          (candidate) => normalizeCaptainTagKey(candidate) === normalizeCaptainTagKey(tag),
        ) === index,
    );
}

function summarizeLeaderCriteria(
  candidates: AutoBuildCandidate[],
  leaderCriteria: ActiveLeaderCriteria,
): AutoBuildLeaderCriteriaSummary {
  const matchingSlots = candidates.filter((candidate) =>
    matchesActiveLeaderCriteria(candidate, leaderCriteria),
  ).length;

  return {
    source: leaderCriteria.source,
    coverageMode: leaderCriteria.coverageMode,
    captainLeaderId: leaderCriteria.captainLeaderId,
    friendCaptainLeaderId: leaderCriteria.friendCaptainLeaderId,
    leaderIds: [...leaderCriteria.leaderIds],
    leaderNames: [...leaderCriteria.leaderNames],
    dualLeaderMode: leaderCriteria.dualLeaderMode,
    derivedAllowedClasses: [...leaderCriteria.derivedAllowedClasses],
    derivedAllowedTypes: [...leaderCriteria.derivedAllowedTypes],
    derivedAllowedCharacterTags: [...leaderCriteria.derivedAllowedCharacterTags],
    hasCostRestriction: leaderCriteria.hasCostRestriction,
    maxAllowedCost: leaderCriteria.maxAllowedCost,
    hasClassRestriction: leaderCriteria.hasClassRestriction,
    hasTypeRestriction: leaderCriteria.hasTypeRestriction,
    hasCharacterTagRestriction: leaderCriteria.hasCharacterTagRestriction,
    tagConditionSets: leaderCriteria.tagConditionSets.map((set) => ({
      ...set,
      branches: set.branches.map((branch) => ({
        ...branch,
        labels: [...branch.labels],
        acceptedKeys: [...branch.acceptedKeys],
      })),
    })),
    matchingSlots,
    totalSlots: candidates.length,
    allSlotsMatch: matchingSlots === candidates.length,
  };
}

function matchesActiveLeaderCriteria(
  candidate: AutoBuildCandidate,
  leaderCriteria: ActiveLeaderCriteria,
): boolean {
  if (leaderCriteria.coverageMode === 'fullAbilityCoverage') {
    return leaderCriteria.leaders.every(
      (leader) =>
        resolveCaptainCoverage(leader.character, candidate.character, {
          coverageMode: 'fullAbilityCoverage',
          targetCharacterTags: candidate.character.detail.characterTags ?? [],
          includeTeamTagClauses: false,
        }).matches,
    );
  }

  const matchesClassScope = leaderCriteria.hasClassRestriction
    ? candidate.character.classes.some((characterClass) =>
        leaderCriteria.derivedAllowedClasses.some(
          (allowedClass) => allowedClass.toLowerCase() === characterClass.toLowerCase(),
        ),
      )
    : false;
  const characterTypes = resolveCharacterTypeTokens(candidate.character.type);
  const matchesTypeScope = leaderCriteria.hasTypeRestriction
    ? characterTypes.some((type) => leaderCriteria.derivedAllowedTypes.includes(type))
    : false;
  const characterTagKeys = (candidate.character.detail.characterTags ?? []).map((tag) =>
    normalizeCaptainTagKey(tag),
  );
  const matchesCharacterTagScope = leaderCriteria.hasCharacterTagRestriction
    ? leaderCriteria.derivedAllowedCharacterTags.some((tag) =>
        characterTagKeys.includes(normalizeCaptainTagKey(tag)),
      )
    : false;
  const hasDimensionScope =
    leaderCriteria.hasClassRestriction ||
    leaderCriteria.hasTypeRestriction ||
    leaderCriteria.hasCharacterTagRestriction;
  const matchesDimensionScope = hasDimensionScope
    ? matchesClassScope || matchesTypeScope || matchesCharacterTagScope
    : true;

  return matchesDimensionScope;
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

function matchesLeaderBuildScopeForAttempt(
  candidate: AutoBuildCandidate,
  leaderCriteria: ActiveLeaderCriteria,
  input: AutoBuildInput,
): boolean {
  return input.allowPartialCaptainAbilityCoverage
    ? true
    : matchesLeaderBuildScope(candidate, leaderCriteria);
}

function shouldEnforceCaptainAbilityCoverage(input: AutoBuildInput): boolean {
  return input.requireFullCaptainAbilityCoverage && !input.allowPartialCaptainAbilityCoverage;
}

function resolveLeaderCriteriaCoveragePreferenceScore(
  candidate: AutoBuildCandidate,
  leaderCriteria: ActiveLeaderCriteria,
): number {
  return matchesActiveLeaderCriteria(candidate, leaderCriteria) ? 1 : 0;
}

function matchesActiveLeaderTagConditions(
  candidates: readonly AutoBuildCandidate[],
  leaderCriteria: ActiveLeaderCriteria,
): boolean {
  return leaderCriteria.tagConditionSets.every((set) =>
    captainTagBranchesSatisfied(
      candidates.map((candidate) => candidate.character),
      set.branches,
    ),
  );
}

function canStillReachLeaderTagConditions(
  candidates: readonly AutoBuildCandidate[],
  remainingSlots: number,
  leaderCriteria: ActiveLeaderCriteria,
): boolean {
  const characters = candidates.map((candidate) => candidate.character);

  return leaderCriteria.tagConditionSets.every((set) =>
    set.branches.some(
      (branch) =>
        countCaptainTagBranchMatches(characters, branch) + remainingSlots >= branch.requiredCount,
    ),
  );
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
  return /^(?:(?:and|or|also|additionally|furthermore|then|otherwise)\b,?\s*)*(?:if|when)\b/i.test(
    clause.trim(),
  );
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
