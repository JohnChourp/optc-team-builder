import {
  banOutline,
  boatOutline,
  eyeOffOutline,
  flameOutline,
  flaskOutline,
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
  trendingUpOutline,
  trendingDownOutline,
  warningOutline,
} from 'ionicons/icons';

import {
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilityRequirementSourceScope,
  type AutoBuildAbilitySlotScope,
} from '../models/auto-team-builder-ability.models';

export interface AbilityRequirementDraft {
  draftId: string;
  abilityKey: string;
  minTurns: number | null;
  slotTokens: string[];
  requiredCharacterCount: number | null;
  slotScope?: AutoBuildAbilitySlotScope;
  sourceScope?: AutoBuildAbilityRequirementSourceScope;
}

export interface AbilityRequirementVisualMeta {
  icon: string;
  badge: string;
  tone: 'gold' | 'red' | 'teal' | 'blue' | 'violet' | 'green' | 'orange' | 'neutral';
  isFallback: boolean;
}

export interface AbilityRequirementSummaryFormatter {
  formatCharacters(count: number): string;
  formatTurns(count: number): string;
  formatSlotScope?(scope: AutoBuildAbilitySlotScope): string;
  formatSourceScope?(scope: AutoBuildAbilityRequirementSourceScope): string;
}

export interface AbilityRequirementMiniBadge {
  abilityKey: string;
  label: string;
  badge: string;
  tone: AbilityRequirementVisualMeta['tone'];
}

interface SerializeAbilityRequirementDraftOptions {
  dedupe?: boolean;
  forceSingleCharacterCount?: boolean;
  catalogMap?: Map<string, AutoBuildAbilityCatalogItem>;
}

const FALLBACK_ABILITY_VISUAL: AbilityRequirementVisualMeta = {
  icon: helpCircleOutline,
  badge: 'UT',
  tone: 'neutral',
  isFallback: true,
};

