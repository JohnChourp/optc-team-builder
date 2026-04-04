const SLOT_ABILITY_KEY_SET = new Set(['remove_slot_bind', 'remove_slot_barrier']);
const DEFAULT_COVERAGE_MODE = 'explicit';
const PAIN_ABILITY_KEY = 'remove_pain';
const PAIN_ABILITY_LABEL = 'Remove Pain';
const EXPLICIT_BUILDER_ABILITIES = [
  {
    key: 'ignore_normal_attack_only',
    label: 'Ignore Normal Attack Only (NAO)',
    matcher: (text) => /\bignoring normal attack only\b/i.test(text),
  },
];
const IGNORED_TARGET_PATTERNS = [
  'special cooldown',
  'cooldown',
  'captain effect',
  'captain ability',
];

const TARGET_ALIASES = [
  {
    key: 'remove_slot_barrier',
    label: 'Remove Slot Barrier',
    matcher: (target) => target.includes('slot barrier') || target.includes('orb barrier'),
  },
  {
    key: 'remove_slot_bind',
    label: 'Remove Slot Bind',
    matcher: (target) => target.includes('slot bind') || target.includes('orb bind'),
  },
  {
    key: 'remove_ship_bind',
    label: 'Remove Ship Bind',
    matcher: (target) => target.includes('ship bind'),
  },
  {
    key: 'remove_sailor_despair',
    label: 'Remove Sailor Despair',
    matcher: (target) => target.includes('sailor despair'),
  },
  {
    key: 'remove_special_bind',
    label: 'Remove Special Bind',
    matcher: (target) => target.includes('special bind') || target.includes('silence'),
  },
  {
    key: 'remove_bind',
    label: 'Remove Bind',
    matcher: (target) =>
      (target === 'bind' || target.endsWith(' bind')) &&
      !target.includes('slot bind') &&
      !target.includes('orb bind'),
  },
  {
    key: 'remove_despair',
    label: 'Remove Despair',
    matcher: (target) => target.includes('despair'),
  },
  {
    key: 'remove_paralysis',
    label: 'Remove Paralysis',
    matcher: (target) => target.includes('paralysis'),
  },
  {
    key: 'remove_blindness',
    label: 'Remove Blindness',
    matcher: (target) => target.includes('blindness') || target === 'blind',
  },
  {
    key: 'remove_atk_down',
    label: 'Remove ATK Down',
    matcher: (target) => target.includes('atk down') || target.includes('attack down'),
  },
  {
    key: 'remove_damage_reduction',
    label: 'Remove Damage Reduction',
    matcher: (target) => target === 'damage reduction' || target === 'percent damage reduction',
  },
  {
    key: 'remove_enemy_orb_based_damage_reduction',
    label: 'Remove Orb-Based Damage Reduction',
    matcher: (target) =>
      target.includes('orb-based damage reduction') || target.includes('orb based damage reduction'),
  },
  {
    key: 'remove_threshold_damage_reduction',
    label: 'Remove Threshold Damage Reduction',
    matcher: (target) => target.includes('threshold damage reduction'),
  },
  {
    key: 'remove_resilience',
    label: 'Remove Resilience',
    matcher: (target) => target.includes('resilience'),
  },
  {
    key: 'remove_enemy_increased_defense',
    label: 'Remove Increased Defense',
    matcher: (target) =>
      target.includes('increased defense') ||
      target === 'defense up' ||
      target.endsWith(' defense up'),
  },
  {
    key: 'remove_enemy_barrier',
    label: 'Remove Enemy Barrier',
    matcher: (target) =>
      target.includes('barrier') &&
      !target.includes('slot barrier') &&
      !target.includes('orb barrier'),
  },
  {
    key: 'remove_enemy_damage_nullification',
    label: 'Remove Damage Nullification',
    matcher: (target) => target.includes('damage nullification'),
  },
  {
    key: 'remove_enemy_atk_up',
    label: 'Remove ATK Up',
    matcher: (target) => target.includes('atk up') || target.includes('attack up'),
  },
  {
    key: 'remove_enemy_enrage',
    label: 'Remove Enrage',
    matcher: (target) => target.includes('enrage'),
  },
  {
    key: 'remove_enemy_end_of_turn_damage_percent_cut',
    label: 'Remove End of Turn Damage/Percent Cut',
    matcher: (target) =>
      target.includes('end of turn damage/percent cut') ||
      target.includes('end of turn damage percent cut') ||
      target.includes('end of turn damage') ||
      target.includes('percent cut'),
  },
  {
    key: 'remove_enemy_end_of_turn_heal',
    label: 'Remove End of Turn Heal',
    matcher: (target) => target.includes('end of turn heal'),
  },
  {
    key: 'remove_no_healing',
    label: 'Remove No Healing',
    matcher: (target) => target.includes('no healing'),
  },
  {
    key: 'remove_burn',
    label: 'Remove Burn',
    matcher: (target) => target.includes('burn'),
  },
  {
    key: 'remove_poison',
    label: 'Remove Poison',
    matcher: (target) => target === 'poison' || target === 'toxic' || target.includes('poison'),
  },
  {
    key: PAIN_ABILITY_KEY,
    label: PAIN_ABILITY_LABEL,
    matcher: (target) => target.includes('pain'),
  },
  {
    key: 'remove_chain_coefficient_reduction',
    label: 'Remove Chain Coefficient Reduction',
    matcher: (target) => target.includes('chain coefficient reduction'),
  },
  {
    key: 'remove_chain_multiplier_limit',
    label: 'Remove Chain Multiplier Limit',
    matcher: (target) => target.includes('chain multiplier limit') || target.includes('chain lock'),
  },
  {
    key: 'remove_increase_damage_taken',
    label: 'Remove Increase Damage Taken',
    matcher: (target) => target.includes('increase damage taken'),
  },
  {
    key: 'remove_healing_reduction',
    label: 'Remove Healing Reduction',
    matcher: (target) => target.includes('healing reduction'),
  },
  {
    key: 'remove_stun',
    label: 'Remove Stun',
    matcher: (target) => target.includes('stun'),
  },
];

