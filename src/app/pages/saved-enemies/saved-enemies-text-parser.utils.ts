import {
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  deriveAbilityRequirementsFromEnemyMechanics,
  mergeAbilityRequirements,
  normalizeEnemyMechanicRequirements,
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

export interface ParsedEnemyTextAbilityCandidate {
  abilityKey: string;
  category: AutoBuildAbilityCategory;
  sourceLine: string;
  minTurns: number | null;
  requiredCharacterCount: number;
  slotTokens: string[];
}

export interface ParsedEnemyTextResult {
  parsedAbilityCandidates: ParsedEnemyTextAbilityCandidate[];
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

interface ParsedAbilityCandidateSeed {
  abilityKey: string;
  category: AutoBuildAbilityCategory;
  sourceLine: string;
  minTurns: number | null;
  slotTokens: string[];
}

interface ParsedEnemyTextSection {
  id: string;
  lines: string[];
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

const SINGLE_CHARACTER_DEFAULT_ABILITY_KEYS = new Set(['ignore_normal_attack_only']);
const PARSED_ABILITY_FAMILY_EQUIVALENTS: Partial<
  Record<string, Partial<Record<AutoBuildAbilityCategory, string>>>
> = {
  deal_fixed_damage: {
    special: 'deal_fixed_damage',
  },
  ignore_normal_attack_only: {
    special: 'ignore_normal_attack_only',
  },
  inflict_poison: {
    special: 'inflict_poison',
    support: 'support_apply_status_effect_poison',
  },
  remove_bind: {
    special: 'remove_bind',
    support: 'support_status_effect_recovery_bind',
  },
  remove_despair: {
    special: 'remove_despair',
    support: 'support_status_effect_recovery_despair',
  },
  remove_atk_down: {
    special: 'remove_atk_down',
    support: 'support_status_effect_recovery_atk_down',
  },
  remove_burn: {
    special: 'remove_burn',
    crewmate: 'crewmate_recover_burn',
    support: 'support_status_effect_recovery_burn',
  },
  remove_enemy_damage_nullification: {
    special: 'remove_enemy_damage_nullification',
  },
  remove_paralysis: {
    special: 'remove_paralysis',
    crewmate: 'crewmate_recover_paralysis',
    support: 'support_status_effect_recovery_paralysis',
  },
  remove_special_bind: {
    special: 'remove_special_bind',
    crewmate: 'crewmate_recover_special_bind',
    support: 'support_status_effect_recovery_special_bind',
  },
  family_special_reverse: {
    crewmate: 'crewmate_recover_special_reverse',
  },
};

export function parseSavedEnemyText(
  rawValue: string,
  options: ParseEnemyTextOptions,
): ParsedEnemyTextResult {
  const abilityCatalogMap = new Map(
    options.abilityCatalogItems.map((item) => [item.key, item] as const),
  );
  const enemyMechanicSections = new Map<
    string,
    {
      requirement: Omit<AutoBuildEnemyMechanicRequirement, 'requiredCharacterCount'>;
      requiredCharacterCount: number;
    }
  >();
  const requiredAbilitySections = new Map<
    string,
    Omit<AutoBuildAbilityRequirement, 'requiredCharacterCount'> & { requiredCharacterCount: number }
  >();
  const parsedAbilityCandidateSections = new Map<string, ParsedEnemyTextAbilityCandidate>();
  const warnings: ParsedEnemyTextWarning[] = [];

  extractEnemyTextSections(rawValue).forEach((section) => {
    const sectionMechanics = new Map<
      string,
      Omit<AutoBuildEnemyMechanicRequirement, 'requiredCharacterCount'> & {
        requiredCharacterCount: number;
      }
    >();
    const sectionAbilities = new Map<
      string,
      Omit<AutoBuildAbilityRequirement, 'requiredCharacterCount'> & { requiredCharacterCount: number }
    >();
    const sectionParsedAbilityCandidates = new Map<string, ParsedEnemyTextAbilityCandidate>();

    section.lines.forEach((line) => {
      const normalizedLine = normalizeEnemyTextLine(line);

      // Ignore pure phase labels so warnings focus on real mechanics and unsupported effects.
      if (isIgnoredEnemyTextLine(normalizedLine)) {
        return;
      }

      const parsedTurns = extractTurns(normalizedLine);
      const mechanicMatch = matchEnemyMechanic(normalizedLine, parsedTurns, line);

      if (mechanicMatch) {
        const mergeKey = buildEnemyMechanicIdentity(mechanicMatch.requirement);
        const existingMechanic = sectionMechanics.get(mergeKey);

        if (existingMechanic) {
          existingMechanic.minTurns = resolveMaxTurns(
            existingMechanic.minTurns,
            mechanicMatch.requirement.minTurns,
          );
          existingMechanic.requiredCharacterCount += 1;
        } else {
          sectionMechanics.set(mergeKey, {
            mechanicKey: mechanicMatch.requirement.mechanicKey,
            category: mechanicMatch.requirement.category,
            minTurns: mechanicMatch.requirement.minTurns,
            triggerTags: [...mechanicMatch.requirement.triggerTags],
            responseTags: [...mechanicMatch.requirement.responseTags],
            conditionTags: [...mechanicMatch.requirement.conditionTags],
            derivedAbilityKey: mechanicMatch.requirement.derivedAbilityKey,
            requiredCharacterCount: 1,
          });
        }

        buildParsedAbilityCandidateSeeds(
          mechanicMatch.requirement.derivedAbilityKey,
          mechanicMatch.requirement.minTurns,
          line,
          abilityCatalogMap,
        ).forEach((candidate) =>
          mergeParsedAbilityCandidate(sectionParsedAbilityCandidates, candidate),
        );

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
            slotTokens: [],
          } satisfies Omit<AutoBuildAbilityRequirement, 'requiredCharacterCount'>,
        ];
      });

      if (matchedDirectAbilities.length > 0) {
        matchedDirectAbilities.forEach((requirement) => {
          const mergeKey = buildAbilityIdentity(requirement);
          const existingAbility = sectionAbilities.get(mergeKey);

          if (existingAbility) {
            existingAbility.minTurns = resolveMaxTurns(existingAbility.minTurns, requirement.minTurns);
            existingAbility.requiredCharacterCount += 1;
            return;
          }

          sectionAbilities.set(mergeKey, {
            abilityKey: requirement.abilityKey,
            minTurns: requirement.minTurns,
            slotTokens: [...requirement.slotTokens],
            requiredCharacterCount: 1,
          });
        });

        matchedDirectAbilities
          .flatMap((requirement) =>
            buildParsedAbilityCandidateSeeds(
              requirement.abilityKey,
              requirement.minTurns,
              line,
              abilityCatalogMap,
            ),
          )
          .forEach((candidate) => mergeParsedAbilityCandidate(sectionParsedAbilityCandidates, candidate));

        return;
      }

      const directCandidateOnlyMatch = matchDirectParsedAbilityCandidate(
        normalizedLine,
        parsedTurns,
        line,
        abilityCatalogMap,
      );

      if (directCandidateOnlyMatch.length > 0) {
        directCandidateOnlyMatch.forEach(({ candidate, warning }) => {
          mergeParsedAbilityCandidate(sectionParsedAbilityCandidates, candidate);

          if (warning) {
            warnings.push(warning);
          }
        });

        return;
      }

      warnings.push({
        kind: 'unmatched',
        line,
      });
    });

    sectionMechanics.forEach((requirement, identity) => {
      const existingMechanicSection = enemyMechanicSections.get(identity);

      if (existingMechanicSection) {
        existingMechanicSection.requirement.minTurns = resolveMaxTurns(
          existingMechanicSection.requirement.minTurns,
          requirement.minTurns,
        );
        existingMechanicSection.requiredCharacterCount += requirement.requiredCharacterCount;
        return;
      }

      enemyMechanicSections.set(identity, {
        requirement: {
          mechanicKey: requirement.mechanicKey,
          category: requirement.category,
          minTurns: requirement.minTurns,
          triggerTags: [...requirement.triggerTags],
          responseTags: [...requirement.responseTags],
          conditionTags: [...requirement.conditionTags],
          derivedAbilityKey: requirement.derivedAbilityKey,
        },
        requiredCharacterCount: requirement.requiredCharacterCount,
      });
    });

    sectionAbilities.forEach((requirement, identity) => {
      const existingAbilitySection = requiredAbilitySections.get(identity);

      if (existingAbilitySection) {
        existingAbilitySection.minTurns = resolveMaxTurns(
          existingAbilitySection.minTurns,
          requirement.minTurns,
        );
        existingAbilitySection.requiredCharacterCount += requirement.requiredCharacterCount;
        return;
      }

      requiredAbilitySections.set(identity, {
        abilityKey: requirement.abilityKey,
        minTurns: requirement.minTurns,
        slotTokens: [...requirement.slotTokens],
        requiredCharacterCount: requirement.requiredCharacterCount,
      });
    });

    sectionParsedAbilityCandidates.forEach((candidate, identity) => {
      const existingCandidate = parsedAbilityCandidateSections.get(identity);

      if (existingCandidate) {
        existingCandidate.minTurns = resolveMaxTurns(existingCandidate.minTurns, candidate.minTurns);
        existingCandidate.requiredCharacterCount += candidate.requiredCharacterCount;
        return;
      }

      parsedAbilityCandidateSections.set(identity, {
        abilityKey: candidate.abilityKey,
        category: candidate.category,
        sourceLine: candidate.sourceLine,
        minTurns: candidate.minTurns,
        requiredCharacterCount: candidate.requiredCharacterCount,
        slotTokens: [...candidate.slotTokens],
      });
    });
  });

  const mergedEnemyMechanics = normalizeEnemyMechanicRequirements(
    [...enemyMechanicSections.values()].map(({ requirement, requiredCharacterCount }) => ({
      ...requirement,
      ...(requiredCharacterCount > 1 ? { requiredCharacterCount } : {}),
    })),
  );
  const mergedRequiredAbilities = normalizeParsedRequiredAbilities(
    mergeAbilityRequirements([...requiredAbilitySections.values()]),
  );
  const mergedParsedAbilityCandidates = normalizeParsedRequiredAbilities(
    mergeAbilityRequirements([
      ...parsedAbilityCandidateSections.values(),
      ...buildParsedAbilityCandidateSeedsFromRequirements(
        deriveAbilityRequirementsFromEnemyMechanics(mergedEnemyMechanics),
        abilityCatalogMap,
      ),
    ]),
  ).flatMap((requirement) => {
    const catalogItem = abilityCatalogMap.get(requirement.abilityKey);

    if (!catalogItem || !catalogItem.category) {
      return [];
    }

    return [
      {
        abilityKey: requirement.abilityKey,
        category: catalogItem.category,
        sourceLine:
          parsedAbilityCandidateSections.get(
            buildParsedAbilityCandidateIdentity({
              abilityKey: requirement.abilityKey,
              category: catalogItem.category,
              sourceLine: '',
              minTurns: requirement.minTurns,
              requiredCharacterCount: requirement.requiredCharacterCount,
              slotTokens: requirement.slotTokens,
            }),
          )?.sourceLine ?? catalogItem.label,
        minTurns: requirement.minTurns,
        requiredCharacterCount: requirement.requiredCharacterCount,
        slotTokens: [...requirement.slotTokens],
      } satisfies ParsedEnemyTextAbilityCandidate,
    ];
  });

  return {
    parsedAbilityCandidates: mergedParsedAbilityCandidates,
    enemyMechanics: mergedEnemyMechanics,
    matchedAbilityCount: mergedParsedAbilityCandidates.length,
    matchedMechanicCount: mergedEnemyMechanics.length,
    requiredAbilities: mergedRequiredAbilities,
    unmatchedLines: warnings
      .filter((warning) => warning.kind === 'unmatched')
      .map((warning) => warning.line),
    warnings,
  };
}

