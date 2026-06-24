import {
  banOutline,
  flameOutline,
  flashOutline,
  gitNetworkOutline,
  gridOutline,
  helpCircleOutline,
  linkOutline,
  lockOpenOutline,
  medkitOutline,
  pulseOutline,
  removeCircleOutline,
  sadOutline,
  shieldOutline,
  sparklesOutline,
  timerOutline,
  trendingDownOutline,
  trendingUpOutline,
  warningOutline,
} from 'ionicons/icons';

import {
  normalizeAbilityEffectTargetScope,
  normalizeAbilityRequirementEffectValue,
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicCatalogItem,
  type AutoBuildEnemyMechanicCategory,
  type AutoBuildEnemyMechanicConditionTag,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildEnemyMechanicResponseTag,
  type AutoBuildEnemyMechanicTriggerTag,
} from '../models/auto-team-builder-ability.models';
import { resolvePositiveInteger } from './ability-requirement-draft.utils';

export interface EnemyMechanicDraft {
  draftId: string;
  mechanicKey: string;
  category: AutoBuildEnemyMechanicCategory;
  minTurns: number | null;
  requiredCharacterCount: number | null;
  triggerTags: AutoBuildEnemyMechanicTriggerTag[];
  responseTags: AutoBuildEnemyMechanicResponseTag[];
  conditionTags: AutoBuildEnemyMechanicConditionTag[];
  derivedAbilityKey: string | null;
}

export interface EnemyMechanicVisualMeta {
  icon: string;
  badge: string;
  tone: 'gold' | 'red' | 'teal' | 'blue' | 'violet' | 'green' | 'orange' | 'neutral';
  isFallback: boolean;
}

export interface EnemyMechanicSummaryFormatter {
  formatTurns(count: number): string;
  resolveTriggerTag(tag: AutoBuildEnemyMechanicTriggerTag): string;
  resolveResponseTag(tag: AutoBuildEnemyMechanicResponseTag): string;
  resolveConditionTag(tag: AutoBuildEnemyMechanicConditionTag): string;
}

const DEFAULT_TRIGGER_TAGS: AutoBuildEnemyMechanicTriggerTag[] = [];
const DEFAULT_RESPONSE_TAGS: AutoBuildEnemyMechanicResponseTag[] = [];
const DEFAULT_CONDITION_TAGS: AutoBuildEnemyMechanicConditionTag[] = [];

const ENEMY_INTERRUPT_RESPONSE_TAGS: AutoBuildEnemyMechanicResponseTag[] = [
  'removeBuffs',
  'applyDebuffs',
  'heal',
  'shield',
];

