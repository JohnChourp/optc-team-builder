import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path, { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertFormRowsDropNothing,
  normalizeCharacterForms,
  normalizeCharacters,
} from './import-optc-data.mjs';
import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';
import { buildDatasetIntegrityReport } from './lib/dataset-integrity.mjs';
import {
  buildFormProvenance,
  buildProvenance,
  extractShippedColumnsByTable,
  findUnshippedFormFields,
} from './lib/dataset-provenance.mjs';
import { applyManualCharacterOverlay } from './lib/manual-character-apply.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createSqlSeed,
  createUnresolvedCatalog,
  writeGeneratedDatasetFiles,
} from './lib/optc-dataset.mjs';
import {
  FORM_DROPPED_FIELDS,
  FORM_TABLE,
  FORM_UPSTREAM_SOURCES,
  UPSTREAM_UNIT_ROW_FIELDS,
} from './lib/optc-upstream-forms.mjs';

/*
 * 869f63gv6. A dual or VS unit's forms were read for their type alone, and every other field was
 * dropped without a record. The importer now keeps them as `character_forms` rows, and the fields a
 * form drops are declared, generated into the provenance record, and checked to be empty.
 */

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

/** An upstream units.js row, in upstream's object shape. */
function row(id: string, fields: Record<string, unknown>) {
  return {
    id,
    name: null,
    type: null,
    class: null,
    stars: null,
    cost: null,
    combo: null,
    sockets: null,
    maxLevel: null,
    maxEXP: null,
    minHP: null,
    minATK: null,
    minRCV: null,
    maxHP: null,
    maxATK: null,
    maxRCV: null,
    growth: null,
    ...fields,
  };
}

/** #1983 as upstream carries it on 2026-09-24: the unit, then its two forms. */
function smokerAndTashigi() {
  return {
    '1983': row('1983', {
      name: 'Smoker & Tashigi - Straw Hat Pursuer',
      class: ['Striker', 'Slasher'],
      stars: '4',
      cost: 15,
      combo: 4,
      sockets: 4,
      maxLevel: 99,
      maxEXP: 2000000,
      minHP: 264,
      minATK: 138,
      minRCV: 30,
      maxHP: 1858,
      maxATK: 1421,
      maxRCV: 325,
    }),
    '1983-1': row('1983-1', {
      name: 'Smoker',
      type: 'INT',
      class: ['Striker', 'Driven'],
      combo: 4,
      minHP: 194,
      minATK: 98,
      minRCV: 15,
      maxHP: 1828,
      maxATK: 1348,
      maxRCV: 62,
    }),
    '1983-2': row('1983-2', {
      name: 'Tashigi',
      type: 'PSY',
      class: ['Slasher', 'Cerebral'],
      combo: 6,
      minHP: 188,
      minATK: 89,
      minRCV: 19,
      maxHP: 1704,
      maxATK: 1028,
      maxRCV: 324,
    }),
    '1984': row('1984', {
      name: 'Monkey D. Luffy',
      type: 'QCK',
      class: 'Fighter',
      stars: '5',
      cost: 30,
      combo: 4,
    }),
  };
}

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('normalizeCharacterForms', () => {
  it("keeps each form's name, type, classes, combo and stats, in key order", () => {
    const forms = normalizeCharacterForms(smokerAndTashigi());

    expect([...forms.keys()]).toEqual([1983]);
    expect(forms.get(1983)).toEqual([
      {
        key: '1',
        name: 'Smoker',
        type: 'INT',
        classes: ['Striker', 'Driven'],
        combo: 4,
        minHp: 194,
        minAtk: 98,
        minRcv: 15,
        maxHp: 1828,
        maxAtk: 1348,
        maxRcv: 62,
      },
      {
        key: '2',
        name: 'Tashigi',
        type: 'PSY',
        classes: ['Slasher', 'Cerebral'],
        combo: 6,
        minHp: 188,
        minAtk: 89,
        minRcv: 19,
        maxHp: 1704,
        maxAtk: 1028,
        maxRcv: 324,
      },
    ]);
  });

  it('sorts form keys as numbers, so a tenth form never lands before the second', () => {
    const units = {
      '7': row('7', { name: 'Unit' }),
      '7-10': row('7-10', { name: 'Ten', type: 'STR' }),
      '7-2': row('7-2', { name: 'Two', type: 'DEX' }),
    };

    expect(normalizeCharacterForms(units).get(7)?.map((form: { key: string }) => form.key)).toEqual([
      '2',
      '10',
    ]);
  });

  it('reads nothing from the legacy array format, which has no forms', () => {
    expect(normalizeCharacterForms([['Luffy', 'STR', ['Fighter']]]).size).toBe(0);
    expect(normalizeCharacterForms(null).size).toBe(0);
  });
});

