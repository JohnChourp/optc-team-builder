import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ActivatedRoute, type Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterDetailRecord, type DatasetManifest } from '../../core/models/optc.models';
import { type AppI18nService } from '../../core/services/app-i18n.service';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { type PreferencesAdapterService } from '../../core/services/preferences-adapter.service';
import {
  buildCharacterOverridesTransferPayload,
  parseCharacterOverridesImportPayload,
  sanitizeCharacterOverridesImportPayload,
} from '../character-detail/character-overrides-transfer.utils';
import { CharacterEditPage } from './character-edit.page';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gqd. Edit -> Save with nothing touched used to change the character it saved: the
 * override replaced the whole detail with the fields the editor knows, so the Captain tiers of
 * 4,007 characters vanished and the tier filter stopped filtering; a "6+" rarity came back as "6";
 * 189 Captain boosts were re-read by an older parser; a plain-text Captain Shift was nulled; and
 * the 18 VS units, which have no classes, could not be saved at all. Export -> import lost the same.
 *
 * This drives the REAL path - the page's own seed and save, the overrides service, and the
 * repository's read-back - over shipped characters picked by the shape that broke, so a release
 * that renumbers them still tests the same thing and a release that removes the shape says so.
 */
describe('Character Edit: a save that changes nothing changes nothing', () => {
  const seed = readSeedRows();
  const samples = [
    {
      shape: 'a trained rarity label, Captain tiers and a Captain boost',
      id: findSeedId(seed, (row, detail) =>
        String(row['stars_label']).endsWith('+') &&
        countCaptainTiers(detail) > 0 &&
        Number(row['captain_atk_boost']) > 0 &&
        Number(row['captain_hp_boost']) > 0,
      ),
    },
    {
      shape: 'a VS unit, which has no classes',
      id: findSeedId(seed, (row) => row['classes_json'] === '[]'),
    },
    {
      shape: 'a Captain Shift written as plain text',
      id: findSeedId(seed, (_row, detail) => typeof detail['swapData'] === 'string'),
    },
  ];

  it.each(samples)('saves $shape back exactly as it was', async ({ id }) => {
    const device = createDevice(seed);
    const page = createPage(device, id);

    await page.ngOnInit();
    const shown = page.character();

    expect(shown?.id).toBe(id);
    await page.save();

    // Not vacuous: the save really happened, and the next read really applies it.
    expect(device.overrides.getOverrideByCharacterId(id)).not.toBeNull();
    expect(device.preferences.set).toHaveBeenCalledOnce();
    expect(await device.repository.getCharacterById(id)).toEqual(shown);
  });

  it('keeps the tiers, the label and the boosts of a real Captain through the save', async () => {
    const [captain] = samples;
    const device = createDevice(seed);
    const page = createPage(device, captain!.id);

    await page.ngOnInit();
    const shown = page.character()!;
    await page.save();
    const saved = (await device.repository.getCharacterById(captain!.id))!;

    // Named, so a failure reads as the defect it is rather than as a large object diff.
    expect(countCaptainTiers(saved.detail)).toBe(countCaptainTiers(shown.detail));
    expect(countCaptainTiers(saved.detail)).toBeGreaterThan(0);
    expect(saved.starsLabel).toBe(shown.starsLabel);
    expect(saved.captainAtkBoost).toBe(shown.captainAtkBoost);
    expect(saved.captainHpBoost).toBe(shown.captainHpBoost);
  });

  it('keeps the boost the dataset shipped while the captain text is the one it shipped', async () => {
    /*
     * The shared grammar reads today's dataset exactly, so this row's boost is nudged to a number
     * the text alone would never give: only a save that keeps the dataset's own value survives it,
     * which is what stands between a player's untouched edit and the next grammar change.
     */
    const [captain] = samples;
    const row = seed.get(captain!.id)!;
    const nudged = new Map(seed).set(captain!.id, {
      ...row,
      captain_atk_boost: Number(row['captain_atk_boost']) + 0.25,
    });
    const device = createDevice(nudged);
    const page = createPage(device, captain!.id);

    await page.ngOnInit();
    const shown = page.character()!;
    await page.save();

    expect(shown.captainAtkBoost).toBe(Number(row['captain_atk_boost']) + 0.25);
    expect((await device.repository.getCharacterById(captain!.id))!.captainAtkBoost).toBe(
      shown.captainAtkBoost,
    );
  });

  it('drops the tiers and re-reads the boosts once the captain text itself is edited', async () => {
    const [captain] = samples;
    const device = createDevice(seed);
    const page = createPage(device, captain!.id);

    await page.ngOnInit();
    page.onAdvancedJsonChange(
      new CustomEvent('ionInput', {
        detail: {
          value: JSON.stringify({
            ...JSON.parse(page.advancedJsonValue()),
            detail: {
              ...JSON.parse(page.advancedJsonValue()).detail,
              captainAbility: 'Boosts ATK of all characters by 2x',
              captainAbilityVariants: [],
            },
          }),
        },
      }),
    );
    await page.save();
    const edited = (await device.repository.getCharacterById(captain!.id))!;

    expect(edited.detail.captainAbilityCoverage).toBeUndefined();
    expect(edited.captainAtkBoost).toBe(2);
    expect(edited.captainHpBoost).toBe(0);
  });

  it('exports and imports every saved override without losing a field', async () => {
    const device = createDevice(seed);
    const shownById = new Map<number, CharacterDetailRecord | null>();

    for (const { id } of samples) {
      const page = createPage(device, id);

      await page.ngOnInit();
      shownById.set(id, page.character());
      await page.save();
    }

    const imported = sanitizeCharacterOverridesImportPayload(
      parseCharacterOverridesImportPayload(
        JSON.stringify(buildCharacterOverridesTransferPayload(device.overrides.overrides())),
      ),
    );
    const otherDevice = createDevice(seed);

    await otherDevice.overrides.mergeImportedOverrides(imported.overrides);

    expect(imported.invalidOverrideCount).toBe(0);
    expect(imported.overrides).toHaveLength(samples.length);

    for (const { id } of samples) {
      expect(await otherDevice.repository.getCharacterById(id)).toEqual(shownById.get(id));
    }
  });
});

