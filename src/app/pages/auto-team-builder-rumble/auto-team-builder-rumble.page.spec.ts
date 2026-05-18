import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type NormalizedRumbleEffect,
  type RumbleBuildProgressSnapshot,
  type RumbleTeamResult,
} from '../../core/models/auto-team-builder-rumble.models';
import {
  captureJsonDownloads,
  readJsonDownloadPayload,
  restoreJsonDownloadCapture,
} from '../../testing/download-capture';
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
  afterEach(() => {
    restoreJsonDownloadCapture();
    vi.clearAllMocks();
  });

  it('initializes without auto-building on first entry', async () => {
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();

    expect(rumbleBuilder.buildBestTeams).not.toHaveBeenCalled();
    expect(page.initialized()).toBe(true);
    expect(page.loading()).toBe(false);
    expect(page.result()).toBeNull();
    expect(page.emptyStateVisible()).toBe(false);
  });

  it('loads a saved Rumble team from the route query param', async () => {
    const result = createResult();
    const savedRumbleTeam = {
      id: 'saved-rumble-1',
      name: 'Saved Rumble',
      notes: '',
      settings: {
        ...result.input,
        types: ['DEX'],
      },
      teams: [
        {
          ...result,
          activeSlots: result.activeSlots.map((slot) => ({
            characterId: slot.unit.character.id,
            index: slot.index,
            reasonChips: slot.reasonChips,
            role: slot.role,
            score: slot.score,
          })),
          benchSlots: result.benchSlots.map((slot) => ({
            characterId: slot.unit.character.id,
            index: slot.index,
            reasonChips: slot.reasonChips,
            role: slot.role,
            score: slot.score,
          })),
        },
      ],
      selectedTeamIndex: 0,
      opponentActiveCharacterIds: [result.activeSlots[0].unit.character.id, null, null, null, null],
      opponentBenchCharacterIds: [null, null, null],
      opponentAwarenessEnabled: true,
      createdAt: '2026-04-30T09:00:00.000Z',
      updatedAt: '2026-04-30T09:00:00.000Z',
    };
    const { page, repository, router, rumbleBuilder } = createPage(result, {
      savedRumbleTeamId: 'saved-rumble-1',
      savedRumbleTeam,
    });

    repository.getDetailedCharactersByIds.mockResolvedValue(
      [...result.activeSlots, ...result.benchSlots].map((slot) => slot.unit.character),
    );
    rumbleBuilder.scoreCandidates.mockReturnValue(
      [...result.activeSlots, ...result.benchSlots].map((slot) => slot.unit),
    );

    await page.ngOnInit();

    expect(page.selectedTypes()).toEqual(['DEX']);
    expect(page.teamResults()).toHaveLength(1);
    expect(page.opponentAwarenessEnabled()).toBe(true);
    expect(page.opponentActiveSlots()[0]?.unit.character.id).toBe(
      result.activeSlots[0].unit.character.id,
    );
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { savedRumbleTeamId: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }),
    );
  });

  it('builds a team on demand and exposes summary state', async () => {
    const result = createResult();
    const { page, rumbleBuilder } = createPage(result);

    await page.ngOnInit();
    await page.buildTeam();

    expect(rumbleBuilder.buildBestTeams).toHaveBeenNthCalledWith(
      1,
      {
        types: [],
        selectedClasses: [],
        onlySelectedTypes: false,
        onlySelectedClasses: false,
        favoritesOnly: false,
        favoriteCharacterIds: [1001, 1002],
        characterBoxId: null,
        candidateCharacterIds: undefined,
        opponentSlots: [],
        buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
        requireFullTeam: true,
      },
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        workerCount: 2,
        getWorkerCount: expect.any(Function),
        onProgress: expect.any(Function),
      }),
      1,
    );
    expect(rumbleBuilder.buildBestTeams).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requireFullTeam: false,
      }),
      expect.objectContaining({
        resultMode: 'closestCost',
      }),
      1,
    );
    expect(page.loading()).toBe(false);
    expect(page.result()).toBe(result);
    expect(page.emptyStateVisible()).toBe(false);
    expect(page.insufficientStateVisible()).toBe(false);
  });

  it('uses inner work units for Rumble build progress instead of marking the first pass complete', () => {
    const { page } = createPage();

    page.buildProgress.set(
      createProgressSnapshot({
        stage: 'selectingSlots',
        completedAttempts: 0,
        totalAttempts: 1,
        completedWorkUnits: 25,
        totalWorkUnits: 100,
        currentSlot: 1,
        totalSlots: 8,
        checkedCandidates: 25,
        totalCandidatesToCheck: 100,
        retainedVariants: 8,
        activeWorkerCount: 1,
      }),
    );

    expect(page.buildOverallProgressPercent()).toBe(63);
    expect(page.loadingProgressRows().map((row) => row.text)).toContain(
      'progress.candidateChecks:{"checked":"25","total":"100"}',
    );
    expect(page.loadingProgressRows().map((row) => row.text)).toContain(
      'progress.slotProgress:{"current":1,"total":8}',
    );

    page.buildProgress.set(
      createProgressSnapshot({
        stage: 'attempt',
        completedAttempts: 0,
        totalAttempts: 1,
      }),
    );

    expect(page.buildOverallProgressPercent()).toBe(50);

    page.buildProgress.set(
      createProgressSnapshot({
        stage: 'completed',
        completedAttempts: 1,
        totalAttempts: 1,
      }),
    );

    expect(page.buildOverallProgressPercent()).toBe(100);
  });

  it('switches between generated teams and compares the selected result', async () => {
    const firstResult = createResult();
    const secondResult = createActiveOnlyResult(createResult(100));
    secondResult.totalScore = firstResult.totalScore - 75;
    secondResult.roleCoverage = ['attacker'];
    secondResult.typeCoverage = ['DEX'];
    const { page, rumbleBuilder } = createPage(firstResult);

    rumbleBuilder.buildBestTeams.mockImplementation((input: Partial<RumbleTeamResult['input']>) =>
      Promise.resolve(input.requireFullTeam === false ? [secondResult] : [firstResult]),
    );

    await page.ngOnInit();
    await page.buildTeam();

    expect(page.hasAlternateTeams()).toBe(true);
    expect(page.result()).toBe(firstResult);
    expect(page.comparisonRows().find((row) => row.labelKey === 'comparison.score')).toMatchObject({
      value: '+75',
      tone: 'positive',
    });

    page.selectTeam(1);

    expect(page.result()).toBe(secondResult);
    const payload = page.buildTeamExportPayload('2026-04-29T04:00:00.000Z');

    expect(payload?.selectedTeamIndex).toBe(1);
    expect(payload?.teams).toHaveLength(2);
    expect(payload?.teams[0].team[0].unit.character.id).toBe(
      firstResult.activeSlots[0].unit.character.id,
    );
    expect(payload?.team[0].unit.character.id).toBe(secondResult.activeSlots[0].unit.character.id);
    expect(payload?.teams[1].benchSlots).toEqual([]);
    expect(payload?.teams[1].requestedInput.requireFullTeam).toBe(false);
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

  it('treats the second five-active no-bench team as complete', async () => {
    const { page } = createPage({
      ...createResult(),
      benchSlots: [],
      selectedCount: 5,
      input: {
        ...createResult().input,
        requireFullTeam: false,
      },
    });

    await page.ngOnInit();
    await page.buildTeam();
    page.selectTeam(1);

    expect(page.result()?.input.requireFullTeam).toBe(false);
    expect(page.insufficientStateVisible()).toBe(false);
    expect(page.canDownloadTeamJson()).toBe(true);
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
    expect(template).toContain("t('actions.importSettings')");
    expect(template).toContain("t('actions.importTeam')");
    expect(template).toContain("t('actions.save')");
    expect(template).toContain("t('actions.savedRumbleTeams')");
    expect(template).toContain('onSettingsFileSelected($event, settingsImportInput)');
    expect(template).toContain('onTeamFileSelected($event, teamImportInput)');
    expect(template).toContain('saveCurrentRumbleTeam()');
    expect(template).toContain("['/tabs/saved-rumble-teams']");
    expect(template).toContain("t('actions.downloadSettings')");
    expect(template).toContain("t('actions.downloadTeam')");
    expect(template).toContain("t('filters.characterBox.label')");
    expect(template).toContain('onCharacterBoxChange($event)');
    expect(template).toContain('characterBoxSupportLabel()');
    expect(template).toContain("t('filters.favoritesOnly.toggle')");
    expect(template).toContain("t('filters.buffFocus.label')");
    expect(template).toContain('buffFocusRanks');
    expect(template).toContain("moveBuffFocusStat(stat, 'up')");
    expect(template).toContain("moveBuffFocusStat(stat, 'down')");
    expect(template).not.toContain("t('filters.optionalBench.toggle')");
    expect(template).toContain("t('filters.types.onlyToggle')");
    expect(template).toContain("t('filters.classes.onlyToggle')");
    expect(template).toContain('onOnlySelectedTypesToggle($event)');
    expect(template).toContain('onOnlySelectedClassesToggle($event)');
    expect(template).not.toContain('onOptionalBenchToggle($event)');
    expect(template).toContain('onAutoTeamBuilderWorkerModeChange($event)');
    expect(template).toContain("t('teams.option'");
    expect(template).toContain('selectTeam($index)');
    expect(template).toContain('comparisonRows()');
    expect(template).toContain('team-flip-panel--alternate');
    expect(template).toContain('currentResult.input.requireFullTeam');
    expect(template).toContain("t('states.strictTypesTitle')");
    expect(template).not.toContain("t('summary.droppedType'");
    expect(template).toContain("t('active.title')");
    expect(template).toContain("t('bench.title')");
    expect(template).toContain("t('opponent.title')");
    expect(template).toContain("t('summary.rumbleCost')");
    expect(template).toContain("t('opponent.rumbleCost')");
    expect(template).toContain('formatTeamRumbleCostUsage(currentResult)');
    expect(template).toContain('opponentRumbleCostUsage()');
    expect(template).toContain("t('opponent.awarenessToggle')");
    expect(template).toContain('opponentDebuffRuleLabel()');
    expect(template).toContain('opponentAwarenessEnabled()');
    expect(template).toContain('onOpponentAwarenessToggle($event)');
    expect(template).toContain('opponentActiveSlots()');
    expect(template).toContain('opponentBenchSlots()');
    expect(template).toContain('currentResult.activeSlots');
    expect(template).toContain('currentResult.benchSlots');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(slot)"');
    expect(template).toContain('[attr.title]="formatSlotTooltip(slot)"');
    expect(template).toContain('[attr.title]="formatSlotTooltip(opponentSlot)"');
    expect(template).toContain('(click)="openManualCharacterPicker(slot)"');
    expect(template).toContain('(click)="openOpponentCharacterPicker(\'active\', $index)"');
    expect(template).toContain('(click)="clearOpponentSlot(\'active\', $index)"');
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
    expect(template).toContain('getOpponentSlotTotalBuffRows(opponentSlot)');
    expect(template).toContain('{{ buff.label }}');
    expect(template).not.toContain('class="slot-name"');
    expect(template).not.toContain(
      '{{ slot.unit.character.type }} • {{ slot.unit.character.primaryClass }}',
    );
    expect(template).not.toContain('{{ opponentSlot.unit.character.type }} •');
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

  it('formats slot image tooltips with name, type, and class', () => {
    const { page } = createPage();
    const slot = createSlot('active', 1);

    slot.unit.character.name = 'Master Caesar Clown - Scientist Wreathed in Toxic Gas';
    slot.unit.character.type = 'DEX';
    slot.unit.character.primaryClass = 'Cerebral';

    expect(page.formatSlotTooltip(slot)).toBe(
      'Master Caesar Clown - Scientist Wreathed in Toxic Gas\nDEX • Cerebral',
    );
  });

  it('formats full team cost from active and bench, and active-only cost from active slots', () => {
    const { page } = createPage();
    const result = createResult();

    result.activeSlots.forEach((slot) => {
      slot.unit.normalized.cost = 10;
    });
    result.benchSlots[0].unit.normalized.cost = 60;
    result.benchSlots[1].unit.normalized.cost = 70;
    result.benchSlots[2].unit.normalized.cost = 80;
    page.opponentActiveSlots.set([createSlot('active', 40), null, null, null, null]);
    page.opponentBenchSlots.set([createSlot('bench', 41), null, null]);
    page.opponentActiveSlots()[0]!.unit.normalized.cost = 70;
    page.opponentBenchSlots()[0]!.unit.normalized.cost = 15;

    expect(page.formatTeamRumbleCostUsage(result)).toBe('260 / 300');
    expect(page.formatTeamRumbleCostUsage(createActiveOnlyResult(result))).toBe('50 / 300');
    expect(page.opponentRumbleCostUsage()).toBe('85 / 300');
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
    slots[5].unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['RCV'],
        level: 9,
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    nonMatchingSlot.unit.character.classes = ['Shooter'];
    nonMatchingSlot.unit.character.primaryClass = 'Shooter';
    nonMatchingSlot.unit.normalized.baseResistances = ['70% chance to resist Paralysis'];
    page.teamResults.set([result]);

    expect(page.getSlotTotalBuffRows(targetSlot)).toEqual([
      { stat: 'HP', label: 'HP', value: '+4' },
      { stat: 'ATK', label: 'ATK', value: '+3' },
      { stat: 'DEF', label: 'DEF', value: '+5' },
      { stat: 'Special CT', label: 'CT', value: '+2' },
    ]);
    expect(page.getSlotTotalBuffRows(nonMatchingSlot)).toEqual([]);
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
    page.teamResults.set([result]);

    expect(page.getSlotTotalBuffRows(slots[0])).toEqual([]);
    expect(page.getSlotTotalBuffRows(slots[1])).toEqual([
      { stat: 'SPD', label: 'SPD', value: '+6' },
    ]);
    expect(page.getSlotTotalBuffRows(slots[2])).toEqual([
      { stat: 'SPD', label: 'SPD', value: '+6' },
    ]);
    expect(page.getSlotTotalBuffRows(slots[3])).toEqual([]);
  });

  it('counts broad Rumble buffs even when imported data has no structured targeting', () => {
    const { page } = createPage();
    const result = createActiveOnlyResult(createResult());

    result.activeSlots[0].unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['ATK'],
        level: 5,
        targetScope: 'unknown',
        targetTokens: [],
      }),
    ];
    page.teamResults.set([createResult(), result]);
    page.selectTeam(1);

    expect(page.getSlotTotalBuffRows(result.activeSlots[1])).toEqual([
      { stat: 'ATK', label: 'ATK', value: '+5' },
    ]);
  });

  it('summarizes subset buffs on the selected active-only generated team', () => {
    const { page } = createPage();
    const firstResult = createResult();
    const secondResult = createActiveOnlyResult(createResult(100));

    secondResult.activeSlots[0].unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['ATK', 'HP'],
        level: 4,
        targetScope: 'subset',
        targetTokens: ['[DEX]', 'Slasher'],
      }),
    ];
    secondResult.activeSlots[1].unit.character.type = 'PSY';
    secondResult.activeSlots[1].unit.character.classes = ['Slasher', 'Driven'];
    secondResult.activeSlots[2].unit.character.type = 'INT';
    secondResult.activeSlots[2].unit.character.classes = ['Shooter'];
    page.teamResults.set([firstResult, secondResult]);
    page.selectTeam(1);

    expect(page.getSlotTotalBuffRows(secondResult.activeSlots[1])).toEqual([
      { stat: 'HP', label: 'HP', value: '+4' },
      { stat: 'ATK', label: 'ATK', value: '+4' },
    ]);
    expect(page.getSlotTotalBuffRows(secondResult.activeSlots[2])).toEqual([]);
  });

  it('returns no buff rows when the generated team gives no matching buffs', () => {
    const { page } = createPage();
    const result = createResult();

    page.teamResults.set([result]);

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

    expect(rumbleBuilder.buildBestTeams).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        types: ['DEX', 'STR'],
        selectedClasses: ['Fighter'],
        onlySelectedTypes: true,
        onlySelectedClasses: true,
        favoritesOnly: true,
        favoriteCharacterIds: [1001, 1002],
        characterBoxId: null,
        candidateCharacterIds: undefined,
        opponentSlots: [],
        buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
        requireFullTeam: true,
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
      1,
    );
    expect(rumbleBuilder.buildBestTeams).toHaveBeenLastCalledWith(
      expect.objectContaining({
        types: ['DEX', 'STR'],
        selectedClasses: ['Fighter'],
        onlySelectedTypes: true,
        onlySelectedClasses: true,
        favoritesOnly: true,
        favoriteCharacterIds: [1001, 1002],
        characterBoxId: null,
        candidateCharacterIds: undefined,
        opponentSlots: [],
        buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
        requireFullTeam: false,
      }),
      expect.objectContaining({
        resultMode: 'closestCost',
      }),
      1,
    );
  });

  it('passes selected buff focus ranks to the builder', async () => {
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();
    page.moveBuffFocusStat('SPD', 'up');
    page.moveBuffFocusStat('ATK', 'down');
    await page.buildTeam();

    expect(page.buffFocusStatsForRank('primary')).toEqual(['HP', 'DEF', 'SPD']);
    expect(page.buffFocusStatsForRank('secondary')).toEqual(['ATK', 'RCV', 'Special CT']);
    expect(rumbleBuilder.buildBestTeams).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        buffFocus: [
          { stat: 'ATK', rank: 'secondary' },
          { stat: 'HP', rank: 'primary' },
          { stat: 'DEF', rank: 'primary' },
          { stat: 'SPD', rank: 'primary' },
          { stat: 'RCV', rank: 'secondary' },
          { stat: 'Special CT', rank: 'secondary' },
        ],
      }),
      expect.any(Object),
      1,
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
    page.opponentActiveSlots.set([createSlot('active', 50), null, null, null, null]);
    page.opponentBenchSlots.set([createSlot('bench', 51), null, null]);

    expect(page.buildSettingsExportPayload('2026-04-29T04:00:00.000Z')).toMatchObject({
      schemaVersion: 2,
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
        characterBoxId: null,
        opponentSlots: [],
        buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
        requireFullTeam: true,
      },
      favoriteCount: 2,
      workerPreference: { mode: 'auto', manualCount: 2 },
    });
    expect(page.buildTeamExportPayload('2026-04-29T04:00:00.000Z')?.team[0].unit.character).toEqual(
      page.result()?.activeSlots[0].unit.character,
    );
    expect(
      page
        .buildTeamExportPayload('2026-04-29T04:00:00.000Z')
        ?.opponentTeam.team.map((slot) => slot.unit.character.id),
    ).toEqual([1050, 1051]);
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
    const downloads = captureJsonDownloads();
    const { page } = createPage();

    await page.ngOnInit();
    await page.buildTeam();
    page.downloadSettingsJson();
    page.downloadTeamJson();

    await expect(readJsonDownloadPayload(downloads, 0)).resolves.toMatchObject({
      exportType: 'settings',
    });
    await expect(readJsonDownloadPayload(downloads, 1)).resolves.toMatchObject({
      exportType: 'team',
    });
  });

  it('imports settings without replacing the current generated teams', async () => {
    const { page } = createPage(createResult(), {
      characterBoxes: [createBox('box-1', 'Saved Box', [1001])],
    });

    await page.ngOnInit();
    await page.buildTeam();
    const existingResults = page.teamResults();
    await (page as never as { importSettingsJson(file: File): Promise<void> }).importSettingsJson({
      name: 'settings.json',
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          schemaVersion: 2,
          exportedAt: '2026-04-30T09:00:00.000Z',
          source: 'auto-team-builder-rumble',
          exportType: 'settings',
          settings: {
            types: ['DEX'],
            selectedClasses: ['Fighter'],
            onlySelectedTypes: true,
            onlySelectedClasses: true,
            favoritesOnly: true,
            favoriteCharacterIds: [1001],
            characterBoxId: 'box-1',
            opponentSlots: [],
            buffFocus: [{ stat: 'SPD', rank: 'primary' }],
            requireFullTeam: true,
          },
          favoriteCount: 1,
          workerPreference: { mode: 'auto', manualCount: 2 },
        }),
      ),
    } as never);

    expect(page.selectedTypes()).toEqual(['DEX']);
    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.onlySelectedTypes()).toBe(true);
    expect(page.onlySelectedClasses()).toBe(true);
    expect(page.favoritesOnly()).toBe(true);
    expect(page.selectedCharacterBoxId()).toBe('box-1');
    expect(page.buffFocus().find((preference) => preference.stat === 'SPD')?.rank).toBe('primary');
    expect(page.teamResults()).toBe(existingResults);
    expect(page.importFeedback()?.tone).toBe('success');
  });

  it('imports team results and opponent slots without changing filters', async () => {
    const result = createResult();
    const { page, repository, rumbleBuilder } = createPage(result);

    await page.ngOnInit();
    page.onTypeChange({ detail: { value: ['PSY'] } } as never);
    const payload = rumbleExportUtils.buildRumbleTeamExportPayload(
      result,
      '2026-04-30T09:00:00.000Z',
      {
        allResults: [result, createActiveOnlyResult(result)],
        selectedTeamIndex: 1,
        opponentSlots: [createSlot('active', 50), createSlot('bench', 51)],
      },
    );

    repository.getDetailedCharactersByIds.mockResolvedValue(
      [
        ...result.activeSlots,
        ...result.benchSlots,
        createSlot('active', 50),
        createSlot('bench', 51),
      ].map((slot) => slot.unit.character),
    );
    rumbleBuilder.scoreCandidates.mockReturnValue(
      [
        ...result.activeSlots,
        ...result.benchSlots,
        createSlot('active', 50),
        createSlot('bench', 51),
      ].map((slot) => slot.unit),
    );

    await (page as never as { importTeamJson(file: File): Promise<void> }).importTeamJson({
      name: 'team.json',
      text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
    } as never);

    expect(page.selectedTypes()).toEqual(['PSY']);
    expect(page.teamResults()).toHaveLength(2);
    expect(page.selectedTeamIndex()).toBe(1);
    expect(page.opponentActiveSlots()[0]?.unit.character.id).toBe(1050);
    expect(page.opponentBenchSlots()[0]?.unit.character.id).toBe(1051);
  });

  it('saves current settings, teams, and opponent slots as a saved Rumble team', async () => {
    const promptSpy = vi.fn().mockReturnValue('Saved rumble');
    vi.stubGlobal('prompt', promptSpy);
    const { page, userState } = createPage();

    await page.ngOnInit();
    await page.buildTeam();
    page.opponentActiveSlots.set([createSlot('active', 60), null, null, null, null]);

    await page.saveCurrentRumbleTeam();

    expect(userState.saveRumbleTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Saved rumble',
        teams: expect.arrayContaining([
          expect.objectContaining({
            activeSlots: expect.arrayContaining([expect.objectContaining({ characterId: 1000 })]),
          }),
        ]),
        opponentActiveCharacterIds: [1060, null, null, null, null],
        opponentBenchCharacterIds: [null, null, null],
        settings: expect.objectContaining({
          buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
        }),
      }),
    );
    expect(page.importFeedback()?.tone).toBe('success');

    vi.unstubAllGlobals();
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

  it('selects opponent characters before any team build', async () => {
    const opponentSlot = createSlot('active', 30);
    const { page, repository, rumbleBuilder } = createPage();

    repository.getRumbleBuilderCandidates.mockResolvedValue([opponentSlot.unit.character]);
    rumbleBuilder.scoreCandidates.mockReturnValue([opponentSlot.unit]);
    await page.ngOnInit();
    await page.openOpponentCharacterPicker('active', 0);

    expect(page.manualPickerOpen()).toBe(true);
    expect(page.manualPickerResults().map((candidate) => candidate.character.id)).toEqual([
      opponentSlot.unit.character.id,
    ]);

    page.selectManualCharacter(opponentSlot.unit);

    expect(page.manualPickerOpen()).toBe(false);
    expect(page.opponentActiveSlots()[0]?.unit.character.id).toBe(opponentSlot.unit.character.id);
    expect(page.result()).toBeNull();
  });

  it('keeps the opponent team when the player team is built again', async () => {
    const opponentSlot = createSlot('active', 31);
    const { page, repository, rumbleBuilder } = createPage();

    repository.getRumbleBuilderCandidates.mockResolvedValue([opponentSlot.unit.character]);
    rumbleBuilder.scoreCandidates.mockReturnValue([opponentSlot.unit]);
    await page.ngOnInit();
    await page.openOpponentCharacterPicker('active', 0);
    page.selectManualCharacter(opponentSlot.unit);
    await page.buildTeam();

    expect(page.result()?.selectedCount).toBe(8);
    expect(page.opponentActiveSlots()[0]?.unit.character.id).toBe(opponentSlot.unit.character.id);
  });

  it('defaults opponent-aware builds off and only passes opponent slots when enabled', async () => {
    const opponentSlot = createSlot('active', 0);
    const opponentBenchSlot = createSlot('bench', 0);
    opponentBenchSlot.unit.character.id = 1071;
    const { page, rumbleBuilder } = createPage();

    await page.ngOnInit();
    page.opponentActiveSlots.set([opponentSlot, null, null, null, null]);
    page.opponentBenchSlots.set([opponentBenchSlot, null, null]);
    await page.buildTeam();

    expect(page.opponentAwarenessEnabled()).toBe(false);
    expect(rumbleBuilder.buildBestTeams).toHaveBeenLastCalledWith(
      expect.objectContaining({
        opponentSlots: [],
      }),
      expect.any(Object),
      1,
    );

    page.onOpponentAwarenessToggle({ detail: { checked: true } } as never);
    await page.buildTeam();

    expect(rumbleBuilder.buildBestTeams).toHaveBeenLastCalledWith(
      expect.objectContaining({
        opponentSlots: [
          { characterId: opponentSlot.unit.character.id, role: 'active', index: 0 },
          { characterId: opponentBenchSlot.unit.character.id, role: 'bench', index: 0 },
        ],
      }),
      expect.any(Object),
      1,
    );
    expect(page.opponentActiveSlots()[0]?.unit.character.id).toBe(opponentSlot.unit.character.id);
  });

  it('summarizes opponent buffs from opponent slots only', () => {
    const { page } = createPage();
    const result = createResult();
    const playerTarget = result.activeSlots[0];
    const opponentTarget = createSlot('active', 40);
    const opponentSource = createSlot('active', 41);
    const opponentBenchSource = createSlot('bench', 42);

    result.activeSlots[1].unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['HP'],
        level: 3,
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    opponentSource.unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['ATK'],
        level: 7,
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    opponentBenchSource.unit.normalized.passiveEffects = [
      createEffect({
        attributes: ['DEF'],
        level: 9,
        targetScope: 'crew',
        targetTokens: ['crew'],
      }),
    ];
    page.teamResults.set([result]);
    page.opponentActiveSlots.set([opponentTarget, opponentSource, null, null, null]);
    page.opponentBenchSlots.set([opponentBenchSource, null, null]);

    expect(page.getSlotTotalBuffRows(playerTarget)).toEqual([
      { stat: 'HP', label: 'HP', value: '+3' },
    ]);
    expect(page.getOpponentSlotTotalBuffRows(opponentTarget)).toEqual([
      { stat: 'ATK', label: 'ATK', value: '+7' },
    ]);
  });

  it('filters opponent duplicates without blocking player team characters', async () => {
    const result = createResult();
    const existingOpponentSlot = createSlot('active', 50);
    const playerSlotCandidate = result.activeSlots[0].unit;
    const duplicateOpponentCandidate = existingOpponentSlot.unit;
    const newOpponentSlot = createSlot('bench', 51);
    const { page, repository, rumbleBuilder } = createPage(result);

    repository.getRumbleBuilderCandidates.mockResolvedValue([
      playerSlotCandidate.character,
      duplicateOpponentCandidate.character,
      newOpponentSlot.unit.character,
    ]);
    rumbleBuilder.scoreCandidates.mockReturnValue([
      playerSlotCandidate,
      duplicateOpponentCandidate,
      newOpponentSlot.unit,
    ]);
    page.teamResults.set([result]);
    page.opponentActiveSlots.set([existingOpponentSlot, null, null, null, null]);

    await page.openOpponentCharacterPicker('bench', 0);

    expect(page.manualPickerResults().map((candidate) => candidate.character.id)).toEqual([
      playerSlotCandidate.character.id,
      newOpponentSlot.unit.character.id,
    ]);
  });

  it('limits Rumble builds to the selected live character box', async () => {
    const { page, rumbleBuilder } = createPage(createResult(), {
      characterBoxes: [
        createBox('box-1', 'Rumble Box', [1001, 1003, 1005]),
        createBox('box-2', 'Other Box', [1002]),
      ],
    });

    await page.ngOnInit();
    page.onCharacterBoxChange({ detail: { value: 'box-1' } } as never);
    await page.buildTeam();

    expect(rumbleBuilder.buildBestTeams).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        characterBoxId: 'box-1',
        candidateCharacterIds: [1001, 1003, 1005],
      }),
      expect.any(Object),
      1,
    );
  });

  it('intersects the selected character box with favorites before building', async () => {
    const { page, rumbleBuilder } = createPage(createResult(), {
      characterBoxes: [createBox('box-1', 'Favorite Box', [1001, 1003, 1005])],
    });

    await page.ngOnInit();
    page.onCharacterBoxChange({ detail: { value: 'box-1' } } as never);
    page.onFavoritesOnlyToggle({ detail: { checked: true } } as never);
    await page.buildTeam();

    expect(rumbleBuilder.buildBestTeams).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        characterBoxId: 'box-1',
        favoritesOnly: true,
        candidateCharacterIds: [1001],
      }),
      expect.any(Object),
      1,
    );
  });

  it('blocks empty selected boxes and boxes without favorite overlap', async () => {
    const { page, rumbleBuilder } = createPage(createResult(), {
      characterBoxes: [
        createBox('empty-box', 'Empty Box', []),
        createBox('no-favorites-box', 'No Favorites Box', [1003]),
      ],
    });

    await page.ngOnInit();
    page.onCharacterBoxChange({ detail: { value: 'empty-box' } } as never);
    await page.buildTeam();

    expect(page.buildBlockedByCharacterBox()).toBe(true);
    expect(rumbleBuilder.buildBestTeams).not.toHaveBeenCalled();

    page.onCharacterBoxChange({ detail: { value: 'no-favorites-box' } } as never);
    page.onFavoritesOnlyToggle({ detail: { checked: true } } as never);
    await page.buildTeam();

    expect(page.buildBlockedByBoxFavorites()).toBe(true);
    expect(rumbleBuilder.buildBestTeams).not.toHaveBeenCalled();
  });

  it('removes excluded characters from the selected character box scope', async () => {
    const result = createResult();
    const { page, rumbleBuilder } = createPage(result, {
      characterBoxes: [createBox('box-1', 'Rumble Box', [1000, 1001, 1002])],
    });

    await page.ngOnInit();
    page.onCharacterBoxChange({ detail: { value: 'box-1' } } as never);
    page.excludedCharacterIds.set([1001]);
    await page.buildTeam();

    expect(rumbleBuilder.buildBestTeams).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        candidateCharacterIds: [1000, 1002],
      }),
      expect.any(Object),
      1,
    );
  });

  it('clears missing character box ids from imported settings', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    await (page as never as { importSettingsJson(file: File): Promise<void> }).importSettingsJson({
      name: 'settings.json',
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          schemaVersion: 2,
          exportedAt: '2026-04-30T09:00:00.000Z',
          source: 'auto-team-builder-rumble',
          exportType: 'settings',
          settings: {
            types: [],
            selectedClasses: [],
            onlySelectedTypes: false,
            onlySelectedClasses: false,
            favoritesOnly: false,
            favoriteCharacterIds: [],
            characterBoxId: 'deleted-box',
            opponentSlots: [],
            buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
            requireFullTeam: true,
          },
          favoriteCount: 0,
          workerPreference: { mode: 'auto', manualCount: 2 },
        }),
      ),
    } as never);

    expect(page.selectedCharacterBoxId()).toBeNull();
    expect(page.buildSettingsExportPayload().settings.characterBoxId).toBeNull();
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
    expect(rumbleBuilder.buildBestTeams).toHaveBeenLastCalledWith(
      expect.objectContaining({
        candidateCharacterIds: candidateCharacters
          .map((character) => character.id)
          .filter((characterId) => characterId !== excludedSlot.unit.character.id),
      }),
      expect.any(Object),
      1,
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
    expect(rumbleBuilder.buildBestTeams).toHaveBeenLastCalledWith(
      expect.objectContaining({
        candidateCharacterIds: undefined,
      }),
      expect.any(Object),
      1,
    );

    await page.excludeCharacter(result.activeSlots[1]!);
    page.clearExcludedCharacters();

    expect(page.excludedCharacterIds()).toEqual([]);
    expect(page.result()).toBeNull();
  });

  it('cancels the active build and restores the previous result', async () => {
    const previousResult = createResult();
    const { page, rumbleBuilder } = createPage(previousResult);

    rumbleBuilder.buildBestTeams.mockImplementation(
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
    page.teamResults.set([previousResult]);
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

function createPage(
  result: RumbleTeamResult | Error = createResult(),
  options: {
    savedRumbleTeamId?: string | null;
    savedRumbleTeam?: Record<string, unknown> | null;
    characterBoxes?: Array<{
      id: string;
      name: string;
      characterIds: number[];
      createdAt: string;
      updatedAt: string;
    }>;
  } = {},
) {
  const defaultCandidates =
    result instanceof Error
      ? []
      : [...result.activeSlots, ...result.benchSlots].map((slot) => slot.unit.character);
  const rumbleBuilder = {
    scoreCandidates: vi.fn().mockReturnValue([]),
    buildBestTeams: vi.fn().mockImplementation((input: Partial<RumbleTeamResult['input']>) => {
      if (result instanceof Error) {
        return Promise.reject(result);
      }

      return Promise.resolve([
        input.requireFullTeam === false ? createActiveOnlyResult(result) : result,
      ]);
    }),
  };
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      availableClasses: ['Fighter', 'Slasher'],
    }),
    getRumbleBuilderCandidates: vi.fn().mockResolvedValue(defaultCandidates),
    getDetailedCharactersByIds: vi
      .fn()
      .mockImplementation((ids: number[]) =>
        Promise.resolve(defaultCandidates.filter((candidate) => ids.includes(candidate.id))),
      ),
  };
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
    readyCharacterBoxes: vi.fn().mockResolvedValue(undefined),
    readyAutoTeamBuilderWorkerPreference: vi.fn().mockResolvedValue(undefined),
    readySavedRumbleTeams: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: vi.fn(() => [1001, 1002]),
    characterBoxes: vi.fn(() => options.characterBoxes ?? []),
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
    saveRumbleTeam: vi.fn().mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      id: 'rumble-team-1',
      createdAt: '2026-04-30T09:00:00.000Z',
      updatedAt: '2026-04-30T09:00:00.000Z',
    })),
    getSavedRumbleTeamById: vi.fn((id: string) =>
      id === options.savedRumbleTeamId ? (options.savedRumbleTeam ?? null) : null,
    ),
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
  const route = {
    snapshot: {
      queryParamMap: {
        get: vi.fn((key: string) =>
          key === 'savedRumbleTeamId' ? options.savedRumbleTeamId : null,
        ),
      },
    },
  };
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const page = new AutoTeamBuilderRumblePage(
    rumbleBuilder as never,
    repository as never,
    userState as never,
    i18n as never,
    route as never,
    router as never,
  );

  return { page, rumbleBuilder, repository, route, router, userState };
}

