export type AutoBuildAbilitySource = 'specialText' | 'captainAbility' | 'sailorAbilities';
export type AutoBuildAbilityCategory = 'special' | 'crewmate' | 'legacy';
export type AutoBuildAbilityCoverageMode = 'explicit' | 'selectedDebuff';
export type AutoBuildEnemyMechanicCategory =
  | 'enemyDefense'
  | 'crewDebuff'
  | 'orbControl'
  | 'interrupt'
  | 'conditional';
export type AutoBuildEnemyMechanicTriggerTag =
  | 'onSpecial'
  | 'onAtkBoost'
  | 'onOrbBoost'
  | 'onDelay'
  | 'onOrbChange';
export type AutoBuildEnemyMechanicResponseTag =
  | 'removeBuffs'
  | 'applyDebuffs'
  | 'heal'
  | 'shield';
export type AutoBuildEnemyMechanicConditionTag =
  | 'hpThreshold'
  | 'turnCounter'
  | 'revive';

export interface NormalizedBuilderAbility {
  key: string;
  label: string;
  minTurns: number | null;
  isCompleteRemoval: boolean;
  slotTokens: string[];
  source: AutoBuildAbilitySource;
  coverageMode?: AutoBuildAbilityCoverageMode;
}

export interface AutoBuildAbilityCatalogItem {
  key: string;
  label: string;
  category?: AutoBuildAbilityCategory;
  groupLabel?: string | null;
  groupOrder?: number | null;
  effectOrder?: number | null;
  supportsTurns: boolean;
  supportsSlotTokens: boolean;
  availableSlotTokens: string[];
  availableSources: AutoBuildAbilitySource[];
  availableCoverageModes?: AutoBuildAbilityCoverageMode[];
  matchCount: number;
  matchingCharacterIds?: number[];
  sampleCharacterIds: number[];
  sampleTexts: string[];
}

export interface AutoBuildAbilityCatalog {
  generatedAt: string;
  sourceVersion: string;
  abilityCount: number;
  abilities: AutoBuildAbilityCatalogItem[];
}

export interface AutoBuildAbilityRequirement {
  abilityKey: string;
  minTurns: number | null;
  slotTokens: string[];
  requiredCharacterCount: number;
}

export interface AutoBuildEnemyMechanicRequirement {
  mechanicKey: string;
  category: AutoBuildEnemyMechanicCategory;
  minTurns: number | null;
  requiredCharacterCount?: number;
  triggerTags: AutoBuildEnemyMechanicTriggerTag[];
  responseTags: AutoBuildEnemyMechanicResponseTag[];
  conditionTags: AutoBuildEnemyMechanicConditionTag[];
  derivedAbilityKey: string | null;
}

export interface AutoBuildEnemyMechanicCatalogItem {
  key: string;
  label: string;
  category: AutoBuildEnemyMechanicCategory;
  supportsTurns: boolean;
  availableTriggerTags: AutoBuildEnemyMechanicTriggerTag[];
  availableResponseTags: AutoBuildEnemyMechanicResponseTag[];
  availableConditionTags: AutoBuildEnemyMechanicConditionTag[];
  defaultTriggerTags: AutoBuildEnemyMechanicTriggerTag[];
  defaultResponseTags: AutoBuildEnemyMechanicResponseTag[];
  defaultConditionTags: AutoBuildEnemyMechanicConditionTag[];
  derivedAbilityKey: string | null;
  keywords: string[];
}