const TURN_PATTERNS = [
  {
    isCompleteRemoval: false,
    pattern: /(?:reduces?|removes?)\s+([^.;]+?)\s+(?:duration\s+)?by\s+(\d+)\s+turns?/gi,
    resolveTurns: (match) => Number(match[2]),
  },
  {
    isCompleteRemoval: true,
    pattern: /(?:reduces?|removes?)\s+([^.;]+?)\s+completely/gi,
    resolveTurns: () => 99,
  },
];
const SELECTED_DEBUFF_PAIN_PATTERNS = [
  /(?:reduces?|removes?)\s+(?:\d+\s+)?selected\s+debuffs?\s+(?:duration\s+)?by\s+(\d+)\s+turns?/gi,
];

export function normalizeLegacyAbilityText(value) {
  const fragments = [...new Set(extractTextFragments(value))].filter(Boolean);
  return fragments.join('. ');
}

export function analyzeBuilderAbilityText(value, source) {
  const normalizedText = normalizeLegacyAbilityText(value);

  if (!normalizedText.length) {
    return [];
  }

  const abilities = [];
  const seen = new Set();

  TURN_PATTERNS.forEach(({ pattern, resolveTurns, isCompleteRemoval }) => {
    for (const match of normalizedText.matchAll(pattern)) {
      const rawTarget = String(match[1] ?? '').trim();
      const minTurns = resolveTurns(match);

      if (!Number.isFinite(minTurns) || minTurns <= 0) {
        continue;
      }

      normalizeTargetSegments(rawTarget).forEach((segment) => {
        resolveAbilityDefinitions(segment).forEach((normalized) => {
          const ability = {
            key: normalized.key,
            label: normalized.label,
            minTurns,
            isCompleteRemoval,
            slotTokens: normalized.slotTokens,
            source,
            coverageMode: DEFAULT_COVERAGE_MODE,
          };
          addAbility(abilities, seen, ability);
        });
      });
    }
  });

  SELECTED_DEBUFF_PAIN_PATTERNS.forEach((pattern) => {
    for (const match of normalizedText.matchAll(pattern)) {
      const minTurns = Number(match[1]);

      if (!Number.isFinite(minTurns) || minTurns <= 0) {
        continue;
      }

      addAbility(abilities, seen, {
        key: PAIN_ABILITY_KEY,
        label: PAIN_ABILITY_LABEL,
        minTurns,
        isCompleteRemoval: false,
        slotTokens: [],
        source,
        coverageMode: 'selectedDebuff',
      });
    }
  });

  EXPLICIT_BUILDER_ABILITIES.forEach((definition) => {
    if (!definition.matcher(normalizedText)) {
      return;
    }

    const ability = {
      key: definition.key,
      label: definition.label,
      minTurns: null,
      isCompleteRemoval: false,
      slotTokens: [],
      source,
      coverageMode: DEFAULT_COVERAGE_MODE,
    };
    addAbility(abilities, seen, ability);
  });

  return abilities;
}