function normalizeParsedRequiredAbilities(
  requirements: AutoBuildAbilityRequirement[],
): AutoBuildAbilityRequirement[] {
  return requirements.map((requirement) =>
    SINGLE_CHARACTER_DEFAULT_ABILITY_KEYS.has(requirement.abilityKey)
      ? {
          ...requirement,
          requiredCharacterCount: 1,
        }
      : requirement,
  );
}

function extractEnemyTextSections(rawValue: string): ParsedEnemyTextSection[] {
  const sections: ParsedEnemyTextSection[] = [
    {
      id: 'default-0',
      lines: [],
    },
  ];
  let sectionIndex = 0;

  extractEnemyTextFragments(rawValue).forEach((line) => {
    if (isEnemyTextSectionHeader(line)) {
      sectionIndex += 1;
      sections.push({
        id: `section-${sectionIndex}`,
        lines: [],
      });
      return;
    }

    sections[sections.length - 1]?.lines.push(line);
  });

  return sections.filter((section) => section.lines.length > 0);
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

function isEnemyTextSectionHeader(value: string): boolean {
  return /^(?:battle|stage|wave)\s+\d+(?:\s*[:\-]\s*)?$/i.test(value.trim());
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

function isIgnoredEnemyTextLine(value: string): boolean {
  return /^(?:preemptive|starting state|unlimited number of times)$/i.test(value);
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
  if (
    /\b(?:slot|orb) bind\b/i.test(line) ||
    /\block(?:ed)? slots?\b/i.test(line) ||
    /\bslots?\s+locked\b/i.test(line)
  ) {
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
      mechanicKey === 'orb_slot_bind' ||
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

  if (mechanicKey === 'orb_slot_bind' && /\block(?:ed)? slots?\b|\bslots?\s+locked\b/i.test(line)) {
    return true;
  }

  return false;
}

function buildEnemyMechanicIdentity(
  requirement: Omit<AutoBuildEnemyMechanicRequirement, 'requiredCharacterCount'>,
): string {
  return [
    requirement.mechanicKey,
    requirement.category,
    requirement.triggerTags.join(','),
    requirement.responseTags.join(','),
    requirement.conditionTags.join(','),
    requirement.derivedAbilityKey ?? 'none',
  ].join('|');
}

function buildAbilityIdentity(
  requirement: Omit<AutoBuildAbilityRequirement, 'requiredCharacterCount'>,
): string {
  return [
    requirement.abilityKey.trim(),
    [...new Set(requirement.slotTokens.map((token) => token.trim().toUpperCase()))]
      .filter((token) => token.length > 0)
      .sort((left, right) => left.localeCompare(right))
      .join(','),
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

function buildParsedAbilityCandidateSeeds(
  familyKey: string | null,
  minTurns: number | null,
  sourceLine: string,
  abilityCatalogMap: ReadonlyMap<string, AutoBuildAbilityCatalogItem>,
): ParsedAbilityCandidateSeed[] {
  if (!familyKey) {
    return [];
  }

  const seeds = new Map<string, ParsedAbilityCandidateSeed>();
  const exactCatalogItem = abilityCatalogMap.get(familyKey);

  if (exactCatalogItem?.category) {
    const exactSeed = createParsedAbilityCandidateSeed(
      familyKey,
      exactCatalogItem.category,
      minTurns,
      sourceLine,
      exactCatalogItem,
    );

    seeds.set(buildParsedAbilityCandidateSeedIdentity(exactSeed), exactSeed);
  }

  const categoryAbilityKeys = PARSED_ABILITY_FAMILY_EQUIVALENTS[familyKey];

  if (!categoryAbilityKeys) {
    return [...seeds.values()];
  }

  Object.entries(categoryAbilityKeys).forEach(([category, abilityKey]) => {
    if (!abilityKey) {
      return;
    }

    const catalogItem = abilityCatalogMap.get(abilityKey);

    if (!catalogItem || catalogItem.category !== category) {
      return;
    }

    const seed = createParsedAbilityCandidateSeed(
      abilityKey,
      category as AutoBuildAbilityCategory,
      minTurns,
      sourceLine,
      catalogItem,
    );

    seeds.set(buildParsedAbilityCandidateSeedIdentity(seed), seed);
  });

  return [...seeds.values()];
}

function createParsedAbilityCandidateSeed(
  abilityKey: string,
  category: AutoBuildAbilityCategory,
  minTurns: number | null,
  sourceLine: string,
  catalogItem: AutoBuildAbilityCatalogItem,
): ParsedAbilityCandidateSeed {
  return {
    abilityKey,
    category,
    sourceLine,
    minTurns: catalogItem.supportsTurns ? minTurns : null,
    slotTokens: [],
  };
}

function buildParsedAbilityCandidateSeedIdentity(candidate: ParsedAbilityCandidateSeed): string {
  return [candidate.category, candidate.abilityKey.trim(), candidate.slotTokens.join(',')].join('|');
}

function buildParsedAbilityCandidateSeedsFromRequirements(
  requirements: readonly AutoBuildAbilityRequirement[],
  abilityCatalogMap: ReadonlyMap<string, AutoBuildAbilityCatalogItem>,
): AutoBuildAbilityRequirement[] {
  return requirements.flatMap((requirement) =>
    buildParsedAbilityCandidateSeeds(
      requirement.abilityKey,
      requirement.minTurns,
      requirement.abilityKey,
      abilityCatalogMap,
    ).map((candidate) => ({
      abilityKey: candidate.abilityKey,
      minTurns: candidate.minTurns,
      slotTokens: candidate.slotTokens,
      requiredCharacterCount: requirement.requiredCharacterCount,
    })),
  );
}

function mergeParsedAbilityCandidate(
  candidateMap: Map<string, ParsedEnemyTextAbilityCandidate>,
  candidate: ParsedAbilityCandidateSeed,
): void {
  const identity = buildParsedAbilityCandidateIdentity({
    ...candidate,
    requiredCharacterCount: 1,
  });
  const existingCandidate = candidateMap.get(identity);

  if (existingCandidate) {
    existingCandidate.minTurns = resolveMaxTurns(existingCandidate.minTurns, candidate.minTurns);
    existingCandidate.requiredCharacterCount += 1;
    return;
  }

  candidateMap.set(identity, {
    abilityKey: candidate.abilityKey,
    category: candidate.category,
    sourceLine: candidate.sourceLine,
    minTurns: candidate.minTurns,
    requiredCharacterCount: 1,
    slotTokens: [...candidate.slotTokens],
  });
}

function buildParsedAbilityCandidateIdentity(
  candidate: ParsedEnemyTextAbilityCandidate,
): string {
  return [candidate.category, candidate.abilityKey.trim(), candidate.slotTokens.join(',')].join('|');
}

function matchDirectParsedAbilityCandidate(
  normalizedLine: string,
  parsedTurns: number | null,
  originalLine: string,
  abilityCatalogMap: ReadonlyMap<string, AutoBuildAbilityCatalogItem>,
): Array<{ candidate: ParsedAbilityCandidateSeed; warning: ParsedEnemyTextWarning | null }> {
  if (!/\bspecial reverse\b/i.test(normalizedLine)) {
    return [];
  }

  return buildParsedAbilityCandidateSeeds(
    'family_special_reverse',
    parsedTurns,
    originalLine,
    abilityCatalogMap,
  ).map((candidate) => ({
    candidate,
    warning: hasParsedAbilityCandidatePrecisionLoss(normalizedLine)
      ? {
          kind: 'precisionLoss',
          line: originalLine,
          matchKind: 'ability',
          resolvedKey: candidate.abilityKey,
        }
      : null,
  }));
}

function hasParsedAbilityCandidatePrecisionLoss(line: string): boolean {
  return (
    POSITION_DETAIL_PATTERN.test(line) ||
    /\bcremate\b/i.test(line) ||
    EXTRA_DETAIL_PATTERNS.some((pattern) => pattern.test(line))
  );
}
