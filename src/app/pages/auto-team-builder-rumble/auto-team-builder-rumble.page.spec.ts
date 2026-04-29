import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type NormalizedRumbleEffect,
  type RumbleTeamResult,
} from '../../core/models/auto-team-builder-rumble.models';
import * as rumbleExportUtils from './auto-team-builder-rumble-export.utils';
import { AutoTeamBuilderRumblePage } from './auto-team-builder-rumble.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonMenuButton: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

describe('AutoTeamBuilderRumblePage', () => {
  it('initializes without auto-building on first entry', async () => {
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();

    expect(rumbleBuilder.buildBestTeam).not.toHaveBeenCalled();
    expect(page.initialized()).toBe(true);
    expect(page.loading()).toBe(false);
    expect(page.result()).toBeNull();
    expect(page.emptyStateVisible()).toBe(false);
  });

  it('builds a team on demand and exposes summary state', async () => {
    const result = createResult();
    const { page, rumbleBuilder } = createPage(result);

    await page.ngOnInit();
    await page.buildTeam();

    expect(rumbleBuilder.buildBestTeam).toHaveBeenCalledWith(
      {
        types: [],
        selectedClasses: [],
        onlySelectedTypes: false,
        onlySelectedClasses: false,
        favoritesOnly: false,
        favoriteCharacterIds: [1001, 1002],
        candidateCharacterIds: undefined,
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        workerCount: 2,
        getWorkerCount: expect.any(Function),
        onProgress: expect.any(Function),
      }),
    );
    expect(page.loading()).toBe(false);
    expect(page.result()).toBe(result);
    expect(page.emptyStateVisible()).toBe(false);
    expect(page.insufficientStateVisible()).toBe(false);
  });

  it('shows the empty state when the builder returns no candidates', async () => {
    const { page } = createPage({
      ...createResult(),
      activeSlots: [],
      benchSlots: [],
      candidateCount: 0,
      selectedCount: 0,
      totalScore: 0,
    });

    await page.ngOnInit();
    await page.buildTeam();

    expect(page.emptyStateVisible()).toBe(true);
  });

  it('shows the partial state when fewer than eight slots can be filled', async () => {
    const { page } = createPage({
      ...createResult(),
      benchSlots: [],
      selectedCount: 5,
    });

    await page.ngOnInit();
    await page.buildTeam();

    expect(page.insufficientStateVisible()).toBe(true);
  });

  it('shows the hard filter no-match state instead of a partial team', async () => {
    const { page } = createPage({
      ...createResult(),
      activeSlots: [],
      benchSlots: [],
      candidateCount: 0,
      selectedCount: 0,
      input: {
        ...createResult().input,
        types: ['DEX'],
        onlySelectedTypes: true,
      },
    });

    await page.ngOnInit();
    await page.buildTeam();

    expect(page.strictTypeBlockedStateVisible()).toBe(true);
    expect(page.insufficientStateVisible()).toBe(false);
    expect(page.emptyStateVisible()).toBe(false);
  });

  it('captures builder errors without leaving the page loading', async () => {
    const error = new Error('Dataset unavailable');
    const { page } = createPage(error);

    await page.ngOnInit();
    await page.buildTeam();

    expect(page.loading()).toBe(false);
    expect(page.result()).toBeNull();
    expect(page.errorMessage()).toBe('Dataset unavailable');
  });

  it('renders active and bench groups with rebuild controls in the template', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/pages/auto-team-builder-rumble/auto-team-builder-rumble.page.html',
      ),
      'utf8',
    );

    expect(template).toContain("scope: 'auto-team-builder-rumble'");
    expect(template).toContain("t('actions.rebuild')");
    expect(template).toContain("t('actions.downloadSettings')");
    expect(template).toContain("t('actions.downloadTeam')");
    expect(template).toContain("t('filters.favoritesOnly.toggle')");
    expect(template).toContain("t('filters.types.onlyToggle')");
    expect(template).toContain("t('filters.classes.onlyToggle')");
    expect(template).toContain('onOnlySelectedTypesToggle($event)');
    expect(template).toContain('onOnlySelectedClassesToggle($event)');
    expect(template).toContain('onAutoTeamBuilderWorkerModeChange($event)');
    expect(template).toContain("t('states.strictTypesTitle')");
    expect(template).not.toContain("t('summary.droppedType'");
    expect(template).toContain("t('active.title')");
    expect(template).toContain("t('bench.title')");
    expect(template).toContain('currentResult.activeSlots');
    expect(template).toContain('currentResult.benchSlots');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(slot)"');
    expect(template).toContain('(click)="openManualCharacterPicker(slot)"');
    expect(template).toContain('(click)="excludeCharacter(slot)"');
    expect(template).toContain('(click)="cancelBuild()"');
    expect(template).toContain("t('excluded.title')");
    expect(template).toContain('excludedCharacters()');
    expect(template).toContain('manualPickerOpen()');
    expect(template).toContain('selectManualCharacter(candidate)');
    expect(template).not.toContain('slot.reasonChips');
    expect(template).toContain("t('slot.totalBuffs')");
    expect(template).toContain("t('slot.noBuffs')");
    expect(template).toContain('getSlotTotalBuffRows(slot)');
    expect(template).not.toContain("t('slot.passiveLevel'");
    expect(template).not.toContain("t('slot.specialLevel'");
    expect(template).not.toContain("t('slot.resistance')");
    expect(template).not.toContain('slot.unit.normalized.baseResistances');
    expect(template).not.toContain('slot.unit.normalized.maxPassiveEffects');
    expect(template).not.toContain('slot.unit.normalized.maxSpecialEffects');
    expect(template).not.toContain('formatSlotLabel(slot)');
    expect(template).not.toContain('formatScore(slot.score)');
    expect(template).not.toContain('currentResult.totalScore');
    expect(template).not.toContain("t('slot.effects')");
  });

  it('summarizes total buffs received from passive and special effects', () => {
    const { page } = createPage();
    const result = createResult();
    const slots = [...result.activeSlots, ...result.benchSlots];
    const targetSlot = slots[0];
    const nonMatchingSlot = slots[6];

    targetSlot.unit.normalized.passiveEffects = [
      createEffect({ attributes: ['ATK'], level: 3, targetScope: 'self', targetTokens: ['self'] }),
    ];
    targetSlot.unit.normalized.specialEffects = [
      createEffect({
        attributes: ['Special CT'],
        level: 2,
        source: 'special',
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    slots[1].unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['HP'],
        amount: 4,
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    slots[2].unit.normalized.specialEffects = [
      createEffect({
        attributes: ['DEF'],
        level: 5,
        source: 'special',
        targetScope: 'subset',
        targetTokens: ['Fighter'],
      }),
    ];
    slots[3].unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['RCV'],
        effect: 'debuff',
        level: 99,
        targetScope: 'enemies',
        targetTokens: ['enemies'],
      }),
    ];
    slots[4].unit.normalized.specialEffects = [
      createEffect({
        attributes: ['SPD'],
        effect: 'damage',
        amount: 99,
        source: 'special',
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    nonMatchingSlot.unit.character.classes = ['Shooter'];
    nonMatchingSlot.unit.character.primaryClass = 'Shooter';
    nonMatchingSlot.unit.normalized.baseResistances = ['70% chance to resist Paralysis'];
    page.result.set(result);

    expect(page.getSlotTotalBuffRows(targetSlot)).toEqual([
      { stat: 'HP', value: '+4' },
      { stat: 'ATK', value: '+3' },
      { stat: 'DEF', value: '+5' },
      { stat: 'Special CT', value: '+2' },
    ]);
    expect(page.getSlotTotalBuffRows(nonMatchingSlot)).toEqual([
      { stat: 'HP', value: '+4' },
      { stat: 'Special CT', value: '+2' },
    ]);
  });

  it('limits counted buff recipients by targeting count and priority', () => {
    const { page } = createPage();
    const result = createResult();
    const slots = [...result.activeSlots, ...result.benchSlots];

    slots[0].unit.character.stats.max.atk = 100;
    slots[1].unit.character.stats.max.atk = 9000;
    slots[2].unit.character.stats.max.atk = 8000;
    slots[3].unit.character.stats.max.atk = 700;
    slots[0].unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['SPD'],
        level: 6,
        targetCount: 2,
        targetPriority: 'highest',
        targetStat: 'ATK',
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    page.result.set(result);

    expect(page.getSlotTotalBuffRows(slots[0])).toEqual([]);
    expect(page.getSlotTotalBuffRows(slots[1])).toEqual([{ stat: 'SPD', value: '+6' }]);
    expect(page.getSlotTotalBuffRows(slots[2])).toEqual([{ stat: 'SPD', value: '+6' }]);
    expect(page.getSlotTotalBuffRows(slots[3])).toEqual([]);
  });

  it('returns no buff rows when the generated team gives no matching buffs', () => {
    const { page } = createPage();
    const result = createResult();

    page.result.set(result);

    expect(page.getSlotTotalBuffRows(result.activeSlots[0])).toEqual([]);
  });

  it('passes selected filters and favorites to the builder', async () => {
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();
    page.onTypeChange({ detail: { value: ['DEX', 'STR'] } } as never);
    page.onClassChange({ detail: { value: ['Fighter'] } } as never);
    page.onOnlySelectedTypesToggle({ detail: { checked: true } } as never);
    page.onOnlySelectedClassesToggle({ detail: { checked: true } } as never);
    page.onFavoritesOnlyToggle({ detail: { checked: true } } as never);
    await page.buildTeam();

    expect(rumbleBuilder.buildBestTeam).toHaveBeenLastCalledWith(
      expect.objectContaining({
        types: ['DEX', 'STR'],
        selectedClasses: ['Fighter'],
        onlySelectedTypes: true,
        onlySelectedClasses: true,
        favoritesOnly: true,
        favoriteCharacterIds: [1001, 1002],
        candidateCharacterIds: undefined,
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('builds settings and team export payloads from current page state', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    await page.buildTeam();
    page.onTypeChange({ detail: { value: ['DEX'] } } as never);
    page.onClassChange({ detail: { value: ['Fighter'] } } as never);
    page.onOnlySelectedTypesToggle({ detail: { checked: true } } as never);
    page.onFavoritesOnlyToggle({ detail: { checked: true } } as never);
    await page.buildTeam();

    expect(page.buildSettingsExportPayload('2026-04-29T04:00:00.000Z')).toMatchObject({
      schemaVersion: 1,
      exportedAt: '2026-04-29T04:00:00.000Z',
      source: 'auto-team-builder-rumble',
      exportType: 'settings',
      settings: {
        types: ['DEX'],
        selectedClasses: ['Fighter'],
        onlySelectedTypes: true,
        onlySelectedClasses: false,
        favoritesOnly: true,
        favoriteCharacterIds: [1001, 1002],
      },
      favoriteCount: 2,
      workerPreference: { mode: 'auto', manualCount: 2 },
    });
    expect(page.buildTeamExportPayload('2026-04-29T04:00:00.000Z')?.team[0].unit.character).toEqual(
      page.result()?.activeSlots[0].unit.character,
    );
  });

  it('blocks team export when the current result is strict-type blocked', async () => {
    const { page } = createPage({
      ...createResult(),
      activeSlots: [],
      benchSlots: [],
      selectedCount: 0,
      input: {
        ...createResult().input,
        types: ['DEX'],
        onlySelectedTypes: true,
      },
    });

    await page.ngOnInit();
    await page.buildTeam();

    expect(page.canDownloadTeamJson()).toBe(false);
    expect(page.buildTeamExportPayload()).toBeNull();
  });

  it('downloads settings and team json through the export helpers', async () => {
    const settingsSpy = vi
      .spyOn(rumbleExportUtils, 'downloadRumbleBuilderSettingsExport')
      .mockImplementation(() => undefined);
    const teamSpy = vi
      .spyOn(rumbleExportUtils, 'downloadRumbleTeamExport')
      .mockImplementation(() => undefined);
    const { page } = createPage();

    await page.ngOnInit();
    await page.buildTeam();
    page.downloadSettingsJson();
    page.downloadTeamJson();

    expect(settingsSpy).toHaveBeenCalledWith(expect.objectContaining({ exportType: 'settings' }));
    expect(teamSpy).toHaveBeenCalledWith(expect.objectContaining({ exportType: 'team' }));

    settingsSpy.mockRestore();
    teamSpy.mockRestore();
  });

  it('persists live worker preference changes', async () => {
    const { page, userState } = createPage();

    await page.onAutoTeamBuilderWorkerModeChange({ detail: { value: 'manual' } } as never);
    await page.onAutoTeamBuilderManualWorkerCountChange({ detail: { value: 3 } } as never);

    expect(userState.setAutoTeamBuilderWorkerPreference).toHaveBeenCalledWith({
      mode: 'manual',
      manualCount: 2,
    });
    expect(userState.setAutoTeamBuilderWorkerPreference).toHaveBeenCalledWith({
      mode: 'auto',
      manualCount: 3,
    });
  });

  it('opens the manual picker and replaces the targeted slot', async () => {
    const replacementSlot = createSlot('active', 99);
    const { page, repository, rumbleBuilder } = createPage();

    repository.getRumbleBuilderCandidates.mockResolvedValue([replacementSlot.unit.character]);
    rumbleBuilder.scoreCandidates.mockReturnValue([replacementSlot.unit]);
    await page.ngOnInit();
    await page.buildTeam();
    await page.openManualCharacterPicker(page.result()!.activeSlots[0]!);

    expect(page.manualPickerOpen()).toBe(true);
    expect(page.manualPickerResults().map((candidate) => candidate.character.id)).toEqual([
      replacementSlot.unit.character.id,
    ]);

    page.selectManualCharacter(replacementSlot.unit);

    expect(page.manualPickerOpen()).toBe(false);
    expect(page.result()?.activeSlots[0]?.unit.character.id).toBe(
      replacementSlot.unit.character.id,
    );
    expect(page.result()?.activeSlots[0]?.role).toBe('active');
    expect(page.result()?.selectedCount).toBe(8);
  });

  it('excludes a selected slot and rebuilds with that character removed from the candidate scope', async () => {
    const result = createResult();
    const { page, rumbleBuilder, repository } = createPage(result);
    const excludedSlot = result.activeSlots[0]!;
    const candidateCharacters = [...result.activeSlots, ...result.benchSlots].map(
      (slot) => slot.unit.character,
    );

    repository.getRumbleBuilderCandidates.mockResolvedValue(candidateCharacters);
    await page.ngOnInit();
    await page.buildTeam();
    await page.excludeCharacter(excludedSlot);

    expect(page.excludedCharacterIds()).toEqual([excludedSlot.unit.character.id]);
    expect(page.excludedCharacters().map((character) => character.id)).toEqual([
      excludedSlot.unit.character.id,
    ]);
    expect(rumbleBuilder.buildBestTeam).toHaveBeenLastCalledWith(
      expect.objectContaining({
        candidateCharacterIds: candidateCharacters
          .map((character) => character.id)
          .filter((characterId) => characterId !== excludedSlot.unit.character.id),
      }),
      expect.any(Object),
    );
  });

  it('removes and clears excluded characters before future builds', async () => {
    const result = createResult();
    const { page, rumbleBuilder, repository } = createPage(result);
    const candidateCharacters = [...result.activeSlots, ...result.benchSlots].map(
      (slot) => slot.unit.character,
    );

    repository.getRumbleBuilderCandidates.mockResolvedValue(candidateCharacters);
    await page.ngOnInit();
    await page.buildTeam();
    await page.excludeCharacter(result.activeSlots[0]!);
    page.removeExcludedCharacter(result.activeSlots[0]!.unit.character.id);
    await page.buildTeam();

    expect(page.excludedCharacterIds()).toEqual([]);
    expect(rumbleBuilder.buildBestTeam).toHaveBeenLastCalledWith(
      expect.objectContaining({
        candidateCharacterIds: undefined,
      }),
      expect.any(Object),
    );

    await page.excludeCharacter(result.activeSlots[1]!);
    page.clearExcludedCharacters();

    expect(page.excludedCharacterIds()).toEqual([]);
    expect(page.result()).toBeNull();
  });

  it('cancels the active build and restores the previous result', async () => {
    const previousResult = createResult();
    const { page, rumbleBuilder } = createPage(previousResult);

    rumbleBuilder.buildBestTeam.mockImplementation(
      (
        _input: unknown,
        executionOptions?: {
          signal?: AbortSignal;
        },
      ) =>
        new Promise<never>((_resolve, reject) => {
          executionOptions?.signal?.addEventListener(
            'abort',
            () => reject(new Error('Rumble team build cancelled.')),
            { once: true },
          );
        }),
    );

    await page.ngOnInit();
    page.result.set(previousResult);
    const buildPromise = page.buildTeam();

    await Promise.resolve();

    expect(page.loading()).toBe(true);

    page.cancelBuild();
    await buildPromise;

    expect(page.result()).toBe(previousResult);
    expect(page.errorMessage()).toBe('');
    expect(page.loading()).toBe(false);
    expect(page.buildProgress()).toBeNull();
  });
});

function createPage(result: RumbleTeamResult | Error = createResult()) {
  const defaultCandidates =
    result instanceof Error
      ? []
      : [...result.activeSlots, ...result.benchSlots].map((slot) => slot.unit.character);
  const rumbleBuilder = {
    scoreCandidates: vi.fn().mockReturnValue([]),
    buildBestTeam: vi.fn().mockImplementation(() => {
      if (result instanceof Error) {
        return Promise.reject(result);
      }

      return Promise.resolve(result);
    }),
  };
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      availableClasses: ['Fighter', 'Slasher'],
    }),
    getRumbleBuilderCandidates: vi.fn().mockResolvedValue(defaultCandidates),
  };
  const userState = {
    favoriteCharacterIds: vi.fn(() => [1001, 1002]),
    autoTeamBuilderWorkerPreference: vi.fn(() => ({ mode: 'auto', manualCount: 2 })),
    resolveAutoTeamBuilderWorkerPreference: vi.fn(() => ({
      mode: 'auto',
      manualCount: 2,
      detectedCoreCount: 4,
      effectiveCount: 2,
      manualMaxCount: 3,
      manualMaxPercent: 75,
    })),
    resolveAutoTeamBuilderWorkerCount: vi.fn(() => 2),
    setAutoTeamBuilderWorkerPreference: vi.fn().mockResolvedValue(undefined),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key.endsWith('.empty')) {
        return 'Any';
      }

      return params ? `${key}:${JSON.stringify(params)}` : key;
    }),
  };
  const page = new AutoTeamBuilderRumblePage(
    rumbleBuilder as never,
    repository as never,
    userState as never,
    i18n as never,
  );

  return { page, rumbleBuilder, repository, userState };
}

