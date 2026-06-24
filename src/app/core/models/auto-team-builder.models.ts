import {
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildRequiredCharacterGroup,
} from './auto-team-builder-ability.models';
import { type CharacterDetailRecord, type ShipRecord } from './optc.models';

export const AUTO_TEAM_BUILDER_TYPES = ['DEX', 'STR', 'QCK', 'PSY', 'INT'] as const;
export const AUTO_TEAM_BUILDER_CLASSES = [
  'Booster',
  'Cerebral',
  'Driven',
  'Evolver',
  'Fighter',
  'Free Spirit',
  'Powerhouse',
  'Shooter',
  'Slasher',
  'Striker',
] as const;
export const AUTO_TEAM_BUILDER_DEFAULT_TYPE = 'DEX';
export const AUTO_TEAM_CANDIDATE_LIMIT = null;
export const DEFAULT_AUTO_TEAM_CANDIDATE_LIMIT = 1200;
export const MAX_AUTO_BUILD_RANKED_RESULT_COUNT = 50;
export const AUTO_BUILD_MANUAL_SLOT_ROLES = [
  'captain',
  'friendCaptain',
  'sub1',
  'sub2',
  'sub3',
  'sub4',
] as const;
export const AUTO_BUILD_MANUAL_SUB_SLOT_ROLES = ['sub1', 'sub2', 'sub3', 'sub4'] as const;
export const AUTO_BUILD_TOTAL_SLOT_COUNT = AUTO_BUILD_MANUAL_SLOT_ROLES.length;
export const AUTO_BUILD_LEADER_BOOST_FILTERS = ['HP', 'ATK'] as const;

export type AutoTeamBuilderType = (typeof AUTO_TEAM_BUILDER_TYPES)[number];
export type AutoBuildManualSlotRole = (typeof AUTO_BUILD_MANUAL_SLOT_ROLES)[number];
export type AutoBuildLeaderBoostFilter = (typeof AUTO_BUILD_LEADER_BOOST_FILTERS)[number];
export type AutoBuildCaptainAbilityCoverageMode = 'simpleBoostScope' | 'fullAbilityCoverage';
export type AutoBuildCaptainBranchMode = 'character1' | 'character2' | 'both';
type AutoBuildCaptainBranchSelectionSource = 'manual' | 'auto';
export type AutoBuildLeaderSlotRole = 'captain' | 'friendCaptain';

export interface AutoBuildLeaderBoostRange {
  min: number | null;
  max: number | null;
}

export interface AutoBuildLeaderBoostRanges {
  HP: AutoBuildLeaderBoostRange;
  ATK: AutoBuildLeaderBoostRange;
}

export interface AutoBuildCostRange {
  min: number | null;
  max: number | null;
}

export interface AutoBuildManualSlotSelection {
  role: AutoBuildManualSlotRole;
  characterIds: number[];
  requiredCharacterId?: number | null;
  branchSelections?: AutoBuildManualSlotBranchSelection[];
}

interface AutoBuildManualSlotBranchSelection {
  characterId: number;
  mode: AutoBuildCaptainBranchMode;
}

export interface AutoBuildCaptainBranchSelection {
  characterId: number;
  mode: AutoBuildCaptainBranchMode;
  label: string;
  displayName: string;
  source: AutoBuildCaptainBranchSelectionSource;
}

interface AutoBuildLeaderBranchSelection extends AutoBuildCaptainBranchSelection {
  role: AutoBuildLeaderSlotRole;
}

export function createEmptyAutoBuildLeaderBoostRanges(): AutoBuildLeaderBoostRanges {
  return {
    HP: { min: null, max: null },
    ATK: { min: null, max: null },
  };
}

export function createEmptyAutoBuildCostRange(): AutoBuildCostRange {
  return {
    min: null,
    max: null,
  };
}

export function createEmptyAutoBuildManualSlots(): AutoBuildManualSlotSelection[] {
  return AUTO_BUILD_MANUAL_SLOT_ROLES.map((role) => ({
    role,
    characterIds: [],
    requiredCharacterId: null,
  }));
}