const ABILITY_VISUALS: Record<string, Omit<AbilityRequirementVisualMeta, 'isFallback'>> = {
  deal_fixed_damage: {
    icon: pulseOutline,
    badge: 'FIX',
    tone: 'orange',
  },
  extra_drop_any: {
    icon: sparklesOutline,
    badge: 'DROP',
    tone: 'green',
  },
  extra_drop_guaranteed: {
    icon: sparklesOutline,
    badge: 'GDRP',
    tone: 'gold',
  },
  inflict_poison: {
    icon: flaskOutline,
    badge: 'POI',
    tone: 'green',
  },
  special_damage: {
    icon: pulseOutline,
    badge: 'DMG',
    tone: 'orange',
  },
  ignore_normal_attack_only: {
    icon: banOutline,
    badge: 'NAO',
    tone: 'violet',
  },
  remove_atk_down: {
    icon: trendingDownOutline,
    badge: 'ATK',
    tone: 'red',
  },
  remove_bind: {
    icon: linkOutline,
    badge: 'BD',
    tone: 'gold',
  },
  remove_blindness: {
    icon: eyeOffOutline,
    badge: 'BL',
    tone: 'blue',
  },
  remove_burn: {
    icon: flameOutline,
    badge: 'BR',
    tone: 'red',
  },
  remove_chain_coefficient_reduction: {
    icon: gitNetworkOutline,
    badge: 'CH',
    tone: 'teal',
  },
  remove_chain_multiplier_limit: {
    icon: gitNetworkOutline,
    badge: 'CL',
    tone: 'teal',
  },
  remove_damage_reduction: {
    icon: shieldOutline,
    badge: 'DR',
    tone: 'blue',
  },
  remove_despair: {
    icon: sadOutline,
    badge: 'DS',
    tone: 'violet',
  },
  remove_increase_damage_taken: {
    icon: warningOutline,
    badge: 'DT',
    tone: 'orange',
  },
  remove_no_healing: {
    icon: medkitOutline,
    badge: 'NH',
    tone: 'teal',
  },
  remove_enemy_atk_up: {
    icon: trendingUpOutline,
    badge: 'ATK',
    tone: 'red',
  },
  remove_enemy_barrier: {
    icon: gridOutline,
    badge: 'BAR',
    tone: 'blue',
  },
  remove_enemy_damage_nullification: {
    icon: banOutline,
    badge: 'DN',
    tone: 'violet',
  },
  remove_enemy_end_of_turn_damage_percent_cut: {
    icon: warningOutline,
    badge: 'EOT',
    tone: 'orange',
  },
  remove_enemy_end_of_turn_heal: {
    icon: medkitOutline,
    badge: 'HEAL',
    tone: 'green',
  },
  remove_enemy_enrage: {
    icon: flameOutline,
    badge: 'ENG',
    tone: 'red',
  },
  remove_enemy_increased_defense: {
    icon: shieldOutline,
    badge: 'DEF',
    tone: 'teal',
  },
  remove_enemy_orb_based_damage_reduction: {
    icon: gridOutline,
    badge: 'ORB',
    tone: 'teal',
  },
  remove_pain: {
    icon: pulseOutline,
    badge: 'PN',
    tone: 'red',
  },
  remove_paralysis: {
    icon: flashOutline,
    badge: 'PR',
    tone: 'gold',
  },
  remove_poison: {
    icon: flaskOutline,
    badge: 'PS',
    tone: 'green',
  },
  remove_resilience: {
    icon: shieldOutline,
    badge: 'RS',
    tone: 'green',
  },
  remove_sailor_despair: {
    icon: sadOutline,
    badge: 'SD',
    tone: 'violet',
  },
  remove_ship_bind: {
    icon: boatOutline,
    badge: 'SB',
    tone: 'teal',
  },
  remove_slot_barrier: {
    icon: gridOutline,
    badge: 'SL',
    tone: 'blue',
  },
  remove_slot_bind: {
    icon: lockOpenOutline,
    badge: 'SBD',
    tone: 'gold',
  },
  remove_special_bind: {
    icon: sparklesOutline,
    badge: 'SP',
    tone: 'orange',
  },
  remove_stun: {
    icon: flashOutline,
    badge: 'ST',
    tone: 'violet',
  },
  remove_threshold_damage_reduction: {
    icon: removeCircleOutline,
    badge: 'TH',
    tone: 'blue',
  },
  remove_healing_reduction: {
    icon: medkitOutline,
    badge: 'HR',
    tone: 'teal',
  },
  remove_defense_up: {
    icon: shieldOutline,
    badge: 'DEF',
    tone: 'teal',
  },
};

const PAIN_SELECTABLE_DEBUFF_KEYS = [
  { abilityKey: 'remove_enemy_atk_up', label: 'ATK Up' },
  { abilityKey: 'remove_enemy_barrier', label: 'Barrier' },
  { abilityKey: 'remove_enemy_damage_nullification', label: 'Damage Nullification' },
  {
    abilityKey: 'remove_enemy_end_of_turn_damage_percent_cut',
    label: 'End of Turn Damage/Percent Cut',
  },
  { abilityKey: 'remove_enemy_end_of_turn_heal', label: 'End of Turn Heal' },
  { abilityKey: 'remove_enemy_enrage', label: 'Enrage' },
  { abilityKey: 'remove_enemy_increased_defense', label: 'Increased Defense' },
  { abilityKey: 'remove_enemy_orb_based_damage_reduction', label: 'Orb-Based Damage Reduction' },
  { abilityKey: 'remove_damage_reduction', label: 'Percent Damage Reduction' },
  { abilityKey: 'remove_resilience', label: 'Resilience' },
  { abilityKey: 'remove_threshold_damage_reduction', label: 'Threshold Damage Reduction' },
] as const;

export function resolveAbilityRequirementVisual(abilityKey: string): AbilityRequirementVisualMeta {
  const resolved = ABILITY_VISUALS[abilityKey];

  if (!resolved) {
    return FALLBACK_ABILITY_VISUAL;
  }

  return {
    ...resolved,
    isFallback: false,
  };
}

