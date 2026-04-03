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
  trendingDownOutline,
  warningOutline,
} from "ionicons/icons";

import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from "../models/auto-team-builder-ability.models";

export interface AbilityRequirementDraft {
  draftId: string;
  abilityKey: string;
  minTurns: number | null;
  slotTokens: string[];
  requiredCharacterCount: number | null;
}

export interface AbilityRequirementVisualMeta {
  icon: string;
  badge: string;
  tone: "gold" | "red" | "teal" | "blue" | "violet" | "green" | "orange" | "neutral";
  isFallback: boolean;
}

export interface AbilityRequirementSummaryFormatter {
  formatCharacters(count: number): string;
  formatTurns(count: number): string;
}

interface SerializeAbilityRequirementDraftOptions {
  dedupe?: boolean;
  forceSingleCharacterCount?: boolean;
  catalogMap?: Map<string, AutoBuildAbilityCatalogItem>;
}

const FALLBACK_ABILITY_VISUAL: AbilityRequirementVisualMeta = {
  icon: helpCircleOutline,
  badge: "UT",
  tone: "neutral",
  isFallback: true,
};

const ABILITY_VISUALS: Record<string, Omit<AbilityRequirementVisualMeta, "isFallback">> = {
  ignore_normal_attack_only: {
    icon: banOutline,
    badge: "NAO",
    tone: "violet",
  },
  remove_atk_down: {
    icon: trendingDownOutline,
    badge: "ATK",
    tone: "red",
  },
  remove_bind: {
    icon: linkOutline,
    badge: "BD",
    tone: "gold",
  },
  remove_blindness: {
    icon: eyeOffOutline,
    badge: "BL",
    tone: "blue",
  },
  remove_burn: {
    icon: flameOutline,
    badge: "BR",
    tone: "red",
  },
  remove_chain_coefficient_reduction: {
    icon: gitNetworkOutline,
    badge: "CH",
    tone: "teal",
  },
  remove_damage_reduction: {
    icon: shieldOutline,
    badge: "DR",
    tone: "blue",
  },
  remove_despair: {
    icon: sadOutline,
    badge: "DS",
    tone: "violet",
  },
  remove_increase_damage_taken: {
    icon: warningOutline,
    badge: "DT",
    tone: "orange",
  },
  remove_no_healing: {
    icon: medkitOutline,
    badge: "NH",
    tone: "teal",
  },
  remove_pain: {
    icon: pulseOutline,
    badge: "PN",
    tone: "red",
  },
  remove_paralysis: {
    icon: flashOutline,
    badge: "PR",
    tone: "gold",
  },
  remove_poison: {
    icon: flaskOutline,
    badge: "PS",
    tone: "green",
  },
  remove_resilience: {
    icon: shieldOutline,
    badge: "RS",
    tone: "green",
  },
  remove_sailor_despair: {
    icon: sadOutline,
    badge: "SD",
    tone: "violet",
  },
  remove_ship_bind: {
    icon: boatOutline,
    badge: "SB",
    tone: "teal",
  },
  remove_slot_barrier: {
    icon: gridOutline,
    badge: "SL",
    tone: "blue",
  },
  remove_slot_bind: {
    icon: lockOpenOutline,
    badge: "SBD",
    tone: "gold",
  },
  remove_special_bind: {
    icon: sparklesOutline,
    badge: "SP",
    tone: "orange",
  },
  remove_threshold_damage_reduction: {
    icon: removeCircleOutline,
    badge: "TH",
    tone: "blue",
  },
};

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

export function createAbilityRequirementDraft(
  item?: AutoBuildAbilityCatalogItem | null,
  requirement?: Partial<AutoBuildAbilityRequirement>,
): AbilityRequirementDraft {
  return {
    draftId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    abilityKey: requirement?.abilityKey?.trim() ?? item?.key ?? "",
    minTurns: item?.supportsTurns
      ? resolvePositiveInteger(requirement?.minTurns) ?? 1
      : resolvePositiveInteger(requirement?.minTurns),
    slotTokens: sanitizeSlotTokens(requirement?.slotTokens),
    requiredCharacterCount: resolvePositiveInteger(requirement?.requiredCharacterCount) ?? 1,
  };
}

export function cloneAbilityRequirementDraft(
  draft: AbilityRequirementDraft,
): AbilityRequirementDraft {
  return {
    draftId: draft.draftId,
    abilityKey: draft.abilityKey,
    minTurns: draft.minTurns,
    slotTokens: [...draft.slotTokens],
    requiredCharacterCount: draft.requiredCharacterCount,
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
    minTurns: catalogItem?.supportsTurns ? resolvePositiveInteger(draft.minTurns) ?? 1 : null,
    slotTokens: catalogItem?.supportsSlotTokens
      ? sanitizeSlotTokens(draft.slotTokens).filter((token) =>
          catalogItem.availableSlotTokens.includes(token),
        )
      : [],
  };
}

export function resolvePositiveInteger(
  value: number | string | null | undefined,
): number | null {
  const normalizedValue =
    typeof value === "number" ? `${value}` : typeof value === "string" ? value.trim() : "";

  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsed = Number(normalizedValue);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
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
        ? resolvePositiveInteger(draft.minTurns)
        : null
      : resolvePositiveInteger(draft.minTurns);
    const slotTokens = catalogItem?.supportsSlotTokens === false
      ? []
      : sanitizeSlotTokens(draft.slotTokens).filter((token) =>
          catalogItem?.availableSlotTokens?.length
            ? catalogItem.availableSlotTokens.includes(token)
            : true,
        );
    const requiredCharacterCount = forceSingleCharacterCount
      ? 1
      : resolvePositiveInteger(draft.requiredCharacterCount) ?? 1;
    const nextRequirement: AutoBuildAbilityRequirement = {
      abilityKey,
      minTurns,
      slotTokens,
      requiredCharacterCount,
    };

    if (!dedupe) {
      serializedRequirements.push(nextRequirement);
      continue;
    }

    const identity = `${abilityKey}|${minTurns ?? "none"}|${slotTokens.join(",")}`;
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

  if (requirement.requiredCharacterCount > 1) {
    suffixes.push(formatter.formatCharacters(requirement.requiredCharacterCount));
  }

  if (requirement.minTurns !== null) {
    suffixes.push(formatter.formatTurns(requirement.minTurns));
  }

  if (requirement.slotTokens.length > 0) {
    suffixes.push(requirement.slotTokens.join(" / "));
  }

  const label = resolveLabel(requirement.abilityKey);

  return suffixes.length > 0 ? `${label} (${suffixes.join(" • ")})` : label;
}

function sanitizeSlotTokens(slotTokens: string[] | null | undefined): string[] {
  return [...new Set((slotTokens ?? []).map((token) => token.trim().toUpperCase()))].filter(
    (token) => token.length > 0,
  );
}