export interface AutoBuildConstraints {
  selectedCharacterTags?: string[];
  selectedCharacterNames?: string[];
  requireAllSelectedTypesInTeam?: boolean;
  requireAllSelectedClassesPerCharacter?: boolean;
  requireAllSelectedCharacterTagsInTeam?: boolean;
  requireAllSelectedCharacterNamesInTeam?: boolean;
  requireAllSlotsInLeaderSuperEffectScope?: boolean;
  requireFullCaptainAbilityCoverage?: boolean;
  requireBothLeadersFullCaptainAbilityCoverage?: boolean;
  minimumLeaderSuperEffectMatchingSlots?: number | null;
  requireLeaderSuperSpecialCriteria?: boolean;
  strictSuperSpecialCriteriaCoverage?: boolean;
  requireSuperTandemCriteria?: boolean;
  strictSuperTandemCriteriaCoverage?: boolean;
  requireUniqueBaseCharacterNames?: boolean;
  requiredAbilities?: AutoBuildAbilityRequirement[];
  requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
  enemyMechanics?: AutoBuildEnemyMechanicRequirement[];
  candidateCharacterIds?: number[];
  favoritesOnly?: boolean;
  allowAnyFriendCaptainAutoFill?: boolean;
  favoriteCharacterIds?: number[];
  favoriteShipsOnly?: boolean;
  favoriteShipIds?: number[];
  leaderBoostFilters?: AutoBuildLeaderBoostFilter[];
  leaderBoostRanges?: Partial<
    Record<AutoBuildLeaderBoostFilter, Partial<AutoBuildLeaderBoostRange> | null>
  >;
  costRange?: Partial<AutoBuildCostRange> | null;
  leaderCostRange?: Partial<AutoBuildCostRange> | null;
  subCostRange?: Partial<AutoBuildCostRange> | null;
  maxTotalCost?: number | null;
  manualSlots?: AutoBuildManualSlotSelection[];
  lockedCharacterIds?: number[];
  excludedCharacterIds?: number[];
  captainCharacterId?: number | null;
  friendCaptainCharacterId?: number | null;
  manualShipId?: number | null;
  requireManualShip?: boolean;
  excludedShipIds?: number[];
}

export interface AutoBuildCandidateQueryOptions {
  selectedClasses?: string[];
  allowedCharacterIds?: number[];
  lockedCharacterIds?: number[];
  excludedCharacterIds?: number[];
  costRange?: Partial<AutoBuildCostRange> | null;
}

export type AutoBuildBurstRole =
  | 'atkBoost'
  | 'orbBoost'
  | 'colorAffinity'
  | 'chainBoost'
  | 'conditional';

export type AutoBuildConsistencyRole = 'matchingOrbs' | 'orbChange' | 'cooldownReduction';

export type AutoBuildUtilityRole =
  | 'bind'
  | 'despair'
  | 'paralysis'
  | 'atkDown'
  | 'damageReduction'
  | 'threshold'
  | 'defenseDown';

export interface AutoBuildInput extends AutoBuildConstraints {
  types: AutoTeamBuilderType[];
  selectedClasses: string[];
  selectedCharacterTags: string[];
  selectedCharacterNames: string[];
  requireAllSelectedCharacterTagsInTeam: boolean;
  requireAllSelectedCharacterNamesInTeam: boolean;
  requireLeaderSuperSpecialCriteria: boolean;
  requireAllSlotsInLeaderSuperEffectScope: boolean;
  requireFullCaptainAbilityCoverage: boolean;
  requireBothLeadersFullCaptainAbilityCoverage: boolean;
  allowPartialCaptainAbilityCoverage?: boolean;
  minimumLeaderSuperEffectMatchingSlots: number | null;
  requireUniqueBaseCharacterNames: boolean;
  strictSuperSpecialCriteriaCoverage: boolean;
  requireSuperTandemCriteria: boolean;
  strictSuperTandemCriteriaCoverage: boolean;
  requiredAbilities: AutoBuildAbilityRequirement[];
  requiredCharacterGroups: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  favoritesOnly: boolean;
  allowAnyFriendCaptainAutoFill: boolean;
  favoriteShipsOnly: boolean;
  favoriteShipIds: number[];
  leaderBoostFilters: AutoBuildLeaderBoostFilter[];
  leaderBoostRanges: AutoBuildLeaderBoostRanges;
  costRange: AutoBuildCostRange;
  leaderCostRange: AutoBuildCostRange;
  subCostRange: AutoBuildCostRange;
  maxTotalCost: number | null;
  manualSlots: AutoBuildManualSlotSelection[];
  lockedCharacterIds: number[];
  excludedCharacterIds: number[];
  captainCharacterId: number | null;
  friendCaptainCharacterId: number | null;
  manualShipId: number | null;
  requireManualShip: boolean;
  excludedShipIds: number[];
  candidateLimit?: number | null;
}

export interface AutoBuildRosterInput extends Omit<
  AutoBuildConstraints,
  'manualSlots' | 'lockedCharacterIds' | 'captainCharacterId' | 'friendCaptainCharacterId'
