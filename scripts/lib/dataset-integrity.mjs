export class DatasetIntegrityError extends Error {
  constructor(report) {
    const preview = report.errors.slice(0, 8).join('\n- ');
    const suffix = report.errors.length > 8 ? `\n- ... ${report.errors.length - 8} more` : '';

    super(`Dataset integrity check failed:\n- ${preview}${suffix}`);
    this.name = 'DatasetIntegrityError';
    this.report = report;
  }
}

const MANUAL_CHARACTER_ID_MIN = 900000;

export function validateDatasetIntegrity({
  characters,
  ships,
  manifest,
  autoBuilderAbilityCatalog,
}) {
  const report = buildDatasetIntegrityReport({
    characters,
    ships,
    manifest,
    autoBuilderAbilityCatalog,
  });

  if (report.errors.length > 0) {
    throw new DatasetIntegrityError(report);
  }

  return report;
}

export function buildDatasetIntegrityReport({
  characters,
  ships,
  manifest,
  autoBuilderAbilityCatalog,
}) {
  const errors = [];
  const characterIds = validateCharacters(characters, errors);

  validateShips(ships, errors);
  validateManifest(manifest, characters, ships, errors);
  validateAbilityCatalog(autoBuilderAbilityCatalog, characterIds, errors);

  return {
    ok: errors.length === 0,
    errors,
  };
}

function validateCharacters(characters, errors) {
  const characterIds = new Set();
  const detailReferences = [];

  if (!Array.isArray(characters) || characters.length === 0) {
    errors.push('characters must be a non-empty array.');
    return characterIds;
  }

  characters.forEach((character, index) => {
    if (!isRecord(character)) {
      errors.push(`characters[${index}] must be an object.`);
      return;
    }

    const characterId = normalizePositiveInteger(character.id);

    if (characterId === null) {
      errors.push(`characters[${index}] has invalid id "${String(character.id)}".`);
    } else if (characterIds.has(characterId)) {
      errors.push(`characters contains duplicate id ${characterId}.`);
    } else {
      characterIds.add(characterId);
    }

    if (!normalizeString(character.name).length) {
      errors.push(`character ${characterId ?? index} is missing a name.`);
    }

    if (!isRecord(character.detail)) {
      errors.push(`character ${characterId ?? index} is missing detail data.`);
      return;
    }

    const detailCharacterId = normalizePositiveInteger(character.detail.characterId);

    if (characterId !== null) {
      detailReferences.push({
        characterId,
        detailCharacterId,
      });
    }
  });

  detailReferences.forEach(({ characterId, detailCharacterId }) => {
    if (detailCharacterId === characterId) {
      return;
    }

    if (isManualCharacterId(characterId) && detailCharacterId !== null) {
      if (characterIds.has(detailCharacterId)) {
        return;
      }

      errors.push(
        `character ${characterId} detail.characterId references unknown canonical character id ${detailCharacterId}.`,
      );
      return;
    }

    errors.push(`character ${characterId} detail.characterId must match the character id.`);
  });

  return characterIds;
}

function isManualCharacterId(value) {
  return Number.isInteger(value) && value >= MANUAL_CHARACTER_ID_MIN;
}

function validateShips(ships, errors) {
  const shipIds = new Set();

  if (!Array.isArray(ships)) {
    errors.push('ships must be an array.');
    return;
  }

  ships.forEach((ship, index) => {
    if (!isRecord(ship)) {
      errors.push(`ships[${index}] must be an object.`);
      return;
    }

    const shipId = normalizePositiveInteger(ship.id);

    if (shipId === null) {
      errors.push(`ships[${index}] has invalid id "${String(ship.id)}".`);
    } else if (shipIds.has(shipId)) {
      errors.push(`ships contains duplicate id ${shipId}.`);
    } else {
      shipIds.add(shipId);
    }

    if (!normalizeString(ship.name).length) {
      errors.push(`ship ${shipId ?? index} is missing a name.`);
    }
  });
}

