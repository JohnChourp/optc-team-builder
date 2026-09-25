import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AUTO_TEAM_BUILDER_TYPES,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoBuildInput,
  type AutoBuildResult,
} from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord, type SavedEnemy } from '../../core/models/optc.models';
import type { AutoTeamBuilderPage } from './auto-team-builder.page';
import { buildAutoTeamBuilderStateFromSavedEnemy } from './auto-team-builder-enemy-preset.utils';
import {
  AutoTeamSelectionImportError,
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
} from './auto-team-builder-export.utils';

/**
 * 869f63gma, the Auto Team Builder half. A loaded Saved Enemy's avoid and prefer rules reach the
 * page, are said out loud before a build, go out with every build, survive a preset file, and come
 * back in the Final team report as one row - Passed, Relaxed or Not applicable, never a number.
 *
 * Its own file, with a trimmed copy of the page suite's harness rather than a shared one.
 */

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonCheckbox: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSegment: class {},
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
vi.mock('@ionic/angular/ion-segment-button', () => ({ IonSegmentButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

type AutoTeamBuilderPageClass = typeof import('./auto-team-builder.page').AutoTeamBuilderPage;
let AutoTeamBuilderPageClass: AutoTeamBuilderPageClass;

const AT = '2026-09-24T10:00:00.000Z';

function enemy(overrides: Partial<SavedEnemy> = {}): SavedEnemy {
  return {
    id: 'enemy-blackbeard',
    name: 'Blackbeard',
    notes: '',
    rawEnemyText: '',
    imageDataUrl: null,
    selectedTypes: ['DEX', 'PSY'],
    selectedClasses: ['Fighter', 'Slasher'],
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function character(id: number, classes: string[], type = 'DEX'): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    isIncomplete: false,
    type,
    classes,
    primaryClass: classes[0] ?? 'Fighter',
    secondaryClass: classes[1] ?? null,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1.3,
    captainAtkBoost: 5,
    captainAverageBoost: 3.15,
    stats: { min: { hp: 1000, atk: 500, rcv: 100 }, max: { hp: 4200, atk: 1800, rcv: 320 }, growth: 2.4 },
    regionArtwork: { exactLocal: true, thumbnailGlobal: true, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  } as unknown as CharacterDetailRecord;
}

/** A finished result: the team below, built for `requested`, relaxing only what `relaxedAvoidedValues` says. */
function result(
  requested: Partial<AutoBuildInput>,
  options: { relaxedAvoidedValues?: string[]; manualSubIds?: number[] } = {},
): AutoBuildResult {
  const manualSlots = createEmptyAutoBuildManualSlots().map((slot) =>
    slot.role === 'sub1' && options.manualSubIds ? { ...slot, characterIds: options.manualSubIds } : slot,
  );
  const input: AutoBuildInput = {
    types: [...AUTO_TEAM_BUILDER_TYPES],
    selectedClasses: [],
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    boostedCharacterIds: [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: false,
    minimumLeaderSuperEffectMatchingSlots: null,
    requireLeaderSuperSpecialCriteria: false,
    strictSuperSpecialCriteriaCoverage: false,
    requireSuperTandemCriteria: false,
    strictSuperTandemCriteriaCoverage: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    leaderBoostFilters: ['HP', 'ATK'],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    costRange: createEmptyAutoBuildCostRange(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    manualSlots,
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
    manualShipId: null,
    requireManualShip: false,
    excludedShipIds: [],
    candidateLimit: null,
    ...requested,
  };

  return {
    input,
    requestedInput: input,
    relaxation: {
      usedFallback: Boolean(options.relaxedAvoidedValues),
      droppedTypes: [],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
      ...(options.relaxedAvoidedValues ? { relaxedAvoidedValues: options.relaxedAvoidedValues } : {}),
    },
    shipSelection: null,
    candidateCount: 12,
    friendCaptainAlternatives: [],
    coverage: {
      leaderCriteria: {
        source: 'captainAbility',
        coverageMode: 'simpleBoostScope',
        captainLeaderId: 101,
        friendCaptainLeaderId: 102,
        leaderIds: [101, 102],
        leaderNames: ['Character 101', 'Character 102'],
        leaderBranchSelections: [],
        dualLeaderMode: 'intersection',
        derivedAllowedClasses: [],
        derivedAllowedTypes: [],
        derivedAllowedCharacterTags: [],
        dominantTypeRequirements: [],
        hasCostRestriction: false,
        maxAllowedCost: null,
        hasClassRestriction: false,
        hasTypeRestriction: false,
        hasCharacterTagRestriction: false,
        requiresDominantType: false,
        tagConditionSets: [],
        matchingSlots: 6,
        totalSlots: 6,
        allSlotsMatch: true,
        leaderTierCoverages: [],
        allLeaderTiersCovered: true,
      },
      abilityRequirements: { requested: [], matched: [], missing: [], matchesAll: true },
      requiredCharacterGroups: { requested: [], matched: [], missing: [], matchesAll: true },
      burst: [],
      consistency: [],
      utility: [],
      coveredSelectedClasses: [],
      coveredSelectedTypes: [],
      coveredSelectedCharacterTags: [],
      coveredSelectedCharacterNames: [],
      coversAllSelectedClasses: true,
      coversAllSelectedTypes: true,
      coversAllSelectedCharacterTags: true,
      coversAllSelectedCharacterNames: true,
      selectedClassMatches: 6,
      selectedTypeMatches: 6,
      selectedCharacterTagMatches: 0,
      selectedCharacterNameMatches: 0,
    },
    slots: [
      { role: 'captain', character: character(101, ['Fighter']), reasonChips: [] },
      { role: 'friendCaptain', character: character(102, ['Slasher']), reasonChips: [] },
      { role: 'sub', character: character(103, ['Driven', 'Fighter'], 'QCK'), reasonChips: [] },
      { role: 'sub', character: character(104, ['Shooter']), reasonChips: [] },
      { role: 'sub', character: character(105, ['Driven'], 'STR'), reasonChips: [] },
      { role: 'sub', character: character(106, ['Cerebral'], 'PSY'), reasonChips: [] },
    ],
  };
}

function loadJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as Record<string, unknown>;
}

function i18nStub() {
  const global = loadJson('public/i18n/en.json');
  const scoped = loadJson('public/i18n/auto-team-builder/en.json');

  return {
    activeLanguage: signal<'en' | 'el'>('en'),
    availableLanguages: [
      { id: 'en', label: 'English' },
      { id: 'el', label: 'Ελληνικά' },
    ] as const,
    preloadScope: vi.fn().mockResolvedValue(undefined),
    ready: vi.fn().mockResolvedValue(undefined),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    translate: (key: string, params?: Record<string, unknown>, scope?: string) => {
      const value = key
        .split('.')
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          scope ? scoped : global,
        );

      return typeof value === 'string'
        ? value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(params?.[name] ?? ''))
        : key;
    },
  };
}

function createPage(savedEnemy: SavedEnemy | null = null) {
  const queryParams = new Map<string, string>(savedEnemy ? [['enemyId', savedEnemy.id]] : []);
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      generatedAt: AT,
      sourceVersion: 'test',
      characterCount: 10,
      detailCount: 10,
      shipCount: 0,
      rumbleCount: 0,
      availableTypes: ['DEX', 'PSY'],
      availableClasses: ['Fighter', 'Slasher', 'Driven'],
      packs: [],
    }),
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue({
      generatedAt: AT,
      sourceVersion: 'test',
      abilityCount: 0,
      abilities: [],
    }),
    getAutoBuilderCandidates: vi.fn().mockResolvedValue([]),
    getAvailableCharacterTags: vi.fn().mockResolvedValue([]),
    getShips: vi.fn().mockResolvedValue([]),
    getCharacterById: vi.fn().mockResolvedValue(null),
    getCharactersByIds: vi.fn().mockResolvedValue([]),
    getDetailedCharactersByIds: vi.fn().mockResolvedValue([]),
    getSpecialCooldownsByIds: vi.fn().mockResolvedValue([]),
    searchDetailedCharacters: vi.fn().mockResolvedValue([]),
    searchCharacters: vi.fn().mockResolvedValue([]),
  };
  const autoTeamBuilder = {
    buildTeam: vi.fn().mockResolvedValue(null),
    resolveCaptainCoveredCandidateRecords: vi
      .fn()
      .mockImplementation((records: CharacterDetailRecord[]) => records),
  };
  const savedEnemies = signal(savedEnemy ? [savedEnemy] : []);
  const workerPreference = signal<{ mode: 'auto' | 'manual'; manualCount: number }>({
    mode: 'auto',
    manualCount: 1,
  });
  const userState = {
    boostedCharacterIds: signal<number[]>([]),
    readyBoostedCharacterIds: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: signal<number[]>([]),
    favoriteShipIds: signal<number[]>([]),
    characterBoxes: signal([]),
    savedTeams: signal([]),
    savedEnemies,
    getSavedTeamById: vi.fn().mockReturnValue(null),
    getSavedEnemyById: vi.fn(
      (enemyId: string) => savedEnemies().find((entry) => entry.id === enemyId) ?? null,
    ),
    ready: vi.fn().mockResolvedValue(undefined),
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
    readyFavoriteShipIds: vi.fn().mockResolvedValue(undefined),
    readyCharacterBoxes: vi.fn().mockResolvedValue(undefined),
    readyAutoTeamBuilderWorkerPreference: vi.fn().mockResolvedValue(undefined),
    readySavedTeams: vi.fn().mockResolvedValue(undefined),
    readySavedEnemies: vi.fn().mockResolvedValue(undefined),
    builderIntroDismissed: signal({ autoTeamBuilder: true, manualTeamBuilder: true }),
    readyBuilderIntroDismissed: vi.fn().mockResolvedValue(undefined),
    setBuilderIntroDismissed: vi.fn().mockResolvedValue(undefined),
    autoTeamBuilderWorkerPreference: workerPreference,
    resolveAutoTeamBuilderWorkerCount: vi.fn().mockReturnValue(1),
    resolveAutoTeamBuilderWorkerPreference: vi.fn(() => ({
      ...workerPreference(),
      detectedCoreCount: 4,
      effectiveCount: 1,
      manualMaxCount: 2,
      manualMaxPercent: 50,
    })),
    setAutoTeamBuilderWorkerPreference: vi.fn().mockResolvedValue(undefined),
  };
  const route = {
    snapshot: { queryParamMap: { get: vi.fn((key: string) => queryParams.get(key) ?? null) } },
  };
  const router = {
    navigate: vi.fn(
      async (_commands: unknown[], extras?: { queryParams?: Record<string, string | null> }) => {
        for (const [key, value] of Object.entries(extras?.queryParams ?? {})) {
          if (value === null) {
            queryParams.delete(key);
          }
        }

        return true;
      },
    ),
  };
  const preferencesStore = new Map<string, string>();
  const preferences = {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: preferencesStore.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
  };
  const page: AutoTeamBuilderPage = new AutoTeamBuilderPageClass(
    repository as never,
    autoTeamBuilder as never,
    userState as never,
    i18nStub() as never,
    route as never,
    router as never,
    { create: vi.fn() } as never,
    { overridesByCharacterId: signal(new Map()) } as never,
    preferences as never,
  );

  return { page, autoTeamBuilder };
}