> {
  rosterCharacterIds: number[];
  captainCharacterId?: number | null;
  friendCaptainCharacterId?: number | null;
  resultLimit?: number | null;
  maxTotalCost?: number | null;
}

export interface AutoBuildShipSelection {
  ship: ShipRecord;
  source: 'manual' | 'recommended';
  reasonChips: string[];
}

export type AutoBuildSlotExplanationReasonParam =
  | boolean
  | number
  | string
  | readonly number[]
  | readonly string[];

export type AutoBuildSlotExplanationReasonCode =
  | 'manualPick'
  | 'captainRole'
  | 'friendCaptainRole'
  | 'subRole'
  | 'selectedTypeMatch'
  | 'selectedClassMatch'
  | 'selectedCharacterTagMatch'
  | 'selectedCharacterNameMatch'
  | 'captainUniversalScope'
  | 'captainTypeScope'
  | 'captainClassScope'
  | 'leaderScopeMatch'
  | 'requiredAbilityMatch'
  | 'battleRequirementMatch'
  | 'burstRole'
  | 'consistencyRole'
  | 'utilityRole'
  | 'rankingDemand'
  | 'rankingSelectedFilters'
  | 'rankingNewestId'
  | 'fallbackUsed'
  | 'fallbackDroppedTypes'
  | 'fallbackDroppedClasses'
  | 'fallbackDroppedCharacterTags'
  | 'fallbackDroppedCharacterNames'
  | 'fallbackAllowedSuperEffectLeaders'
  | 'fallbackIgnoredLeaderSuperScope'
  | 'fallbackIgnoredSuperSpecialCriteria'
  | 'fallbackIgnoredSuperTandemCriteria'
  | 'fallbackIgnoredCaptainAbilityCoverage'
  | 'fallbackDowngradedCaptainAbilityCoverage';

export interface AutoBuildSlotExplanationReason {
  code: AutoBuildSlotExplanationReasonCode;
  params?: Record<string, AutoBuildSlotExplanationReasonParam>;
}

export type AutoBuildRejectedCandidateReasonCode =
  | 'manualSlotLocked'
  | 'alreadySelected'
  | 'duplicateBaseConflict'
  | 'leaderScopeConstraint'
  | 'costConstraint'
  | 'requiredConstraint'
  | 'lowerRequirementDemand'
  | 'lowerCoverageContribution'
  | 'lowerSelectedFilterScore'
  | 'lowerLeaderCoverageScore'
  | 'rankingTieBreak';

export interface AutoBuildRejectedCandidateReason {
  code: AutoBuildRejectedCandidateReasonCode;
  params?: Record<string, AutoBuildSlotExplanationReasonParam>;
}

export interface AutoBuildRejectedCandidateExplanation {
  characterId: number;
  characterName: string;
  reasons: AutoBuildRejectedCandidateReason[];
}

export interface AutoBuildSlotExplanation {
  primaryReason: AutoBuildSlotExplanationReason;
  reasons: AutoBuildSlotExplanationReason[];
  fallbackReasons: AutoBuildSlotExplanationReason[];
  rejectedCandidates: AutoBuildRejectedCandidateExplanation[];
}

export interface AutoBuildSpecialScope {
  allCharacters: boolean;
  allowedClasses: string[];
  allowedTypes: AutoTeamBuilderType[];
  hasCostRestriction: boolean;
  maxAllowedCost: number | null;
  hasClassRestriction: boolean;
  hasTypeRestriction: boolean;
  hasExplicitTarget: boolean;
  hasQualifyingEffect: boolean;
}

export interface AutoBuildLeaderTagConditionBranch {
  requiredCount: number;
  labels: string[];
  acceptedKeys: string[];
  text: string;
}

export interface AutoBuildLeaderTagConditionSet {
  leaderId: number;
  leaderName: string;
  branches: AutoBuildLeaderTagConditionBranch[];
}

export interface AutoBuildEffectTags {
  captainScope: {
    allCharacters: boolean;
    allowedClasses: string[];
    allowedTypes: AutoTeamBuilderType[];
    allowedCharacterTags: string[];
    hasCostRestriction: boolean;
    maxAllowedCost: number | null;
    hasClassRestriction: boolean;
    hasTypeRestriction: boolean;
    hasCharacterTagRestriction: boolean;
    matchedSelectedClasses: string[];
    matchedSelectedClassCount: number;
    coversAllSelectedClasses: boolean;
    matchedSelectedTypes: AutoTeamBuilderType[];
    matchedSelectedTypeCount: number;
    coversAllSelectedTypes: boolean;
    matchesClass: boolean;
    tagConditionBranches: AutoBuildLeaderTagConditionBranch[];
  };
  specialScope: AutoBuildSpecialScope;
  burstRoles: AutoBuildBurstRole[];
  consistencyRoles: AutoBuildConsistencyRole[];
  utilityRoles: AutoBuildUtilityRole[];
  captainAtkMultiplier: number;
  captainHpMultiplier: number;
  readableCaptainText: boolean;
  hasCaptainCoverageTier: boolean;
  readableSpecialText: boolean;
  readableSailorText: boolean;
}

