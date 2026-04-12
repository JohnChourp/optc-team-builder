export function normalizePartyConflictKey(value) {
  return String(value ?? '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveBasePartyConflictKey(name) {
  const trimmedName = String(name ?? '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const [baseName = trimmedName] = trimmedName.split(' - ', 1);

  return normalizePartyConflictKey(baseName);
}

export function resolveNameDerivedPartyConflictKeys(name) {
  const primaryKey = resolveBasePartyConflictKey(name);

  if (!primaryKey.length) {
    return [];
  }

  const keys = new Set([primaryKey]);

  if (primaryKey.includes('&')) {
    primaryKey
      .split('&')
      .map((value) => normalizePartyConflictKey(value))
      .filter((value) => value.length > 0)
      .forEach((value) => keys.add(value));
  }

  return [...keys];
}

export function normalizePartyConflictOverrideMap(rawOverrides) {
  if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
    throw new Error('Invalid party conflict override catalog.');
  }

  return new Map(
    Object.entries(rawOverrides).map(([rawCharacterId, rawKeys]) => {
      const characterId = Number(rawCharacterId);

      if (!Number.isInteger(characterId) || characterId <= 0) {
        throw new Error(`Invalid character id in party conflict overrides: ${rawCharacterId}`);
      }

      if (!Array.isArray(rawKeys)) {
        throw new Error(`Invalid party conflict key list for character ${characterId}.`);
      }

      return [
        characterId,
        [
          ...new Set(
            rawKeys
              .map((value) => normalizePartyConflictKey(value))
              .filter((value) => value.length > 0),
          ),
        ],
      ];
    }),
  );
}

export function applyPartyConflictKeys(characters, overrideMap = new Map()) {
  return characters.map((character) => {
    const explicitKeys = Array.isArray(character.detail?.partyConflictKeys)
      ? character.detail.partyConflictKeys
      : [];
    const overrideKeys = overrideMap.get(character.id) ?? [];
    const partyConflictKeys = [
      ...new Set(
        [...resolveNameDerivedPartyConflictKeys(character.name), ...explicitKeys, ...overrideKeys]
          .map((value) => normalizePartyConflictKey(value))
          .filter((value) => value.length > 0),
      ),
    ];

    return {
      ...character,
      detail: {
        ...character.detail,
        partyConflictKeys,
      },
    };
  });
}