async function openWithEnemy(savedEnemy: SavedEnemy) {
  const harness = createPage(savedEnemy);

  await harness.page.ngOnInit();
  await harness.page.ionViewWillEnter();

  return harness;
}

function sentConstraints(autoTeamBuilder: { buildTeam: ReturnType<typeof vi.fn> }) {
  return autoTeamBuilder.buildTeam.mock.calls.at(-1)![2] as Record<string, unknown>;
}

const avoidPreferRow = (page: AutoTeamBuilderPage) =>
  page.finalReportRows().find((row) => row.key === 'avoidPrefer');

beforeAll(async () => {
  AutoTeamBuilderPageClass = (await import('./auto-team-builder.page')).AutoTeamBuilderPage;
});

describe('a loaded Saved Enemy brings its avoid and prefer rules to the builder (869f63gma)', () => {
  const blackbeard = enemy({ avoidedClasses: ['Driven'], preferredTypes: ['PSY'] });

  it('maps the enemy onto the builder state through the shared normaliser', () => {
    expect(buildAutoTeamBuilderStateFromSavedEnemy(blackbeard).avoidPreferRules).toEqual({
      avoidedTypes: [],
      avoidedClasses: ['Driven'],
      avoidMode: 'hard',
      preferredTypes: ['PSY'],
      preferredClasses: [],
    });
  });

  it('says the rules before a build, and sends them with it', async () => {
    const { page, autoTeamBuilder } = await openWithEnemy(blackbeard);

    expect(page.loadedEnemyPresetName()).toBe('Blackbeard');
    expect(page.avoidPreferRulesLabel()).toBe(
      'Kept out of every seat the search fills: Driven. Ranked higher: PSY.',
    );

    await page.buildTeam();

    expect(sentConstraints(autoTeamBuilder)).toMatchObject({
      avoidedClasses: ['Driven'],
      avoidMode: 'hard',
      preferredTypes: ['PSY'],
    });
  });

  it('drops them, and only them, when the reader clears them', async () => {
    const { page, autoTeamBuilder } = await openWithEnemy(blackbeard);

    page.clearAvoidPreferRules();
    await page.buildTeam();

    const constraints = sentConstraints(autoTeamBuilder);

    expect(page.avoidPreferRulesLabel()).toBe('');
    expect('avoidedClasses' in constraints || 'avoidMode' in constraints).toBe(false);
    expect('preferredTypes' in constraints).toBe(false);
    expect(page.loadedEnemyPresetName()).toBe('Blackbeard');
  });

  it('sends nothing new for an enemy without rules', async () => {
    const { page, autoTeamBuilder } = await openWithEnemy(enemy());

    await page.buildTeam();

    expect(page.avoidPreferRulesLabel()).toBe('');
    expect(Object.keys(sentConstraints(autoTeamBuilder))).not.toContain('avoidMode');
  });
});

