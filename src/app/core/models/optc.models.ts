import {
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
  type NormalizedBuilderAbility,
} from './auto-team-builder-ability.models';

export interface CharacterStatsRange {
  hp: number;
  atk: number;
  rcv: number;
}

export interface CharacterStats {
  min: CharacterStatsRange;
  max: CharacterStatsRange;
  growth: number;
}

export interface RegionAvailability {
  exactLocal: boolean;
  thumbnailGlobal: boolean;
  thumbnailJapan: boolean;
  fullTransparent: boolean;
}

export interface CharacterSupportEntry {
  supportedCharactersText: string;
  levelDescriptions: string[];
}

export interface CharacterCaptainAbilityVariant {
  key: string;
  label: string;
  text: string;
}

export interface SuperCriteriaCharacterOption {
  label: string;
  acceptedKeys: string[];
}

export interface CharacterCountAnySuperCriteriaBranch {
  branchType: 'character_count_any';
  requiredCount: number;
  options: SuperCriteriaCharacterOption[];
}

export interface ClassOrTypeCountAnySuperCriteriaBranch {
  branchType: 'class_or_type_count_any';
  requiredCount: number;
  allowedClasses: string[];
  allowedTypes: string[];
}

export interface ClassOrTypePresenceAllSuperCriteriaBranch {
  branchType: 'class_or_type_presence_all';
  requiredClasses: string[];
  requiredTypes: string[];
}

export type SuperCriteriaBranch =
  | CharacterCountAnySuperCriteriaBranch
  | ClassOrTypeCountAnySuperCriteriaBranch
  | ClassOrTypePresenceAllSuperCriteriaBranch;

export interface NormalizedSuperSpecialCriteria {
  rawText: string;
  requiresCaptain: boolean;
  rosterBranches: SuperCriteriaBranch[];
  hasNonRosterBranches: boolean;
  parserStatus: 'roster_only' | 'mixed' | 'non_roster_only' | 'unsupported';
}

export interface CharacterAssets {
  exactLocal: string | null;
  thumbnailGlobal: string | null;
  thumbnailJapan: string | null;
  fullTransparent: string | null;
}

export interface CharacterRecord {
  id: number;
  name: string;
  type: string;
  classes: string[];
  primaryClass: string;
  secondaryClass: string | null;
  stars: number;
  cost: number;
  combo: number;
  maxLevel: number;
  maxExperience: number;
  stats: CharacterStats;
  regionAvailability: RegionAvailability;
  assets: CharacterAssets;
}

export interface CharacterDetail {
  characterId: number;
  captainAbility: string | null;
  captainAbilityVariants: CharacterCaptainAbilityVariant[];
  captainNotes: string | null;
  specialName: string | null;
  specialText: string | null;
  specialNotes: string | null;
  superSpecialText: string | null;
  superSpecialCriteriaText: string | null;
  superSpecialNotes: string | null;
  superSpecialCriteria: NormalizedSuperSpecialCriteria | null;
  partyConflictKeys: string[];
  builderAbilities: NormalizedBuilderAbility[];
  sailorAbilities: string[];
  sailorNotes: string | null;
  limitBreak: Array<{ description: string }>;
  potentialAbilities: Array<{ Name?: string; description?: string[] }>;
  supportData: CharacterSupportEntry[];
  swapData: Record<string, unknown> | null;
  vsSpecial: Record<string, unknown> | null;
  superType: Record<string, unknown> | null;
  superClass: Record<string, unknown> | null;
  rumbleData: Record<string, unknown> | null;
}

export interface CharacterListItem extends CharacterRecord {
  imageUrl: string;
}

export interface CharacterDetailRecord extends CharacterListItem {
  detail: CharacterDetail;
  detailImageUrl: string;
}

export interface ShipRecord {
  id: number;
  name: string;
  thumb: string | null;
  thumbUrl: string | null;
  description: string;
}

export interface SavedTeam {
  id: string;
  name: string;
  slots: Array<number | null>;
  shipId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedEnemy {
  id: string;
  name: string;
  notes: string;
  imageDataUrl: string | null;
  selectedTypes: string[];
  selectedClasses: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OfflinePackSummary {
  key: string;
  id: string;
  label: string;
  localBasePath: string;
  fileCount: number;
  totalBytes: number;
  installed: boolean;
}

export interface DatasetManifest {
  generatedAt: string;
  sourceVersion: string;
  characterCount: number;
  detailCount: number;
  shipCount: number;
  rumbleCount: number;
  availableTypes: string[];
  availableClasses: string[];
  packs: OfflinePackSummary[];
}

export interface CharacterSearchQuery {
  searchTerm: string;
  typeFilter: string;
  classFilter: string;
  allowedCharacterIds?: number[];
  limit: number;
  offset: number;
}

export interface DetailedCharacterSearchQuery {
  searchTerm: string;
  selectedTypes: string[];
  selectedTypesMatchMode?: 'all' | 'any';
  selectedClasses: string[];
  selectedClassesMatchMode?: 'all' | 'any';
  sortMode?: 'catalog' | 'newest';
  limit: number;
  offset: number;
}
