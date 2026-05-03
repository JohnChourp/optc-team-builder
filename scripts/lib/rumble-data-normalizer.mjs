const leveledRumbleSectionKeys = [
  'ability',
  'special',
  'llbability',
  'llbspecial',
  'gpability',
  'gpspecial',
];

export function normalizeRumbleData(rawRumbleData) {
  if (!isRecord(rawRumbleData)) {
    return rawRumbleData ?? null;
  }

  const normalized = cloneValue(rawRumbleData);

  for (const key of leveledRumbleSectionKeys) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = selectMaxLeveledEntry(materializeLeveledSection(normalized[key]));
    }
  }

  return normalized;
}

export function normalizeRumbleUnits(rawRumbleUnits) {
  if (!Array.isArray(rawRumbleUnits)) {
    return [];
  }

  return rawRumbleUnits
    .map((entry) => normalizeRumbleData(entry))
    .filter((entry) => isRecord(entry));
}

function selectMaxLeveledEntry(levels) {
  const maxLevel = [...levels]
    .reverse()
    .find((level) => isMeaningfulLeveledEntry(level));

  return maxLevel ? [cloneValue(maxLevel)] : [];
}

function isMeaningfulLeveledEntry(level) {
  if (!isRecord(level)) {
    return level !== null && level !== undefined && String(level).trim().length > 0;
  }

  if (Array.isArray(level.effects)) {
    return level.effects.some((effect) => isRecord(effect) && Object.keys(effect).length > 0);
  }

  return Object.keys(level).length > 0;
}

function materializeLeveledSection(levels) {
  let previousEffects = [];

  return levels.map((level) => {
    if (!isRecord(level)) {
      return cloneValue(level);
    }

    const materializedLevel = cloneValue(level);

    if (!Array.isArray(materializedLevel.effects)) {
      return materializedLevel;
    }

    const currentEffects = materializedLevel.effects.map((effect, index) =>
      materializeEffect(effect, previousEffects[index]),
    );
    materializedLevel.effects = currentEffects;
    previousEffects = currentEffects.map((effect) => cloneValue(effect));

    return materializedLevel;
  });
}

function materializeEffect(effect, previousEffect) {
  if (!isRecord(effect)) {
    return cloneValue(effect);
  }

  const override = isRecord(effect.override) ? effect.override : null;

  if (override) {
    return mergeRecords(isRecord(previousEffect) ? previousEffect : {}, override);
  }

  const clonedEffect = cloneValue(effect);
  delete clonedEffect.override;

  if (!Object.keys(clonedEffect).length && isRecord(previousEffect)) {
    return cloneValue(previousEffect);
  }

  return clonedEffect;
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)]),
    );
  }

  return value;
}

function mergeRecords(base, override) {
  const merged = cloneValue(base);

  for (const [key, value] of Object.entries(override)) {
    merged[key] =
      isRecord(value) && isRecord(merged[key])
        ? mergeRecords(merged[key], value)
        : cloneValue(value);
  }

  return merged;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
