import {
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildRequiredCharacterGroup,
  type NormalizedBuilderAbility,
} from './auto-team-builder-ability.models';

export interface CharacterStatsRange {
  hp: number | null;
  atk: number | null;
  rcv: number | null;
}

export interface CharacterStats {
  min: CharacterStatsRange;
  max: CharacterStatsRange;
  growth: number | null;
}

export interface RegionAvailability {
  exactLocal: boolean;
  thumbnailGlobal: boolean;
  thumbnailJapan: boolean;
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
  matchMode?: 'unique_options' | 'any_candidate';
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
  excludesSelf?: boolean;
  rosterBranches: SuperCriteriaBranch[];
  hasNonRosterBranches: boolean;
  parserStatus: 'roster_only' | 'mixed' | 'non_roster_only' | 'unsupported';
}

export interface NormalizedSuperTandemLevel extends Record<string, unknown> {
  level: number;
  effect: string;
}

export interface NormalizedSuperTandemData extends Record<string, unknown> {
  requirement?: string | null;
  levels?: NormalizedSuperTandemLevel[];
  criteria?: NormalizedSuperSpecialCriteria | null;
}

export interface CharacterAssets {
  exactLocal: string | null;
  thumbnailLocal?: string | null;
  thumbnailGlobal: string | null;
  thumbnailJapan: string | null;
}

export interface CharacterRecord {
  id: number;
  name: string;
  searchText?: string;
  isIncomplete: boolean;
  type: string;
  classes: string[];
  primaryClass: string;
  secondaryClass: string | null;
  stars: number;
  starsLabel?: string;
  cost: number;
  combo: number;
  captainHpBoost: number;
  captainAtkBoost: number;
  captainAverageBoost: number;
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
  characterTags?: string[];
  builderAbilities: NormalizedBuilderAbility[];
  sailorAbilities: string[];
  sailorNotes: string | null;
  potentialAbilities: Array<{ Name?: string; description?: string[] }>;
  supportData: CharacterSupportEntry[];
  swapData: Record<string, unknown> | null;
  vsSpecial: Record<string, unknown> | null;
  exSuperData?: Record<string, unknown> | null;
  superType: Record<string, unknown> | null;
  superTandemData?: NormalizedSuperTandemData | null;
  finalTapData?: Record<string, unknown> | null;
  rushSugoSpecialData?: Record<string, unknown> | null;
  superClass: Record<string, unknown> | null;
  switchEffectData?: Record<string, unknown> | null;
  captainShiftData?: Record<string, unknown> | null;
  rumbleData: Record<string, unknown> | null;
}

export interface CharacterListItem extends CharacterRecord {
  imageUrl: string;
}

export interface CharacterDetailRecord extends CharacterListItem {
  detail: CharacterDetail;
  detailImageUrl: string;
}

export interface LocalCharacterOverrideImages {
  thumbnailDataUrl: string | null;
  detailDataUrl: string | null;
}

export interface LocalCharacterOverride {
  characterId: number;
  name: string;
  isIncomplete: boolean;
  type: string;
  classes: string[];
  stars: number;
  cost: number;
  combo: number;
  minHp: number | null;
  minAtk: number | null;
  minRcv: number | null;
  maxHp: number | null;
  maxAtk: number | null;
  maxRcv: number | null;
  growth: number | null;
  detail: CharacterDetail;
  images: LocalCharacterOverrideImages;
  createdAt: string;
  updatedAt: string;
}

export interface ShipRecord {
  id: number;
  name: string;
  thumb: string | null;
  thumbUrl: string | null;
  description: string;
}

export interface CharacterBox {
  id: string;
  name: string;
  characterIds: number[];
  createdAt: string;
  updatedAt: string;
}

export type CrewForgeImageSlotRole = 'leader' | 'sub';