export function resolveAbilityRequirementPainSelectableDebuffBadges(
  abilityKey: string,
): AbilityRequirementMiniBadge[] {
  if (abilityKey !== 'remove_pain') {
    return [];
  }

  return PAIN_SELECTABLE_DEBUFF_KEYS.map(({ abilityKey: painAbilityKey, label }) => {
    const visual = resolveAbilityRequirementVisual(painAbilityKey);

    return {
      abilityKey: painAbilityKey,
      label,
      badge: visual.badge,
      tone: visual.tone,
    };
  });
}

export function createAbilityRequirementDraft(
  item?: AutoBuildAbilityCatalogItem | null,
  requirement?: Partial<AutoBuildAbilityRequirement>,
): AbilityRequirementDraft {
  const rawTurns = requirement?.minTurns;

  return {
    draftId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    abilityKey: requirement?.abilityKey?.trim() ?? item?.key ?? '',
    minTurns: item?.supportsTurns
      ? rawTurns === undefined || rawTurns === null
        ? 1
        : resolveNonNegativeInteger(rawTurns)
      : normalizeAbilityRequirementTurns(rawTurns),
    slotTokens: sanitizeSlotTokens(requirement?.slotTokens),
    requiredCharacterCount: resolvePositiveInteger(requirement?.requiredCharacterCount) ?? 1,
    slotScope: normalizeAbilityRequirementSlotScope(requirement?.slotScope),
    ...(normalizeAbilityRequirementSourceScope(requirement?.sourceScope)
      ? { sourceScope: normalizeAbilityRequirementSourceScope(requirement?.sourceScope)! }
      : {}),
  };
}

function cloneAbilityRequirementDraft(
  draft: AbilityRequirementDraft,
): AbilityRequirementDraft {
  return {
    draftId: draft.draftId,
    abilityKey: draft.abilityKey,
    minTurns: draft.minTurns,
    slotTokens: [...draft.slotTokens],
    requiredCharacterCount: draft.requiredCharacterCount,
    slotScope: normalizeAbilityRequirementSlotScope(draft.slotScope),
    ...(normalizeAbilityRequirementSourceScope(draft.sourceScope)
      ? { sourceScope: normalizeAbilityRequirementSourceScope(draft.sourceScope)! }
      : {}),
  };
}

export function cloneAbilityRequirementDrafts(
  drafts: AbilityRequirementDraft[],
): AbilityRequirementDraft[] {
  return drafts.map((draft) => cloneAbilityRequirementDraft(draft));
}

export function createAbilityRequirementDrafts(
  requirements: AutoBuildAbilityRequirement[],
): AbilityRequirementDraft[] {
  return requirements.map((requirement) => createAbilityRequirementDraft(undefined, requirement));
}

export function applyCatalogAbilityToDraft(
  draft: AbilityRequirementDraft,
  abilityKey: string,
  catalogMap: Map<string, AutoBuildAbilityCatalogItem>,
): AbilityRequirementDraft {
  const catalogItem = catalogMap.get(abilityKey);

  return {
    ...draft,
    abilityKey,
    minTurns: catalogItem?.supportsTurns
      ? draft.minTurns === null
        ? 1
        : (resolveNonNegativeInteger(draft.minTurns) ?? 1)
      : null,
    slotTokens: catalogItem?.supportsSlotTokens
      ? sanitizeSlotTokens(draft.slotTokens).filter((token) =>
          catalogItem.availableSlotTokens.includes(token),
        )
      : [],
  };
}

