import { type CharacterDetailRecord } from './optc.models';

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
export const AUTO_TEAM_CANDIDATE_LIMIT = 1200;

export type AutoTeamBuilderType = (typeof AUTO_TEAM_BUILDER_TYPES)[number];
export type AutoTeamBuilderClass = (typeof AUTO_TEAM_BUILDER_CLASSES)[number];

export interface AutoBuildConstraints {
  requireAllSelectedTypesInTeam?: boolean;
  requireAllSelectedClassesPerCharacter?: boolean;
  requireAllSpecialsSupportTeam?: boolean;
  favoritesOnly?: boolean;
  favoriteCharacterIds?: number[];
  lockedCharacterIds?: number[];
  captainCharacterId?: number | null;
  friendCaptainCharacterId?: number | null;
}

export interface AutoBuildCandidateQueryOptions {
  allowedCharacterIds?: number[];
  lockedCharacterIds?: number[];
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
  requireAllSpecialsSupportTeam: boolean;
  favoritesOnly: boolean;
  lockedCharacterIds: number[];
  captainCharacterId: number | null;
  friendCaptainCharacterId: number | null;
  candidateLimit?: number;
}

export interface AutoBuildSpecialScope {
  allCharacters: boolean;
  allowedClasses: string[];
  allowedTypes: AutoTeamBuilderType[];
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
  hasClassRestriction: boolean;
  hasTypeRestriction: boolean;
  matchingSlots: number;
  totalSlots: number;
  allSlotsMatch: boolean;
}

export interface AutoBuildSpecialSupportSummary {
  source: 'specialText';
  enabled: boolean;
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
  specialSupport: AutoBuildSpecialSupportSummary;
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
}

export interface AutoBuildCoreResult {
  input: AutoBuildInput;
  candidateCount: number;
  slots: AutoBuildSlot[];
  coverage: AutoBuildCoverageSummary;
}

export interface AutoBuildResult extends AutoBuildCoreResult {
  requestedInput: AutoBuildInput;
  relaxation: AutoBuildRelaxationSummary;
}