function validateManifest(manifest, characters, ships, errors) {
  if (!isRecord(manifest)) {
    errors.push('manifest must be an object.');
    return;
  }

  if (manifest.schemaVersion !== 1) {
    errors.push(`manifest.schemaVersion must be 1, received ${String(manifest.schemaVersion)}.`);
  }

  if (!normalizeString(manifest.generatedAt).length) {
    errors.push('manifest.generatedAt is required.');
  }

  if (!normalizeString(manifest.sourceVersion).length) {
    errors.push('manifest.sourceVersion is required.');
  }

  assertCount('manifest.characterCount', manifest.characterCount, characters?.length ?? 0, errors);
  assertCount('manifest.shipCount', manifest.shipCount, ships?.length ?? 0, errors);
  assertCount(
    'manifest.detailCount',
    manifest.detailCount,
    Array.isArray(characters)
      ? characters.filter(
          (character) => character?.detail?.specialText || character?.detail?.captainAbility,
        ).length
      : 0,
    errors,
  );
  assertCount(
    'manifest.rumbleCount',
    manifest.rumbleCount,
    Array.isArray(characters)
      ? characters.filter((character) => Boolean(character?.detail?.rumbleData)).length
      : 0,
    errors,
  );

  if (!Array.isArray(manifest.packs)) {
    errors.push('manifest.packs must be an array.');
  }
}

function validateAbilityCatalog(autoBuilderAbilityCatalog, characterIds, errors) {
  if (!isRecord(autoBuilderAbilityCatalog)) {
    errors.push('auto builder ability catalog must be an object.');
    return;
  }

  const abilities = autoBuilderAbilityCatalog.abilities;

  if (!Array.isArray(abilities)) {
    errors.push('auto builder ability catalog abilities must be an array.');
    return;
  }

  assertCount(
    'autoBuilderAbilityCatalog.abilityCount',
    autoBuilderAbilityCatalog.abilityCount,
    abilities.length,
    errors,
  );

  const abilityKeys = new Set();

  abilities.forEach((ability, index) => {
    if (!isRecord(ability)) {
      errors.push(`ability catalog entry ${index} must be an object.`);
      return;
    }

    const key = normalizeString(ability.key);

    if (!key.length) {
      errors.push(`ability catalog entry ${index} is missing key.`);
    } else if (abilityKeys.has(key)) {
      errors.push(`ability catalog contains duplicate key "${key}".`);
    } else {
      abilityKeys.add(key);
    }

    if (!normalizeString(ability.label).length) {
      errors.push(`ability catalog entry ${key || index} is missing label.`);
    }

    const matchingCharacterIds = normalizePositiveIntegerArray(ability.matchingCharacterIds);

    assertCount(
      `ability catalog entry ${key || index} matchCount`,
      ability.matchCount,
      matchingCharacterIds.length,
      errors,
    );
    validateCharacterReferences(
      matchingCharacterIds,
      characterIds,
      `ability catalog entry ${key || index}.matchingCharacterIds`,
      errors,
    );
    validateCharacterReferences(
      normalizePositiveIntegerArray(ability.sampleCharacterIds),
      characterIds,
      `ability catalog entry ${key || index}.sampleCharacterIds`,
      errors,
    );

    const turnEntries = Array.isArray(ability.turnMatchingCharacterIds)
      ? ability.turnMatchingCharacterIds
      : [];

    turnEntries.forEach((entry, turnIndex) => {
      const ids = normalizePositiveIntegerArray(entry?.characterIds);

      if (normalizePositiveInteger(entry?.minTurns) === null) {
        errors.push(`ability catalog entry ${key || index} turn bucket ${turnIndex} has invalid minTurns.`);
      }

      validateCharacterReferences(
        ids,
        characterIds,
        `ability catalog entry ${key || index}.turnMatchingCharacterIds[${turnIndex}]`,
        errors,
      );
    });
  });
}

function validateCharacterReferences(ids, characterIds, label, errors) {
  ids.forEach((characterId) => {
    if (!characterIds.has(characterId)) {
      errors.push(`${label} references unknown character id ${characterId}.`);
    }
  });
}

function assertCount(label, actual, expected, errors) {
  if (actual !== expected) {
    errors.push(`${label} must be ${expected}, received ${String(actual)}.`);
  }
}

function normalizePositiveIntegerArray(value) {
  return Array.isArray(value)
    ? value
        .map((entry) => normalizePositiveInteger(entry))
        .filter((entry) => entry !== null)
    : [];
}

function normalizePositiveInteger(value) {
  const numericValue = Number(value);

  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
