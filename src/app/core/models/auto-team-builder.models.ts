import { type CharacterDetailRecord } from './optc.models';

export const AUTO_TEAM_BUILDER_TYPES = ['DEX', 'STR', 'QCK', 'PSY', 'INT'] as const;
export const AUTO_TEAM_BUILDER_DEFAULT_TYPE = 'DEX';
export const AUTO_TEAM_CANDIDATE_LIMIT = 1200;

export type AutoTeamBuilderType = (typeof AUTO_TEAM_BUILDER_TYPES)[number];

export interface AutoBuildConstraints {
  requireAllSelectedTypesInTeam?: boolean;
  requireAllSelectedClassesPerCharacter?: boolean;
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
  candidateLimit?: number;
}

export interface AutoBuildEffectTags {
  captainScope: {
    allCharacters: boolean;
    matchedSelectedClasses: string[];
    matchedSelectedClassCount: number;
    coversAllSelectedClasses: boolean;
    matchedSelectedTypes: AutoTeamBuilderType[];
    matchedSelectedTypeCount: number;
    coversAllSelectedTypes: boolean;
    matchesClass: boolean;
  };
  burstRoles: AutoBuildBurstRole[];
  consistencyRoles: AutoBuildConsistencyRole[];
  utilityRoles: AutoBuildUtilityRole[];
  captainAtkMultiplier: number;
  captainHpMultiplier: number;
  readableCaptainText: boolean;
  readableSpecialText: boolean;
  readableSailorText: boolean;
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

export interface AutoBuildResult {
  input: AutoBuildInput;
  candidateCount: number;
  slots: AutoBuildSlot[];
  coverage: AutoBuildCoverageSummary;
}