export interface CrewForgeImageSlotDefinition {
  key: string;
  label: string;
  role: CrewForgeImageSlotRole;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CrewForgeImagePreprocessConfig {
  fingerprintSize: number;
  contrast: number;
  brightness: number;
  grayscale: boolean;
  invert: boolean;
  blurRadius: number;
  matchThreshold: number;
  emptyVarianceThreshold: number;
}

export interface CrewForgeImageExample {
  id: string;
  name: string;
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrewForgeImageExemplar {
  id: string;
  slotKey: string;
  characterId: number;
  fingerprint: number[];
  cropDataUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrewForgeImageProfile {
  id: string;
  name: string;
  source: 'built-in' | 'user';
  imageWidth: number;
  imageHeight: number;
  slotDefinitions: CrewForgeImageSlotDefinition[];
  preprocess: CrewForgeImagePreprocessConfig;
  examples: CrewForgeImageExample[];
  exemplars: CrewForgeImageExemplar[];
  createdAt: string;
  updatedAt: string;
}

export interface CrewForgeImageRecognitionCandidate {
  characterId: number;
  confidence: number;
  source: 'exemplar' | 'catalog';
}

export type CrewForgeImageRecognitionSlotStatus =
  | 'matched'
  | 'ambiguous'
  | 'empty'
  | 'no_profile'
  | 'manual';

export interface CrewForgeImageRecognitionSlotResult {
  slotKey: string;
  label: string;
  role: CrewForgeImageSlotRole;
  characterId: number | null;
  confidence: number;
  status: CrewForgeImageRecognitionSlotStatus;
  cropDataUrl: string | null;
  candidates: CrewForgeImageRecognitionCandidate[];
  manuallyEdited: boolean;
}

export interface CrewForgeImageRecognitionResult {
  profileId: string | null;
  imageWidth: number;
  imageHeight: number;
  slots: CrewForgeImageRecognitionSlotResult[];
  reason: 'matched' | 'no_profile' | 'dimension_mismatch';
}

export const CREW_FORGE_IMAGE_SLOT_BLUEPRINTS: ReadonlyArray<
  Pick<CrewForgeImageSlotDefinition, 'key' | 'label' | 'role'>
> = [
  { key: 'leader-1', label: 'Leader 1', role: 'leader' },
  { key: 'leader-2', label: 'Leader 2', role: 'leader' },
  { key: 'leader-3', label: 'Leader 3', role: 'leader' },
  { key: 'leader-4', label: 'Leader 4', role: 'leader' },
  { key: 'sub-1', label: 'Sub 1', role: 'sub' },
  { key: 'sub-2', label: 'Sub 2', role: 'sub' },
  { key: 'sub-3', label: 'Sub 3', role: 'sub' },
  { key: 'sub-4', label: 'Sub 4', role: 'sub' },
  { key: 'sub-5', label: 'Sub 5', role: 'sub' },
  { key: 'sub-6', label: 'Sub 6', role: 'sub' },
  { key: 'sub-7', label: 'Sub 7', role: 'sub' },
  { key: 'sub-8', label: 'Sub 8', role: 'sub' },
] as const;

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
  rawEnemyText: string;
  imageDataUrl: string | null;
  selectedTypes: string[];
  selectedClasses: string[];
  selectedCharacterTags?: string[];
  selectedCharacterNames?: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
  requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSelectedCharacterTagsInTeam?: boolean;
  requireAllSelectedCharacterNamesInTeam?: boolean;
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

export type CharacterSortMode =
  | 'catalog'
  | 'newest'
  | 'powerFirst'
  | 'captainHpBoost'
  | 'captainAtkBoost'
  | 'captainAverageBoost'
  | 'nameAsc'
  | 'nameDesc'
  | 'idDesc'
  | 'idAsc';

export type CharacterIdOrder = 'newest' | 'oldest';

export interface CharacterSearchQuery {
  searchTerm: string;
  typeFilter: string;
  classFilter: string;
  allowedCharacterIds?: number[];
  excludedCharacterIds?: number[];
  maxCost?: number | null;
  sortMode?: CharacterSortMode;
  idOrder?: CharacterIdOrder;
  limit: number;
  offset: number;
}

export interface DetailedCharacterSearchQuery {
  searchTerm: string;
  selectedTypes: string[];
  selectedTypesMatchMode?: 'all' | 'any';
  selectedClasses: string[];
  selectedClassesMatchMode?: 'all' | 'any';
  allowedCharacterIds?: number[];
  excludedCharacterIds?: number[];
  costRange?: {
    min?: number | null;
    max?: number | null;
  } | null;
  sortMode?: CharacterSortMode;
  idOrder?: CharacterIdOrder;
  limit: number;
  offset: number;
}
