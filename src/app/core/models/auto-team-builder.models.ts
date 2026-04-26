import {
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
  type NormalizedBuilderAbility,
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
export type AutoTeamBuilderClass = (typeof AUTO_TEAM_BUILDER_CLASSES)[number];
export type AutoBuildManualSlotRole = (typeof AUTO_BUILD_MANUAL_SLOT_ROLES)[number];
export type AutoBuildLeaderBoostFilter = (typeof AUTO_BUILD_LEADER_BOOST_FILTERS)[number];

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
  }));
}

export interface AutoBuildConstraints {
  requireAllSelectedTypesInTeam?: boolean;
  requireAllSelectedClassesPerCharacter?: boolean;
  requireAllSlotsInLeaderSuperEffectScope?: boolean;
  minimumLeaderSuperEffectMatchingSlots?: number | null;
  requireLeaderSuperSpecialCriteria?: boolean;
  requireUniqueBaseCharacterNames?: boolean;
  requiredAbilities?: AutoBuildAbilityRequirement[];
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
  manualSlots?: AutoBuildManualSlotSelection[];
  lockedCharacterIds?: number[];
  excludedCharacterIds?: number[];
  captainCharacterId?: number | null;
  friendCaptainCharacterId?: number | null;
  manualShipId?: number | null;
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
  requireLeaderSuperSpecialCriteria: boolean;
  requireAllSlotsInLeaderSuperEffectScope: boolean;
  minimumLeaderSuperEffectMatchingSlots: number | null;
  requireUniqueBaseCharacterNames: boolean;
  requiredAbilities: AutoBuildAbilityRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  favoritesOnly: boolean;
  allowAnyFriendCaptainAutoFill: boolean;
  favoriteShipsOnly: boolean;
  favoriteShipIds: number[];
  leaderBoostFilters: AutoBuildLeaderBoostFilter[];
  leaderBoostRanges: AutoBuildLeaderBoostRanges;
  costRange: AutoBuildCostRange;
  manualSlots: AutoBuildManualSlotSelection[];
  lockedCharacterIds: number[];
  excludedCharacterIds: number[];
  captainCharacterId: number | null;
  friendCaptainCharacterId: number | null;
  manualShipId: number | null;
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
}

export interface AutoBuildShipSelection {
  ship: ShipRecord;
  source: 'manual' | 'recommended';
  reasonChips: string[];
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

export interface AutoBuildEffectTags {
  captainScope: {
    allCharacters: boolean;
    allowedClasses: string[];
    allowedTypes: AutoTeamBuilderType[];
    hasCostRestriction: boolean;
    maxAllowedCost: number | null;
    hasClassRestriction: boolean;
    hasTypeRestriction: boolean;
    matchedSelectedClasses: string[];
    matchedSelectedClassCount: number;
    coversAllSelectedClasses: boolean;
    matchedSelectedTypes: AutoTeamBuilderType[];
    matchedSelectedTypeCount: number;
    coversAllSelectedTypes: boolean;
    matchesClass: boolean;
  };
  specialScope: AutoBuildSpecialScope;
  burstRoles: AutoBuildBurstRole[];
  consistencyRoles: AutoBuildConsistencyRole[];
  utilityRoles: AutoBuildUtilityRole[];
  captainAtkMultiplier: number;
  captainHpMultiplier: number;
  readableCaptainText: boolean;
  readableSpecialText: boolean;
  readableSailorText: boolean;
}

export interface AutoBuildLeaderCriteriaSummary {
  source: 'captainAbility';
  captainLeaderId: number | null;
  friendCaptainLeaderId: number | null;
  leaderIds: number[];
  leaderNames: string[];
  dualLeaderMode: 'single' | 'intersection';
  derivedAllowedClasses: string[];
  derivedAllowedTypes: AutoTeamBuilderType[];
  hasCostRestriction: boolean;
  maxAllowedCost: number | null;
  hasClassRestriction: boolean;
  hasTypeRestriction: boolean;
  matchingSlots: number;
  totalSlots: number;
  allSlotsMatch: boolean;
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
  tags: AutoBuildEffectTags;
  reasonChips: string[];
  recencyScore: number;
}

export interface AutoBuildSlot {
  role: 'captain' | 'friendCaptain' | 'sub';
  character: CharacterDetailRecord;
  reasonChips: string[];
}

export interface AutoBuildCoverageSummary {
  leaderCriteria: AutoBuildLeaderCriteriaSummary;
  abilityRequirements: {
    requested: AutoBuildAbilityRequirement[];
    matched: AutoBuildAbilityRequirement[];
    missing: AutoBuildAbilityRequirement[];
    matchesAll: boolean;
  };
  burst: string[];
  consistency: string[];
  utility: string[];
  coveredSelectedClasses: string[];
  coveredSelectedTypes: AutoTeamBuilderType[];
  coversAllSelectedClasses: boolean;
  coversAllSelectedTypes: boolean;
  selectedClassMatches: number;
  selectedTypeMatches: number;
}

export interface AutoBuildRelaxationSummary {
  usedFallback: boolean;
  droppedTypes: AutoTeamBuilderType[];
  droppedClasses: string[];
  minimumLeaderSuperEffectMatchingSlots: number | null;
  allowedLeadersWithSuperEffects: boolean;
  ignoredLeaderSuperEffectScope: boolean;
  ignoredLeaderSuperSpecialCriteria: boolean;
}

export type AutoBuildProgressStage =
  | 'loadingCandidates'
  | 'preparingSearch'
  | 'exactAttempt'
  | 'fallbackAttempt'
  | 'completed';

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

export interface AutoBuildAbilityMatchSummary {
  requirement: AutoBuildAbilityRequirement;
  matchedByCharacterIds: number[];
}

export interface AutoBuildRequirementMatchCandidate {
  abilities: NormalizedBuilderAbility[];
}