describe('assertFormRowsDropNothing', () => {
  it('refuses a form row that carries a value the import would drop, naming it', () => {
    const units = smokerAndTashigi();

    units['1983-2'].stars = '6';
    units['1983-1'].growth = 1.5;

    expect(() => assertFormRowsDropNothing(units)).toThrow(/stars in 1 \(first 1983-2\)/u);
    expect(() => assertFormRowsDropNothing(units)).toThrow(/growth in 1 \(first 1983-1\)/u);
  });

  it('passes the rows upstream really has, where every dropped field is empty', () => {
    expect(() => assertFormRowsDropNothing(smokerAndTashigi())).not.toThrow();
  });

  it('counts a zero as a value, and a blank as nothing', () => {
    const units = smokerAndTashigi();

    units['1983-1'].sockets = 0;
    units['1983-2'].stars = '  ';

    expect(() => assertFormRowsDropNothing(units)).toThrow(/sockets in 1/u);
    expect(() => assertFormRowsDropNothing(units)).not.toThrow(/stars/u);
  });

  it('is the import\'s check only: normalizing units for the release check still tolerates new shapes', () => {
    const units = smokerAndTashigi();

    units['1983-2'].stars = '6+';

    expect(normalizeCharacters(units, {}, [], new Map()).map((unit: { id: number }) => unit.id)).toEqual([
      1983, 1984,
    ]);
  });

});

describe('normalizeCharacters', () => {
  it("attaches the forms to their unit and leaves the unit's own classes alone", () => {
    const characters = normalizeCharacters(smokerAndTashigi(), {}, [], new Map());
    const dual = characters.find((character: { id: number }) => character.id === 1983);
    const single = characters.find((character: { id: number }) => character.id === 1984);

    expect(characters.map((character: { id: number }) => character.id)).toEqual([1983, 1984]);
    expect(dual?.classes).toEqual(['Striker', 'Slasher']);
    expect(dual?.type).toBe('INT,PSY');
    expect(dual?.forms.map((form: { name: string }) => form.name)).toEqual(['Smoker', 'Tashigi']);
    expect(single?.forms).toEqual([]);
  });
});

