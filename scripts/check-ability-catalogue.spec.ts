import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkAbilityCatalogue,
  formatAbilityCatalogueResult,
  readSeedBuilderAbilities,
} from './check-ability-catalogue.mjs';
import {
  auditAbilityCatalogue,
  indexBuilderAbilities,
  mapAbilitiesByCharacter,
} from './lib/ability-catalogue-index.mjs';
import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';

/**
 * 869f138qm. Every finding is proved by breaking the catalogue the way the importer could break it.
 *
 * The lists under test are an index, so each mutation is the same shape: a character that the seed
 * says has the key and the catalogue does not, or the reverse. A guard that only ran against the
 * shipped pair would pass forever without ever having compared anything.
 */

type Ability = {
  key: string;
  label?: string;
  minTurns?: number | null;
  isCompleteRemoval?: boolean;
  slotTokens?: string[];
  source?: string;
  effectTargetScope?: string;
  minEffectValue?: number | null;
};

const rows = [
  {
    characterId: 1,
    builderAbilities: [
      { key: 'special_damage', source: 'specialText', minTurns: null, isCompleteRemoval: false },
      { key: 'cure_paralysis', source: 'captainAbility', minTurns: 2, isCompleteRemoval: true },
    ] as Ability[],
  },
  {
    characterId: 2,
    builderAbilities: [
      { key: 'special_damage', source: 'captainAbility', minTurns: 3, isCompleteRemoval: false },
      { key: 'cure_paralysis', source: 'specialText', minTurns: 2, effectTargetScope: 'crew' },
    ] as Ability[],
  },
];

const catalogue = {
  abilities: [
    {
      key: 'special_damage',
      matchCount: 2,
      matchingCharacterIds: [1, 2],
      turnMatchingCharacterIds: [{ minTurns: 3, characterIds: [2] }],
      captainAbilityMatchingCharacterIds: [2],
      captainAbilityTurnMatchingCharacterIds: [{ minTurns: 3, characterIds: [2] }],
      sampleCharacterIds: [1],
      sampleTexts: ['Deals damage'],
    },
    {
      key: 'cure_paralysis',
      matchCount: 2,
      matchingCharacterIds: [1, 2],
      turnMatchingCharacterIds: [{ minTurns: 2, characterIds: [1, 2] }],
      completeRemovalCharacterIds: [1],
      captainAbilityMatchingCharacterIds: [1],
      captainAbilityCompleteRemovalCharacterIds: [1],
      captainAbilityTurnMatchingCharacterIds: [{ minTurns: 2, characterIds: [1] }],
      availableEffectTargetScopes: ['crew'],
      effectTargetScopeMatchingCharacterIds: [
        {
          effectTargetScope: 'crew',
          characterIds: [2],
          turnMatchingCharacterIds: [{ minTurns: 2, characterIds: [2] }],
        },
      ],
      sampleCharacterIds: [1],
      sampleTexts: ['Cures paralysis'],
    },
    {
      key: 'boost_max_hp',
      matchCount: 0,
      matchingCharacterIds: [],
      turnMatchingCharacterIds: [],
      sampleCharacterIds: [],
      sampleTexts: [],
    },
  ],
};

function audit(mutate: (value: typeof catalogue) => void = () => {}) {
  const mutated = JSON.parse(JSON.stringify(catalogue)) as typeof catalogue;

  mutate(mutated);

  return auditAbilityCatalogue({
    catalogue: mutated,
    index: indexBuilderAbilities(rows),
    characterIds: new Set([1, 2]),
    abilitiesByCharacter: mapAbilitiesByCharacter(rows),
  });
}

function kinds(result: ReturnType<typeof audit>) {
  return result.findings.map((finding) => finding.kind);
}