const ENEMY_MECHANIC_CATALOG: AutoBuildEnemyMechanicCatalogItem[] = [
  createEnemyMechanicCatalogItem({
    key: 'enemy_damage_reduction',
    label: 'Enemy Damage Reduction',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_damage_reduction',
    keywords: ['damage reduction', 'percent damage reduction'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_percent_damage_reduction',
    label: 'Percent Damage Reduction',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_damage_reduction',
    keywords: ['percent damage reduction'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_threshold_damage_reduction',
    label: 'Threshold Damage Reduction',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_threshold_damage_reduction',
    keywords: ['threshold damage reduction'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_barrier',
    label: 'Barrier',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_barrier',
    keywords: ['barrier'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_damage_nullification',
    label: 'Damage Nullification',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_damage_nullification',
    keywords: ['damage nullification'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_immunity',
    label: 'Immunity',
    category: 'enemyDefense',
    derivedAbilityKey: null,
    keywords: ['immunity', 'debuff immunity'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_resilience',
    label: 'Resilience',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_resilience',
    keywords: ['resilience'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_atk_up',
    label: 'ATK Up',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_atk_up',
    keywords: ['atk up', 'attack up'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_enrage',
    label: 'Enrage',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_enrage',
    keywords: ['enrage'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_increased_defense',
    label: 'Increased Defense',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_increased_defense',
    keywords: ['increased defense', 'defense up'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_end_of_turn_damage_percent_cut',
    label: 'End of Turn Damage/Percent Cut',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_end_of_turn_damage_percent_cut',
    keywords: ['end of turn damage', 'percent cut'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_end_of_turn_heal',
    label: 'End of Turn Heal',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_end_of_turn_heal',
    keywords: ['end of turn heal'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'enemy_orb_based_damage_reduction',
    label: 'Orb-Based Damage Reduction',
    category: 'enemyDefense',
    derivedAbilityKey: 'remove_enemy_orb_based_damage_reduction',
    keywords: ['orb-based damage reduction'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_bind',
    label: 'Bind',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_bind',
    keywords: ['bind'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_despair',
    label: 'Despair',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_despair',
    keywords: ['despair'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_paralysis',
    label: 'Paralysis',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_paralysis',
    keywords: ['paralysis'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_special_bind',
    label: 'Silence / Special Bind',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_special_bind',
    keywords: ['silence', 'special bind'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_chain_coefficient_reduction',
    label: 'Chain Coefficient Reduction',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_chain_coefficient_reduction',
    keywords: ['chain coefficient reduction'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_chain_multiplier_limit',
    label: 'Chain Multiplier Limit',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_chain_multiplier_limit',
    keywords: ['chain multiplier limit', 'chain lock'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_atk_down',
    label: 'ATK Down',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_atk_down',
    keywords: ['atk down', 'attack down'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_orb_boost_down',
    label: 'Orb Boost Down',
    category: 'crewDebuff',
    derivedAbilityKey: null,
    keywords: ['orb boost down', 'orb effects down'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_increase_damage_taken',
    label: 'Increased Damage Taken',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_increase_damage_taken',
    keywords: ['increase damage taken'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_burn',
    label: 'Burn',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_burn',
    keywords: ['burn'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_healing_reduction',
    label: 'Healing Reduction',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_healing_reduction',
    keywords: ['healing reduction'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'crew_stun',
    label: 'Stun',
    category: 'crewDebuff',
    derivedAbilityKey: 'remove_stun',
    keywords: ['stun'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'orb_block',
    label: 'Block Orbs',
    category: 'orbControl',
    supportsTurns: false,
    derivedAbilityKey: null,
    keywords: ['block orbs'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'orb_bomb',
    label: 'Bomb Orbs',
    category: 'orbControl',
    supportsTurns: false,
    derivedAbilityKey: null,
    keywords: ['bomb orbs'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'orb_negative',
    label: 'Negative Orbs',
    category: 'orbControl',
    supportsTurns: false,
    derivedAbilityKey: null,
    keywords: ['negative orbs', 'badly matching orbs'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'orb_shuffle',
    label: 'Orb Shuffle',
    category: 'orbControl',
    supportsTurns: false,
    derivedAbilityKey: null,
    keywords: ['orb shuffle', 'randomize orbs', 'change orbs'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'orb_slot_bind',
    label: 'Slot Bind',
    category: 'orbControl',
    derivedAbilityKey: 'remove_slot_bind',
    keywords: ['slot bind'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'interrupt_special',
    label: 'Interrupt on Special',
    category: 'interrupt',
    supportsTurns: false,
    availableTriggerTags: ['onSpecial'],
    defaultTriggerTags: ['onSpecial'],
    availableResponseTags: ENEMY_INTERRUPT_RESPONSE_TAGS,
    derivedAbilityKey: null,
    keywords: ['interrupt special'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'interrupt_atk_boost',
    label: 'Interrupt on ATK Boost',
    category: 'interrupt',
    supportsTurns: false,
    availableTriggerTags: ['onAtkBoost'],
    defaultTriggerTags: ['onAtkBoost'],
    availableResponseTags: ENEMY_INTERRUPT_RESPONSE_TAGS,
    derivedAbilityKey: null,
    keywords: ['interrupt atk boost'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'interrupt_orb_boost',
    label: 'Interrupt on Orb Boost',
    category: 'interrupt',
    supportsTurns: false,
    availableTriggerTags: ['onOrbBoost'],
    defaultTriggerTags: ['onOrbBoost'],
    availableResponseTags: ENEMY_INTERRUPT_RESPONSE_TAGS,
    derivedAbilityKey: null,
    keywords: ['interrupt orb boost'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'interrupt_delay',
    label: 'Interrupt on Delay',
    category: 'interrupt',
    supportsTurns: false,
    availableTriggerTags: ['onDelay'],
    defaultTriggerTags: ['onDelay'],
    availableResponseTags: ENEMY_INTERRUPT_RESPONSE_TAGS,
    derivedAbilityKey: null,
    keywords: ['interrupt delay'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'interrupt_orb_change',
    label: 'Interrupt on Orb Change',
    category: 'interrupt',
    supportsTurns: false,
    availableTriggerTags: ['onOrbChange'],
    defaultTriggerTags: ['onOrbChange'],
    availableResponseTags: ENEMY_INTERRUPT_RESPONSE_TAGS,
    derivedAbilityKey: null,
    keywords: ['interrupt orb change'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'condition_hp_threshold',
    label: 'HP Threshold Trigger',
    category: 'conditional',
    supportsTurns: false,
    availableConditionTags: ['hpThreshold'],
    defaultConditionTags: ['hpThreshold'],
    derivedAbilityKey: null,
    keywords: ['hp threshold', 'under 50%', 'under 20%'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'condition_turn_counter',
    label: 'Turn Counter Trigger',
    category: 'conditional',
    supportsTurns: false,
    availableConditionTags: ['turnCounter'],
    defaultConditionTags: ['turnCounter'],
    derivedAbilityKey: null,
    keywords: ['turn counter'],
  }),
  createEnemyMechanicCatalogItem({
    key: 'condition_revive',
    label: 'Revive Mechanic',
    category: 'conditional',
    supportsTurns: false,
    availableConditionTags: ['revive'],
    defaultConditionTags: ['revive'],
    derivedAbilityKey: null,
    keywords: ['revive', 'resurrect'],
  }),
];

const FALLBACK_ENEMY_MECHANIC_VISUAL: EnemyMechanicVisualMeta = {
  icon: helpCircleOutline,
  badge: 'ME',
  tone: 'neutral',
  isFallback: true,
};

const ENEMY_MECHANIC_VISUALS: Record<string, Omit<EnemyMechanicVisualMeta, 'isFallback'>> = {
  enemy_damage_reduction: { icon: shieldOutline, badge: 'DR', tone: 'blue' },
  enemy_percent_damage_reduction: { icon: shieldOutline, badge: 'PDR', tone: 'blue' },
  enemy_threshold_damage_reduction: { icon: removeCircleOutline, badge: 'TH', tone: 'blue' },
  enemy_barrier: { icon: gridOutline, badge: 'BAR', tone: 'blue' },
  enemy_damage_nullification: { icon: banOutline, badge: 'DN', tone: 'violet' },
  enemy_immunity: { icon: shieldOutline, badge: 'IMM', tone: 'violet' },
  enemy_resilience: { icon: pulseOutline, badge: 'RS', tone: 'green' },
  enemy_atk_up: { icon: trendingUpOutline, badge: 'ATK', tone: 'red' },
  enemy_enrage: { icon: flameOutline, badge: 'ENG', tone: 'red' },
  enemy_increased_defense: { icon: shieldOutline, badge: 'DEF', tone: 'teal' },
  enemy_end_of_turn_damage_percent_cut: { icon: warningOutline, badge: 'EOT', tone: 'orange' },
  enemy_end_of_turn_heal: { icon: medkitOutline, badge: 'HEAL', tone: 'green' },
  enemy_orb_based_damage_reduction: { icon: gridOutline, badge: 'ORB', tone: 'teal' },
  crew_bind: { icon: linkOutline, badge: 'BD', tone: 'gold' },
  crew_despair: { icon: sadOutline, badge: 'DS', tone: 'violet' },
  crew_paralysis: { icon: flashOutline, badge: 'PR', tone: 'gold' },
  crew_special_bind: { icon: sparklesOutline, badge: 'SP', tone: 'orange' },
  crew_chain_coefficient_reduction: { icon: gitNetworkOutline, badge: 'CH', tone: 'teal' },
  crew_chain_multiplier_limit: { icon: gitNetworkOutline, badge: 'CL', tone: 'teal' },
  crew_atk_down: { icon: trendingDownOutline, badge: 'ATK', tone: 'red' },
  crew_orb_boost_down: { icon: trendingDownOutline, badge: 'ORB', tone: 'orange' },
  crew_increase_damage_taken: { icon: warningOutline, badge: 'DT', tone: 'orange' },
  crew_burn: { icon: flameOutline, badge: 'BR', tone: 'red' },
  crew_healing_reduction: { icon: medkitOutline, badge: 'HR', tone: 'teal' },
  crew_stun: { icon: flashOutline, badge: 'ST', tone: 'violet' },
  orb_block: { icon: gridOutline, badge: 'BLK', tone: 'blue' },
  orb_bomb: { icon: warningOutline, badge: 'BMB', tone: 'orange' },
  orb_negative: { icon: removeCircleOutline, badge: 'NEG', tone: 'violet' },
  orb_shuffle: { icon: sparklesOutline, badge: 'SHF', tone: 'teal' },
  orb_slot_bind: { icon: lockOpenOutline, badge: 'SB', tone: 'gold' },
  interrupt_special: { icon: sparklesOutline, badge: 'INT', tone: 'orange' },
  interrupt_atk_boost: { icon: sparklesOutline, badge: 'INT', tone: 'orange' },
  interrupt_orb_boost: { icon: sparklesOutline, badge: 'INT', tone: 'orange' },
  interrupt_delay: { icon: sparklesOutline, badge: 'INT', tone: 'orange' },
  interrupt_orb_change: { icon: sparklesOutline, badge: 'INT', tone: 'orange' },
  condition_hp_threshold: { icon: pulseOutline, badge: 'HP', tone: 'red' },
  condition_turn_counter: { icon: timerOutline, badge: 'TURN', tone: 'gold' },
  condition_revive: { icon: medkitOutline, badge: 'REV', tone: 'green' },
};

function createEnemyMechanicCatalogItem(
  item: Partial<AutoBuildEnemyMechanicCatalogItem> &
    Pick<
      AutoBuildEnemyMechanicCatalogItem,
      'key' | 'label' | 'category' | 'derivedAbilityKey' | 'keywords'
    >,
): AutoBuildEnemyMechanicCatalogItem {
  return {
    supportsTurns: true,
    availableTriggerTags: DEFAULT_TRIGGER_TAGS,
    availableResponseTags: DEFAULT_RESPONSE_TAGS,
    availableConditionTags: DEFAULT_CONDITION_TAGS,
    defaultTriggerTags: DEFAULT_TRIGGER_TAGS,
    defaultResponseTags: DEFAULT_RESPONSE_TAGS,
    defaultConditionTags: DEFAULT_CONDITION_TAGS,
    ...item,
  };
}

function cloneEnemyMechanicCatalogItem(
  item: AutoBuildEnemyMechanicCatalogItem,
): AutoBuildEnemyMechanicCatalogItem {
  return {
    ...item,
    availableTriggerTags: [...item.availableTriggerTags],
    availableResponseTags: [...item.availableResponseTags],
    availableConditionTags: [...item.availableConditionTags],
    defaultTriggerTags: [...item.defaultTriggerTags],
    defaultResponseTags: [...item.defaultResponseTags],
    defaultConditionTags: [...item.defaultConditionTags],
    keywords: [...item.keywords],
  };
}

export function getEnemyMechanicCatalogItems(): AutoBuildEnemyMechanicCatalogItem[] {
  return ENEMY_MECHANIC_CATALOG.map((item) => cloneEnemyMechanicCatalogItem(item));
}

export function resolveEnemyMechanicCatalogItem(
  mechanicKey: string,
): AutoBuildEnemyMechanicCatalogItem | undefined {
  return ENEMY_MECHANIC_CATALOG.find((item) => item.key === mechanicKey.trim());
}

export function resolveEnemyMechanicVisual(mechanicKey: string): EnemyMechanicVisualMeta {
  const resolved = ENEMY_MECHANIC_VISUALS[mechanicKey];

  if (!resolved) {
    return FALLBACK_ENEMY_MECHANIC_VISUAL;
  }

  return {
    ...resolved,
    isFallback: false,
  };
}

function createEnemyMechanicDraft(
  item?: AutoBuildEnemyMechanicCatalogItem | null,
  requirement?: Partial<AutoBuildEnemyMechanicRequirement>,
): EnemyMechanicDraft {
  return {
    draftId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mechanicKey: requirement?.mechanicKey?.trim() ?? item?.key ?? '',
    category: requirement?.category ?? item?.category ?? 'enemyDefense',
    minTurns:
      item?.supportsTurns === false ? null : (resolvePositiveInteger(requirement?.minTurns) ?? 1),
    requiredCharacterCount: resolvePositiveInteger(requirement?.requiredCharacterCount),
    triggerTags: sanitizeTags(
      requirement?.triggerTags,
      item?.availableTriggerTags ?? DEFAULT_TRIGGER_TAGS,
      item?.defaultTriggerTags ?? DEFAULT_TRIGGER_TAGS,
    ),
    responseTags: sanitizeTags(
      requirement?.responseTags,
      item?.availableResponseTags ?? DEFAULT_RESPONSE_TAGS,
      item?.defaultResponseTags ?? DEFAULT_RESPONSE_TAGS,
    ),
    conditionTags: sanitizeTags(
      requirement?.conditionTags,
      item?.availableConditionTags ?? DEFAULT_CONDITION_TAGS,
      item?.defaultConditionTags ?? DEFAULT_CONDITION_TAGS,
    ),
    derivedAbilityKey: normalizeDerivedAbilityKey(
      requirement?.derivedAbilityKey ?? item?.derivedAbilityKey ?? null,
    ),
  };
}

export function createEnemyMechanicDrafts(
  requirements: AutoBuildEnemyMechanicRequirement[],
): EnemyMechanicDraft[] {
  return requirements.map((requirement) =>
    createEnemyMechanicDraft(resolveEnemyMechanicCatalogItem(requirement.mechanicKey), requirement),
  );
}

export function serializeEnemyMechanicDrafts(
  drafts: EnemyMechanicDraft[],
): AutoBuildEnemyMechanicRequirement[] {
  return normalizeEnemyMechanicRequirements(
    drafts.map((draft) => ({
      mechanicKey: draft.mechanicKey,
      category: draft.category,
      minTurns: draft.minTurns,
      requiredCharacterCount: resolvePositiveInteger(draft.requiredCharacterCount) ?? undefined,
      triggerTags: draft.triggerTags,
      responseTags: draft.responseTags,
      conditionTags: draft.conditionTags,
      derivedAbilityKey: draft.derivedAbilityKey,
    })),
  );
}

export function normalizeEnemyMechanicRequirements(
  requirements: readonly AutoBuildEnemyMechanicRequirement[] | undefined,
): AutoBuildEnemyMechanicRequirement[] {
  if (!Array.isArray(requirements)) {
    return [];
  }

  const normalizedRequirements = new Map<string, AutoBuildEnemyMechanicRequirement>();

  requirements.forEach((requirement) => {
    if (!requirement || typeof requirement !== 'object') {
      return;
    }

    const catalogItem = resolveEnemyMechanicCatalogItem(requirement.mechanicKey);
    const mechanicKey =
      typeof requirement.mechanicKey === 'string' ? requirement.mechanicKey.trim() : '';

    if (!mechanicKey.length) {
      return;
    }

    const minTurns =
      catalogItem?.supportsTurns === false ? null : resolvePositiveInteger(requirement.minTurns);
    const requiredCharacterCount = resolvePositiveInteger(requirement.requiredCharacterCount) ?? 1;
    const triggerTags = sanitizeTags(
      requirement.triggerTags,
      catalogItem?.availableTriggerTags ?? DEFAULT_TRIGGER_TAGS,
      catalogItem?.defaultTriggerTags ?? DEFAULT_TRIGGER_TAGS,
    );
    const responseTags = sanitizeTags(
      requirement.responseTags,
      catalogItem?.availableResponseTags ?? DEFAULT_RESPONSE_TAGS,
      catalogItem?.defaultResponseTags ?? DEFAULT_RESPONSE_TAGS,
    );
    const conditionTags = sanitizeTags(
      requirement.conditionTags,
      catalogItem?.availableConditionTags ?? DEFAULT_CONDITION_TAGS,
      catalogItem?.defaultConditionTags ?? DEFAULT_CONDITION_TAGS,
    );
    const derivedAbilityKey = normalizeDerivedAbilityKey(
      requirement.derivedAbilityKey ?? catalogItem?.derivedAbilityKey ?? null,
    );
    const category = catalogItem?.category ?? requirement.category;

    if (!category) {
      return;
    }

    const identity = buildEnemyMechanicIdentity({
      mechanicKey,
      category,
      minTurns: null,
      requiredCharacterCount,
      triggerTags,
      responseTags,
      conditionTags,
      derivedAbilityKey,
    });

    const existing = normalizedRequirements.get(identity);

    if (existing) {
      existing.minTurns = resolveMaxTurns(existing.minTurns, minTurns);
      existing.requiredCharacterCount = Math.max(
        resolvePositiveInteger(existing.requiredCharacterCount) ?? 1,
        requiredCharacterCount,
      );
      return;
    }

    normalizedRequirements.set(identity, {
      mechanicKey,
      category,
      minTurns,
      ...(requiredCharacterCount > 1 ? { requiredCharacterCount } : {}),
      triggerTags,
      responseTags,
      conditionTags,
      derivedAbilityKey,
    });
  });

  return [...normalizedRequirements.values()];
}

export function deriveAbilityRequirementsFromEnemyMechanics(
  mechanics: AutoBuildEnemyMechanicRequirement[],
): AutoBuildAbilityRequirement[] {
  return mergeAbilityRequirements(
    normalizeEnemyMechanicRequirements(mechanics)
      .filter((mechanic) => mechanic.derivedAbilityKey !== null)
      .map((mechanic) => ({
        abilityKey: mechanic.derivedAbilityKey as string,
        minTurns: mechanic.minTurns,
        slotTokens: [],
        requiredCharacterCount: resolvePositiveInteger(mechanic.requiredCharacterCount) ?? 1,
      })),
  );
}

export function mergeAbilityRequirements(
  requirements: AutoBuildAbilityRequirement[],
): AutoBuildAbilityRequirement[] {
  const mergedRequirements = new Map<string, AutoBuildAbilityRequirement>();

  requirements.forEach((requirement) => {
    const abilityKey = requirement.abilityKey.trim();

    if (!abilityKey.length) {
      return;
    }

    const slotTokens = [
      ...new Set(requirement.slotTokens.map((token) => token.trim().toUpperCase())),
    ]
      .filter((token) => token.length > 0)
      .sort((left, right) => left.localeCompare(right));
    const slotScope = normalizeAbilityRequirementSlotScope(requirement.slotScope);
    const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);
    const minEffectValue = normalizeAbilityRequirementEffectValue(requirement.minEffectValue);
    const effectTargetScope = normalizeAbilityEffectTargetScope(requirement.effectTargetScope);
    const mergeKey = [
      abilityKey,
      slotTokens.join(','),
      slotScope,
      sourceScope ?? 'any',
      minEffectValue ?? 'none',
      effectTargetScope,
    ].join('|');
    const minTurns = resolvePositiveInteger(requirement.minTurns);
    const requiredCharacterCount = resolvePositiveInteger(requirement.requiredCharacterCount) ?? 1;
    const existing = mergedRequirements.get(mergeKey);

    if (existing) {
      existing.minTurns = resolveMaxTurns(existing.minTurns, minTurns);
      existing.requiredCharacterCount = Math.max(
        existing.requiredCharacterCount,
        requiredCharacterCount,
      );
      return;
    }

    mergedRequirements.set(mergeKey, {
      abilityKey,
      minTurns,
      slotTokens,
      requiredCharacterCount,
      ...(slotScope !== 'any' ? { slotScope } : {}),
      ...(sourceScope ? { sourceScope } : {}),
      ...(minEffectValue !== null ? { minEffectValue } : {}),
      ...(effectTargetScope !== 'any' ? { effectTargetScope } : {}),
    });
  });

  return [...mergedRequirements.values()];
}

export function splitManualAbilityRequirementsFromEnemyMechanics(
  effectiveRequirements: AutoBuildAbilityRequirement[],
  mechanics: AutoBuildEnemyMechanicRequirement[],
): AutoBuildAbilityRequirement[] {
  const derivedRequirements = deriveAbilityRequirementsFromEnemyMechanics(mechanics);
  const derivedRequirementMap = new Map(
    derivedRequirements.map(
      (requirement) => [buildAbilityIdentity(requirement), requirement] as const,
    ),
  );

  return effectiveRequirements
    .filter((requirement) => {
      const derivedRequirement = derivedRequirementMap.get(buildAbilityIdentity(requirement));

      if (!derivedRequirement) {
        return true;
      }

      return (
        (requirement.requiredCharacterCount ?? 1) > derivedRequirement.requiredCharacterCount ||
        resolvePositiveInteger(requirement.minTurns) !==
          resolvePositiveInteger(derivedRequirement.minTurns)
      );
    })
    .map((requirement) => {
      const slotScope = normalizeAbilityRequirementSlotScope(requirement.slotScope);
      const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);
      const minEffectValue = normalizeAbilityRequirementEffectValue(requirement.minEffectValue);
      const effectTargetScope = normalizeAbilityEffectTargetScope(requirement.effectTargetScope);

      return {
        abilityKey: requirement.abilityKey.trim(),
        minTurns: resolvePositiveInteger(requirement.minTurns),
        slotTokens: [
          ...new Set(requirement.slotTokens.map((token) => token.trim().toUpperCase())),
        ]
          .filter((token) => token.length > 0)
          .sort((left, right) => left.localeCompare(right)),
        requiredCharacterCount: resolvePositiveInteger(requirement.requiredCharacterCount) ?? 1,
        ...(slotScope !== 'any' ? { slotScope } : {}),
        ...(sourceScope ? { sourceScope } : {}),
        ...(minEffectValue !== null ? { minEffectValue } : {}),
        ...(effectTargetScope !== 'any' ? { effectTargetScope } : {}),
      };
    });
}

export function formatEnemyMechanicSummary(
  requirement: AutoBuildEnemyMechanicRequirement,
  resolveLabel: (mechanicKey: string) => string,
  formatter: EnemyMechanicSummaryFormatter,
): string {
  const suffixes: string[] = [];

  if (requirement.minTurns !== null) {
    suffixes.push(formatter.formatTurns(requirement.minTurns));
  }

  if (requirement.triggerTags.length) {
    suffixes.push(
      requirement.triggerTags.map((tag) => formatter.resolveTriggerTag(tag)).join(' / '),
    );
  }

  if (requirement.responseTags.length) {
    suffixes.push(
      requirement.responseTags.map((tag) => formatter.resolveResponseTag(tag)).join(' / '),
    );
  }

  if (requirement.conditionTags.length) {
    suffixes.push(
      requirement.conditionTags.map((tag) => formatter.resolveConditionTag(tag)).join(' / '),
    );
  }

  const label = resolveLabel(requirement.mechanicKey);

  return suffixes.length ? `${label} (${suffixes.join(' • ')})` : label;
}

function sanitizeTags<T extends string>(
  values: T[] | undefined,
  allowedValues: readonly T[],
  fallbackValues: readonly T[],
): T[] {
  const allowedValueSet = new Set(allowedValues);
  const nextValues = Array.isArray(values) ? values : fallbackValues;

  return [...new Set(nextValues.map((value) => value.trim() as T))]
    .filter((value) => value.length > 0)
    .filter((value) => allowedValueSet.has(value));
}

function normalizeDerivedAbilityKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function buildEnemyMechanicIdentity(requirement: AutoBuildEnemyMechanicRequirement): string {
  return [
    requirement.mechanicKey,
    requirement.category,
    requirement.triggerTags.join(','),
    requirement.responseTags.join(','),
    requirement.conditionTags.join(','),
    requirement.derivedAbilityKey ?? 'none',
  ].join('|');
}

function buildAbilityIdentity(requirement: AutoBuildAbilityRequirement): string {
  return [
    requirement.abilityKey.trim(),
    resolvePositiveInteger(requirement.minTurns) ?? 'none',
    [...new Set(requirement.slotTokens.map((token) => token.trim().toUpperCase()))]
      .filter((token) => token.length > 0)
      .sort((left, right) => left.localeCompare(right))
      .join(','),
    normalizeAbilityRequirementSlotScope(requirement.slotScope),
    normalizeAbilityRequirementSourceScope(requirement.sourceScope) ?? 'any',
    normalizeAbilityRequirementEffectValue(requirement.minEffectValue) ?? 'none',
    normalizeAbilityEffectTargetScope(requirement.effectTargetScope),
  ].join('|');
}

function resolveMaxTurns(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }

  if (right === null) {
    return left;
  }

  return Math.max(left, right);
}
