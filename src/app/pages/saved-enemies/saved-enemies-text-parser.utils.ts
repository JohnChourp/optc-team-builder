import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  mergeAbilityRequirements,
  resolveEnemyMechanicCatalogItem,
} from '../../core/services/enemy-mechanic-draft.utils';

export type ParsedEnemyTextMatchKind = 'ability' | 'mechanic';
export type ParsedEnemyTextWarningKind = 'precisionLoss' | 'unmatched';

export interface ParsedEnemyTextWarning {
  kind: ParsedEnemyTextWarningKind;
  line: string;
  matchKind?: ParsedEnemyTextMatchKind;
  resolvedKey?: string;
}

export interface ParsedEnemyTextResult {
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  matchedAbilityCount: number;
  matchedMechanicCount: number;
  requiredAbilities: AutoBuildAbilityRequirement[];
  unmatchedLines: string[];
  warnings: ParsedEnemyTextWarning[];
}

interface ParseEnemyTextOptions {
  abilityCatalogItems: readonly AutoBuildAbilityCatalogItem[];
}

interface ParsedMechanicMatch {
  requirement: AutoBuildEnemyMechanicRequirement;
  warning: ParsedEnemyTextWarning | null;
}

const DIRECT_ABILITY_MATCHERS = [
  {
    abilityKey: 'ignore_normal_attack_only',
    matches: (line: string) =>
      /\bnon[- ]normal attacks?\b.*\bdeal 1 damage\b/i.test(line) ||
      /\bignoring normal attack only\b/i.test(line),
  },
  {
    abilityKey: 'deal_fixed_damage',
    matches: (line: string) =>
      /\bfixed(?: true)? damage\b/i.test(line) || /\bdeal(?:s)?\b.*\bfixed damage\b/i.test(line),
  },
  {
    abilityKey: 'inflict_poison',
    matches: (line: string) =>
      /\binflict(?:s)?\b.*\b(?:poison|strong poison|toxic|venom)\b/i.test(line) ||
      /\bpoison(?:s)?\b.*\benem(?:y|ies)\b/i.test(line) ||
      /^\s*(?:poison|strong poison|toxic|venom)\s*$/i.test(line),
  },
] as const;

const POSITION_DETAIL_PATTERN =
  /\b(?:top|bottom|middle)[ -]?row\b|\b(?:left|right)[ -]?column\b|\b(?:top|middle|bottom)[ -]?(?:left|center|right)\b/i;

const SLOT_DETAIL_PATTERN = /\[[^\]]+\]/i;
const EXTRA_DETAIL_PATTERNS = [
  /\b\d+%/i,
  /\bx\s*\d+/i,
  /\b\d+\s+damage\b/i,
  /\btake damage when\b/i,
  /\bperfect\b/i,
  /\bgreat\b/i,
  /\blocked\b/i,
  /\binstant defeat\b/i,
  /\bblow away\b/i,
] as const;

export function parseSavedEnemyText(
  rawValue: string,
  options: ParseEnemyTextOptions,
): ParsedEnemyTextResult {
  const abilityCatalogMap = new Map(
    options.abilityCatalogItems.map((item) => [item.key, item] as const),
  );
  const enemyMechanics: AutoBuildEnemyMechanicRequirement[] = [];
  const requiredAbilities: AutoBuildAbilityRequirement[] = [];
  const warnings: ParsedEnemyTextWarning[] = [];

  extractEnemyTextFragments(rawValue).forEach((line) => {
    const normalizedLine = normalizeEnemyTextLine(line);
    const parsedTurns = extractTurns(normalizedLine);
    const mechanicMatch = matchEnemyMechanic(normalizedLine, parsedTurns, line);

    if (mechanicMatch) {
      enemyMechanics.push(mechanicMatch.requirement);

      if (mechanicMatch.warning) {
        warnings.push(mechanicMatch.warning);
      }

      return;
    }

    const matchedDirectAbilities = DIRECT_ABILITY_MATCHERS.flatMap((matcher) => {
      if (!matcher.matches(normalizedLine) || !abilityCatalogMap.has(matcher.abilityKey)) {
        return [];
      }

      return [
        {
          abilityKey: matcher.abilityKey,
          minTurns: null,
          requiredCharacterCount: 1,
          slotTokens: [],
        } satisfies AutoBuildAbilityRequirement,
      ];
    });

    if (matchedDirectAbilities.length > 0) {
      requiredAbilities.push(...matchedDirectAbilities);
      return;
    }

    warnings.push({
      kind: 'unmatched',
      line,
    });
  });

  const mergedEnemyMechanics = mergeEnemyMechanics(enemyMechanics);
  const mergedRequiredAbilities = mergeAbilityRequirements(requiredAbilities);

  return {
    enemyMechanics: mergedEnemyMechanics,
    matchedAbilityCount: mergedRequiredAbilities.length,
    matchedMechanicCount: mergedEnemyMechanics.length,
    requiredAbilities: mergedRequiredAbilities,
    unmatchedLines: warnings
      .filter((warning) => warning.kind === 'unmatched')
      .map((warning) => warning.line),
    warnings,
  };
}

