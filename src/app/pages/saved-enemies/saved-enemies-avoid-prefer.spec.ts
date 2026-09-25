import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { type SavedEnemy, type SavedTeam } from '../../core/models/optc.models';
import { DriveSyncStateService } from '../../core/services/drive-sync-state.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  buildDriveSyncReviewDraft,
  buildReviewedAllDataPayload,
} from '../drive-sync/drive-sync-review.utils';
import {
  buildAllDataTransferPayload,
  type AllDataTransferPayload,
} from '../settings/all-data-transfer.utils';
import {
  buildSavedEnemiesTransferPayload,
  parseSavedEnemiesImportPayload,
  sanitizeSavedEnemiesImportPayload,
} from './saved-enemies-transfer.utils';

/**
 * 869f63gma. A Saved Enemy can now say what it punishes (avoid a class or type) and what it is
 * weak to (prefer one). These fields travel through every place an enemy does - storage, the Saved
 * Enemies file, the single-enemy file, the all-data backup, the Drive sync review - and the Saved
 * Enemies editor. Each hop is pinned here, and so is the other half: an enemy WITHOUT a rule is
 * byte-identical to what it was before, so an older Drive backup does not list it as changed.
 *
 * Its own file, with the page's harness preamble copied rather than shared.
 */

type SavedEnemiesPageClass = typeof import('./saved-enemies.page').SavedEnemiesPage;
let SavedEnemiesPage: SavedEnemiesPageClass;

vi.mock('@ionic/angular', () => ({
  IonCheckbox: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

const AT = '2026-09-24T10:00:00.000Z';
const RULE_KEYS = ['avoidedTypes', 'avoidedClasses', 'avoidMode', 'preferredTypes', 'preferredClasses'];

class MemoryPreferences {
  public readonly store = new Map<string, string>();

  public constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.store.set(key, JSON.stringify(value));
    }
  }

  public async get({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: this.store.get(key) ?? null };
  }

  public async set({ key, value }: { key: string; value: string }): Promise<void> {
    this.store.set(key, value);
  }
}

function enemy(overrides: Partial<SavedEnemy> = {}): SavedEnemy {
  return {
    id: 'enemy-blackbeard',
    name: 'Blackbeard',
    notes: '',
    rawEnemyText: '',
    imageDataUrl: null,
    selectedTypes: ['STR', 'DEX'],
    selectedClasses: ['Fighter', 'Driven'],
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function userStateOver(preferences: MemoryPreferences): UserStateService {
  const i18n = { translate: (key: string) => key };

  return new UserStateService(
    i18n as never,
    preferences as never,
    new DriveSyncStateService(preferences as never),
  );
}

async function loadStored(stored: SavedEnemy): Promise<SavedEnemy> {
  const userState = userStateOver(new MemoryPreferences({ savedEnemies: [stored] }));

  await userState.readySavedEnemies();

  return userState.savedEnemies()[0]!;
}

function importFile(content: unknown): SavedEnemy[] {
  return sanitizeSavedEnemiesImportPayload(parseSavedEnemiesImportPayload(JSON.stringify(content)), {
    now: AT,
    untitledEnemyName: 'Untitled enemy',
  }).enemies;
}

describe('a Saved Enemy keeps its avoid and prefer rules in storage (869f63gma)', () => {
  it('normalises the rules it loads: known types only, classes as written, a mode', async () => {
    const loaded = await loadStored(
      enemy({
        avoidedTypes: ['qck', 'XYZ'],
        avoidedClasses: [' Driven ', 'driven'],
        preferredClasses: ['Fighter'],
      }),
    );

    expect(loaded).toMatchObject({
      avoidedTypes: ['QCK'],
      avoidedClasses: ['Driven'],
      avoidMode: 'hard',
      preferredClasses: ['Fighter'],
    });
    expect(loaded.preferredTypes).toBeUndefined();
  });

  it('stores an enemy without a rule with none of the five keys, as it always was', async () => {
    const loaded = await loadStored(enemy());

    expect(Object.keys(loaded).filter((key) => RULE_KEYS.includes(key))).toEqual([]);
  });

  it('writes what the editor saved, and reads it back after a restart', async () => {
    const preferences = new MemoryPreferences();
    const userState = userStateOver(preferences);

    await userState.saveEnemy({
      name: 'Blackbeard',
      notes: '',
      rawEnemyText: '',
      imageDataUrl: null,
      selectedTypes: ['STR'],
      selectedClasses: ['Driven'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
      preferredTypes: ['PSY'],
    });

    const restarted = userStateOver(preferences);

    await restarted.readySavedEnemies();

    expect(restarted.savedEnemies()[0]).toMatchObject({
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
      preferredTypes: ['PSY'],
    });
  });
});

describe('the rules survive every file an enemy travels in (869f63gma)', () => {
  const withRules = enemy({
    avoidedTypes: ['QCK'],
    avoidedClasses: ['Driven'],
    avoidMode: 'hard',
    preferredClasses: ['Slasher'],
  });

  it('round-trips the Saved Enemies export and import', async () => {
    const [imported] = importFile(buildSavedEnemiesTransferPayload([withRules], AT));
    const preferences = new MemoryPreferences();
    const userState = userStateOver(preferences);

    await userState.mergeImportedEnemies([imported!]);

    for (const stored of [imported, userState.savedEnemies()[0]]) {
      expect(stored).toMatchObject({
        avoidedTypes: ['QCK'],
        avoidedClasses: ['Driven'],
        avoidMode: 'hard',
        preferredClasses: ['Slasher'],
      });
    }
  });

  it('imports a file without the rules without inventing any', () => {
    const [imported] = importFile(buildSavedEnemiesTransferPayload([enemy()], AT));

    expect(Object.keys(imported!).filter((key) => RULE_KEYS.includes(key))).toEqual([]);
  });

  it('reads the rules off a single-enemy file too', () => {
    const [imported] = importFile({
      schemaVersion: 1,
      source: 'optc-enemy-skill',
      exportType: 'enemy',
      enemy: { ...withRules, avoidMode: 'soft', avoidedClasses: ['driven', 'Driven'] },
    });

    expect(imported).toMatchObject({
      avoidedTypes: ['QCK'],
      avoidedClasses: ['driven'],
      avoidMode: 'soft',
      preferredClasses: ['Slasher'],
    });
  });

  it('copies the rules into the all-data backup rather than sharing them', () => {
    const exported = buildSavedEnemiesTransferPayload([withRules], AT);
    const backedUp = buildAllDataTransferPayload({ savedEnemies: exported }, AT).savedEnemies!
      .enemies[0]!;

    expect(backedUp).toMatchObject({ avoidedClasses: ['Driven'], preferredClasses: ['Slasher'] });
    expect(backedUp.avoidedClasses).not.toBe(exported.enemies[0]!.avoidedClasses);
    expect(backedUp.preferredClasses).not.toBe(exported.enemies[0]!.preferredClasses);
  });

  it('carries the rules through a reviewed Drive sync, and an enemy without them stays unchanged', async () => {
    // What this device holds now, and a backup of the same enemy written before the rules existed:
    // the stored shape with none of the five keys.
    const oldEnemy = await loadStored(enemy({ id: 'enemy-old', name: 'Old boss' }));
    const backedUpBeforeTheRules = JSON.parse(JSON.stringify(oldEnemy)) as Record<string, unknown>;

    for (const key of RULE_KEYS) {
      delete backedUpBeforeTheRules[key];
    }

    const device = buildAllDataTransferPayload(
      { savedEnemies: buildSavedEnemiesTransferPayload([oldEnemy, withRules], AT) },
      AT,
    );
    const drive: AllDataTransferPayload = {
      schemaVersion: 1,
      source: 'all-data',
      exportedAt: AT,
      savedEnemies: buildSavedEnemiesTransferPayload([backedUpBeforeTheRules as never], AT),
    };
    const draft = buildDriveSyncReviewDraft(device, drive, 'merge-and-upload');
    const rows = draft.sections.find((section) => section.key === 'savedEnemies')!.rows;

    expect(rows.find((row) => row.key === 'enemy-old')?.status).toBe('kept');

    const reviewed = buildReviewedAllDataPayload(draft, AT);

    expect(
      reviewed.savedEnemies?.enemies.find((stored) => stored.id === withRules.id),
    ).toMatchObject({ avoidedClasses: ['Driven'], avoidMode: 'hard', preferredClasses: ['Slasher'] });
  });
});

function i18nStub() {
  const translations = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/i18n/saved-enemies/en.json'), 'utf8'),
  ) as Record<string, unknown>;

  return {
    translate: (key: string, params?: Record<string, unknown>) => {
      const value = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], translations);

      return typeof value === 'string'
        ? value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(params?.[name] ?? ''))
        : key;
    },
  };
}

