export type AutoBuildAbilitySource =
  | 'specialText'
  | 'superSpecialText'
  | 'captainAbility'
  | 'sailorAbilities'
  | 'potentialAbilities'
  | 'supportData'
  | 'superTandemData'
  | 'finalTapData'
  | 'rushSugoSpecialData';
export type AutoBuildAbilityCategory = 'special' | 'crewmate' | 'potential' | 'support' | 'legacy';
export type AutoBuildAbilityCoverageMode = 'explicit' | 'selectedDebuff';
export type AutoBuildAbilitySlotScope = 'any' | 'leader' | 'sub';
export type AutoBuildAbilityRequirementSourceScope = 'captainAbility';
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
export type AutoBuildEnemyMechanicResponseTag = 'removeBuffs' | 'applyDebuffs' | 'heal' | 'shield';
export type AutoBuildEnemyMechanicConditionTag = 'hpThreshold' | 'turnCounter' | 'revive';

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
  turnMatchingCharacterIds?: AutoBuildAbilityTurnMatchingCharacterIds[];
  sampleCharacterIds: number[];
  sampleTexts: string[];
}

interface AutoBuildAbilityTurnMatchingCharacterIds {
  minTurns: number;
  characterIds: number[];
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
  slotScope?: AutoBuildAbilitySlotScope;
  sourceScope?: AutoBuildAbilityRequirementSourceScope;
}

export interface AutoBuildRequiredCharacterGroup {
  id: string;
  abilities: AutoBuildAbilityRequirement[];
}

export interface AutoBuildBattleRequirement {
  id: string;
  title: string;
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  requiredCharacterGroups: AutoBuildRequiredCharacterGroup[];
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

export function normalizeAbilityRequirementSlotScope(
  value: string | null | undefined,
): AutoBuildAbilitySlotScope {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  return normalizedValue === 'leader' || normalizedValue === 'sub' ? normalizedValue : 'any';
}

export function normalizeAbilityRequirementSourceScope(
  value: string | null | undefined,
): AutoBuildAbilityRequirementSourceScope | null {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  return normalizedValue === 'captainAbility' ? normalizedValue : null;
}