describe('a preset file keeps the rules (869f63gma)', () => {
  const options = {
    availableTypes: AUTO_TEAM_BUILDER_TYPES,
    availableClasses: ['Fighter', 'Slasher', 'Driven'],
    abilityCatalogItems: [],
    availableLockedCharacters: [],
  };

  it('exports them as schema 34 and imports them back unchanged', async () => {
    const { page } = await openWithEnemy(
      enemy({ avoidedTypes: ['QCK'], avoidedClasses: ['Driven'], avoidMode: 'soft' }),
    );
    const payload = page.buildSelectionExportPayload(AT)!;

    expect(payload.schemaVersion).toBe(34);
    expect(payload.filters).toMatchObject({
      avoidedTypes: ['QCK'],
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
    });

    const { state, warnings } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(JSON.stringify(payload)),
      options,
    );

    expect(state.avoidPreferRules).toEqual({
      avoidedTypes: ['QCK'],
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
      preferredTypes: [],
      preferredClasses: [],
    });
    expect(warnings).toEqual([]);
  });

  it('imports a schema 33 preset, which has no rules, with none', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    const v33 = { ...page.buildSelectionExportPayload(AT)!, schemaVersion: 33 };
    const { state } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(JSON.stringify(v33)),
      options,
    );

    expect(state.avoidPreferRules).toEqual({
      avoidedTypes: [],
      avoidedClasses: [],
      avoidMode: 'hard',
      preferredTypes: [],
      preferredClasses: [],
    });
  });

  it('refuses a malformed rule rather than half-read it', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    const payload = page.buildSelectionExportPayload(AT)!;

    for (const broken of [
      { avoidMode: 'sometimes' },
      { avoidedClasses: 'Driven' },
      { preferredTypes: [3] },
    ]) {
      const file = JSON.stringify({ ...payload, filters: { ...payload.filters, ...broken } });

      expect(() => parseAutoTeamSelectionImportPayload(file)).toThrow(AutoTeamSelectionImportError);
    }
  });

  it('says how many rule values this dataset does not know, in the warnings it already has', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    const payload = page.buildSelectionExportPayload(AT)!;
    const { state, warnings } = sanitizeAutoTeamSelectionImportPayload(
      parseAutoTeamSelectionImportPayload(
        JSON.stringify({
          ...payload,
          filters: {
            ...payload.filters,
            avoidedTypes: ['QCK', 'XYZ'],
            preferredClasses: ['Slasher', 'Pirate King'],
          },
        }),
      ),
      options,
    );

    expect(state.avoidPreferRules).toMatchObject({
      avoidedTypes: ['QCK'],
      preferredClasses: ['Slasher'],
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        { key: 'preset.warnings.unavailableTypes', params: { count: 1 } },
        { key: 'preset.warnings.unavailableClasses', params: { count: 1 } },
      ]),
    );
  });
});