describe('the declaration of what a form keeps and drops', () => {
  it('drops exactly the row fields it does not keep - computed, never typed', () => {
    expect(FORM_DROPPED_FIELDS).toEqual(['stars', 'cost', 'sockets', 'maxLevel', 'maxEXP', 'growth']);

    const kept = Object.values(FORM_UPSTREAM_SOURCES).map((source) => source.upstream);

    expect([...kept, ...FORM_DROPPED_FIELDS].sort()).toEqual([...UPSTREAM_UNIT_ROW_FIELDS].sort());
  });

  it('declares only fields the importer really writes onto a form', () => {
    const [form] = normalizeCharacterForms(smokerAndTashigi()).get(1983) ?? [];

    expect(Object.keys(form)).toEqual(['key', ...Object.keys(FORM_UPSTREAM_SOURCES)]);
  });

  it('reads each kept field from the upstream field it names', () => {
    /* Each upstream field gets a value no other field has, so a crossed wire cannot pass. */
    const units = {
      '1': row('1', { name: 'Unit' }),
      '1-1': row('1-1', {
        name: 'Form',
        type: 'DEX',
        class: ['Shooter'],
        combo: 11,
        minHP: 12,
        minATK: 13,
        minRCV: 14,
        maxHP: 15,
        maxATK: 16,
        maxRCV: 17,
      }),
    };

    expect(normalizeCharacterForms(units).get(1)?.[0]).toMatchObject({
      name: 'Form',
      type: 'DEX',
      classes: ['Shooter'],
      combo: 11,
      minHp: 12,
      minAtk: 13,
      minRcv: 14,
      maxHp: 15,
      maxAtk: 16,
      maxRcv: 17,
    });
  });

  it('names only columns the seed really writes, and the seed writes no column it does not name', () => {
    const columns = extractShippedColumnsByTable(readSource('scripts/lib/optc-dataset.mjs')).get(
      FORM_TABLE,
    );

    expect(columns).toEqual([
      'character_id',
      'form_key',
      ...Object.values(FORM_UPSTREAM_SOURCES).map((source) => source.column),
    ]);
  });
});

describe('the provenance record', () => {
  it('lists every kept field with its column, and every dropped field with its reason', () => {
    const provenance = buildProvenance({
      importerSource: readSource('scripts/import-optc-data.mjs'),
      datasetSource: readSource('scripts/lib/optc-dataset.mjs'),
      generatedAt: '2026-09-25T00:00:00.000Z',
    });

    expect(provenance.forms.table).toBe('character_forms');
    expect(provenance.forms.kept).toContainEqual({
      importerField: 'classes',
      source: 'units.js <id>-<n> .class',
      column: 'classes_json',
    });
    expect(provenance.forms.dropped.map((field: { source: string }) => field.source)).toEqual(
      FORM_DROPPED_FIELDS.map((field) => `units.js <id>-<n> .${field}`),
    );
    expect(findUnshippedFormFields(provenance)).toEqual([]);
  });

  it('refuses a kept field whose column the seed never writes', () => {
    const forms = buildFormProvenance(new Map([[FORM_TABLE, ['character_id', 'form_key', 'name']]]));

    expect(findUnshippedFormFields({ forms })).toContain('classes');
    expect(findUnshippedFormFields({ forms })).not.toContain('name');
  });

  it('is what docs/dataset-provenance.json records', () => {
    const committed = JSON.parse(readSource('docs/dataset-provenance.json'));

    expect(committed.forms).toEqual(
      buildFormProvenance(extractShippedColumnsByTable(readSource('scripts/lib/optc-dataset.mjs'))),
    );
  });
});

describe('the integrity check', () => {
  it('refuses a form with no name, two types, or a repeated key', () => {
    const [character] = normalizeCharacters(smokerAndTashigi(), {}, [], new Map());
    const broken = {
      ...character,
      forms: [
        { ...character.forms[0], type: 'INT,PSY' },
        { ...character.forms[1], key: '1', name: '' },
      ],
    };
    const errors = buildDatasetIntegrityReport({
      characters: [broken],
      ships: [],
      manifest: buildManifest([broken], [], '36', [], '2026-09-25T00:00:00.000Z'),
      autoBuilderAbilityCatalog: buildAutoBuilderAbilityCatalog('2026-09-25T00:00:00.000Z', '36', []),
    }).errors;

    expect(errors).toEqual([
      'character 1983 form 1 has type "INT,PSY", not one type.',
      'character 1983 form 1 has a missing or repeated key.',
      'character 1983 form 1 is missing a name.',
    ]);
  });
});

