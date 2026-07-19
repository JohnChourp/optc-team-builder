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
export type AutoBuildAbilityEffectTargetScope = 'any' | 'crew' | 'captains' | 'self' | 'subs';
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
  minEffectValue?: number | null;
  effectTargetScope?: AutoBuildAbilityEffectTargetScope;
}

export interface AutoBuildAbilityEffectMatch {
  characterId: number;
  minEffectValue?: number | null;
  effectTargetScope?: AutoBuildAbilityEffectTargetScope;
  slotTokens: string[];
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
  /**
   * Team-role scopes real characters implement for this ability, so the picker
   * can offer exactly those and never a scope that would match nobody. Absent
   * when the ability carries no scope data at all (no scope control is shown).
   * Never contains 'any' — that is the "do not filter" choice, not a scope.
   */
  availableEffectTargetScopes?: Exclude<AutoBuildAbilityEffectTargetScope, 'any'>[];
  effectTargetScopeMatchingCharacterIds?: AutoBuildAbilityEffectTargetScopeMatchingCharacterIds[];
  matchCount: number;
  matchingCharacterIds?: number[];
  turnMatchingCharacterIds?: AutoBuildAbilityTurnMatchingCharacterIds[];
  /**
   * Characters that clear the effect COMPLETELY rather than for a turn count.
   * A complete removal satisfies ANY turn requirement, so these ids are unioned
   * into every turn-filtered result instead of being compared numerically.
   *
   * They also appear in the `minTurns: 99` bucket, but 99 cannot be used as the
   * discriminator: upstream writes literal "for 99+ turns" and "for 999 turns"
   * as its own way of saying "effectively permanent", so the sentinel collides
   * with genuine counts. Absent when the ability has no complete removals.
   */
  completeRemovalCharacterIds?: number[];
  captainAbilityMatchingCharacterIds?: number[];
  captainAbilityTurnMatchingCharacterIds?: AutoBuildAbilityTurnMatchingCharacterIds[];
  captainAbilityCompleteRemovalCharacterIds?: number[];
  captainAbilityEffectMatches?: AutoBuildAbilityEffectMatch[];
  sampleCharacterIds: number[];
  sampleTexts: string[];
}

interface AutoBuildAbilityTurnMatchingCharacterIds {
  minTurns: number;
  characterIds: number[];
}

/**
 * Per-scope match index. Turn buckets are nested INSIDE the scope rather than
 * intersected with the ability-wide ones: a character can cure at one turn count
 * on itself and a different one crew-wide, so intersecting the two flat lists
 * would match it for a (scope, turns) pair it does not actually implement.
 */
interface AutoBuildAbilityEffectTargetScopeMatchingCharacterIds {
  effectTargetScope: Exclude<AutoBuildAbilityEffectTargetScope, 'any'>;
  characterIds: number[];
  turnMatchingCharacterIds: AutoBuildAbilityTurnMatchingCharacterIds[];
  completeRemovalCharacterIds?: number[];
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
  minEffectValue?: number | null;
  effectTargetScope?: AutoBuildAbilityEffectTargetScope;
}

export interface AutoBuildRequiredCharacterGroup {
  id: string;
  abilities: AutoBuildAbilityRequirement[];
}

/**
 * Boolean combinator for tag filtering. Deliberately reuses the `'all' | 'any'`
 * vocabulary already used by `CharacterSearchQuery.selectedTypesMatchMode` rather
 * than `'AND' | 'OR'`, and deliberately does not collide with
 * `AutoBuildAbilityEffectTargetScope`, whose `'any'` means "unscoped".
 */
export type AbilityTagSetOperator = 'all' | 'any';

/** One user-authored bucket of ability tags plus the operator that joins them. */
export interface AbilityFilterTagSet {
  id: string;
  operator: AbilityTagSetOperator;
  requirements: AutoBuildAbilityRequirement[];
}

/** The full multi-set selection: sets, plus the operator joining the sets. */
export interface AbilityFilterTagSetSelection {
  sets: AbilityFilterTagSet[];
  operator: AbilityTagSetOperator;
}

/** Mirrors MAX_REQUIRED_CHARACTER_GROUPS in required-character-groups.utils.ts. */
export const MAX_ABILITY_FILTER_TAG_SETS = 6;

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

export function normalizeAbilityTagSetOperator(
  value: string | null | undefined,
): AbilityTagSetOperator {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  return normalizedValue === 'any' ? 'any' : 'all';
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

export function normalizeAbilityEffectTargetScope(
  value: string | null | undefined,
): AutoBuildAbilityEffectTargetScope {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  return normalizedValue === 'crew' ||
    normalizedValue === 'captains' ||
    normalizedValue === 'self' ||
    normalizedValue === 'subs'
    ? normalizedValue
    : 'any';
}

export function normalizeAbilityRequirementEffectValue(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const nextValue = Number(value);

  return Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : null;
}