describe('ability catalogue index', () => {
  it('accepts a catalogue that is exactly the index of its database', () => {
    const result = audit();

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('counts a key no character has as definition-only rather than a finding', () => {
    expect(audit().definitionOnlyKeys).toEqual(['boost_max_hp']);
  });

  it('catches a character the seed has and the catalogue dropped', () => {
    const result = audit((value) => {
      value.abilities[0].matchingCharacterIds = [1];
      value.abilities[0].matchCount = 1;
    });

    expect(kinds(result)).toContain('matching-character-ids-diverged');
    expect(result.findings[0].detail).toContain('2');
  });

  it('catches a character the catalogue kept after the seed lost it', () => {
    const result = audit((value) => {
      value.abilities[0].matchingCharacterIds = [1, 2, 3];
      value.abilities[0].matchCount = 3;
    });

    expect(kinds(result)).toContain('matching-character-ids-diverged');
    expect(kinds(result)).toContain('unknown-character-id');
  });

  it('catches a matchCount that no longer counts its own list', () => {
    expect(kinds(audit((value) => (value.abilities[0].matchCount = 7)))).toEqual([
      'match-count-diverged',
    ]);
  });

  it('catches a turn group that moved to another turn count', () => {
    const result = audit((value) => {
      value.abilities[0].turnMatchingCharacterIds = [{ minTurns: 4, characterIds: [2] }];
    });

    expect(kinds(result)).toContain('turn-matching-character-ids-diverged');
    expect(result.findings).toHaveLength(2);
  });

  it('catches a captain list that picked up a character whose ability is not a captain ability', () => {
    const result = audit((value) => {
      value.abilities[0].captainAbilityMatchingCharacterIds = [1, 2];
    });

    expect(kinds(result)).toEqual(['captain-ability-matching-character-ids-diverged']);
  });

  it('catches a complete-removal list that kept a character whose clause is no longer complete', () => {
    const result = audit((value) => {
      value.abilities[1].completeRemovalCharacterIds = [1, 2];
    });

    expect(kinds(result)).toEqual(['complete-removal-character-ids-diverged']);
  });

  it('catches a captain complete-removal list that diverged on its own', () => {
    const result = audit((value) => {
      value.abilities[1].captainAbilityCompleteRemovalCharacterIds = [2];
    });

    expect(kinds(result)).toContain('captain-ability-complete-removal-character-ids-diverged');
  });

  it('catches a captain turn group that diverged on its own', () => {
    const result = audit((value) => {
      value.abilities[1].captainAbilityTurnMatchingCharacterIds = [
        { minTurns: 2, characterIds: [1, 2] },
      ];
    });

    expect(kinds(result)).toContain('captain-ability-turn-matching-character-ids-diverged');
  });

  it('catches a scope list naming a character whose row carries no such scope', () => {
    const result = audit((value) => {
      value.abilities[1].effectTargetScopeMatchingCharacterIds[0].characterIds = [1, 2];
    });

    expect(kinds(result)).toEqual(['effect-target-scope-not-in-database']);
  });

  it('catches a scope turn group naming a character whose row carries no such scope', () => {
    const result = audit((value) => {
      value.abilities[1].effectTargetScopeMatchingCharacterIds[0].turnMatchingCharacterIds = [
        { minTurns: 2, characterIds: [1] },
      ];
    });

    expect(kinds(result)).toEqual(['effect-target-scope-not-in-database']);
  });

  it('catches a captain effect match the seed does not carry', () => {
    const result = audit((value) => {
      (value.abilities[1] as Record<string, unknown>).captainAbilityEffectMatches = [
        { characterId: 1, effectTargetScope: 'crew', slotTokens: [] },
      ];
    });

    expect(kinds(result)).toEqual(['captain-ability-effect-match-not-in-database']);
  });

  it('catches a key the catalogue never heard of', () => {
    const result = auditAbilityCatalogue({
      catalogue: { abilities: catalogue.abilities.slice(1) },
      index: indexBuilderAbilities(rows),
      characterIds: new Set([1, 2]),
      abilitiesByCharacter: mapAbilitiesByCharacter(rows),
    });

    expect(kinds(result)).toEqual(['ability-missing-from-catalogue']);
  });

  it('catches a catalogue key that claims characters no row has', () => {
    const result = auditAbilityCatalogue({
      catalogue: {
        abilities: [{ key: 'ghost_key', matchCount: 2, matchingCharacterIds: [1, 2] }],
      },
      index: indexBuilderAbilities(rows),
      characterIds: new Set([1, 2]),
      abilitiesByCharacter: mapAbilitiesByCharacter(rows),
    });

    expect(kinds(result)).toContain('ability-missing-from-database');
  });

  it('rejects a file that is not the catalogue at all', () => {
    const result = auditAbilityCatalogue({
      catalogue: { generatedAt: '2026-09-17T00:00:00.000Z' },
      index: new Map(),
      characterIds: new Set(),
      abilitiesByCharacter: new Map(),
    });

    expect(kinds(result)).toEqual(['catalogue-unreadable']);
  });
});

describe('check-ability-catalogue', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function withFixture(catalogueValue: unknown) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-ability-catalogue-'));

    temporaryDirectories.push(dir);

    const seedPath = path.join(dir, 'optc-seed.sql');
    const cataloguePath = path.join(dir, 'catalogue.json');
    const seed = [
      'CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
      'CREATE TABLE character_details (character_id INTEGER PRIMARY KEY, detail_json TEXT NOT NULL);',
      ...rows.map(
        (row) =>
          `INSERT INTO characters (id, name) VALUES (${row.characterId}, 'Character ${row.characterId}');`,
      ),
      ...rows.map(
        (row) =>
          `INSERT INTO character_details (character_id, detail_json) VALUES (${row.characterId}, '${JSON.stringify(
            { builderAbilities: row.builderAbilities },
          )}');`,
      ),
      '',
    ].join('\n');

    await writeFile(seedPath, seed, 'utf8');
    await writeFile(cataloguePath, JSON.stringify(catalogueValue), 'utf8');

    return { seedPath, cataloguePath };
  }

  it('reads the abilities back out of a real database', async () => {
    const SQL = await loadSqlJs();
    const { seedPath } = await withFixture(catalogue);
    const { readFile } = await import('node:fs/promises');
    const bytes = buildDatasetDatabaseBytes(SQL, await readFile(seedPath, 'utf8'));
    const seedRows = readSeedBuilderAbilities(bytes, SQL);

    expect(seedRows.rows).toHaveLength(2);
    expect(seedRows.characterIds).toEqual(new Set([1, 2]));
    expect(seedRows.rows[0].builderAbilities[0].key).toBe('special_damage');
  });

  it('passes on a catalogue that is the index of the seed beside it', async () => {
    const { seedPath, cataloguePath } = await withFixture(catalogue);
    const result = await checkAbilityCatalogue({ seedPath, cataloguePath });

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.indexedKeyCount).toBe(2);
    expect(formatAbilityCatalogueResult(result)).toContain('Status: passed');
  });

  it('fails when the catalogue beside the seed is stale', async () => {
    const stale = JSON.parse(JSON.stringify(catalogue));

    stale.abilities[0].matchingCharacterIds = [1];
    stale.abilities[0].matchCount = 1;

    const { seedPath, cataloguePath } = await withFixture(stale);
    const result = await checkAbilityCatalogue({ seedPath, cataloguePath });

    expect(result.ok).toBe(false);
    expect(formatAbilityCatalogueResult(result)).toContain('matching-character-ids-diverged');
  });
});