describe('the seed round trip', () => {
  /*
   * The seed is written twice on an import, the second time from characters read back out of it by
   * the manual-character overlay - which drops anything it does not name (869f1935z).
   */
  it('keeps every form through the manual-character overlay', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'optc-forms-'));
    tempDirs.push(rootDir);
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
    const sourceImageDir = path.join(scriptsDataDir, 'character-images');
    const characters = normalizeCharacters(smokerAndTashigi(), {}, [], new Map());
    const generatedAt = '2026-09-25T00:00:00.000Z';
    const manifest = buildManifest(characters, [], '36', [], generatedAt);

    await mkdir(dataDir, { recursive: true });
    await mkdir(sourceImageDir, { recursive: true });
    await writeGeneratedDatasetFiles(
      dataDir,
      manifest,
      createSqlSeed(characters, [], manifest),
      createUnresolvedCatalog(characters, [], '36', generatedAt),
      buildAutoBuilderAbilityCatalog(generatedAt, '36', []),
      buildPreviewPayload(generatedAt, characters, []),
    );
    await writeFile(path.join(scriptsDataDir, 'builder-ability-corrections.json'), '{}');
    await writeFile(
      path.join(scriptsDataDir, 'manual-characters.json'),
      JSON.stringify({
        900000: {
          id: 900000,
          name: 'Manual Smoker',
          type: 'INT',
          classes: ['Striker'],
          stars: 6,
          cost: 55,
          combo: 4,
          minHp: 1000,
          minAtk: 500,
          minRcv: 100,
          maxHp: 3000,
          maxAtk: 1500,
          maxRcv: 300,
          growth: 0,
          image: { file: '900000.png' },
          detail: { characterId: 900000 },
        },
      }),
    );
    await writeFile(path.join(sourceImageDir, '900000.png'), 'manual-png');

    const result = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      overlayPath: path.join(scriptsDataDir, 'manual-characters.json'),
      sourceImageDir,
      exactImagesDir: path.join(rootDir, 'public', 'assets', 'exact-character-images'),
      logger: null,
    });
    const SQL = await loadSqlJs();
    const database = new SQL.Database(
      buildDatasetDatabaseBytes(SQL, await readFile(path.join(dataDir, 'optc-seed.sql'), 'utf8')),
    );
    const [rows] = database.exec(
      'SELECT character_id, form_key, name, type, classes_json, combo, max_atk FROM character_forms ORDER BY character_id, form_key',
    );

    database.close();

    expect(result.written).toBe(true);
    expect(rows?.values).toEqual([
      [1983, '1', 'Smoker', 'INT', '["Striker","Driven"]', 4, 1348],
      [1983, '2', 'Tashigi', 'PSY', '["Slasher","Cerebral"]', 6, 1028],
    ]);
  });
});

describe('the shipped seed', () => {
  const seed = readSource('public/assets/data/optc-seed.sql');

  it('carries #1983 as the unit and its two forms, and every form beside its unit', async () => {
    const SQL = await loadSqlJs();
    const database = new SQL.Database(buildDatasetDatabaseBytes(SQL, seed));

    try {
      const [unit] = database.exec('SELECT type, classes_json FROM characters WHERE id = 1983');
      const [forms] = database.exec(
        'SELECT form_key, name, type, classes_json FROM character_forms WHERE character_id = 1983 ORDER BY form_key',
      );
      const [orphans] = database.exec(
        'SELECT COUNT(*) FROM character_forms f LEFT JOIN characters c ON c.id = f.character_id WHERE c.id IS NULL',
      );
      const [typeRows] = database.exec(
        'SELECT c.type, f.type FROM character_forms f JOIN characters c ON c.id = f.character_id',
      );

      expect(unit?.values).toEqual([['INT,PSY', '["Striker","Slasher"]']]);
      expect(forms?.values).toEqual([
        ['1', 'Smoker', 'INT', '["Striker","Driven"]'],
        ['2', 'Tashigi', 'PSY', '["Slasher","Cerebral"]'],
      ]);
      expect(orphans?.values).toEqual([[0]]);
      /* The unit's comma-joined type has always been its forms' types; the two records agree. */
      expect((typeRows?.values ?? []).length).toBeGreaterThan(0);

      for (const [unitType, formType] of typeRows?.values ?? []) {
        expect(String(unitType).split(','), `${unitType} / ${formType}`).toContain(String(formType));
      }
    } finally {
      database.close();
    }
  });
});