describe('the Final team report gives the rules one row (869f63gma)', () => {
  it('reads Not applicable when no rule was set', () => {
    const { page } = createPage();

    page.result.set(result({}));

    expect(avoidPreferRow(page)).toMatchObject({
      state: 'notApplicable',
      detail: 'No avoid or prefer rule was set.',
    });
  });

  it('reads Passed for a hard avoid the team kept', () => {
    const { page } = createPage();

    page.result.set(result({ avoidedClasses: ['Driven'], avoidMode: 'hard' }));

    expect(avoidPreferRow(page)).toMatchObject({
      state: 'passed',
      stateLabel: 'Passed',
      detail: 'Kept out of every seat the search fills: Driven.',
      remedy: null,
    });
  });

  it('reads Relaxed for a hard avoid the search gave up, naming who it let in', () => {
    const { page } = createPage();

    page.result.set(
      result(
        { avoidedClasses: ['Driven'], avoidedTypes: ['INT'], avoidMode: 'hard' },
        { relaxedAvoidedValues: ['Driven'] },
      ),
    );

    expect(avoidPreferRow(page)).toMatchObject({
      state: 'relaxed',
      stateLabel: 'Relaxed',
      detail: 'No team could be built without Driven, so the search let in: Character 103, Character 105.',
    });
  });

  it("does not name the reader's own pick among the units the search let in", () => {
    const { page } = createPage();

    page.result.set(
      result(
        { avoidedClasses: ['Driven'], avoidMode: 'hard' },
        { relaxedAvoidedValues: ['Driven'], manualSubIds: [103] },
      ),
    );

    expect(avoidPreferRow(page)?.detail).toBe(
      'No team could be built without Driven, so the search let in: Character 105.',
    );
  });

  it('reads Passed for a soft avoid and a prefer, which only rank', () => {
    const { page } = createPage();

    page.result.set(
      result({
        avoidedClasses: ['Driven'],
        avoidMode: 'soft',
        preferredTypes: ['PSY'],
        preferredClasses: ['Cerebral'],
      }),
    );

    expect(avoidPreferRow(page)).toMatchObject({
      state: 'passed',
      detail: 'Ranked lower: Driven. Ranked higher: PSY / Cerebral.',
    });
  });

  it('puts the row with the other candidate-pool rules, before the leader rules', () => {
    const { page } = createPage();

    page.result.set(result({ avoidedClasses: ['Driven'] }));

    const keys = page.finalReportRows().map((row) => row.key);

    expect(keys.indexOf('avoidPrefer')).toBe(keys.indexOf('characterNames') + 1);
    expect(keys.indexOf('avoidPrefer')).toBeLessThan(keys.indexOf('captain'));
  });
});