type SeedValue = string | number | null;
type SeedRow = Record<string, SeedValue>;

interface Device {
  preferences: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  overrides: CharacterOverridesService;
  repository: OptcRepositoryService;
}

/** Every `characters` row of the committed seed, with its `detail_json`, keyed by id. */
function readSeedRows(): Map<number, SeedRow> {
  const sql = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const detailJsonById = new Map<number, string>();
  const rows = new Map<number, SeedRow>();

  for (const match of sql.matchAll(
    /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu,
  )) {
    detailJsonById.set(Number(match[1]), match[2]!.replace(/''/gu, "'"));
  }

  // The importer writes one value per line, so a line is a value; a count that disagrees with
  // the column list means the format moved, and says so rather than reading a shifted row.
  for (const match of sql.matchAll(
    /INSERT INTO characters \(\s*([^)]*?)\s*\) VALUES \(\n([\s\S]*?)\n\s*\);/gu,
  )) {
    const columns = match[1]!.split(',').map((column) => column.trim());
    const values = match[2]!.split('\n').map((line) => parseSeedValue(line.trim().replace(/,$/u, '')));

    if (values.length !== columns.length) {
      throw new Error(`Seed row with ${values.length} values for ${columns.length} columns.`);
    }

    const row: SeedRow = Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null]));
    const id = Number(row['id']);

    rows.set(id, { ...row, detail_json: detailJsonById.get(id) ?? null });
  }

  return rows;
}

function parseSeedValue(token: string): SeedValue {
  if (token === 'NULL') {
    return null;
  }

  return token.startsWith("'") ? token.slice(1, -1).replace(/''/gu, "'") : Number(token);
}

function findSeedId(
  seed: ReadonlyMap<number, SeedRow>,
  matches: (row: SeedRow, detail: Record<string, unknown>) => boolean,
): number {
  for (const [id, row] of seed) {
    if (matches(row, JSON.parse(String(row['detail_json'] ?? '{}')) as Record<string, unknown>)) {
      return id;
    }
  }

  throw new Error('The shipped dataset no longer has a character of this shape.');
}

function countCaptainTiers(detail: object): number {
  const coverage = (detail as { captainAbilityCoverage?: { entries?: Array<{ tiers?: unknown[] }> } })
    .captainAbilityCoverage;

  return (coverage?.entries ?? []).reduce((total, entry) => total + (entry.tiers?.length ?? 0), 0);
}

function createDevice(seed: ReadonlyMap<number, SeedRow>): Device {
  const preferences = {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const overrides = new CharacterOverridesService(preferences as unknown as PreferencesAdapterService);
  const repository = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;
  const manifest: DatasetManifest = {
    schemaVersion: 2,
    generatedAt: '2026-09-24T00:00:00.000Z',
    sourceVersion: 'test',
    characterCount: seed.size,
    detailCount: seed.size,
    shipCount: 0,
    rumbleCount: 0,
    availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    availableClasses: [],
    packs: [],
  };

  Object.assign(repository, {
    characterOverrides: overrides,
    userState: { activeRegionFilter: () => 'all' },
    getDatasetManifest: () => Promise.resolve(manifest),
    getAutoBuilderAbilityCatalog: () => Promise.reject(new Error('no catalog in this spec')),
    // Only the two queries this path makes; anything else is a path this spec does not model.
    selectAll: (query: string, params: Array<string | number> = []) => {
      if (query.includes('WHERE c.id = ?')) {
        const row = seed.get(Number(params[0]));

        return Promise.resolve(row ? [row] : []);
      }

      if (query.includes('FROM character_details') && query.includes('WHERE character_id IN')) {
        return Promise.resolve(
          params.map((id) => ({ character_id: id, detail_json: seed.get(Number(id))?.['detail_json'] ?? null })),
        );
      }

      return Promise.reject(new Error(`Unexpected query: ${query}`));
    },
  });

  return { preferences, overrides, repository };
}

function createPage(device: Device, characterId: number): CharacterEditPage {
  return new CharacterEditPage(
    { snapshot: { paramMap: { get: () => String(characterId) } } } as unknown as ActivatedRoute,
    { navigate: vi.fn().mockResolvedValue(true) } as unknown as Router,
    device.repository,
    device.overrides,
    { translate: (key: string) => key } as unknown as AppI18nService,
  );
}