function createProgressSnapshot(
  overrides: Partial<RumbleBuildProgressSnapshot>,
): RumbleBuildProgressSnapshot {
  return {
    stage: 'attempt',
    candidateCount: 100,
    completedAttempts: 0,
    totalAttempts: 1,
    attemptCountFinal: true,
    currentDroppedTypes: [],
    currentDroppedClasses: [],
    elapsedMs: 0,
    estimatedRemainingMs: null,
    messageKey: 'progress.attempt',
    ...overrides,
  };
}

function createResult(offset = 0): RumbleTeamResult {
  const activeSlots = Array.from({ length: 5 }, (_, index) => createSlot('active', index, offset));
  const benchSlots = Array.from({ length: 3 }, (_, index) =>
    createSlot('bench', index + 5, offset),
  );

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
      characterBoxId: null,
      opponentSlots: [],
      buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
      requireFullTeam: true,
    },
    requestedTypes: [],
    requestedClasses: [],
    resolvedTypes: [],
    resolvedClasses: [],
    droppedTypes: [],
    droppedClasses: [],
  };
}

function createActiveOnlyResult(source: RumbleTeamResult): RumbleTeamResult {
  return {
    ...source,
    benchSlots: [],
    selectedCount: source.activeSlots.length,
    totalScore: Math.max(0, source.totalScore - 75),
    input: {
      ...source.input,
      requireFullTeam: false,
    },
  };
}

function createSlot(
  role: 'active' | 'bench',
  index: number,
  offset = 0,
): RumbleTeamResult['activeSlots'][number] {
  const id = 1000 + index + offset;

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
  } as unknown as RumbleTeamResult['activeSlots'][number];
}

function createBox(id: string, name: string, characterIds: number[]) {
  return {
    id,
    name,
    characterIds,
    createdAt: '2026-04-30T09:00:00.000Z',
    updatedAt: '2026-04-30T09:00:00.000Z',
  };
}

function createEffect(overrides: Partial<NormalizedRumbleEffect> = {}): NormalizedRumbleEffect {
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
