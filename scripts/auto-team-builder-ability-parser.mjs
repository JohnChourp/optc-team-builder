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
  'chain multiplier',
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
    matcher: (target) => target === 'bind' || target.endsWith(' bind'),
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
    key: 'remove_defense_up',
    label: 'Remove Defense Up',
    matcher: (target) => target === 'defense up',
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
    key: 'remove_increase_damage_taken',
    label: 'Remove Increase Damage Taken',
    matcher: (target) => target.includes('increase damage taken'),
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
        const normalized = resolveAbilityDefinition(segment);

        if (!normalized) {
          return;
        }

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
      const builderAbilities = [
        ...analyzeBuilderAbilityText(character.detail?.specialText ?? null, 'specialText'),
        ...analyzeBuilderAbilityText(character.detail?.captainAbility ?? null, 'captainAbility'),
      ];
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

  return normalizedTarget
    .split(/\s*,\s*|\s+and\s+/gi)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => ({
      target: segment,
      slotTokens: [],
    }));
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
    .replace(/\bof the crew\b/g, ' ')
    .replace(/\bcrew\b/g, ' ')
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

function resolveAbilityDefinition(segment) {
  const target = segment.target.trim();

  if (!target.length || IGNORED_TARGET_PATTERNS.some((pattern) => target.includes(pattern))) {
    return null;
  }

  const alias = TARGET_ALIASES.find((entry) => entry.matcher(target));

  if (!alias) {
    return null;
  }

  return {
    key: alias.key,
    label: alias.label,
    slotTokens: SLOT_ABILITY_KEY_SET.has(alias.key) ? [...segment.slotTokens] : [],
  };
}