function extractEnemyTextFragments(rawValue: string): string[] {
  return rawValue
    .replace(/```/g, '\n')
    .replace(/"""/g, '\n')
    .replace(/[“”]/g, '"')
    .split(/[\n,]+/)
    .map((value) => cleanupDisplayLine(value))
    .filter((value) => value.length > 0);
}

function cleanupDisplayLine(value: string): string {
  return value
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .replace(/^[•*-]\s+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[;.,]+$/g, '')
    .trim();
}

function normalizeEnemyTextLine(value: string): string {
  return cleanupDisplayLine(value)
    .toLowerCase()
    .replace(/\bturn\(s\)\b/g, 'turns')
    .replace(/\btime\(s\)\b/g, 'times')
    .replace(/\bath\b/g, 'atk')
    .replace(/\battack\b/g, 'atk')
    .replace(/\bpercentage damage resistance\b/g, 'percent damage reduction')
    .replace(/\bnullify damage\b/g, 'damage nullification')
    .replace(/\bnullifies damage\b/g, 'damage nullification')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTurns(line: string): number | null {
  const match = line.match(/\b(\d+)\s+turns?\b/i);

  if (!match) {
    return null;
  }

  const parsedValue = Number(match[1]);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : null;
}

function matchEnemyMechanic(
  normalizedLine: string,
  parsedTurns: number | null,
  originalLine: string,
): ParsedMechanicMatch | null {
  const mechanicKey =
    matchOrbMechanic(normalizedLine) ??
    matchCrewDebuffMechanic(normalizedLine) ??
    matchEnemyDefenseMechanic(normalizedLine);

  if (!mechanicKey) {
    return null;
  }

  const catalogItem = resolveEnemyMechanicCatalogItem(mechanicKey);

  if (!catalogItem) {
    return null;
  }

  return {
    requirement: {
      mechanicKey: catalogItem.key,
      category: catalogItem.category,
      minTurns: catalogItem.supportsTurns ? parsedTurns : null,
      triggerTags: [...catalogItem.defaultTriggerTags],
      responseTags: [...catalogItem.defaultResponseTags],
      conditionTags: [...catalogItem.defaultConditionTags],
      derivedAbilityKey: catalogItem.derivedAbilityKey,
    },
    warning: hasPrecisionLoss(normalizedLine, mechanicKey)
      ? {
          kind: 'precisionLoss',
          line: originalLine,
          matchKind: 'mechanic',
          resolvedKey: mechanicKey,
        }
      : null,
  };
}

function matchOrbMechanic(line: string): string | null {
  if (/\b(?:slot|orb) bind\b/i.test(line)) {
    return 'orb_slot_bind';
  }

  if (/\bblock orbs?\b/i.test(line) || (line.includes('[block]') && line.includes('slot'))) {
    return 'orb_block';
  }

  if (/\bbomb orbs?\b/i.test(line) || (line.includes('[bomb]') && line.includes('slot'))) {
    return 'orb_bomb';
  }

  if (/\bnegative orbs?\b/i.test(line) || /\bbadly matching orbs?\b/i.test(line)) {
    return 'orb_negative';
  }

  return null;
}

function matchCrewDebuffMechanic(line: string): string | null {
  if (/\b(?:special bind|silence)\b/i.test(line)) {
    return 'crew_special_bind';
  }

  if (/\bparalysis\b/i.test(line)) {
    return 'crew_paralysis';
  }

  if (/\bchain multiplier limit\b/i.test(line) || /\bchain lock\b/i.test(line)) {
    return 'crew_chain_multiplier_limit';
  }

  if (/\bchain coefficient reduction\b/i.test(line)) {
    return 'crew_chain_coefficient_reduction';
  }

  if (/\batk(?:\s+\d+%?)?\s+down\b/i.test(line)) {
    return 'crew_atk_down';
  }

  if (/\bburn\b/i.test(line)) {
    return 'crew_burn';
  }

  if (/\bdespair\b/i.test(line)) {
    return 'crew_despair';
  }

  if (/\bbind\b/i.test(line) && !/\b(?:slot|orb|special) bind\b/i.test(line)) {
    return 'crew_bind';
  }

  if (/\bhealing reduction\b/i.test(line)) {
    return 'crew_healing_reduction';
  }

  if (/\bstun\b/i.test(line)) {
    return 'crew_stun';
  }

  return null;
}

function matchEnemyDefenseMechanic(line: string): string | null {
  if (/\bdamage nullification\b/i.test(line)) {
    return 'enemy_damage_nullification';
  }

  if (/\bthreshold damage reduction\b/i.test(line)) {
    return 'enemy_threshold_damage_reduction';
  }

  if (/\bpercent damage reduction\b/i.test(line)) {
    return 'enemy_percent_damage_reduction';
  }

  if (/^damage reduction$/i.test(line) || /\bdamage reduction\b/i.test(line)) {
    return 'enemy_damage_reduction';
  }

  if (/\b(?:increased defense|defense up)\b/i.test(line) || /\bdef\s*x\s*\d+\b/i.test(line)) {
    return 'enemy_increased_defense';
  }

  if (/\bbarrier\b/i.test(line) && !/\b(?:slot|orb) barrier\b/i.test(line)) {
    return 'enemy_barrier';
  }

  if (/\b(?:immune to|immunity)\b/i.test(line)) {
    return 'enemy_immunity';
  }

  if (/\bresilience\b/i.test(line)) {
    return 'enemy_resilience';
  }

  if (/\batk up\b/i.test(line)) {
    return 'enemy_atk_up';
  }

  if (/\benrage\b/i.test(line)) {
    return 'enemy_enrage';
  }

  if (/\bend of turn damage\b/i.test(line) || /\bpercent cut\b/i.test(line)) {
    return 'enemy_end_of_turn_damage_percent_cut';
  }

  if (/\bend of turn heal\b/i.test(line)) {
    return 'enemy_end_of_turn_heal';
  }

  if (/\borb[- ]based damage reduction\b/i.test(line)) {
    return 'enemy_orb_based_damage_reduction';
  }

  return null;
}

function hasPrecisionLoss(line: string, mechanicKey: string): boolean {
  if (POSITION_DETAIL_PATTERN.test(line) || SLOT_DETAIL_PATTERN.test(line)) {
    return true;
  }

  if (EXTRA_DETAIL_PATTERNS.some((pattern) => pattern.test(line))) {
    if (mechanicKey === 'orb_block' || mechanicKey === 'orb_bomb') {
      return true;
    }

    if (
      mechanicKey === 'crew_atk_down' ||
      mechanicKey === 'crew_burn' ||
      mechanicKey === 'enemy_immunity' ||
      mechanicKey === 'enemy_percent_damage_reduction' ||
      mechanicKey === 'enemy_increased_defense'
    ) {
      return true;
    }
  }

  if (
    mechanicKey === 'enemy_immunity' &&
    !/^(?:\d+\s+turns?\s+)?(?:debuff\s+)?immunity$/i.test(line)
  ) {
    return true;
  }

  return false;
}

function mergeEnemyMechanics(
  requirements: AutoBuildEnemyMechanicRequirement[],
): AutoBuildEnemyMechanicRequirement[] {
  const mergedRequirements = new Map<string, AutoBuildEnemyMechanicRequirement>();

  requirements.forEach((requirement) => {
    const mergeKey = [
      requirement.mechanicKey,
      requirement.category,
      requirement.triggerTags.join(','),
      requirement.responseTags.join(','),
      requirement.conditionTags.join(','),
      requirement.derivedAbilityKey ?? 'none',
    ].join('|');
    const existingRequirement = mergedRequirements.get(mergeKey);

    if (existingRequirement) {
      existingRequirement.minTurns = resolveMaxTurns(
        existingRequirement.minTurns,
        requirement.minTurns,
      );
      return;
    }

    mergedRequirements.set(mergeKey, {
      mechanicKey: requirement.mechanicKey,
      category: requirement.category,
      minTurns: requirement.minTurns,
      triggerTags: [...requirement.triggerTags],
      responseTags: [...requirement.responseTags],
      conditionTags: [...requirement.conditionTags],
      derivedAbilityKey: requirement.derivedAbilityKey,
    });
  });

  return [...mergedRequirements.values()];
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