function createPage() {
  const saveEnemy = vi.fn().mockResolvedValue(undefined);
  const userState = {
    savedEnemies: signal<SavedEnemy[]>([]),
    savedTeams: signal<SavedTeam[]>([]),
    saveEnemy,
  };
  const page = new SavedEnemiesPage(userState as never, {} as never, i18nStub() as never);

  return { page, saveEnemy };
}

describe('the Saved Enemies editor enters the rules (869f63gma)', () => {
  beforeAll(async () => {
    SavedEnemiesPage = (await import('./saved-enemies.page')).SavedEnemiesPage;
  });

  it('opens an enemy with its rules, and saves what the reader changed', async () => {
    const { page, saveEnemy } = createPage();

    page.openEditModal(enemy({ avoidedClasses: ['Driven'], preferredTypes: ['PSY'] }));

    expect(page.avoidPreferRules()).toMatchObject({
      avoidedClasses: ['Driven'],
      avoidMode: 'hard',
      preferredTypes: ['PSY'],
    });

    page.onAvoidPreferValuesChange('avoidedTypes', { detail: { value: ['qck', 'INT'] } } as never);
    page.onAvoidModeChange({ detail: { value: 'soft' } } as never);
    page.onAvoidPreferValuesChange('preferredTypes', { detail: { value: [] } } as never);
    await page.saveEnemy();

    expect(saveEnemy).toHaveBeenCalledTimes(1);
    const saved = saveEnemy.mock.calls[0]![0] as Partial<SavedEnemy>;

    expect(saved).toMatchObject({
      avoidedTypes: ['QCK', 'INT'],
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
    });
    expect('preferredTypes' in saved).toBe(false);
  });

  it('starts a new enemy with no rule, and saves none', async () => {
    const { page, saveEnemy } = createPage();

    page.openCreateModal();
    page.selectedClasses.set(['Fighter']);
    await page.saveEnemy();

    const saved = saveEnemy.mock.calls[0]![0] as Record<string, unknown>;

    expect(Object.keys(saved).filter((key) => RULE_KEYS.includes(key))).toEqual([]);
  });

  it('words the rules on the card, and shows nothing for an enemy without them', () => {
    const { page } = createPage();

    expect(
      page.avoidPreferChipLabels(
        enemy({ avoidedClasses: ['Driven'], avoidMode: 'soft', preferredClasses: ['Slasher'] }),
      ),
    ).toEqual(['Avoid Driven', 'Rank them lower', 'Prefer Slasher']);
    expect(page.avoidPreferChipLabels(enemy())).toBeNull();
  });
});