export interface AutoBuildLeaderCriteriaSummary {
  source: 'captainAbility';
  coverageMode: AutoBuildCaptainAbilityCoverageMode;
  captainLeaderId: number | null;
  friendCaptainLeaderId: number | null;
  leaderIds: number[];
  leaderNames: string[];
  leaderBranchSelections: AutoBuildLeaderBranchSelection[];
  dualLeaderMode: 'single' | 'intersection';
  derivedAllowedClasses: string[];
  derivedAllowedTypes: AutoTeamBuilderType[];
  derivedAllowedCharacterTags: string[];
  dominantTypeRequirements: AutoTeamBuilderType[];
  hasCostRestriction: boolean;
  maxAllowedCost: number | null;
  hasClassRestriction: boolean;
  hasTypeRestriction: boolean;
  hasCharacterTagRestriction: boolean;
  requiresDominantType: boolean;
  tagConditionSets: AutoBuildLeaderTagConditionSet[];
  matchingSlots: number;
  totalSlots: number;
  allSlotsMatch: boolean;
  leaderTierCoverages: AutoBuildLeaderTierCoverageSummary[];
  allLeaderTiersCovered: boolean;
}

interface AutoBuildLeaderTierCoverageSummary {
  leaderId: number;
  leaderName: string;
  // Tiers that contribute to coverage — excludes self-only-only tiers that no other slot can satisfy.
  applicableTierCount: number;
  matchedTierCount: number;
  uncoveredTierLabels: string[];
  matches: boolean;
}

export interface AutoBuildCandidate {
  character: CharacterDetailRecord;
  captainText: string;
  specialText: string;
  sailorText: string;
  combinedText: string;
  matchesSelectedClass: boolean;
  matchesAllSelectedClasses: boolean;
  matchedSelectedClasses: string[];
  matchedSelectedTypes: AutoTeamBuilderType[];
  matchedSelectedCharacterTags: string[];
  matchedSelectedCharacterNames: string[];
  tags: AutoBuildEffectTags;
  reasonChips: string[];
  recencyScore: number;
}

export interface AutoBuildSlot {
  role: 'captain' | 'friendCaptain' | 'sub';
  character: CharacterDetailRecord;
  reasonChips: string[];
  explanation?: AutoBuildSlotExplanation;
  captainBranchSelection?: AutoBuildCaptainBranchSelection | null;
}

export interface AutoBuildCoverageSummary {
  leaderCriteria: AutoBuildLeaderCriteriaSummary;
  abilityRequirements: {
    requested: AutoBuildAbilityRequirement[];
    matched: AutoBuildAbilityRequirement[];
    missing: AutoBuildAbilityRequirement[];
    matchesAll: boolean;
  };
  requiredCharacterGroups: {
    requested: AutoBuildRequiredCharacterGroup[];
    matched: AutoBuildRequiredCharacterGroup[];
    missing: AutoBuildRequiredCharacterGroup[];
    matchesAll: boolean;
  };
  battleRequirements?: {
    requested: AutoBuildBattleRequirement[];
    matched: AutoBuildBattleRequirement[];
    missing: AutoBuildBattleRequirement[];
    matchesAll: boolean;
  };
  burst: string[];
  consistency: string[];
  utility: string[];
  coveredSelectedClasses: string[];
  coveredSelectedTypes: AutoTeamBuilderType[];
  coveredSelectedCharacterTags: string[];
  coveredSelectedCharacterNames: string[];
  coversAllSelectedClasses: boolean;
  coversAllSelectedTypes: boolean;
  coversAllSelectedCharacterTags: boolean;
  coversAllSelectedCharacterNames: boolean;
  selectedClassMatches: number;
  selectedTypeMatches: number;
  selectedCharacterTagMatches: number;
  selectedCharacterNameMatches: number;
}