export function resolvePositiveInteger(value: number | string | null | undefined): number | null {
  const normalizedValue =
    typeof value === 'number' ? `${value}` : typeof value === 'string' ? value.trim() : '';

  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsed = Number(normalizedValue);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export function resolveNonNegativeInteger(
  value: number | string | null | undefined,
): number | null {
  const normalizedValue =
    typeof value === 'number' ? `${value}` : typeof value === 'string' ? value.trim() : '';

  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsed = Number(normalizedValue);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

export function normalizeAbilityRequirementTurns(
  value: number | string | null | undefined,
): number | null {
  const normalizedValue = resolveNonNegativeInteger(value);

  if (normalizedValue === null || normalizedValue === 0) {
    return null;
  }

  return normalizedValue;
}

export function serializeAbilityRequirementDrafts(
  drafts: AbilityRequirementDraft[],
  options: SerializeAbilityRequirementDraftOptions = {},
): AutoBuildAbilityRequirement[] {
  const requirements = new Map<string, AutoBuildAbilityRequirement>();
  const serializedRequirements: AutoBuildAbilityRequirement[] = [];
  const dedupe = options.dedupe ?? false;
  const forceSingleCharacterCount = options.forceSingleCharacterCount ?? false;

  for (const draft of drafts) {
    const abilityKey = draft.abilityKey.trim();

    if (!abilityKey.length) {
      continue;
    }

    const catalogItem = options.catalogMap?.get(abilityKey);
    const minTurns = catalogItem
      ? catalogItem.supportsTurns
        ? normalizeAbilityRequirementTurns(draft.minTurns)
        : null
      : normalizeAbilityRequirementTurns(draft.minTurns);
    const slotTokens =
      catalogItem?.supportsSlotTokens === false
        ? []
        : sanitizeSlotTokens(draft.slotTokens).filter((token) =>
            catalogItem?.availableSlotTokens?.length
              ? catalogItem.availableSlotTokens.includes(token)
              : true,
          );
    const requiredCharacterCount = forceSingleCharacterCount
      ? 1
      : (resolvePositiveInteger(draft.requiredCharacterCount) ?? 1);
    const slotScope = normalizeAbilityRequirementSlotScope(draft.slotScope);
    const sourceScope = normalizeAbilityRequirementSourceScope(draft.sourceScope);
    const nextRequirement: AutoBuildAbilityRequirement = {
      abilityKey,
      minTurns,
      slotTokens,
      requiredCharacterCount,
      ...(slotScope !== 'any' ? { slotScope } : {}),
      ...(sourceScope ? { sourceScope } : {}),
    };

    if (!dedupe) {
      serializedRequirements.push(nextRequirement);
      continue;
    }

    const identity = `${abilityKey}|${minTurns ?? 'none'}|${slotTokens.join(',')}|${slotScope}|${sourceScope ?? 'any'}`;
    const existingRequirement = requirements.get(identity);

    if (existingRequirement) {
      existingRequirement.requiredCharacterCount = Math.max(
        existingRequirement.requiredCharacterCount,
        nextRequirement.requiredCharacterCount,
      );
      continue;
    }

    requirements.set(identity, nextRequirement);
  }

  return dedupe ? [...requirements.values()] : serializedRequirements;
}

export function formatAbilityRequirementSummary(
  requirement: AutoBuildAbilityRequirement,
  resolveLabel: (abilityKey: string) => string,
  formatter: AbilityRequirementSummaryFormatter,
): string {
  const suffixes: string[] = [];
  const normalizedTurns = normalizeAbilityRequirementTurns(requirement.minTurns);

  if (requirement.requiredCharacterCount > 1) {
    suffixes.push(formatter.formatCharacters(requirement.requiredCharacterCount));
  }

  if (normalizedTurns !== null) {
    suffixes.push(formatter.formatTurns(normalizedTurns));
  }

  const slotScope = normalizeAbilityRequirementSlotScope(requirement.slotScope);

  if (slotScope !== 'any') {
    suffixes.push(formatter.formatSlotScope?.(slotScope) ?? slotScope);
  }

  const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);

  if (sourceScope) {
    suffixes.push(formatter.formatSourceScope?.(sourceScope) ?? sourceScope);
  }

  if (requirement.slotTokens.length > 0) {
    suffixes.push(requirement.slotTokens.join(' / '));
  }

  const label = resolveLabel(requirement.abilityKey);

  return suffixes.length > 0 ? `${label} (${suffixes.join(' • ')})` : label;
}

function sanitizeSlotTokens(slotTokens: string[] | null | undefined): string[] {
  return [...new Set((slotTokens ?? []).map((token) => token.trim().toUpperCase()))].filter(
    (token) => token.length > 0,
  );
}