function createResult(): RumbleTeamResult {
  const activeSlots = Array.from({ length: 5 }, (_, index) => createSlot('active', index));
  const benchSlots = Array.from({ length: 3 }, (_, index) => createSlot('bench', index + 5));

  return {
    activeSlots,
    benchSlots,
    candidateCount: 12,
    selectedCount: 8,
    totalScore: 1200,
    roleCoverage: ['attacker', 'booster'],
    typeCoverage: ['DEX', 'STR'],
    classCoverage: ['Fighter'],
    topFactors: ['Core power: Unit 1'],
    input: {
      types: [],
      selectedClasses: [],
      onlySelectedTypes: false,
      onlySelectedClasses: false,
      favoritesOnly: false,
      favoriteCharacterIds: [],
    },
    requestedTypes: [],
    requestedClasses: [],
    resolvedTypes: [],
    resolvedClasses: [],
    droppedTypes: [],
    droppedClasses: [],
  };
}

function createSlot(
  role: 'active' | 'bench',
  index: number,
): RumbleTeamResult['activeSlots'][number] {
  const id = 1000 + index;

  return {
    role,
    index,
    score: 100 + index,
    reasonChips: ['Damage'],
    unit: {
      character: {
        id,
        name: `Unit ${id}`,
        type: 'DEX',
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        stats: {
          min: { hp: 1000, atk: 400, rcv: 120 },
          max: { hp: 4200 + index, atk: 1900 + index, rcv: 320 + index },
          growth: 3,
        },
        detail: {
          characterTags: [],
        },
        imageUrl: `assets/${id}.png`,
      },
      normalized: {
        raw: {},
        basedOnId: null,
        rumbleType: 'ATK',
        def: 120,
        spd: 140,
        cost: 55,
        cooldown: 25,
        targetLabel: null,
        patternCount: 1,
        maxPassiveLevel: 5,
        maxSpecialLevel: 10,
        maxPassiveEffects: ['ATK • Lv 5 • crew'],
        maxSpecialEffects: ['damage • Amount 2,500 • fixed • 1 enemy'],
        maxSpecialCooldown: 35,
        baseResistances: ['70% chance to resist Paralysis'],
        llbResistances: ['100% chance to resist Paralysis'],
        passiveEffects: [],
        specialEffects: [],
        roleTags: ['attacker'],
      },
      reasonChips: ['Damage'],
      conflictKeys: [`character:${id}`],
    },
  } as RumbleTeamResult['activeSlots'][number];
}

function createEffect(
  overrides: Partial<NormalizedRumbleEffect> = {},
): NormalizedRumbleEffect {
  return {
    source: overrides.source ?? 'ability',
    sourceLevel: overrides.sourceLevel ?? 1,
    maxSourceLevel: overrides.maxSourceLevel ?? 1,
    effect: overrides.effect ?? 'buff',
    attributes: overrides.attributes ?? ['ATK'],
    level: overrides.level ?? null,
    amount: overrides.amount ?? null,
    chance: overrides.chance ?? null,
    duration: overrides.duration ?? null,
    type: overrides.type ?? null,
    target: overrides.target ?? null,
    targetTokens: overrides.targetTokens ?? [],
    targetCount: overrides.targetCount ?? null,
    targetPriority: overrides.targetPriority ?? null,
    targetStat: overrides.targetStat ?? null,
    targetScope: overrides.targetScope ?? 'crew',
    isConditional: overrides.isConditional ?? false,
  };
}