interface AutoBuildRelaxationSummary {
  usedFallback: boolean;
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
  droppedCharacterTags: string[];
  droppedCharacterNames: string[];
  minimumLeaderSuperEffectMatchingSlots: number | null;
  allowedLeadersWithSuperEffects: boolean;
  ignoredLeaderSuperEffectScope: boolean;
  ignoredLeaderSuperSpecialCriteria: boolean;
  ignoredSuperSpecialCriteriaCharacterNames?: string[];
  ignoredSuperTandemCriteria: boolean;
  ignoredSuperTandemCriteriaCharacterNames?: string[];
  ignoredCaptainAbilityCoverage?: boolean;
  downgradedCaptainAbilityCoverageToSimple?: boolean;
}

type AutoBuildProgressStage =
  | 'loadingCandidates'
  | 'preparingSearch'
  | 'exactAttempt'
  | 'fallbackAttempt'
  | 'completed';

export interface AutoBuildProgressExclusionCounts {
  total: number;
  alreadyUsed: number;
  duplicateBaseCharacter: number;
  leaderScope: number;
  costBudget: number;
  missingRequiredGroup: number;
}

export interface AutoBuildProgressSnapshot {
  stage: AutoBuildProgressStage;
  candidateCount: number;
  completedAttempts: number;
  totalAttempts: number;
  attemptCountFinal: boolean;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  averageFallbackAttemptMs: number | null;
  completedFallbackAttempts: number;
  currentDroppedTypes: AutoTeamBuilderType[];
  currentDroppedClasses: string[];
  currentAllowedLeadersWithSuperEffects: boolean;
  currentIgnoredLeaderSuperSpecialCriteria: boolean;
  messageKey: string;
  messageParams?: Record<string, number | string>;
  completedWorkUnits?: number;
  totalWorkUnits?: number;
  currentSlot?: number;
  totalSlots?: number;
  checkedCandidates?: number;
  totalCandidatesToCheck?: number;
  activeWorkerCount?: number;
  currentCaptainId?: number;
  currentCaptainName?: string;
  currentFriendCaptainId?: number;
  currentFriendCaptainName?: string;
  leaderPairIndex?: number;
  totalLeaderPairs?: number;
  subPoolSize?: number;
  searchNodesVisited?: number;
  permanentExclusionCounts?: AutoBuildProgressExclusionCounts;
  currentExclusionCounts?: AutoBuildProgressExclusionCounts;
}

export interface AutoBuildAttemptProgressSnapshot {
  completedWorkUnits: number;
  totalWorkUnits: number;
  currentSlot?: number;
  totalSlots?: number;
  checkedCandidates?: number;
  totalCandidatesToCheck?: number;
  currentCaptainId?: number;
  currentCaptainName?: string;
  currentFriendCaptainId?: number;
  currentFriendCaptainName?: string;
  leaderPairIndex?: number;
  totalLeaderPairs?: number;
  subPoolSize?: number;
  searchNodesVisited?: number;
  permanentExclusionCounts?: AutoBuildProgressExclusionCounts;
  currentExclusionCounts?: AutoBuildProgressExclusionCounts;
}

export interface AutoBuildCoreResult {
  input: AutoBuildInput;
  candidateCount: number;
  slots: AutoBuildSlot[];
  coverage: AutoBuildCoverageSummary;
}

export interface AutoBuildAbilityCoverageBreakdownItem {
  key: string;
  label: string;
  count: number;
  characterIds: number[];
}

export interface AutoBuildAbilityCoverageBreakdown {
  distinctAbilityCount: number;
  allAbilities: AutoBuildAbilityCoverageBreakdownItem[];
  uniqueAbilities: AutoBuildAbilityCoverageBreakdownItem[];
  duplicateAbilities: AutoBuildAbilityCoverageBreakdownItem[];
}

export interface AutoBuildRankedResult extends AutoBuildCoreResult {
  teamKey: string;
  abilityBreakdown: AutoBuildAbilityCoverageBreakdown;
  ranking: {
    distinctAbilityCount: number;
    utilityCoverageCount: number;
    burstCoverageCount: number;
    consistencyCoverageCount: number;
    powerScore: number;
    recencyScore: number;
  };
}

export interface AutoBuildRankedResults {
  results: AutoBuildRankedResult[];
  totalResults: number;
  limit: number;
}

export interface AutoBuildResult extends AutoBuildCoreResult {
  requestedInput: AutoBuildInput;
  relaxation: AutoBuildRelaxationSummary;
  shipSelection: AutoBuildShipSelection | null;
}

export interface AutoBuildAbilityCoverageState {
  requested: AutoBuildAbilityRequirement[];
  matched: AutoBuildAbilityRequirement[];
  missing: AutoBuildAbilityRequirement[];
}
