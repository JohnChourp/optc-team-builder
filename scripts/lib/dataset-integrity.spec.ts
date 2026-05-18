import { describe, expect, it } from 'vitest';

import {
  DatasetIntegrityError,
  buildDatasetIntegrityReport,
  validateDatasetIntegrity,
} from './dataset-integrity.mjs';

describe('dataset integrity checks', () => {
  it('accepts a consistent generated dataset payload', () => {
    const input = createIntegrityInput();

    expect(validateDatasetIntegrity(input)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('reports duplicate ids, missing details, count mismatches, and unknown references', () => {
    const input = createIntegrityInput({
      characters: [
        createCharacter({ id: 101 }),
        {
          ...createCharacter({ id: 101 }),
          name: '',
          detail: null,
        },
      ],
      manifest: {
        ...createManifest(),
        characterCount: 99,
      },
      autoBuilderAbilityCatalog: {
        ...createAbilityCatalog(),
        abilities: [
          createAbilityCatalogEntry({
            matchingCharacterIds: [101, 999],
            sampleCharacterIds: [999],
          }),
        ],
      },
    });
    const report = buildDatasetIntegrityReport(input);

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'characters contains duplicate id 101.',
        'character 101 is missing a name.',
        'character 101 is missing detail data.',
        'manifest.characterCount must be 2, received 99.',
        'ability catalog entry remove_bind.matchingCharacterIds references unknown character id 999.',
        'ability catalog entry remove_bind.sampleCharacterIds references unknown character id 999.',
      ]),
    );
    expect(() => validateDatasetIntegrity(input)).toThrow(DatasetIntegrityError);
  });
});

function createIntegrityInput(overrides = {}) {
  const characters = overrides.characters ?? [createCharacter({ id: 101 })];
  const ships = overrides.ships ?? [createShip({ id: 1 })];

  return {
    characters,
    ships,
    manifest: overrides.manifest ?? createManifest({ characters, ships }),
    autoBuilderAbilityCatalog:
      overrides.autoBuilderAbilityCatalog ?? createAbilityCatalog({ characterId: 101 }),
  };
}

function createCharacter(overrides = {}) {
  const id = overrides.id ?? 101;

  return {
    id,
    name: 'Monkey D. Luffy',
    detail: {
      characterId: id,
      captainAbility: 'Boosts ATK of all characters by 5x.',
      specialText: null,
      rumbleData: null,
    },
    ...overrides,
  };
}

function createShip(overrides = {}) {
  return {
    id: 1,
    name: 'Thousand Sunny',
    ...overrides,
  };
}

function createManifest({ characters = [createCharacter()], ships = [createShip()] } = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceVersion: 'test',
    characterCount: characters.length,
    detailCount: characters.filter(
      (character) => character?.detail?.specialText || character?.detail?.captainAbility,
    ).length,
    shipCount: ships.length,
    rumbleCount: characters.filter((character) => Boolean(character?.detail?.rumbleData)).length,
    packs: [],
  };
}

function createAbilityCatalog({ characterId = 101 } = {}) {
  return {
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceVersion: 'test',
    abilityCount: 1,
    abilities: [createAbilityCatalogEntry({ matchingCharacterIds: [characterId] })],
  };
}

function createAbilityCatalogEntry(overrides = {}) {
  return {
    key: 'remove_bind',
    label: 'Remove Bind',
    matchCount: overrides.matchingCharacterIds?.length ?? 1,
    matchingCharacterIds: [101],
    sampleCharacterIds: [101],
    turnMatchingCharacterIds: [],
    ...overrides,
  };
}