export function analyzeSpecialText(value) {
  return analyzeBuilderAbilityText(value, 'specialText');
}

export async function enrichCharactersWithBuilderAbilities(
  characters,
  { batchSize = 200, logger = console.log } = {},
) {
  const catalogMap = new Map();
  const total = characters.length;

  for (let start = 0; start < total; start += batchSize) {
    const batch = characters.slice(start, start + batchSize);

    batch.forEach((character) => {
      const derivedBuilderAbilities = [
        ...analyzeBuilderAbilityText(character.detail?.specialText ?? null, 'specialText'),
        ...analyzeBuilderAbilityText(character.detail?.captainAbility ?? null, 'captainAbility'),
      ];
      const builderAbilities = mergeBuilderAbilities(
        character.detail?.builderAbilities ?? [],
        derivedBuilderAbilities,
      );
      character.detail.builderAbilities = builderAbilities;

      builderAbilities.forEach((ability) => {
        const current =
          catalogMap.get(ability.key) ?? createCatalogAccumulator(ability.key, ability.label);

        current.matchCount += 1;
        current.supportsTurns ||= ability.minTurns !== null;
        current.supportsSlotTokens ||= ability.slotTokens.length > 0;
        current.availableSources.add(ability.source);
        current.availableCoverageModes.add(resolveCoverageMode(ability));
        ability.slotTokens.forEach((token) => current.availableSlotTokens.add(token));

        if (current.sampleCharacterIds.length < 5) {
          current.sampleCharacterIds.push(character.id);
        }

        const sampleText =
          ability.source === 'captainAbility'
            ? character.detail?.captainAbility
            : character.detail?.specialText;

        if (
          current.sampleTexts.length < 5 &&
          typeof sampleText === 'string' &&
          sampleText.length
        ) {
          current.sampleTexts.push(sampleText);
        }

        catalogMap.set(ability.key, current);
      });
    });

    const processedCount = Math.min(start + batch.length, total);
    logger?.(
      `[auto-builder-abilities] processed ${processedCount}/${total} characters, catalog size ${catalogMap.size}`,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const abilities = [...catalogMap.values()]
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      supportsTurns: entry.supportsTurns,
      supportsSlotTokens: entry.supportsSlotTokens,
      availableSlotTokens: [...entry.availableSlotTokens].sort((left, right) =>
        left.localeCompare(right),
      ),
      availableSources: [...entry.availableSources].sort((left, right) =>
        left.localeCompare(right),
      ),
      availableCoverageModes: [...entry.availableCoverageModes].sort(compareCoverageModes),
      matchCount: entry.matchCount,
      sampleCharacterIds: [...entry.sampleCharacterIds],
      sampleTexts: [...entry.sampleTexts],
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return abilities;
}

function mergeBuilderAbilities(existingAbilities, derivedAbilities) {
  const mergedAbilities = [];
  const seen = new Set();

  [...normalizeExistingBuilderAbilities(existingAbilities), ...derivedAbilities].forEach((ability) => {
    addAbility(mergedAbilities, seen, ability);
  });

  return mergedAbilities;
}

function normalizeExistingBuilderAbilities(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeExistingBuilderAbility(entry))
    .filter((entry) => entry !== null);
}

function normalizeExistingBuilderAbility(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const key = typeof value.key === 'string' ? value.key.trim() : '';

  if (!key.length) {
    return null;
  }

  return {
    key,
    label: typeof value.label === 'string' && value.label.trim().length ? value.label.trim() : key,
    minTurns: Number.isFinite(Number(value.minTurns)) ? Number(value.minTurns) : null,
    isCompleteRemoval: Boolean(value.isCompleteRemoval),
    slotTokens: Array.isArray(value.slotTokens)
      ? [...new Set(value.slotTokens.map((entry) => String(entry).trim().toUpperCase()).filter(Boolean))]
      : [],
    source: value.source === 'captainAbility' ? 'captainAbility' : 'specialText',
    coverageMode: value.coverageMode === 'selectedDebuff' ? 'selectedDebuff' : DEFAULT_COVERAGE_MODE,
  };
}

function createCatalogAccumulator(key, label) {
  return {
    key,
    label,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: new Set(),
    availableSources: new Set(),
    availableCoverageModes: new Set(),
    matchCount: 0,
    sampleCharacterIds: [],
    sampleTexts: [],
  };
}

function buildAbilityIdentity(ability) {
  return `${ability.key}|${ability.minTurns ?? 'none'}|${ability.slotTokens.join(',')}|${ability.source}|${resolveCoverageMode(ability)}`;
}

function addAbility(abilities, seen, ability) {
  const identity = buildAbilityIdentity(ability);

  if (seen.has(identity)) {
    return;
  }

  seen.add(identity);
  abilities.push(ability);
}

function resolveCoverageMode(ability) {
  return ability.coverageMode ?? DEFAULT_COVERAGE_MODE;
}

function compareCoverageModes(left, right) {
  const order = new Map([
    ['explicit', 0],
    ['selectedDebuff', 1],
  ]);

  return (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER);
}

function extractTextFragments(value) {
  if (typeof value === 'string') {
    const normalized = value.replace(/<br\s*\/?>/gi, '. ').trim();
    return normalized.length ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractTextFragments(entry));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value;
  const preferredKeys = [
    'description',
    'base',
    'llbbase',
    'level1',
    'llblevel1',
    'level2',
    'llblevel2',
    'level3',
    'llblevel3',
    'level4',
    'llblevel4',
    'level5',
    'llblevel5',
  ];
  const fragments = [];
  const seenKeys = new Set();

  preferredKeys.forEach((key) => {
    if (key in record) {
      fragments.push(...extractTextFragments(record[key]));
      seenKeys.add(key);
    }
  });

  const fallbackFragments = Object.entries(record)
    .filter(([key]) => !seenKeys.has(key))
    .flatMap(([, entry]) => extractTextFragments(entry));

  if (fragments.length || fallbackFragments.length) {
    return [...fragments, ...fallbackFragments];
  }

  return Object.values(record).flatMap((entry) => extractTextFragments(entry));
}

function normalizeTargetSegments(targetText) {
  const slotTokens = extractSlotTokens(targetText);
  const normalizedTarget = normalizeTargetText(targetText);

  if (!normalizedTarget.length) {
    return [];
  }

  if (isSlotScopedTarget(normalizedTarget)) {
    return [
      {
        target: normalizedTarget,
        slotTokens,
      },
    ];
  }

  const candidates = [
    ...normalizedTarget
      .split(/\s*,\s*|\s+and\s+/gi)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => ({
        target: segment,
        slotTokens: [],
      })),
    {
      target: normalizedTarget,
      slotTokens: [],
    },
  ];

  const seen = new Set();

  return candidates.filter((candidate) => {
    const identity = `${candidate.target}|${candidate.slotTokens.join(',')}`;

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

function extractSlotTokens(targetText) {
  return [...targetText.matchAll(/\[([^\]]+)\]/g)]
    .flatMap((match) => String(match[1] ?? '').split(/\s*,\s*|\s+and\s+|\s+or\s+/gi))
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
    .filter((token, index, tokens) => tokens.indexOf(token) === index);
}

function normalizeTargetText(targetText) {
  return targetText
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\benemies'?s?\b/g, ' ')
    .replace(/\benemy\b/g, ' ')
    .replace(/\bbuffs?\b/g, ' ')
    .replace(/\bstatuses?\b/g, ' ')
    .replace(/\bof the crew\b/g, ' ')
    .replace(/\bcrew\b/g, ' ')
    .replace(/^(?:and|or)\s+/g, ' ')
    .replace(/\s+(?:and|or)$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSlotScopedTarget(target) {
  return (
    target.includes('slot bind') ||
    target.includes('slot barrier') ||
    target.includes('orb bind') ||
    target.includes('orb barrier')
  );
}

function resolveAbilityDefinitions(segment) {
  const target = segment.target.trim();

  if (!target.length || IGNORED_TARGET_PATTERNS.some((pattern) => target.includes(pattern))) {
    return [];
  }

  return TARGET_ALIASES.filter((entry) => entry.matcher(target)).map((alias) => ({
    key: alias.key,
    label: alias.label,
    slotTokens: SLOT_ABILITY_KEY_SET.has(alias.key) ? [...segment.slotTokens] : [],
  }));
}
