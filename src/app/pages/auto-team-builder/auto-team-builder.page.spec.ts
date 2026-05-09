import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import {
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
} from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord, type DatasetManifest } from '../../core/models/optc.models';
import { AutoTeamBuildCancelledError } from '../../core/services/auto-team-builder.engine';
import type { AutoTeamBuilderPage } from './auto-team-builder.page';
import {
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
  buildAutoTeamExportFilename,
  buildAutoTeamExportPayload,
  buildAutoTeamSelectionExportFilename,
  buildAutoTeamSelectionExportPayload,
  downloadAutoTeamExport,
  downloadAutoTeamSelectionExport,
  type AutoTeamSelectionExportPayload,
} from './auto-team-builder-export.utils';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonCheckbox: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonMenuButton: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSegment: class {},
  IonSegmentButton: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('AutoTeamBuilderPage builder interactions', () => {
  it('keeps runtime auto-builder code independent from the build-time ability parser', () => {
    const runtimeFiles = [
      'src/app/core/services/auto-team-builder.service.ts',
      'src/app/core/services/auto-team-builder.utils.ts',
      'src/app/core/services/auto-team-builder.engine.ts',
      'src/app/core/services/auto-team-builder.worker.ts',
      'src/app/core/services/auto-team-builder-ability-match.utils.ts',
      'src/app/pages/auto-team-builder/auto-team-builder.page.ts',
    ];
    const forbiddenBuildTimeParserReferences = [
      'auto-team-builder-ability-parser',
      'analyzeBuilderAbilityText',
      'enrichCharactersWithBuilderAbilities',
    ];

    expect(
      runtimeFiles.flatMap((filePath) => {
        const source = readFileSync(resolve(process.cwd(), filePath), 'utf8');

        return forbiddenBuildTimeParserReferences
          .filter((reference) => source.includes(reference))
          .map((reference) => `${filePath}: ${reference}`);
      }),
    ).toEqual([]);
  });

  it('passes the resolved worker count to the builder service execution options', async () => {
    const { page, autoTeamBuilder, userState } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    userState.resolveAutoTeamBuilderWorkerCount.mockReturnValue(4);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.any(Object),
      expect.objectContaining({
        workerCount: 4,
      }),
    );
  });

  it('passes selected character tag and name filters to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.selectedCharacterTags.set(['Straw Hat Pirates']);
    page.selectedCharacterNames.set(['zoro', 'luffy']);
    page.requireAllSelectedCharacterTagsInTeam.set(true);
    page.requireAllSelectedCharacterNamesInTeam.set(true);

    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        selectedCharacterTags: ['Straw Hat Pirates'],
        selectedCharacterNames: ['zoro', 'luffy'],
        requireAllSelectedCharacterTagsInTeam: true,
        requireAllSelectedCharacterNamesInTeam: true,
      }),
      expect.any(Object),
    );
  });

  it('filters character tag autocomplete suggestions and adds the selected tag', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.onCharacterTagSearchChange({
      detail: {
        value: 'wor',
      },
    } as CustomEvent<{ value: string }>);

    expect(page.filteredCharacterTagSuggestions()).toEqual(['Worst Generation']);

    page.selectFirstCharacterTagSuggestion();

    expect(page.selectedCharacterTags()).toEqual(['Worst Generation']);
    expect(page.characterTagSearchTerm()).toBe('');

    page.onCharacterTagSearchChange({
      detail: {
        value: 'wor',
      },
    } as CustomEvent<{ value: string }>);

    expect(page.filteredCharacterTagSuggestions()).toEqual([]);
  });

  it('applies ability-derived requirement source tags and names from the modal', async () => {
    const { page, repository } = await createPage();
    const source = createCharacterRecord(990, 'Requirement Source');

    source.detail.superSpecialCriteria = {
      rawText: 'Any 2 of [Straw Hat Pirates] or Roronoa Zoro',
      requiresCaptain: false,
      hasNonRosterBranches: false,
      parserStatus: 'roster_only',
      rosterBranches: [
        {
          branchType: 'character_count_any',
          requiredCount: 2,
          matchMode: 'any_candidate',
          options: [
            { label: '[Straw Hat Pirates]', acceptedKeys: ['straw hat pirates'] },
            { label: 'Roronoa Zoro', acceptedKeys: ['roronoa zoro'] },
          ],
        },
      ],
    };
    repository.searchDetailedCharacters.mockResolvedValue([source]);

    await page.ngOnInit();
    await page.openRequirementSourceModal();

    expect(page.requirementSourceCandidateCards()).toHaveLength(1);
    page.applyRequirementSourceCharacter(source);

    expect(page.selectedCharacterTags()).toEqual(['Straw Hat Pirates']);
    expect(page.selectedCharacterNames()).toEqual(['roronoa zoro']);
    expect(page.requirementSourceModalOpen()).toBe(false);
  });

  it('passes the selected leader boost filters to the builder and restores empty selections', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    expect(page.leaderBoostFilters()).toEqual(['HP', 'ATK']);

    page.onLeaderBoostFilterChange({ detail: { value: ['HP'] } } as CustomEvent<{
      value: ['HP'];
    }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        leaderBoostFilters: ['HP'],
      }),
      expect.any(Object),
    );

    page.onLeaderBoostFilterChange({ detail: { value: [] } } as CustomEvent<{ value: [] }>);
    expect(page.leaderBoostFilters()).toEqual(['HP', 'ATK']);
  });

  it('passes leader boost ranges to the builder and resets them', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.onLeaderBoostRangeChange('ATK', 'min', {
      detail: { value: '5.25' },
    } as CustomEvent<{ value: string }>);
    page.onLeaderBoostRangeChange('ATK', 'max', {
      detail: { value: '6' },
    } as CustomEvent<{ value: string }>);
    page.onLeaderBoostRangeChange('HP', 'min', {
      detail: { value: '1.3' },
    } as CustomEvent<{ value: string }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        leaderBoostRanges: {
          ATK: { min: 5.25, max: 6 },
          HP: { min: 1.3, max: null },
        },
      }),
      expect.any(Object),
    );

    await page.resetPage();
    expect(page.leaderBoostRanges()).toEqual(createEmptyAutoBuildLeaderBoostRanges());
  });

  it('saves leader boost settings from the Captain Ability picker and summarizes active requirements', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.saveCaptainLeaderBoostSettings({
      filters: ['ATK'],
      ranges: {
        ATK: { min: 5.25, max: 6 },
        HP: { min: 1.3, max: null },
      },
    });

    expect(page.leaderBoostFilters()).toEqual(['ATK']);
    expect(page.leaderBoostRanges()).toEqual({
      ATK: { min: 5.25, max: 6 },
      HP: { min: 1.3, max: null },
    });
    expect(page.captainLeaderBoostSummaryChips().map((chip) => chip.label)).toEqual([
      'Priority: ATK',
      'ATK 5.25-6',
      'HP from 1.3',
    ]);
    expect(page.captainFilterSummaryChips()).toEqual(page.captainLeaderBoostSummaryChips());
  });

  it('clears Captain Ability filters and leader boost settings together', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.captainAbilityDrafts.set([
      {
        draftId: 'captain-bind',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
    page.saveCaptainLeaderBoostSettings({
      filters: ['HP'],
      ranges: {
        ATK: { min: null, max: null },
        HP: { min: 1.3, max: 1.5 },
      },
    });

    await page.clearCaptainAbilityFilters();

    expect(page.captainAbilityDrafts()).toEqual([]);
    expect(page.leaderBoostFilters()).toEqual(['HP', 'ATK']);
    expect(page.leaderBoostRanges()).toEqual(createEmptyAutoBuildLeaderBoostRanges());
    expect(page.captainFilterSummaryChips()).toEqual([]);
  });

  it('uses full Captain Ability coverage by default when building', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);

    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        requireFullCaptainAbilityCoverage: true,
        strictSuperSpecialCriteriaCoverage: false,
        strictSuperTandemCriteriaCoverage: false,
      }),
      expect.any(Object),
    );
  });

  it('passes strict both-leader Captain Ability coverage to the builder when enabled', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.onRequireBothLeadersFullCaptainAbilityCoverageToggle({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    await page.buildTeam();

    expect(page.requireBothLeadersFullCaptainAbilityCoverage()).toBe(true);
    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        requireBothLeadersFullCaptainAbilityCoverage: true,
      }),
      expect.any(Object),
    );
  });

  it('reports partial full Captain Ability coverage and exposes result character tags', async () => {
    const { page } = await createPage();
    const captain = createCharacterRecord(200, 'DEX Captain');
    const dexSub = createCharacterRecord(202, 'DEX Sub');
    const psySub = createCharacterRecord(203, 'PSY Sub');

    captain.detail.captainAbility = 'Boosts ATK of [DEX] characters by 5x and HP by 1.3x.';
    captain.detail.characterTags = ['Straw Hat Pirates'];
    dexSub.detail.characterTags = ['Land of Wano'];
    psySub.detail.characterTags = ['Kid Pirates', 'Worst Generation'];
    page.result.set(
      createAutoBuildResult([
        { role: 'captain', character: captain, reasonChips: ['Captain slot'] },
        { role: 'friendCaptain', character: captain, reasonChips: ['Friend captain slot'] },
        { role: 'sub', character: dexSub, reasonChips: ['Covered'] },
        { role: 'sub', character: dexSub, reasonChips: ['Covered'] },
        { role: 'sub', character: dexSub, reasonChips: ['Covered'] },
        { role: 'sub', character: psySub, reasonChips: ['Partial'] },
      ]),
    );

    expect(page.teamSlots()[5]?.characterTags).toEqual(['Kid Pirates', 'Worst Generation']);
    expect(page.captainAbilityCoverageReportLabel()).toBe(
      '10 / 12 Captain Ability slot checks covered.',
    );
    expect(page.captainAbilityCoverageMissingLabels()).toEqual([
      'Captain misses Sub 4.',
      'Friend Captain misses Sub 4.',
    ]);
  });

  it('formats relaxed Super Special Criteria warnings with character names', async () => {
    const { page } = await createPage();
    const result = createAutoBuildResult();

    page.result.set({
      ...result,
      relaxation: {
        ...result.relaxation,
        usedFallback: true,
        ignoredLeaderSuperSpecialCriteria: true,
        ignoredSuperSpecialCriteriaCharacterNames: ['Luffy & Bonney'],
      },
    });

    expect(page.resultIgnoredLeaderSuperSpecialCriteria()).toBe(true);
    expect(page.ignoredSuperSpecialCriteriaLabel()).toBe(
      'Super Special will not activate for: Luffy & Bonney',
    );
  });

  it('formats relaxed Super Tandem warnings with character names', async () => {
    const { page } = await createPage();
    const result = createAutoBuildResult();

    page.result.set({
      ...result,
      relaxation: {
        ...result.relaxation,
        usedFallback: true,
        ignoredSuperTandemCriteria: true,
        ignoredSuperTandemCriteriaCharacterNames: ['Luffy & Bonney'],
      },
    });

    expect(page.resultIgnoredSuperTandemCriteria()).toBe(true);
    expect(page.ignoredSuperTandemCriteriaLabel()).toBe(
      'Super Tandem will not activate for: Luffy & Bonney',
    );
  });

  it('disables builds when a leader boost range minimum is greater than maximum', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    expect(page.buildDisabled()).toBe(false);

    page.onLeaderBoostRangeChange('ATK', 'min', {
      detail: { value: '6' },
    } as CustomEvent<{ value: string }>);
    page.onLeaderBoostRangeChange('ATK', 'max', {
      detail: { value: '5' },
    } as CustomEvent<{ value: string }>);

    expect(page.hasInvalidLeaderBoostRanges()).toBe(true);
    expect(page.buildDisabled()).toBe(true);
    expect(page.leaderBoostRangeErrorLabel()).toBe(
      'Leader boost minimum cannot be greater than maximum.',
    );
  });

  it('passes scoped cost ranges to the builder and resets them', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.onLeaderCostRangeChange('min', {
      detail: { value: '20' },
    } as CustomEvent<{ value: string }>);
    page.onLeaderCostRangeChange('max', {
      detail: { value: '60' },
    } as CustomEvent<{ value: string }>);
    page.onSubCostRangeChange('min', {
      detail: { value: '20.5' },
    } as CustomEvent<{ value: string }>);
    page.onSubCostRangeChange('min', {
      detail: { value: '10' },
    } as CustomEvent<{ value: string }>);
    page.onSubCostRangeChange('max', {
      detail: { value: '40' },
    } as CustomEvent<{ value: string }>);
    page.onMaxTotalCostChange({
      detail: { value: '300' },
    } as CustomEvent<{ value: string }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        leaderCostRange: { min: 20, max: 60 },
        subCostRange: { min: 10, max: 40 },
        maxTotalCost: 300,
      }),
      expect.any(Object),
    );

    await page.resetPage();
    expect(page.leaderCostRange()).toEqual(createEmptyAutoBuildCostRange());
    expect(page.subCostRange()).toEqual(createEmptyAutoBuildCostRange());
    expect(page.maxTotalCost()).toBeNull();
  });

  it('disables builds when a scoped cost range minimum is greater than maximum', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    expect(page.buildDisabled()).toBe(false);

    page.onLeaderCostRangeChange('min', {
      detail: { value: '61' },
    } as CustomEvent<{ value: string }>);
    page.onLeaderCostRangeChange('max', {
      detail: { value: '60' },
    } as CustomEvent<{ value: string }>);

    expect(page.hasInvalidLeaderCostRange()).toBe(true);
    expect(page.buildDisabled()).toBe(true);
    expect(page.leaderCostRangeErrorLabel()).toBe(
      'Minimum leader cost cannot be greater than maximum leader cost.',
    );
  });

  it('keeps the build button label stable across selected filters', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    expect(page.buildButtonLabel()).toBe('Auto Team Build');

    page.selectedTypes.set(['DEX', 'STR', 'PSY']);
    page.selectedClasses.set(['Fighter', 'Slasher']);
    page.requireAllSelectedTypesInTeam.set(true);
    page.favoritesOnly.set(true);

    expect(page.buildButtonLabel()).toBe('Auto Team Build');
  });

  it('passes the live worker count resolver to the builder service execution options', async () => {
    const { page, autoTeamBuilder, userState } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    userState.resolveAutoTeamBuilderWorkerCount.mockReturnValue(5);
    await page.buildTeam();

    const executionOptions = autoTeamBuilder.buildTeam.mock.calls[0]?.[3];

    expect(executionOptions?.getWorkerCount).toBeTypeOf('function');
    expect(executionOptions?.getWorkerCount()).toBe(5);
  });

  it('persists worker mode changes from the live build controls', async () => {
    const { page, userState } = await createPage();

    await page.onAutoTeamBuilderWorkerModeChange({
      detail: { value: 'manual' },
    } as CustomEvent<{ value: 'manual' }>);

    expect(userState.setAutoTeamBuilderWorkerPreference).toHaveBeenCalledWith({
      mode: 'manual',
      manualCount: 7,
    });
    expect(page.autoTeamBuilderWorkerPreference().mode).toBe('manual');
  });

  it('preserves worker mode when the live worker count changes', async () => {
    const { page, userState } = await createPage();

    await page.onAutoTeamBuilderManualWorkerCountChange({
      detail: { value: 3 },
    } as CustomEvent<{ value: number }>);

    expect(userState.setAutoTeamBuilderWorkerPreference).toHaveBeenCalledWith({
      mode: 'auto',
      manualCount: 3,
    });
    expect(page.autoTeamBuilderWorkerPreference()).toEqual({
      mode: 'auto',
      manualCount: 3,
    });
  });

  it('lets the live worker count change while a build is running without cancelling it', async () => {
    const { page, autoTeamBuilder, userState } = await createPage();
    let resolveBuild: ((value: AutoBuildResult | null) => void) | null = null;

    autoTeamBuilder.buildTeam.mockImplementation(
      () =>
        new Promise<AutoBuildResult | null>((resolve) => {
          resolveBuild = resolve;
        }),
    );

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);

    const buildPromise = page.buildTeam();

    await Promise.resolve();

    expect(page.building()).toBe(true);

    await page.onAutoTeamBuilderManualWorkerCountChange({
      detail: { value: 2 },
    } as CustomEvent<{ value: number }>);

    expect(userState.setAutoTeamBuilderWorkerPreference).toHaveBeenCalledWith({
      mode: 'auto',
      manualCount: 2,
    });
    expect(page.building()).toBe(true);

    resolveBuild?.(null);
    await buildPromise;

    expect(page.building()).toBe(false);
  });

  it('passes duplicate-character protection to the builder service by default', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        requireUniqueBaseCharacterNames: true,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('passes the strict Super Special Criteria coverage toggle to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.onRequireSuperSpecialCriteriaCoverageToggle({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        strictSuperSpecialCriteriaCoverage: true,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('passes the strict Super Tandem coverage toggle to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.onRequireSuperTandemCriteriaCoverageToggle({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        strictSuperTandemCriteriaCoverage: true,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('passes the leader super effect scope toggle to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.onRequireAllSlotsInLeaderSuperEffectScopeToggle({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        requireAllSlotsInLeaderSuperEffectScope: true,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('does not pass the removed no-super-leaders filter to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.not.objectContaining({
        requireLeadersWithoutSuperEffects: expect.anything(),
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('uses only leader super effect scope in the strict mode summary', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.requireAllSlotsInLeaderSuperEffectScope.set(true);

    expect(page.strictModeLabel()).toContain('leader super effect scope');
    expect(page.strictModeLabel()).not.toContain('no super leaders');
  });

  it('creates a candidate pool box before build using the exact selected-box scope', async () => {
    const { page, repository, userState } = await createPage();

    repository.getAutoBuilderCandidates.mockResolvedValue([
      createCharacterRecord(201, 'Scoped Candidate'),
      createCharacterRecord(901, 'Locked Outside Scope'),
    ]);

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
    page.favoritesOnly.set(false);
    page.selectedCharacterBoxId.set('box-1');
    page.manualSlots.set(
      createManualSlots({
        captain: [901],
      }),
    );
    page.excludedCharacterIds.set([202]);

    await page.createCandidatePoolBox();

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(['DEX'], null, {
      selectedClasses: ['Fighter'],
      allowedCharacterIds: [201, 202, 203],
      lockedCharacterIds: [901],
      excludedCharacterIds: [202],
    });
    expect(userState.saveCharacterBox).toHaveBeenCalledWith({
      name: 'Auto Builder Pool 1',
      characterIds: [201, 901],
    });
    expect(page.selectedCharacterBoxId()).toBe('box-3');
    expect(page.candidatePoolBoxFeedback()).toEqual({
      tone: 'success',
      title: 'Auto Builder Pool 1 is ready',
      details: ['2 characters were saved into the new character box.'],
    });
  });

  it('keeps locked manual picks outside favorite scope in the candidate pool box', async () => {
    const { page, repository } = await createPage();

    repository.getAutoBuilderCandidates.mockResolvedValue([
      createCharacterRecord(101, 'Favorite Candidate'),
      createCharacterRecord(700, 'Locked Non Favorite'),
    ]);

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
    page.favoritesOnly.set(true);
    page.manualSlots.set(
      createManualSlots({
        captain: [700],
      }),
    );

    await page.createCandidatePoolBox();

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(['DEX'], null, {
      selectedClasses: ['Fighter'],
      allowedCharacterIds: [101, 102, 103],
      lockedCharacterIds: [700],
      excludedCharacterIds: [],
    });
  });

  it('creates a candidate pool box from the captain-covered pool instead of the raw repository pool', async () => {
    const { page, repository, userState, autoTeamBuilder } = await createPage();
    const coveredCandidate = createCharacterRecord(301, 'Covered Candidate');
    const uncoveredCandidate = createCharacterRecord(302, 'Uncovered Candidate');
    const captain = createCharacterRecord(901, 'Selected Captain');

    repository.getAutoBuilderCandidates.mockResolvedValue([
      coveredCandidate,
      uncoveredCandidate,
      captain,
    ]);
    autoTeamBuilder.resolveCaptainCoveredCandidateRecords.mockReturnValue([
      coveredCandidate,
      captain,
    ]);

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
    page.manualSlots.set(
      createManualSlots({
        captain: [901],
      }),
    );

    await page.createCandidatePoolBox();

    expect(autoTeamBuilder.resolveCaptainCoveredCandidateRecords).toHaveBeenCalledWith(
      [coveredCandidate, uncoveredCandidate, captain],
      {
        captainCharacterId: 901,
        friendCaptainCharacterId: 901,
        requireFullCaptainAbilityCoverage: true,
        requireBothLeadersFullCaptainAbilityCoverage: false,
      },
    );
    expect(userState.saveCharacterBox).toHaveBeenCalledWith({
      name: 'Auto Builder Pool 1',
      characterIds: [301, 901],
    });
  });

  it('creates a candidate pool box without truncating scopes larger than 1200 candidates', async () => {
    const { page, repository, userState } = await createPage();
    const candidateRecords = Array.from({ length: 1202 }, (_, index) =>
      createCharacterRecord(5000 + index, `Candidate ${index + 1}`),
    );

    repository.getAutoBuilderCandidates.mockResolvedValue(candidateRecords);

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
    page.favoritesOnly.set(false);

    await page.createCandidatePoolBox();

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(['DEX'], null, {
      selectedClasses: ['Fighter'],
      allowedCharacterIds: undefined,
      lockedCharacterIds: [],
      excludedCharacterIds: [],
    });
    expect(userState.saveCharacterBox).toHaveBeenCalledWith({
      name: 'Auto Builder Pool 1',
      characterIds: candidateRecords.map((candidate) => candidate.id),
    });
  });

  it('does not create a candidate pool box when the resolved pool is empty', async () => {
    const { page, repository, userState } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
    page.selectedCharacterBoxId.set('box-empty');

    await page.createCandidatePoolBox();

    expect(repository.getAutoBuilderCandidates).not.toHaveBeenCalled();
    expect(userState.saveCharacterBox).not.toHaveBeenCalled();
    expect(page.candidatePoolBoxFeedback()).toEqual({
      tone: 'warning',
      title: 'No candidate pool is available',
      details: ['The current builder filters do not produce any searchable characters yet.'],
    });
    expect(page.selectedCharacterBoxId()).toBe('box-empty');
  });

  it('creates a candidate pool box after build without mutating the current result', async () => {
    const { page, repository, autoTeamBuilder } = await createPage();
    const buildResult = createAutoBuildResult();

    autoTeamBuilder.buildTeam.mockResolvedValue(buildResult);
    repository.getAutoBuilderCandidates.mockResolvedValue([
      createCharacterRecord(201, 'Candidate 1'),
      createCharacterRecord(202, 'Candidate 2'),
    ]);

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
    await page.buildTeam();

    const resultBeforeBoxCreation = page.result();

    await page.createCandidatePoolBox();

    expect(page.result()).toBe(resultBeforeBoxCreation);
  });

  it('passes picker-selected Special requirements to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.saveAbilityPicker([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        requiredAbilities: expect.arrayContaining([
          expect.objectContaining({
            abilityKey: 'remove_bind',
            minTurns: null,
            requiredCharacterCount: 1,
          }),
        ]),
      }),
      expect.any(Object),
    );
  });

  it('keeps picker-selected Special abilities in the manual requirement drafts', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    await page.saveAbilityPicker([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);

    expect(page.requiredAbilityDrafts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          abilityKey: 'remove_bind',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        }),
      ]),
    );
    expect(page.requiredAbilitySummaryChips().map((chip) => chip.label)).toContain('Bind');
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
  });

  it('keeps Special requirements in manual slot filters', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    await page.saveAbilityPicker([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    page.activeManualSlotRole.set('captain');

    expect(page.manualCandidateFilters().requiredAbilities).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
  });

  it('removes extra-drop requirements from manual sub slot filters', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    await page.saveAbilityPicker([
      {
        draftId: 'drop-guaranteed',
        abilityKey: 'extra_drop_guaranteed',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    page.activeManualSlotRole.set('sub1');

    expect(page.manualCandidateFilters().requiredAbilities).toEqual([]);
  });

  it('passes Special matching ids to manual candidate repository searches', async () => {
    const matchingLeader = createCharacterRecord(401, 'Buggy', [
      {
        key: 'extra_drop_any',
        label: 'Any Extra Drop',
        minTurns: null,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'captainAbility',
      },
      {
        key: 'extra_drop_guaranteed',
        label: 'Guaranteed Extra Drop',
        minTurns: null,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'captainAbility',
      },
    ]);
    const regularLeader = createCharacterRecord(402, 'Sanji');
    const { page, repository } = await createPage();

    repository.searchDetailedCharacters.mockResolvedValue([regularLeader, matchingLeader]);

    await page.ngOnInit();
    await page.saveAbilityPicker([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);

    expect(repository.searchDetailedCharacters).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedCharacterIds: [102, 101],
      }),
    );
    expect(page.manualCandidateCards().map((card) => card.character.id)).toEqual([402, 401]);
  });

  it('disables favorite-only auto-fill immediately', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.favoritesOnly.set(true);

    page.onFavoritesOnlyToggle({ detail: { checked: false } } as CustomEvent<{
      checked: boolean;
    }>);

    expect(page.favoritesOnly()).toBe(false);
  });

  it('disables favorite ship mode immediately', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.favoriteShipsOnly.set(true);

    page.onFavoriteShipsOnlyToggle({ detail: { checked: false } } as CustomEvent<{
      checked: boolean;
    }>);

    expect(page.favoriteShipsOnly()).toBe(false);
  });

  it('keeps duplicate-character protection enabled without a visible toggle', async () => {
    const { page } = await createPage();
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/auto-team-builder/auto-team-builder.page.html'),
      'utf8',
    );

    await page.ngOnInit();

    expect(page.requireUniqueBaseCharacterNames()).toBe(true);
    expect(template).not.toContain('onRequireUniqueBaseCharacterNamesToggle');
    expect(template).not.toContain('uniqueBaseCharacterNamesToggleLabel()');
  });

  it('passes configured ability requirements to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.requiredAbilityDrafts.set([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
      },
      {
        draftId: 'barrier-1',
        abilityKey: 'remove_slot_barrier',
        minTurns: 2,
        slotTokens: ['DEX'],
        requiredCharacterCount: 1,
      },
    ]);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 2,
          },
        ],
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('opens and closes the shared ability picker without mutating requirements', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.requiredAbilityDrafts.set([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
      },
    ]);

    page.openAbilityPicker();
    expect(page.abilityPickerOpen()).toBe(true);

    page.closeAbilityPicker();
    expect(page.abilityPickerOpen()).toBe(false);
    expect(page.requiredAbilityDrafts()).toEqual([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
      },
    ]);
  });

  it('opens and closes the enemy mechanic picker without mutating the current drafts', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.enemyMechanicDrafts.set([
      {
        draftId: 'barrier-1',
        mechanicKey: 'enemy_barrier',
        category: 'enemyDefense',
        minTurns: 3,
        triggerTags: [],
        responseTags: [],
        conditionTags: [],
        derivedAbilityKey: 'remove_enemy_barrier',
      },
    ]);

    page.openEnemyMechanicPicker();
    expect(page.enemyMechanicPickerOpen()).toBe(true);

    page.closeEnemyMechanicPicker();
    expect(page.enemyMechanicPickerOpen()).toBe(false);
    expect(page.enemyMechanicDrafts()).toHaveLength(1);
  });

  it('applies shared picker drafts and refreshes the manual candidate pool on save', async () => {
    const { page, repository } = await createPage();

    await page.ngOnInit();
    repository.searchDetailedCharacters.mockClear();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);

    await page.saveAbilityPicker([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
      },
    ]);

    expect(page.abilityPickerOpen()).toBe(false);
    expect(page.requiredAbilityDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 2,
      }),
    ]);
    expect(repository.searchDetailedCharacters).toHaveBeenCalledTimes(2);
  });

  it('preserves duplicate turn requirements from the shared ability picker', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);

    await page.saveAbilityPicker([
      {
        draftId: 'atk-down-5',
        abilityKey: 'remove_atk_down',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        draftId: 'atk-down-7',
        abilityKey: 'remove_atk_down',
        minTurns: 7,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        requiredAbilities: [
          {
            abilityKey: 'remove_atk_down',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
          {
            abilityKey: 'remove_atk_down',
            minTurns: 7,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('keeps enemy mechanics out of the Special-only requirement list on save', async () => {
    const { page, repository } = await createPage();

    await page.ngOnInit();
    repository.searchDetailedCharacters.mockClear();

    await page.saveEnemyMechanicPicker([
      {
        mechanicKey: 'enemy_barrier',
        category: 'enemyDefense',
        minTurns: 3,
        triggerTags: [],
        responseTags: [],
        conditionTags: [],
        derivedAbilityKey: 'remove_enemy_barrier',
      },
    ]);

    expect(page.enemyMechanicPickerOpen()).toBe(false);
    expect(page.pageRequiredAbilities()).toEqual([]);
    expect(repository.searchDetailedCharacters).toHaveBeenCalledTimes(2);
  });

  it('passes the selected manual ship to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.selectManualShip(9001);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        manualShipId: 9001,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('selects and clears the manual ship override inline', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    page.selectManualShip(9001);
    expect(page.selectedManualShipId()).toBe(9001);

    page.clearManualShipSelection();
    expect(page.selectedManualShipId()).toBeNull();
  });

  it('opens and closes the compact manual picker modal without changing picker state', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.setShipPickerMode('ships');

    page.openManualPickerModal();

    expect(page.manualPickerModalOpen()).toBe(true);
    expect(page.shipPickerMode()).toBe('ships');
    expect(page.visibleManualShipCandidates()).toHaveLength(2);

    page.closeManualPickerModal();

    expect(page.manualPickerModalOpen()).toBe(false);
  });

  it('opens and closes the compact exclude picker modal without changing picker state', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.setExcludePickerMode('ships');

    page.openExcludePickerModal();

    expect(page.excludePickerModalOpen()).toBe(true);
    expect(page.excludePickerMode()).toBe('ships');
    expect(page.visibleExcludedShipCandidates()).toHaveLength(2);

    page.closeExcludePickerModal();

    expect(page.excludePickerModalOpen()).toBe(false);
  });

  it('keeps the full ship catalog available inline for manual ship selection while marking excluded ships as blocked', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.excludedShipIds.set([9002]);
    page.setShipPickerMode('ships');

    expect(page.manualShipCandidates().map((shipCard) => shipCard.ship.id)).toEqual([9001, 9002]);
    expect(page.manualShipBlockedIds()).toEqual([9002]);
    expect(page.manualShipSupportLabels()[9002]).toBe(
      'This ship is excluded and cannot be confirmed as the manual ship.',
    );
  });

  it('keeps non-favorite ships visible inline for manual ship selection but blocks selecting them when favorite ships only is enabled', async () => {
    const { page, userState } = await createPage();

    await page.ngOnInit();
    userState.favoriteShipIds.set([9001]);
    await page.onFavoriteShipsOnlyToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.setShipPickerMode('ships');

    expect(page.manualShipCandidates().map((shipCard) => shipCard.ship.id)).toEqual([9001, 9002]);
    expect(page.manualShipBlockedIds()).toEqual([9002]);
    expect(page.manualShipSupportLabels()[9002]).toBe(
      'Only favorite ships can be confirmed while favorite ship mode is enabled.',
    );

    page.selectManualShip(9002);

    expect(page.selectedManualShipId()).toBeNull();
  });

  it('shows manual ship candidates 10 at a time and resets the visible count after searching', async () => {
    const { page, repository } = await createPage();

    repository.getShips.mockResolvedValue(createShipCatalog(23));
    await page.ngOnInit();
    page.setShipPickerMode('ships');

    expect(page.manualShipCandidates()).toHaveLength(23);
    expect(page.visibleManualShipCandidates()).toHaveLength(10);

    page.onManualShipListScroll(createShipListScrollEvent());

    expect(page.visibleManualShipCandidates()).toHaveLength(20);

    page.onManualShipSearchChange({ detail: { value: 'Ship' } } as CustomEvent<{
      value?: string | null;
    }>);

    expect(page.visibleManualShipCandidates()).toHaveLength(10);
  });

  it('shows excluded ship candidates 10 at a time and resets the visible count after searching', async () => {
    const { page, repository } = await createPage();

    repository.getShips.mockResolvedValue(createShipCatalog(24));
    await page.ngOnInit();
    page.favoriteShipsOnly.set(false);
    page.setExcludePickerMode('ships');

    expect(page.excludedShipCandidates()).toHaveLength(24);
    expect(page.visibleExcludedShipCandidates()).toHaveLength(10);

    page.onExcludedShipListScroll(createShipListScrollEvent());

    expect(page.visibleExcludedShipCandidates()).toHaveLength(20);

    page.onExcludeShipSearchChange({ detail: { value: 'Ship' } } as CustomEvent<{
      value?: string | null;
    }>);

    expect(page.visibleExcludedShipCandidates()).toHaveLength(10);
  });

  it('keeps all excluded ship candidates visible when favorite ship mode is enabled', async () => {
    const { page, userState } = await createPage();

    userState.favoriteShipIds.set([9001]);
    await page.ngOnInit();
    await page.onFavoriteShipsOnlyToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.setExcludePickerMode('ships');

    expect(page.excludedShipCandidates().map((shipCard) => shipCard.ship.id)).toEqual([9001, 9002]);
    expect(page.visibleExcludedShipCandidates().map((shipCard) => shipCard.ship.id)).toEqual([
      9001, 9002,
    ]);
  });

  it('passes slot-based OR picks to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.manualSlots.set(
      createManualSlots(
        {
          captain: [101, 102],
          sub1: [103, 104],
        },
        {
          sub1: 104,
        },
      ),
    );
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        manualSlots: createManualSlots(
          {
            captain: [101, 102],
            sub1: [103, 104],
          },
          {
            sub1: 104,
          },
        ),
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('passes excluded characters and ships to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.excludedCharacterIds.set([101, 102]);
    page.excludedShipIds.set([9002]);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        excludedCharacterIds: [101, 102],
        excludedShipIds: [9002],
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('passes the union of individual and character-box excludes to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.excludedCharacterIds.set([202, 999]);
    page.selectedExcludeCharacterBoxId.set('box-1');
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        excludedCharacterIds: [202, 999, 201, 203],
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('passes favorite ship filters to the builder service', async () => {
    const { page, autoTeamBuilder, userState } = await createPage();

    await page.ngOnInit();
    userState.favoriteShipIds.set([9002]);
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.onFavoriteShipsOnlyToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        favoriteShipsOnly: true,
        favoriteShipIds: [9002],
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('keeps non-leader manual candidates visible and selectable for leader slots', async () => {
    const { page } = await createPage();
    const leaderCandidate = createCharacterRecord(411, 'Leader Candidate');
    const subOnlyCandidate = createCharacterRecord(412, 'Sub Only');

    subOnlyCandidate.detail.captainAbility = '';

    await page.ngOnInit();
    page.manualCandidates.set([leaderCandidate, subOnlyCandidate]);
    page.activeManualSlotRole.set('captain');

    expect(
      page
        .manualCandidateCards()
        .map((candidate: { character: CharacterDetailRecord }) => candidate.character.id),
    ).toEqual([411, 412]);
    expect(page.canAssignCharacterToManualSlot('captain', subOnlyCandidate)).toBe(true);

    page.toggleCharacterInActiveManualSlot(subOnlyCandidate);

    expect(page.manualSlots().find((slot) => slot.role === 'captain')?.characterIds).toEqual([412]);
  });

  it('copies all manual picks from Captain to Friend Captain', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.manualSlots.set(createManualSlots({ captain: [101, 102] }));
    page.lockedCharacterRecords.set({
      101: createCharacterRecord(101),
      102: createCharacterRecord(102),
    });
    page.activeManualSlotRole.set('captain');

    page.openManualCopyModal();
    page.toggleManualCopyTarget('friendCaptain', {
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    page.applyManualCopy();

    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101, 102],
        friendCaptain: [101, 102],
      }),
    );
    expect(page.manualCopyModalOpen()).toBe(false);
  });

  it('toggles one required manual pick per slot', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.manualSlots.set(createManualSlots({ sub1: [301, 302] }));
    page.lockedCharacterRecords.set({
      301: createCharacterRecord(301),
      302: createCharacterRecord(302),
    });

    page.toggleRequiredManualSlotCharacter('sub1', 301);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')?.requiredCharacterId).toBe(301);
    expect(page.manualSlotCards().find((slot) => slot.role === 'sub1')?.selectedCharacters).toEqual(
      [
        expect.objectContaining({ id: 301, isRequiredInManualSlot: true }),
        expect.objectContaining({ id: 302, isRequiredInManualSlot: false }),
      ],
    );

    page.toggleRequiredManualSlotCharacter('sub1', 302);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')?.requiredCharacterId).toBe(302);

    page.toggleRequiredManualSlotCharacter('sub1', 302);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')?.requiredCharacterId).toBeNull();
  });

  it('clears required manual pick when the character or slot is removed', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.manualSlots.set(createManualSlots({ sub1: [301, 302] }, { sub1: 301 }));

    page.removeCharacterFromManualSlot('sub1', 301);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')).toMatchObject({
      characterIds: [302],
      requiredCharacterId: null,
    });

    page.toggleRequiredManualSlotCharacter('sub1', 302);
    page.clearManualSlot('sub1');

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')).toMatchObject({
      characterIds: [],
      requiredCharacterId: null,
    });
  });

  it('copy-merges selected manual picks into multiple sub slots while preserving targets', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.manualSlots.set(
      createManualSlots({
        sub1: [301, 302],
        sub2: [303],
      }),
    );
    page.lockedCharacterRecords.set({
      301: createCharacterRecord(301),
      302: createCharacterRecord(302),
      303: createCharacterRecord(303),
    });
    page.activeManualSlotRole.set('sub1');

    page.openManualCopyModal();
    page.toggleManualCopyCharacter(302, {
      detail: { checked: false },
    } as CustomEvent<{ checked: boolean }>);
    page.toggleManualCopyTarget('sub2', {
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    page.toggleManualCopyTarget('sub3', {
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    page.applyManualCopy();

    expect(page.manualSlots()).toEqual(
      createManualSlots({
        sub1: [301, 302],
        sub2: [303, 301],
        sub3: [301],
      }),
    );
  });

  it('does not duplicate copied manual picks already present in a target slot', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.manualSlots.set(
      createManualSlots({
        captain: [101, 102],
        friendCaptain: [101],
      }),
    );
    page.lockedCharacterRecords.set({
      101: createCharacterRecord(101),
      102: createCharacterRecord(102),
    });
    page.activeManualSlotRole.set('captain');

    page.openManualCopyModal();
    page.toggleManualCopyTarget('friendCaptain', {
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);
    page.applyManualCopy();

    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101, 102],
        friendCaptain: [101, 102],
      }),
    );
  });

  it('adds the best similar manual pick as an OR choice in the same slot', async () => {
    const { page, repository } = await createPage();
    const source = createCharacterRecord(301, 'Source Pick', [createBuilderAbility('remove_bind')]);
    const similar = createCharacterRecord(401, 'Similar Pick', [
      createBuilderAbility('remove_bind'),
    ]);
    const unrelated = createCharacterRecord(999, 'Unrelated Pick', [
      createBuilderAbility('remove_slot_barrier'),
    ]);

    await page.ngOnInit();
    page.manualSlots.set(createManualSlots({ sub1: [301] }));
    page.lockedCharacterRecords.set({ 301: source });
    repository.searchDetailedCharacters.mockResolvedValue([unrelated, similar]);

    await page.addSimilarManualPick('sub1', source);

    expect(page.manualSlots()).toEqual(createManualSlots({ sub1: [301, 401] }));
    expect(page.lockedCharacterRecords()[401]?.name).toBe('Similar Pick');
    expect(page.manualSimilarPickFeedback()).toBe(
      'Added Similar Pick as a similar OR pick for Source Pick.',
    );
  });

  it('ranks exact ability-key matches ahead of newer partial similar manual picks', async () => {
    const { page, repository } = await createPage();
    const source = createCharacterRecord(301, 'Source Pick', [
      createBuilderAbility('remove_bind'),
      createBuilderAbility('remove_slot_barrier'),
    ]);
    const newerPartial = createCharacterRecord(999, 'Newer Partial Pick', [
      createBuilderAbility('remove_bind'),
    ]);
    const olderExact = createCharacterRecord(401, 'Older Exact Pick', [
      createBuilderAbility('remove_bind'),
      createBuilderAbility('remove_slot_barrier'),
    ]);

    await page.ngOnInit();
    page.manualSlots.set(createManualSlots({ sub1: [301] }));
    page.lockedCharacterRecords.set({ 301: source });
    repository.searchDetailedCharacters.mockResolvedValue([newerPartial, olderExact]);

    await page.addSimilarManualPick('sub1', source);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')?.characterIds).toEqual([
      301, 401,
    ]);
  });

  it('uses newest id as the tie-breaker for equally similar manual picks', async () => {
    const { page, repository } = await createPage();
    const source = createCharacterRecord(301, 'Source Pick', [createBuilderAbility('remove_bind')]);
    const olderExact = createCharacterRecord(401, 'Older Exact Pick', [
      createBuilderAbility('remove_bind'),
    ]);
    const newerExact = createCharacterRecord(701, 'Newer Exact Pick', [
      createBuilderAbility('remove_bind'),
    ]);

    await page.ngOnInit();
    page.manualSlots.set(createManualSlots({ sub1: [301] }));
    page.lockedCharacterRecords.set({ 301: source });
    repository.searchDetailedCharacters.mockResolvedValue([olderExact, newerExact]);

    await page.addSimilarManualPick('sub1', source);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')?.characterIds).toEqual([
      301, 701,
    ]);
  });

  it('skips selected, excluded, and unique-base invalid similar manual candidates', async () => {
    const { page, repository } = await createPage();
    const source = createCharacterRecord(301, 'Source Pick', [createBuilderAbility('remove_bind')]);
    const alreadySelected = createCharacterRecord(901, 'Already Selected Pick', [
      createBuilderAbility('remove_bind'),
    ]);
    const excluded = createCharacterRecord(902, 'Excluded Pick', [
      createBuilderAbility('remove_bind'),
    ]);
    const conflict = createCharacterRecord(903, 'Conflict Pick', [
      createBuilderAbility('remove_bind'),
    ]);
    const otherSlotConflict = createCharacterRecord(302, 'Other Slot Conflict', [
      createBuilderAbility('remove_slot_barrier'),
    ]);
    const fallback = createCharacterRecord(401, 'Fallback Pick', [
      createBuilderAbility('remove_bind'),
    ]);

    source.detail.partyConflictKeys = ['same-base'];
    alreadySelected.detail.partyConflictKeys = ['same-base'];
    conflict.detail.partyConflictKeys = ['same-base'];
    otherSlotConflict.detail.partyConflictKeys = ['same-base'];
    fallback.detail.partyConflictKeys = ['fallback-base'];

    await page.ngOnInit();
    page.requireUniqueBaseCharacterNames.set(true);
    page.excludedCharacterIds.set([902]);
    page.manualSlots.set(createManualSlots({ sub1: [301, 901], sub2: [302] }));
    page.lockedCharacterRecords.set({
      301: source,
      901: alreadySelected,
      302: otherSlotConflict,
    });
    repository.searchDetailedCharacters.mockResolvedValue([
      alreadySelected,
      excluded,
      conflict,
      fallback,
    ]);

    await page.addSimilarManualPick('sub1', source);

    expect(page.manualSlots().find((slot) => slot.role === 'sub1')?.characterIds).toEqual([
      301, 901, 401,
    ]);
  });

  it('leaves manual slots unchanged and shows feedback when no similar pick exists', async () => {
    const { page, repository } = await createPage();
    const source = createCharacterRecord(301, 'Source Pick', [createBuilderAbility('remove_bind')]);
    const unrelated = createCharacterRecord(999, 'Unrelated Pick', [
      createBuilderAbility('remove_slot_barrier'),
    ]);

    await page.ngOnInit();
    page.manualSlots.set(createManualSlots({ sub1: [301] }));
    page.lockedCharacterRecords.set({ 301: source });
    repository.searchDetailedCharacters.mockResolvedValue([unrelated]);

    await page.addSimilarManualPick('sub1', source);

    expect(page.manualSlots()).toEqual(createManualSlots({ sub1: [301] }));
    expect(page.manualSimilarPickFeedback()).toBe('No similar OR pick was found for Source Pick.');
  });

  it('keeps non-favorite manual candidates visible when favorites-only mode is enabled', async () => {
    const { page, userState } = await createPage();
    const favoriteCandidate = createCharacterRecord(411, 'Favorite Candidate');
    const nonFavoriteCandidate = createCharacterRecord(412, 'Non Favorite Candidate');

    userState.favoriteCharacterIds.set([411]);

    await page.ngOnInit();
    page.manualCandidates.set([favoriteCandidate, nonFavoriteCandidate]);
    page.activeManualSlotRole.set('sub1');
    await page.onFavoritesOnlyToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);

    expect(
      page
        .manualCandidateCards()
        .map((candidate: { character: CharacterDetailRecord }) => candidate.character.id),
    ).toEqual([411, 412]);
  });

  it('passes selected character box ids to the builder when a box is selected', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.favoritesOnly.set(false);
    page.onCharacterBoxChange({
      detail: { value: 'box-1' },
    } as CustomEvent<{ value?: string | null }>);
    expect(page.selectedCharacterBox()?.id).toBe('box-1');
    expect(page.buildDisabled()).toBe(false);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        candidateCharacterIds: [201, 202, 203],
      }),
      expect.any(Object),
    );
  });

  it('passes the favorite and box intersection when both scopes are active', async () => {
    const { page, autoTeamBuilder, userState } = await createPage();

    userState.favoriteCharacterIds.set([202, 999]);
    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.onCharacterBoxChange({
      detail: { value: 'box-1' },
    } as CustomEvent<{ value?: string | null }>);
    page.favoritesOnly.set(true);
    expect(page.buildDisabled()).toBe(false);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        candidateCharacterIds: [202],
        favoritesOnly: true,
      }),
      expect.any(Object),
    );
  });

  it('passes the any-friend-captain toggle to the builder without changing the selected box scope', async () => {
    const { page, autoTeamBuilder, userState } = await createPage();

    userState.favoriteCharacterIds.set([202, 999]);
    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.onCharacterBoxChange({
      detail: { value: 'box-1' },
    } as CustomEvent<{ value?: string | null }>);
    page.favoritesOnly.set(true);
    page.allowAnyFriendCaptainAutoFill.set(true);

    expect(page.buildDisabled()).toBe(false);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        candidateCharacterIds: [202],
        favoritesOnly: true,
        allowAnyFriendCaptainAutoFill: true,
      }),
      expect.any(Object),
    );
  });

  it('defaults and resets the any-friend-captain toggle to off', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(page.allowAnyFriendCaptainAutoFill()).toBe(false);

    page.allowAnyFriendCaptainAutoFill.set(true);
    await page['resetPageState']();

    expect(page.allowAnyFriendCaptainAutoFill()).toBe(false);
  });

  it('blocks builds and surfaces a clear message when the selected box is empty', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedCharacterBoxId.set('box-empty');
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);

    expect(page.buildDisabled()).toBe(true);
    expect(page.characterBoxBlockedMessage()).toBe(
      'Empty Box is empty. Add characters to the box or switch back to all characters.',
    );
  });

  it('blocks assigning excluded characters into manual team slots', async () => {
    const { page } = await createPage();
    const excludedCandidate = createCharacterRecord(413, 'Excluded Candidate');

    await page.ngOnInit();
    page.excludedCharacterIds.set([413]);
    page.manualCandidates.set([excludedCandidate]);
    page.activeManualSlotRole.set('sub1');

    expect(page.canAssignCharacterToManualSlot('sub1', excludedCandidate)).toBe(false);
    expect(page.manualCandidateCards()[0]?.selectionSupportLabel).toBe(
      'Excluded picks cannot be assigned to final team slots.',
    );
  });

  it('blocks assigning characters excluded through the selected exclude box', async () => {
    const { page } = await createPage();
    const boxCandidate = createCharacterRecord(201, 'Box Candidate');

    await page.ngOnInit();
    page.selectedExcludeCharacterBoxId.set('box-1');
    page.manualCandidates.set([boxCandidate]);
    page.activeManualSlotRole.set('sub1');

    expect(page.canAssignCharacterToManualSlot('sub1', boxCandidate)).toBe(false);
    expect(page.manualCandidateCards()[0]?.selectionSupportLabel).toBe(
      'Excluded picks cannot be assigned to final team slots.',
    );
  });

  it('uses the global remove translation for selected manual picks', async () => {
    const { page } = await createPage();
    const selectedCandidate = createCharacterRecord(415, 'Selected Candidate');

    await page.ngOnInit();
    page.manualCandidates.set([selectedCandidate]);
    page.manualSlots.set(
      createManualSlots({
        captain: [415],
      }),
    );
    page.activeManualSlotRole.set('captain');

    expect(page.manualCandidateCards()[0]?.actionLabel).toBe('Remove');
  });

  it('excluding a manual-locked character clears it from manual slots and keeps the exclude', async () => {
    const { page } = await createPage();
    const lockedCandidate = createCharacterRecord(414, 'Locked Candidate');

    await page.ngOnInit();
    page.manualSlots.set(
      createManualSlots({
        captain: [414],
        sub1: [414],
      }),
    );
    page.excludedCandidates.set([lockedCandidate]);

    expect(page.excludedCharacterCards()[0]?.selectionSupportLabel).toBe(
      'Excluding this character will remove it from Captain / Sub 1.',
    );

    page.toggleExcludedCharacter(lockedCandidate);

    expect(page.excludedCharacterIds()).toEqual([414]);
    expect(page.manualSlots()).toEqual(createManualSlots());
  });

  it('uses the global remove translation for excluded character cards', async () => {
    const { page } = await createPage();
    const excludedCandidate = createCharacterRecord(416, 'Excluded Candidate');

    await page.ngOnInit();
    page.excludedCharacterIds.set([416]);
    page.excludedCandidates.set([excludedCandidate]);

    expect(page.excludedCharacterCards()[0]?.actionLabel).toBe('Remove');
  });

  it('does not list exclude-box characters as individual selected exclude chips', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.lockedCharacterRecords.set({
      201: createCharacterRecord(201, 'Box Member'),
      202: createCharacterRecord(202, 'Manual Exclude'),
      203: createCharacterRecord(203, 'Box Member 2'),
    });
    page.selectedExcludeCharacterBoxId.set('box-1');
    page.excludedCharacterIds.set([202]);

    expect(page.excludedCharacters().map((character) => character.id)).toEqual([202]);
    expect(page.effectiveExcludedCharacterIds()).toEqual([202, 201, 203]);
    expect(page.excludedSelectionSummaryLabel()).toBe('3 excluded characters, 0 excluded ships.');
  });

  it('disables excluding a character that is already excluded through the selected box', async () => {
    const { page } = await createPage();
    const boxCandidate = createCharacterRecord(201, 'Box Candidate');

    await page.ngOnInit();
    page.selectedExcludeCharacterBoxId.set('box-1');
    page.excludedCandidates.set([boxCandidate]);

    expect(page.canExcludeCharacter(201)).toBe(false);
    expect(page.excludedCharacterCards()[0]).toMatchObject({
      isExcluded: false,
      isSelectable: false,
      actionLabel: 'Exclude',
      selectionSupportLabel: 'Already excluded by Story Box.',
    });
  });

  it('removes manual picks that belong to the newly selected exclude box', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.manualSlots.set(
      createManualSlots({
        captain: [201],
        sub1: [999, 202],
      }),
    );

    page.onExcludeCharacterBoxChange({
      detail: { value: 'box-1' },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.selectedExcludeCharacterBoxId()).toBe('box-1');
    expect(page.manualSlots()).toEqual(
      createManualSlots({
        sub1: [999],
      }),
    );
  });

  it('keeps individual excludes removable when they overlap the selected exclude box', async () => {
    const { page } = await createPage();
    const overlappingCandidate = createCharacterRecord(201, 'Overlapping Candidate');

    await page.ngOnInit();
    page.selectedExcludeCharacterBoxId.set('box-1');
    page.excludedCharacterIds.set([201]);
    page.excludedCandidates.set([overlappingCandidate]);

    expect(page.canExcludeCharacter(201)).toBe(true);
    expect(page.excludedCharacterCards()[0]).toMatchObject({
      isExcluded: true,
      isSelectable: true,
      actionLabel: 'Remove',
    });

    page.toggleExcludedCharacter(overlappingCandidate);

    expect(page.excludedCharacterIds()).toEqual([]);
    expect(page.effectiveExcludedCharacterIds()).toEqual([201, 202, 203]);
  });

  it('excluding the current manual ship override clears the manual ship and keeps the exclude', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectManualShip(9001);
    page.toggleExcludedShip(9001);

    expect(page.selectedManualShipId()).toBeNull();
    expect(page.excludedShipIds()).toEqual([9001]);
    expect(page.canExcludeShip(9001)).toBe(true);
  });

  it('excluding a generated result character adds it to excludes, removes manual locks, and clears the current result', async () => {
    const { page } = await createPage();
    const currentResult = createAutoBuildResult();

    await page.ngOnInit();
    page.result.set(currentResult);
    page.manualSlots.set(
      createManualSlots({
        captain: [101],
      }),
    );

    page.toggleExcludedCharacter(currentResult.slots[0]!.character);

    expect(page.excludedCharacterIds()).toEqual([101]);
    expect(page.manualSlots()).toEqual(createManualSlots());
    expect(page.result()).toBeNull();
  });

  it('adds a generated captain to the matching manual slot while keeping the result visible', async () => {
    const { page } = await createPage();
    const currentResult = createAutoBuildResult();

    await page.ngOnInit();
    page.result.set(currentResult);
    page.currentTeamId.set('saved-auto-team');
    page.saveFeedbackError.set('Save failed');

    page.addResultCharacterToManualSlot(page.teamSlots()[0]!);

    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101],
      }),
    );
    expect(page.lockedCharacterRecords()[101]?.name).toBe(currentResult.slots[0]!.character.name);
    expect(page.result()).toBe(currentResult);
    expect(page.currentTeamId()).toBeNull();
    expect(page.saveFeedbackError()).toBe('');
  });

  it('adds generated subs to their matching manual sub slots', async () => {
    const { page } = await createPage();
    const currentResult = createAutoBuildResult();

    await page.ngOnInit();
    page.result.set(currentResult);

    page.addResultCharacterToManualSlot(page.teamSlots()[2]!);
    page.addResultCharacterToManualSlot(page.teamSlots()[5]!);

    expect(page.manualSlots()).toEqual(
      createManualSlots({
        sub1: [103],
        sub4: [106],
      }),
    );
    expect(page.result()).toBe(currentResult);
  });

  it('does not add excluded generated characters to manual slots', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.excludedCharacterIds.set([101]);

    expect(page.canAddResultCharacterToManualSlot(page.teamSlots()[0]!)).toBe(false);

    page.addResultCharacterToManualSlot(page.teamSlots()[0]!);

    expect(page.manualSlots()).toEqual(createManualSlots());
  });

  it('allows generated result characters to become OR picks in another manual slot', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.manualSlots.set(
      createManualSlots({
        sub1: [101],
      }),
    );

    expect(page.canAddResultCharacterToManualSlot(page.teamSlots()[0]!)).toBe(true);

    page.addResultCharacterToManualSlot(page.teamSlots()[0]!);

    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101],
        sub1: [101],
      }),
    );
  });

  it('excluding the current result ship recomputes the visible ship selection immediately', async () => {
    const { page } = await createPage();
    const currentResult = createAutoBuildResult();

    await page.ngOnInit();
    page.favoriteShipsOnly.set(false);
    page.selectedManualShipId.set(9001);
    page.result.set({
      ...currentResult,
      input: {
        ...currentResult.input,
        manualShipId: 9001,
      },
      requestedInput: {
        ...currentResult.requestedInput,
        manualShipId: 9001,
      },
      shipSelection: {
        ship: createShipRecord(9001),
        source: 'manual',
        reasonChips: ['Manual ship'],
      },
    });

    page.toggleExcludedShip(9001);

    expect(page.selectedManualShipId()).toBeNull();
    expect(page.excludedShipIds()).toEqual([9001]);
    expect(page.result()?.shipSelection?.ship.id).toBe(9002);
    expect(page.result()?.shipSelection?.source).toBe('recommended');
  });

  it('clears a non-favorite manual ship and recomputes the result ship when favorite ships only is enabled', async () => {
    const { page, userState } = await createPage();
    const currentResult = createAutoBuildResult();

    await page.ngOnInit();
    userState.favoriteShipIds.set([9002]);
    page.selectedManualShipId.set(9001);
    page.result.set({
      ...currentResult,
      input: {
        ...currentResult.input,
        manualShipId: 9001,
      },
      requestedInput: {
        ...currentResult.requestedInput,
        manualShipId: 9001,
      },
      shipSelection: {
        ship: createShipRecord(9001),
        source: 'manual',
        reasonChips: ['Manual ship'],
      },
    });

    await page.onFavoriteShipsOnlyToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);

    expect(page.selectedManualShipId()).toBeNull();
    expect(page.result()?.shipSelection?.ship.id).toBe(9002);
    expect(page.result()?.input.favoriteShipsOnly).toBe(true);
    expect(page.result()?.input.favoriteShipIds).toEqual([9002]);
  });

  it('describes favorites mode as favorite auto-fill for open slots in result copy', async () => {
    const { page } = await createPage();
    const result = createAutoBuildResult();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX', 'PSY']);
    page.favoritesOnly.set(true);
    page.manualSlots.set(
      createManualSlots({
        captain: [101],
        sub1: [103],
      }),
    );
    page.result.set({
      ...result,
      input: {
        ...result.input,
        favoritesOnly: true,
      },
      requestedInput: {
        ...result.requestedInput,
        favoritesOnly: true,
      },
    });

    expect(page.candidatePoolLabel()).toBe(
      'Built with favorite-only auto-fill for open slots while targeting DEX / PSY coverage.',
    );
  });

  it('formats captain-sourced abilities with a source suffix', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(
      page['formatCharacterAbility']({
        key: 'ignore_normal_attack_only',
        label: 'Ignore Normal Attack Only (NAO)',
        minTurns: null,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'captainAbility',
      }),
    ).toBe('Ignore Normal Attack Only (NAO) • Captain');
  });

  it('returns detail links only for selected characters', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(page.getCharacterDetailLink({ id: 404 } as never)).toEqual(['/characters', '404']);
    expect(page.getCharacterDetailLink(null)).toBeNull();
  });

  it('formats selectable debuff pain coverage with a dedicated label', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(
      page['formatCharacterAbility']({
        key: 'remove_pain',
        label: 'Remove Pain',
        minTurns: 5,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'specialText',
        coverageMode: 'selectedDebuff',
      }),
    ).toBe('Remove Pain (selectable debuff) (5 turns)');
  });

  it('formats ability requirements with a character-count prefix only when needed', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(
      page.formatAbilityRequirement({
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
      }),
    ).toBe('Bind (>=2 chars • 5 turns)');
    expect(
      page.formatAbilityRequirement({
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      }),
    ).toBe('Bind (5 turns)');
  });

  it('sanitizes empty character counts back to an effective default of 1', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.requiredAbilityDrafts.set([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);

    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
  });

  it('summarizes mixed pain coverage modes in the ability catalog label', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(
      page.formatAbilityCatalogItemLabel({
        key: 'remove_pain',
        label: 'Remove Pain',
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['specialText', 'captainAbility'],
        availableCoverageModes: ['explicit', 'selectedDebuff'],
        matchCount: 6,
        sampleCharacterIds: [2602, 4095],
        sampleTexts: [
          'Reduces 2 selected debuffs duration by 10 turns.',
          'Reduces Pain duration by 5 turns.',
        ],
      }),
    ).toBe('Remove Pain (includes selectable debuff counters)');
  });

  it('renders character detail links on thumbnails and names instead of detail buttons', async () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/auto-team-builder/auto-team-builder.page.html'),
      'utf8',
    );
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/pages/auto-team-builder/auto-team-builder.page.ts'),
      'utf8',
    );
    const normalizedTemplate = template.replace(/\s+/g, ' ');

    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template).not.toContain('common.actions.viewDetails');
    expect(template).not.toContain('detail-link-button');
    expect(template.match(/class="character-detail-thumb-link/g)).toHaveLength(4);
    expect(template.match(/class="character-detail-name-link/g)).toHaveLength(4);
    expect(template).toContain('[routerLink]="getCharacterDetailLink(candidateCard.character)"');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(slot.character)"');
    expect(template).toContain('(click)="saveTeam()"');
    expect(template).not.toContain('<ng-lottie');
    expect(template).toContain('[disabled]="saveUiLocked()"');
    expect(template).toContain('{{ saveButtonLabel() }}');
    expect(template).toContain('class="build-submit-button"');
    expect(template).toContain('{{ buildButtonLabel() }}');
    expect(template).toContain('(click)="pauseBuild()"');
    expect(template).toContain('(click)="resumeBuild()"');
    expect(template).toContain('(click)="downloadSelectionJson()"');
    expect(template).not.toContain('(click)="downloadTeamJson()"');
    expect(template).not.toContain('(click)="downloadSavedTeamImportJson()"');
    expect(template).not.toContain('slot.abilityChips');
    expect(template).not.toContain('slot.snippet');
    expect(template).toContain('<app-ability-filter-rail');
    expect(template).toContain('requiredCharacterAbilityRailItems(view)');
    expect(source).not.toContain("this.buildRequiredCharacterAbilityRailItem(view, 'captain')");
    expect(template).toContain('captainAbilityFilters.title');
    expect(template).toContain('captainAbilityDrafts()');
    expect(template).toContain('availableCaptainAbilityCatalogItems()');
    expect(template).toContain('captainFilterSummaryChips()');
    expect(template).toContain('[showLeaderBoostControls]="true"');
    expect(template).toContain('[leaderBoostFilters]="leaderBoostFilters()"');
    expect(template).toContain('[leaderBoostRanges]="leaderBoostRanges()"');
    expect(template).toContain(
      '(saveLeaderBoostSettings)="saveCaptainLeaderBoostSettings($event)"',
    );
    expect(template).not.toContain("t('filters.leaderBoost.label')");
    expect(template).not.toContain('(ionChange)="onLeaderBoostFilterChange($event)"');
    expect(template).toContain('captainAbilityCoverageToggleLabel()');
    expect(template).toContain('onRequireFullCaptainAbilityCoverageToggle($event)');
    expect(template).toContain('bothLeadersCaptainCoverageToggleLabel()');
    expect(template).toContain('onRequireBothLeadersFullCaptainAbilityCoverageToggle($event)');
    expect(template).toContain('superSpecialCriteriaCoverageToggleLabel()');
    expect(template).toContain('onRequireSuperSpecialCriteriaCoverageToggle($event)');
    expect(template).toContain('superTandemCriteriaCoverageToggleLabel()');
    expect(template).toContain('onRequireSuperTandemCriteriaCoverageToggle($event)');
    expect(template).toContain('ignoredSuperTandemCriteriaLabel()');
    expect(template).toContain('captainAbilityCoverageReportLabel()');
    expect(template).toContain('slot.characterTags');
    expect(template).toContain('clearRequiredCharacterAbilityCategory(');
    expect(template).not.toContain('ability-requirements-selected-row');
    expect(template).toContain('<app-ability-requirement-picker');
    expect(template).toContain('<app-character-ability-groups');
    expect(template).toContain('<app-captain-team-condition-status');
    expect(template).toContain('resultTeamConditionStatus()');
    expect(template).toContain('manual-locks-card');
    expect(template).not.toContain('fixedManualTeamConditionStatus()');
    expect(template).not.toContain('fixed-manual-team-card');
    expect(template).toContain('captain-condition-panel--full');
    expect(template).toContain('captain-condition-panel--partial');
    expect(template).not.toContain('<app-enemy-mechanic-picker');
    expect(template).not.toContain('<app-special-ability-picker');
    expect(template).not.toContain('<app-ship-picker');
    expect(template).not.toContain('leaderSuperEffectScopeToggleLabel()');
    expect(template).toContain('allowAnyFriendCaptainAutoFillToggleLabel()');
    expect(template).toContain('(ionChange)="onAllowAnyFriendCaptainAutoFillToggle($event)"');
    expect(template).toContain('favoriteShipsOnlyToggleLabel()');
    expect(template).toContain('[value]="manualShipSearchTerm()"');
    expect(template).toContain('(ionInput)="onManualShipSearchChange($event)"');
    expect(template).toContain('(scroll)="onManualShipListScroll($event)"');
    expect(template).toContain('(scroll)="onExcludedShipListScroll($event)"');
    expect(template).toContain("t('ships.actions.selected')");
    expect(template).toContain('(click)="toggleShipFavorite(shipCard.ship.id)"');
    expect(template).not.toContain('<cdk-virtual-scroll-viewport');
    expect(template).not.toContain('*cdkVirtualFor=');
    expect(template).toContain('(scroll)="onManualCharacterListScroll($event)"');
    expect(template).toContain('(scroll)="onExcludedCharacterListScroll($event)"');
    expect(template).toContain('manual-candidate-list--manual-characters');
    expect(template).toContain('manual-candidate-list--exclude-characters');
    expect(template).not.toContain('abilityRequirements.placeholders.selectAbility');
    expect(template).not.toContain('filters.extraDrop');
    expect(template).not.toContain('shipSearchTerm()');
    expect(template).not.toContain('manualCandidatesSummaryLabel()');
    expect(template).not.toContain('manualCandidatePoolSupportLabel()');
    expect(template).not.toContain('excludedCandidatesSummaryLabel()');
    expect(template).not.toContain('excludedCandidatePoolSupportLabel()');
    expect(template).not.toContain('manualFilterAppliedAbilityLabels()');
    expect(template).not.toContain('hasAppliedManualFilters()');
    expect(template).not.toContain('manualShipPickerOpen()');
    expect(template).toContain('[class.manual-lock-chip--ship-fallback]="!ship.thumbUrl"');
    expect(template).toContain('@if (ship.thumbUrl; as thumbUrl)');
    expect(template).toContain('[class.ship-candidate-icon--fallback]="!shipCard.ship.thumbUrl"');
    expect(template).toContain('@if (shipCard.ship.thumbUrl; as thumbUrl)');
    expect(template).toContain('(click)="toggleExcludedShip(shipSelection.ship.id)"');
    expect(template).toContain('(click)="addResultCharacterToManualSlot(slot)"');
    expect(template).toContain('(click)="addSimilarManualPick(slotCard.role, character, $event)"');
    expect(normalizedTemplate).toContain(
      'addSimilarManualPick( activeManualSlotRole(), character, $event )',
    );
    expect(template).toContain('(click)="toggleExcludedCharacter(slot.character)"');
    expect(template).toContain("t('exclude.actions.addShip')");
    expect(template).toContain("t('manual.actions.addResult')");
    expect(template).toContain("t('manual.similar.actions.addFor', { name: character.name })");
    expect(template).toContain("t('exclude.actions.add')");
    expect(template).toContain('@if (current.shipSelection; as shipSelection)');
    expect(template).not.toContain('leaderSuperSpecialCriteriaToggleLabel()');
    expect(template).toContain("t('fallback.allowedLeadersWithSuperEffects')");
    expect(template).toContain('ignoredSuperSpecialCriteriaLabel()');
  });

  it('preserves global Captain ability requirements alongside battle Special requirements', async () => {
    const { page } = await createPage();

    page.abilityCatalog.set({
      generatedAt: '2026-03-25T10:00:00.000Z',
      sourceVersion: 'test',
      abilityCount: 1,
      abilities: [
        {
          key: 'remove_despair',
          label: 'Despair',
          category: 'special',
          groupLabel: 'Reduce Status Effect Duration',
          groupOrder: 6,
          effectOrder: 0,
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['captainAbility', 'specialText'],
          matchCount: 10,
          matchingCharacterIds: [4549],
          turnMatchingCharacterIds: [{ minTurns: 10, characterIds: [4549] }],
          sampleCharacterIds: [4549],
          sampleTexts: ['Reduces Despair duration by 10 turns'],
        },
        {
          key: 'remove_bind',
          label: 'Bind',
          category: 'special',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['captainAbility', 'specialText'],
          matchCount: 10,
          sampleCharacterIds: [101],
          sampleTexts: ['Reduces Bind duration by 5 turns'],
        },
      ],
    });
    page.battleRequirements.set([
      {
        id: 'battle-1',
        title: 'Battle 1',
        enemyMechanics: [],
        requiredCharacterGroups: [
          {
            id: 'group-1',
            abilities: [
              {
                abilityKey: 'remove_bind',
                minTurns: 5,
                slotTokens: [],
                requiredCharacterCount: 1,
              },
            ],
          },
        ],
      },
    ]);

    const groupView = page.requiredBattleViews()[0]!.groupViews[0]!;
    const railItems = page.requiredCharacterAbilityRailItems(groupView);

    expect(railItems.map((item) => item.category)).toEqual([
      'special',
      'crewmate',
      'potential',
      'support',
    ]);
    expect(page.availableCaptainAbilityCatalogItems().map((item) => item.key)).toEqual([
      'remove_despair',
      'remove_bind',
    ]);

    page.openCaptainAbilityPicker();
    expect(page.captainAbilityPickerOpen()).toBe(true);

    await page.saveCaptainAbilityPicker([
      {
        draftId: 'captain-bind',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);

    expect(page.captainAbilityDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      }),
    ]);
    expect(page.battleRequirements()[0]!.requiredCharacterGroups[0]!.abilities).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);

    await page.clearRequiredCharacterAbilityCategory('battle-1', 'group-1', 'special');

    expect(page.battleRequirements()[0]!.requiredCharacterGroups[0]!.abilities).toEqual([]);
    expect(page.captainAbilityDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      }),
    ]);
  });

  it('reports partial captain condition status for generated result teams', async () => {
    const { page } = await createPage();
    const captain = createCharacterRecord(101);
    const friendCaptain = createCharacterRecord(102);

    captain.detail.captainAbility = 'Boosts ATK of all characters by 5x.';
    friendCaptain.detail.captainAbility = 'Boosts HP of [DEX] characters by 1.3x.';
    page.result.set(
      createAutoBuildResult([
        { role: 'captain', character: captain, reasonChips: [] },
        { role: 'friendCaptain', character: friendCaptain, reasonChips: [] },
        { role: 'sub', character: createCharacterRecord(103), reasonChips: [] },
        { role: 'sub', character: createCharacterRecord(104), reasonChips: [] },
        { role: 'sub', character: createCharacterRecord(105), reasonChips: [] },
        { role: 'sub', character: createCharacterRecord(106), reasonChips: [] },
      ]),
    );

    expect(page.resultTeamConditionStatus()?.state).toBe('partial');
    expect(page.resultTeamConditionStatus()?.passedLeaderLabels).toEqual(['Captain']);
    expect(page.resultTeamConditionStatus()?.failedLeaderLabels).toEqual(['Friend Captain']);
  });

  it('resets the full page state through resetPage', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
    page.selectedCharacterTags.set(['Straw Hat Pirates']);
    page.selectedCharacterNames.set(['zoro']);
    page.requireAllSelectedCharacterTagsInTeam.set(true);
    page.requireAllSelectedCharacterNamesInTeam.set(true);
    page.enemyMechanicDrafts.set([
      {
        draftId: 'barrier-1',
        mechanicKey: 'enemy_barrier',
        category: 'enemyDefense',
        minTurns: 3,
        triggerTags: [],
        responseTags: [],
        conditionTags: [],
        derivedAbilityKey: 'remove_enemy_barrier',
      },
    ]);
    page.requiredAbilityDrafts.set([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    page.lockedCharacterRecords.set({
      101: createCharacterRecord(101),
    });
    page.manualSlots.set(createManualSlots({ captain: [101] }));
    page.excludedCharacterIds.set([102]);
    page.activeManualSlotRole.set('sub2');
    page.selectedManualShipId.set(9001);
    page.excludedShipIds.set([9002]);
    page.favoritesOnly.set(true);
    page.favoriteShipsOnly.set(true);
    page.manualSearchTerm.set('Luffy');
    page.manualShipSearchTerm.set('Sunny');
    page.excludeCharacterSearchTerm.set('Kaido');
    page.excludeShipSearchTerm.set('Sunny');
    page.shipPickerMode.set('ships');
    page.excludePickerMode.set('ships');
    page.teamName.set('Auto Crew');
    page.notes.set('Generated');
    page.result.set(createAutoBuildResult());
    page.errorMessage.set('Build failed');
    page.currentTeamId.set('saved-team-1');
    page.saveUiLocked.set(true);
    page.saveFeedbackError.set('Save failed');
    page.presetImportFeedback.set({
      tone: 'success',
      title: 'Loaded',
      details: ['Done'],
    });
    page.loadedEnemyPresetName.set('Forest Boss');

    await page.resetPage();

    expect(page.selectedTypes()).toEqual([...page.availableTypes]);
    expect(page.selectedClasses()).toEqual([...page.availableClasses()]);
    expect(page.selectedCharacterTags()).toEqual([]);
    expect(page.selectedCharacterNames()).toEqual([]);
    expect(page.requireAllSelectedCharacterTagsInTeam()).toBe(false);
    expect(page.requireAllSelectedCharacterNamesInTeam()).toBe(false);
    expect(page.enemyMechanicDrafts()).toEqual([]);
    expect(page.requiredAbilityDrafts()).toEqual([]);
    expect(page.manualSlots()).toEqual(createManualSlots());
    expect(page.lockedCharacterIds()).toEqual([]);
    expect(page.excludedCharacterIds()).toEqual([]);
    expect(page.selectedLeaderIds()).toEqual([]);
    expect(page.effectiveCaptainLeaderId()).toBeNull();
    expect(page.activeManualSlotRole()).toBe('captain');
    expect(page.selectedManualShipId()).toBeNull();
    expect(page.excludedShipIds()).toEqual([]);
    expect(page.requireUniqueBaseCharacterNames()).toBe(true);
    expect(page.favoritesOnly()).toBe(true);
    expect(page.favoriteShipsOnly()).toBe(true);
    expect(page.manualSearchTerm()).toBe('');
    expect(page.manualShipSearchTerm()).toBe('');
    expect(page.excludeCharacterSearchTerm()).toBe('');
    expect(page.excludeShipSearchTerm()).toBe('');
    expect(page.shipPickerMode()).toBe('characters');
    expect(page.excludePickerMode()).toBe('characters');
    expect(page.teamName()).toBe('New Crew');
    expect(page.notes()).toBe('');
    expect(page.result()).toBeNull();
    expect(page.errorMessage()).toBe('');
    expect(page.currentTeamId()).toBeNull();
    expect(page.saveUiLocked()).toBe(false);
    expect(page.saveFeedbackError()).toBe('');
    expect(page.presetImportFeedback()).toBeNull();
    expect(page.loadedEnemyPresetName()).toBeNull();
  });

  it('updates build progress from the service execution callback', async () => {
    const { page, autoTeamBuilder } = await createPage();

    autoTeamBuilder.buildTeam.mockImplementation(
      async (
        _selectedClasses: string[],
        _selectedTypes: string[],
        _constraints: unknown,
        executionOptions?: { onProgress?: (snapshot: AutoBuildProgressSnapshot) => void },
      ) => {
        executionOptions?.onProgress?.({
          stage: 'exactAttempt',
          candidateCount: 1242,
          completedAttempts: 0,
          totalAttempts: 1,
          attemptCountFinal: false,
          elapsedMs: 25,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentAllowedLeadersWithSuperEffects: false,
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: 'progress.exactAttempt',
          messageParams: {
            current: 1,
            total: 1,
          },
        });

        return null;
      },
    );

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.buildTeam();

    expect(page.errorMessage()).toContain('DEX');
    expect(page.building()).toBe(false);
    expect(page.buildProgress()).toBeNull();
  });

  it('shows a dedicated manual conflict message for duplicate in-game characters', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.manualSlots.set(
      createManualSlots({
        captain: [3574],
        sub1: [2797],
      }),
    );
    page.lockedCharacterRecords.set({
      2797: createCharacterRecord(2797, 'Tony Tony Chopper - Long-Awaited Present'),
      3574: createCharacterRecord(3574, 'General Franky - Dream Docking'),
    });

    await page.buildTeam();

    expect(page.errorMessage()).toContain('General Franky - Dream Docking');
    expect(page.errorMessage()).toContain('Tony Tony Chopper - Long-Awaited Present');
    expect(page.errorMessage()).toContain('in-game character conflict');
  });

  it('shows a dedicated manual conflict message for General Franky and Law & Chopper', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.manualSlots.set(
      createManualSlots({
        captain: [3574],
        sub1: [3330],
      }),
    );
    page.lockedCharacterRecords.set({
      3330: createCharacterRecord(3330, 'Law & Chopper - Dynamic Doctor Duo'),
      3574: createCharacterRecord(3574, 'General Franky - Dream Docking'),
    });

    await page.buildTeam();

    expect(page.errorMessage()).toContain('General Franky - Dream Docking');
    expect(page.errorMessage()).toContain('Law & Chopper - Dynamic Doctor Duo');
    expect(page.errorMessage()).toContain('in-game character conflict');
  });

  it('exposes stable loading progress rows with placeholder slots', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.buildProgress.set({
      stage: 'fallbackAttempt',
      candidateCount: 1200,
      completedAttempts: 3503,
      totalAttempts: 31744,
      attemptCountFinal: false,
      elapsedMs: 54000,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: ['STR', 'INT'],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: 3504,
        total: 31744,
      },
    });

    expect(page.loadingProgressRows()).toEqual([
      {
        key: 'message',
        text: 'Fallback attempt 3504 / 31744',
        displayText: 'Fallback attempt 3504 / 31744',
        visible: true,
        tone: 'primary',
      },
      {
        key: 'currentStepElapsed',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'leaderPair',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'leaderPairPosition',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'attemptWork',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'candidateChecks',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'subPool',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'searchNodes',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'currentExclusions',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'permanentExclusions',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'activeWorkers',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'secondary',
      },
      {
        key: 'searchPasses',
        text: '31,744 scheduled search passes so far over the same pool of 1,200 candidates',
        displayText: '31,744 scheduled search passes so far over the same pool of 1,200 candidates',
        visible: true,
        tone: 'secondary',
      },
      {
        key: 'workEstimate',
        text: 'Upper-bound scheduled pool rescans so far: 31,744 x 1,200 = ~38,092,800 candidate checks',
        displayText:
          'Upper-bound scheduled pool rescans so far: 31,744 x 1,200 = ~38,092,800 candidate checks',
        visible: true,
        tone: 'secondary',
      },
      {
        key: 'searchMeaning',
        text: 'This is not every 6-slot team combination. Each pass rescans the same pool with exact or relaxed filters.',
        displayText:
          'This is not every 6-slot team combination. Each pass rescans the same pool with exact or relaxed filters.',
        visible: true,
        tone: 'secondary',
      },
      {
        key: 'eta',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'fallback',
      },
      {
        key: 'candidatePool',
        text: '1200 candidates in the current search pool',
        displayText: '1200 candidates in the current search pool',
        visible: true,
        tone: 'secondary',
      },
    ]);
  });

  it('shows the estimated finish row when a service estimate is available', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page['buildProgressNowMs'].set(new Date(2026, 2, 25, 10, 0, 0).getTime());
    page.buildProgress.set({
      stage: 'fallbackAttempt',
      candidateCount: 1200,
      completedAttempts: 3504,
      totalAttempts: 31744,
      attemptCountFinal: false,
      elapsedMs: 91000,
      estimatedRemainingMs: 61000,
      averageFallbackAttemptMs: 15000,
      completedFallbackAttempts: 2,
      currentDroppedTypes: [],
      currentDroppedClasses: ['Fighter'],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: 3505,
        total: 31744,
      },
    });

    expect(page.buildEstimatedFinishLabel()).toBe('Estimated finish: 10:01 (~1m 1s left)');
    expect(page.loadingProgressRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'eta',
          text: 'Estimated finish: 10:01 (~1m 1s left)',
          displayText: 'Estimated finish: 10:01 (~1m 1s left)',
          visible: true,
          tone: 'fallback',
        }),
      ]),
    );
  });

  it('estimates exact attempt finish time from recursive work units', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page['buildProgressNowMs'].set(new Date(2026, 2, 25, 10, 0, 0).getTime());
    page.buildProgress.set({
      stage: 'exactAttempt',
      candidateCount: 1200,
      completedAttempts: 0,
      totalAttempts: 1,
      attemptCountFinal: true,
      elapsedMs: 60_000,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      completedWorkUnits: 60,
      totalWorkUnits: 120,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.exactAttempt',
      messageParams: {
        current: 1,
        total: 1,
      },
    });

    expect(page.buildEstimatedFinishLabel()).toBe('Estimated finish: 10:01 (~1m 0s left)');
    expect(page.loadingProgressRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'eta',
          text: 'Estimated finish: 10:01 (~1m 0s left)',
          visible: true,
        }),
      ]),
    );
  });

  it('computes an overall 0-100 progress label for the active search', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.buildProgress.set({
      stage: 'fallbackAttempt',
      candidateCount: 1200,
      completedAttempts: 1,
      totalAttempts: 4,
      attemptCountFinal: false,
      elapsedMs: 91000,
      estimatedRemainingMs: 61000,
      averageFallbackAttemptMs: 15000,
      completedFallbackAttempts: 1,
      completedWorkUnits: 1,
      totalWorkUnits: 1,
      currentDroppedTypes: [],
      currentDroppedClasses: ['Fighter'],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: 2,
        total: 4,
      },
    });

    expect(page.buildOverallProgressPercent()).toBe(50);
    expect(page.buildOverallProgressLabel()).toBe('Overall progress: 50%');
  });

  it('does not show 100 percent while the final fallback attempt is still running', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.buildProgress.set({
      stage: 'fallbackAttempt',
      candidateCount: 1161,
      completedAttempts: 1,
      totalAttempts: 2,
      attemptCountFinal: true,
      elapsedMs: 91_000,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 1,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: 2,
        total: 2,
      },
    });

    expect(page.buildOverallProgressPercent()).toBe(50);
    expect(page.buildOverallProgressLabel()).toBe('Overall progress: 50%');

    const completedProgress = {
      ...page.buildProgress()!,
      stage: 'completed',
      completedAttempts: 2,
      messageKey: 'progress.completed',
    } satisfies AutoBuildProgressSnapshot;

    delete completedProgress.messageParams;
    page.buildProgress.set(completedProgress);

    expect(page.buildOverallProgressPercent()).toBe(100);
    expect(page.buildOverallProgressLabel()).toBe('Overall progress: 100%');
  });

  it('shows inner attempt progress, active workers, and elapsed step rows', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page['currentBuildStepStartedAtMs'].set(1_000);
    page['buildProgressNowMs'].set(65_000);
    page.buildProgress.set({
      stage: 'fallbackAttempt',
      candidateCount: 1161,
      completedAttempts: 1,
      totalAttempts: 2,
      attemptCountFinal: true,
      elapsedMs: 91_000,
      estimatedRemainingMs: 61_000,
      averageFallbackAttemptMs: 30_500,
      completedFallbackAttempts: 1,
      completedWorkUnits: 32,
      totalWorkUnits: 128,
      checkedCandidates: 32,
      totalCandidatesToCheck: 1161,
      activeWorkerCount: 7,
      currentCaptainId: 4556,
      currentCaptainName: 'Monkey D. Luffy - Future Pirate King',
      currentFriendCaptainId: 4549,
      currentFriendCaptainName: 'Eustass Kid - Whole Quest',
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: 2,
        total: 2,
      },
    });

    expect(page.loadingProgressRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'currentStepElapsed',
          text: 'Current step live: 1m 4s',
          visible: true,
        }),
        expect.objectContaining({
          key: 'leaderPair',
          text: 'Trying leaders: Captain Monkey D. Luffy - Future Pirate King (#4556) / Friend Eustass Kid - Whole Quest (#4549)',
          visible: true,
        }),
        expect.objectContaining({
          key: 'attemptWork',
          text: 'Current attempt work: 32 / 128 work units',
          visible: true,
        }),
        expect.objectContaining({
          key: 'candidateChecks',
          text: '32 / 1,161 candidate checks in the current attempt',
          visible: true,
        }),
        expect.objectContaining({
          key: 'activeWorkers',
          text: 'Active workers: 7',
          visible: true,
        }),
      ]),
    );
  });

  it('shows detailed leader pair, sub pool, search node, and exclusion progress rows', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.buildProgress.set({
      stage: 'exactAttempt',
      candidateCount: 1161,
      completedAttempts: 0,
      totalAttempts: 2,
      attemptCountFinal: false,
      elapsedMs: 12_000,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      completedWorkUnits: 32,
      totalWorkUnits: 128,
      checkedCandidates: 32,
      totalCandidatesToCheck: 1161,
      leaderPairIndex: 2,
      totalLeaderPairs: 8,
      subPoolSize: 37,
      searchNodesVisited: 1024,
      currentExclusionCounts: {
        total: 10,
        alreadyUsed: 2,
        duplicateBaseCharacter: 3,
        leaderScope: 4,
        costBudget: 1,
        missingRequiredGroup: 0,
      },
      permanentExclusionCounts: {
        total: 6,
        alreadyUsed: 2,
        duplicateBaseCharacter: 1,
        leaderScope: 2,
        costBudget: 1,
        missingRequiredGroup: 0,
      },
      currentCaptainId: 4478,
      currentCaptainName: 'King - Unleashing Tension',
      currentFriendCaptainId: 4229,
      currentFriendCaptainName: 'S-Snake & S-Hawk & S-Shark',
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.exactAttempt',
      messageParams: {
        current: 1,
        total: 2,
      },
    });

    expect(page.loadingProgressRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'leaderPairPosition',
          text: 'Leader pair 2 / 8 in this attempt',
          visible: true,
        }),
        expect.objectContaining({
          key: 'subPool',
          text: '37 sub candidates after permanent filters',
          visible: true,
        }),
        expect.objectContaining({
          key: 'searchNodes',
          text: '1,024 recursive search nodes visited in this attempt',
          visible: true,
        }),
        expect.objectContaining({
          key: 'currentExclusions',
          text: 'Current search skips: 10 (used 2, duplicate 3, leader scope 4, budget 1, no group 0)',
          visible: true,
        }),
        expect.objectContaining({
          key: 'permanentExclusions',
          text: 'Filtered before DFS: 6 (used 2, duplicate 1, leader scope 2, budget 1, no group 0)',
          visible: true,
        }),
      ]),
    );
  });

  it('keeps displayed progress percent from moving backward when recursive work grows', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    page['handleBuildProgressSnapshot']({
      stage: 'exactAttempt',
      candidateCount: 1200,
      completedAttempts: 0,
      totalAttempts: 1,
      attemptCountFinal: false,
      elapsedMs: 12_000,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      completedWorkUnits: 80,
      totalWorkUnits: 100,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.exactAttempt',
      messageParams: {
        current: 1,
        total: 1,
      },
    });

    expect(page.buildOverallProgressPercent()).toBe(80);

    page['handleBuildProgressSnapshot']({
      ...page.buildProgress()!,
      completedWorkUnits: 100,
      totalWorkUnits: 500,
      searchNodesVisited: 500,
    });

    expect(page.buildOverallProgressPercent()).toBe(80);
    expect(page.buildOverallProgressLabel()).toBe('Overall progress: 80%');
  });

  it('formats short, minute, and hour fallback eta durations', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(page['formatApproximateDuration'](59_000)).toBe('~59s');
    expect(page['formatApproximateDuration'](61_000)).toBe('~1m 1s');
    expect(page['formatApproximateDuration'](3_600_000)).toBe('~1h 0m');
  });

  it('keeps manual candidates visible when top-level filters change and queries the manual pool without filter constraints', async () => {
    const { page, repository } = await createPage();
    const dexFighter = createCharacterRecord(201, 'DEX Fighter');
    const psySlasher = createCharacterRecord(202, 'PSY Slasher');
    const intShooter = createCharacterRecord(203, 'INT Shooter');

    dexFighter.type = 'DEX';
    dexFighter.classes = ['Fighter'];
    dexFighter.primaryClass = 'Fighter';
    dexFighter.secondaryClass = null;

    psySlasher.type = 'PSY';
    psySlasher.classes = ['Slasher'];
    psySlasher.primaryClass = 'Slasher';
    psySlasher.secondaryClass = null;

    intShooter.type = 'INT';
    intShooter.classes = ['Shooter'];
    intShooter.primaryClass = 'Shooter';
    intShooter.secondaryClass = null;

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery([dexFighter, psySlasher, intShooter], query),
    );

    await page.ngOnInit();
    repository.searchDetailedCharacters.mockClear();

    await page.onTypeChange({ detail: { value: ['DEX', 'PSY'] } } as CustomEvent<{
      value: string[];
    }>);

    expect(repository.searchDetailedCharacters).toHaveBeenNthCalledWith(1, {
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: 10,
      offset: 0,
    });
    expect(repository.searchDetailedCharacters).toHaveBeenNthCalledWith(2, {
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: 10,
      offset: 0,
    });
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [203, 202, 201],
    );
    expect(
      page.excludedCandidates().map((candidate: CharacterDetailRecord) => candidate.id),
    ).toEqual([203, 202, 201]);

    repository.searchDetailedCharacters.mockClear();
    await page.onClassChange({ detail: { value: ['Fighter', 'Slasher'] } } as CustomEvent<{
      value: string[];
    }>);

    expect(repository.searchDetailedCharacters).toHaveBeenNthCalledWith(1, {
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: 10,
      offset: 0,
    });
    expect(repository.searchDetailedCharacters).toHaveBeenNthCalledWith(2, {
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: 10,
      offset: 0,
    });
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [203, 202, 201],
    );
    expect(
      page.excludedCandidates().map((candidate: CharacterDetailRecord) => candidate.id),
    ).toEqual([203, 202, 201]);
  });

  it('keeps manual candidates visible when top-level ability requirements change and normalizes the build-context requirement count', async () => {
    const { page, repository } = await createPage();
    const bindSpecialist = createCharacterRecord(301, 'Bind Specialist', [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        minTurns: 5,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'specialText',
      },
    ]);
    const barrierSpecialist = createCharacterRecord(302, 'Barrier Specialist', [
      {
        key: 'remove_slot_barrier',
        label: 'Remove Slot Barrier',
        minTurns: 2,
        isCompleteRemoval: false,
        slotTokens: ['DEX'],
        source: 'specialText',
      },
    ]);

    repository.searchDetailedCharacters.mockResolvedValue([bindSpecialist, barrierSpecialist]);

    await page.ngOnInit();
    repository.searchDetailedCharacters.mockClear();

    await page.saveAbilityPicker([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 1,
        slotTokens: [],
        requiredCharacterCount: 4,
      },
    ]);

    expect(page.manualCandidateFilters().requiredAbilities).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [301, 302],
    );
    expect(
      page.excludedCandidates().map((candidate: CharacterDetailRecord) => candidate.id),
    ).toEqual([301, 302]);
  });

  it('rebuilds manual candidates with the full catalog after page reset', async () => {
    const { page, repository } = await createPage();
    const dexFighter = createCharacterRecord(401, 'Reset DEX Fighter');
    const psySlasher = createCharacterRecord(402, 'Reset PSY Slasher');

    dexFighter.type = 'DEX';
    dexFighter.classes = ['Fighter'];
    dexFighter.primaryClass = 'Fighter';
    dexFighter.secondaryClass = null;

    psySlasher.type = 'PSY';
    psySlasher.classes = ['Slasher'];
    psySlasher.primaryClass = 'Slasher';
    psySlasher.secondaryClass = null;

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery([dexFighter, psySlasher], query),
    );

    await page.ngOnInit();
    await page.onTypeChange({ detail: { value: ['DEX'] } } as CustomEvent<{ value: string[] }>);

    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [402, 401],
    );

    await page.ionViewWillEnter();

    expect(repository.searchDetailedCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: 10,
      offset: 0,
    });
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [402, 401],
    );
  });

  it('loads only the first 10 manual and excluded character matches on initial render', async () => {
    const { page, repository } = await createPage();
    const records = Array.from({ length: 26 }, (_, index) =>
      createCharacterRecord(600 + index, `Paged Candidate ${index + 1}`),
    );

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery(records, query),
    );

    await page.ngOnInit();

    const characterPickerCalls = repository.searchDetailedCharacters.mock.calls.filter(
      ([query]) => query.limit === 10,
    );

    expect(characterPickerCalls).toHaveLength(2);
    expect(characterPickerCalls).toEqual([
      [
        expect.objectContaining({
          searchTerm: '',
          selectedTypes: [],
          selectedClasses: [],
          sortMode: 'powerFirst',
          limit: 10,
          offset: 0,
        }),
      ],
      [
        expect.objectContaining({
          searchTerm: '',
          selectedTypes: [],
          selectedClasses: [],
          sortMode: 'powerFirst',
          limit: 10,
          offset: 0,
        }),
      ],
    ]);
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      records
        .map((record) => record.id)
        .reverse()
        .slice(0, 10),
    );
    expect(
      page.excludedCandidates().map((candidate: CharacterDetailRecord) => candidate.id),
    ).toEqual(
      records
        .map((record) => record.id)
        .reverse()
        .slice(0, 10),
    );
  });

  it('keeps newest picker candidates first regardless of cost', async () => {
    const { page, repository } = await createPage();
    const cost55 = createCharacterRecord(701, 'Cost 55');
    const cost65Older = createCharacterRecord(702, 'Cost 65 Older');
    const cost60 = createCharacterRecord(703, 'Cost 60');
    const cost99 = createCharacterRecord(704, 'Cost 99');
    const cost65Newer = createCharacterRecord(705, 'Cost 65 Newer');
    const cost70 = createCharacterRecord(706, 'Cost 70');

    cost55.cost = 55;
    cost65Older.cost = 65;
    cost60.cost = 60;
    cost99.cost = 99;
    cost65Newer.cost = 65;
    cost70.cost = 70;

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery(
        [cost55, cost65Older, cost60, cost99, cost65Newer, cost70],
        query,
      ),
    );

    await page.ngOnInit();

    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [706, 705, 704, 703, 702, 701],
    );
    expect(
      page.excludedCandidates().map((candidate: CharacterDetailRecord) => candidate.id),
    ).toEqual([706, 705, 704, 703, 702, 701]);
  });

  it('marks manual candidates that do not fit the remaining max total cost as blocked', async () => {
    const { page } = await createPage();
    const captain = createCharacterRecord(801, 'Budget Captain');
    const cheapSub = createCharacterRecord(802, 'Cheap Sub');
    const expensiveSub = createCharacterRecord(803, 'Expensive Sub');

    captain.cost = 80;
    cheapSub.cost = 20;
    expensiveSub.cost = 21;

    await page.ngOnInit();
    page.onMaxTotalCostChange({
      detail: { value: '100' },
    } as CustomEvent<{ value: string }>);
    page.toggleCharacterInActiveManualSlot(captain);
    page.selectManualSlot('sub1');
    page.manualCandidates.set([cheapSub, expensiveSub]);

    expect(
      page.manualCandidateCards().map((card) => ({
        id: card.character.id,
        selectable: card.isSelectableInActiveSlot,
      })),
    ).toEqual([
      { id: 802, selectable: true },
      { id: 803, selectable: false },
    ]);
  });

  it('loads more manual and excluded candidates in 10-item batches when the character lists scroll near the end', async () => {
    const { page, repository } = await createPage();
    const records = Array.from({ length: 26 }, (_, index) =>
      createCharacterRecord(600 + index, `Paged Candidate ${index + 1}`),
    );

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery(records, query),
    );

    await page.ngOnInit();

    const nearBottomScrollEvent = {
      target: {
        scrollTop: 340,
        clientHeight: 300,
        scrollHeight: 760,
      },
    } as unknown as Event;

    await page.onManualCharacterListScroll(nearBottomScrollEvent);
    await page.onExcludedCharacterListScroll(nearBottomScrollEvent);

    const characterPickerCalls = repository.searchDetailedCharacters.mock.calls.filter(
      ([query]) => query.limit === 10,
    );

    expect(characterPickerCalls).toEqual([
      [
        expect.objectContaining({
          searchTerm: '',
          selectedTypes: [],
          selectedClasses: [],
          sortMode: 'powerFirst',
          limit: 10,
          offset: 0,
        }),
      ],
      [
        expect.objectContaining({
          searchTerm: '',
          selectedTypes: [],
          selectedClasses: [],
          sortMode: 'powerFirst',
          limit: 10,
          offset: 0,
        }),
      ],
      [
        expect.objectContaining({
          searchTerm: '',
          selectedTypes: [],
          selectedClasses: [],
          sortMode: 'powerFirst',
          limit: 10,
          offset: 10,
        }),
      ],
      [
        expect.objectContaining({
          searchTerm: '',
          selectedTypes: [],
          selectedClasses: [],
          sortMode: 'powerFirst',
          limit: 10,
          offset: 10,
        }),
      ],
    ]);
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      records
        .map((record) => record.id)
        .reverse()
        .slice(0, 20),
    );
    expect(
      page.excludedCandidates().map((candidate: CharacterDetailRecord) => candidate.id),
    ).toEqual(
      records
        .map((record) => record.id)
        .reverse()
        .slice(0, 20),
    );
  });

  it('keeps the character loading-more state active while a manual picker page is pending', async () => {
    const { page, repository } = await createPage();
    const records = Array.from({ length: 20 }, (_, index) =>
      createCharacterRecord(700 + index, `Loading Candidate ${index + 1}`),
    );
    let resolveNextPage: (() => void) | undefined;

    repository.searchDetailedCharacters.mockImplementation((query) => {
      if (query.offset === 10) {
        return new Promise<CharacterDetailRecord[]>((resolve) => {
          resolveNextPage = () => resolve(filterCharactersForManualQuery(records, query));
        });
      }

      return Promise.resolve(filterCharactersForManualQuery(records, query));
    });

    await page.ngOnInit();

    const loadPromise = page.onManualCharacterListScroll({
      target: {
        scrollTop: 340,
        clientHeight: 300,
        scrollHeight: 760,
      },
    } as unknown as Event);

    expect(page.manualCandidatesLoadingMore()).toBe(true);

    resolveNextPage?.();
    await loadPromise;

    expect(page.manualCandidatesLoadingMore()).toBe(false);
    expect(page.manualCandidates()).toHaveLength(20);
  });

  it('resets manual character paging when the manual picker search changes', async () => {
    const { page, repository } = await createPage();
    const records = Array.from({ length: 26 }, (_, index) =>
      createCharacterRecord(800 + index, `Search Reset Candidate ${index + 1}`),
    );

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery(records, query),
    );

    await page.ngOnInit();
    await page.onManualCharacterListScroll({
      target: {
        scrollTop: 340,
        clientHeight: 300,
        scrollHeight: 760,
      },
    } as unknown as Event);

    expect(page.manualCandidates()).toHaveLength(20);

    repository.searchDetailedCharacters.mockClear();
    await page.onManualSearchChange({
      detail: { value: 'Candidate 26' },
    } as CustomEvent<{ value: string }>);

    expect(repository.searchDetailedCharacters).toHaveBeenCalledWith(
      expect.objectContaining({
        searchTerm: 'Candidate 26',
        limit: 10,
        offset: 0,
      }),
    );
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [825],
    );
  });

  it('ignores stale manual candidate responses when the search term changes quickly', async () => {
    const { page, repository } = await createPage();

    await page.ngOnInit();

    let resolveFirstRequest: ((value: CharacterDetailRecord[]) => void) | undefined;
    let resolveSecondRequest: ((value: CharacterDetailRecord[]) => void) | undefined;

    repository.searchDetailedCharacters.mockReset();
    repository.searchDetailedCharacters
      .mockImplementationOnce(
        () =>
          new Promise<CharacterDetailRecord[]>((resolve) => {
            resolveFirstRequest = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<CharacterDetailRecord[]>((resolve) => {
            resolveSecondRequest = resolve;
          }),
      );

    const firstRefresh = page.onManualSearchChange({ detail: { value: 'first' } } as CustomEvent<{
      value: string;
    }>);
    const secondRefresh = page.onManualSearchChange({ detail: { value: 'second' } } as CustomEvent<{
      value: string;
    }>);

    resolveSecondRequest?.([createCharacterRecord(501, 'Second Result')]);
    resolveFirstRequest?.([createCharacterRecord(502, 'First Result')]);

    await Promise.all([firstRefresh, secondRefresh]);

    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [501],
    );
  });

  it('cancels the active build and restores the previous result', async () => {
    const { page, autoTeamBuilder } = await createPage();
    const previousResult = createAutoBuildResult();

    autoTeamBuilder.buildTeam.mockImplementation(
      async (
        _selectedClasses: string[],
        _selectedTypes: string[],
        _constraints: unknown,
        executionOptions?: {
          signal?: AbortSignal;
          onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
        },
      ) =>
        new Promise<null>((resolve, reject) => {
          executionOptions?.onProgress?.({
            stage: 'exactAttempt',
            candidateCount: 64,
            completedAttempts: 0,
            totalAttempts: 2,
            attemptCountFinal: false,
            elapsedMs: 18,
            estimatedRemainingMs: null,
            averageFallbackAttemptMs: null,
            completedFallbackAttempts: 0,
            currentDroppedTypes: [],
            currentDroppedClasses: [],
            currentAllowedLeadersWithSuperEffects: false,
            currentIgnoredLeaderSuperSpecialCriteria: false,
            messageKey: 'progress.exactAttempt',
            messageParams: {
              current: 1,
              total: 2,
            },
          });
          executionOptions?.signal?.addEventListener(
            'abort',
            () => reject(new AutoTeamBuildCancelledError()),
            { once: true },
          );
        }),
    );

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.result.set(previousResult);

    const buildPromise = page.buildTeam();

    expect(page.buildDisabled()).toBe(true);

    page.cancelBuild();
    await buildPromise;

    expect(page.result()).toEqual(previousResult);
    expect(page.errorMessage()).toBe('');
    expect(page.building()).toBe(false);
  });

  it('pauses the active build and resumes by starting a fresh run with the same inputs', async () => {
    const { page, autoTeamBuilder } = await createPage();
    const previousResult = createAutoBuildResult();
    const resumedResult = createAutoBuildResult([
      { role: 'captain', character: createCharacterRecord(201), reasonChips: ['Captain slot'] },
      {
        role: 'friendCaptain',
        character: createCharacterRecord(202),
        reasonChips: ['Friend captain slot'],
      },
      { role: 'sub', character: createCharacterRecord(203), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(204), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(205), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(206), reasonChips: [] },
    ]);

    autoTeamBuilder.buildTeam
      .mockImplementationOnce(
        async (
          _selectedClasses: string[],
          _selectedTypes: string[],
          _constraints: unknown,
          executionOptions?: { signal?: AbortSignal },
        ) =>
          new Promise<null>((_resolve, reject) => {
            executionOptions?.signal?.addEventListener(
              'abort',
              () => reject(new AutoTeamBuildCancelledError()),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(resumedResult);

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.result.set(previousResult);

    const buildPromise = page.buildTeam();

    page.pauseBuild();
    await buildPromise;

    expect(page.buildPaused()).toBe(true);
    expect(page.result()).toEqual(previousResult);
    expect(page.building()).toBe(false);

    await page.resumeBuild();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledTimes(2);
    expect(autoTeamBuilder.buildTeam).toHaveBeenLastCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.any(Object),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(page.buildPaused()).toBe(false);
    expect(page.result()).toEqual(resumedResult);
  });

  it('cancels the active build before resetPage and does not restore the previous result', async () => {
    const { page, autoTeamBuilder } = await createPage();
    const previousResult = createAutoBuildResult();

    autoTeamBuilder.buildTeam.mockImplementation(
      async (
        _selectedClasses: string[],
        _selectedTypes: string[],
        _constraints: unknown,
        executionOptions?: {
          signal?: AbortSignal;
          onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
        },
      ) =>
        new Promise<null>((_resolve, reject) => {
          executionOptions?.signal?.addEventListener(
            'abort',
            () => reject(new AutoTeamBuildCancelledError()),
            { once: true },
          );
        }),
    );

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.result.set(previousResult);
    page.currentTeamId.set('saved-team-before-reset');

    const buildPromise = page.buildTeam();

    await page.resetPage();
    await buildPromise;

    expect(page.result()).toBeNull();
    expect(page.currentTeamId()).toBeNull();
    expect(page.selectedTypes()).toEqual([...page.availableTypes]);
    expect(page.selectedClasses()).toEqual([...page.availableClasses()]);
    expect(page.building()).toBe(false);
  });
});

describe('AutoTeamBuilderPage offline save', () => {
  it('does not save when there is no generated result', async () => {
    const { page, userState } = await createPage();

    await page.ngOnInit();
    await page.saveTeam();

    expect(userState.saveTeam).not.toHaveBeenCalled();
  });

  it('saves immediately and unlocks after the save finishes', async () => {
    const { page, userState } = await createPage();

    await page.ngOnInit();
    page.teamName.set('Auto Crew');
    page.notes.set('Generated from filters');
    page.result.set({
      ...createAutoBuildResult(),
      shipSelection: {
        ship: createShipRecord(9001),
        source: 'recommended',
        reasonChips: ['Recommended ship'],
      },
    });

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: undefined,
      name: 'Auto Crew',
      notes: 'Generated from filters',
      shipId: 9001,
      slots: [101, 102, 103, 104, 105, 106],
    });
    expect(page.currentTeamId()).toBe('saved-auto-team');
    expect(page.saveUiLocked()).toBe(false);
    expect(page.saveFeedbackError()).toBe('');
  });

  it('reuses the current saved team id when saving the same generated result again', async () => {
    const { page, userState } = await createPage();

    userState.saveTeam
      .mockResolvedValueOnce({ id: 'saved-auto-team' })
      .mockResolvedValueOnce({ id: 'saved-auto-team' });

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());

    await page.saveTeam();

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: undefined,
      }),
    );
    expect(userState.saveTeam).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'saved-auto-team',
      }),
    );
  });

  it('ignores repeated save clicks while the save request is active', async () => {
    const { page, userState } = await createPage();
    let resolveSave: (value: { id: string }) => void = () => undefined;

    userState.saveTeam.mockReturnValueOnce(
      new Promise<{ id: string }>((resolve) => {
        resolveSave = resolve;
      }),
    );

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());

    const firstSavePromise = page.saveTeam();
    await Promise.resolve();

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenCalledTimes(1);
    expect(page.saveUiLocked()).toBe(true);

    resolveSave({ id: 'saved-auto-team' });
    await firstSavePromise;

    expect(page.saveUiLocked()).toBe(false);
  });

  it('unlocks immediately and shows inline feedback when save fails', async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { page, userState } = await createPage();

    userState.saveTeam.mockRejectedValueOnce(new Error('save failed'));

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());

    await page.saveTeam();

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(page.saveUiLocked()).toBe(false);
    expect(page.saveFeedbackError()).toBe('The team could not be saved. Please try again.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the current saved team id when the generated team is reset', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.currentTeamId.set('saved-auto-team');

    await page.onClassChange({ detail: { value: ['Fighter'] } } as CustomEvent<{
      value?: string[] | string | null;
    }>);

    expect(page.currentTeamId()).toBeNull();
    expect(page.result()).toBeNull();
  });
});

describe('AutoTeamBuilder export helpers', () => {
  it('builds the expected export payload for dual leaders with favorite flags', () => {
    const result = createAutoBuildResult();
    const payload = buildAutoTeamExportPayload(
      result,
      [101, 103],
      101,
      102,
      '2026-03-25T10:00:00.000Z',
    );

    expect(payload.exportedAt).toBe('2026-03-25T10:00:00.000Z');
    expect(payload.source).toBe('auto-team-builder');
    expect(payload.requestedInput).toBe(result.requestedInput);
    expect(payload.effectiveInput).toBe(result.input);
    expect(payload.relaxation).toBe(result.relaxation);
    expect(payload.coverage).toBe(result.coverage);
    expect(payload.coverage.leaderCriteria).toEqual(result.coverage.leaderCriteria);
    expect(payload.team).toHaveLength(6);
    expect(payload.team[0]).toMatchObject({
      slotIndex: 0,
      role: 'captain',
      isLeader: true,
      leaderAssignment: 'captain',
      isFavorite: true,
      character: { id: 101 },
    });
    expect(payload.team[1]).toMatchObject({
      slotIndex: 1,
      role: 'friendCaptain',
      isLeader: true,
      leaderAssignment: 'friendCaptain',
      isFavorite: false,
      character: { id: 102 },
    });
    expect(payload.team[2]).toMatchObject({
      slotIndex: 2,
      role: 'sub',
      isLeader: false,
      leaderAssignment: null,
      isFavorite: true,
      character: { id: 103 },
    });
    expect(payload.team.every((slot) => Boolean(slot.character.detail))).toBe(true);
  });

  it('preserves leader cost restrictions in exported coverage', () => {
    const result = createAutoBuildResult();
    result.coverage.leaderCriteria = {
      ...result.coverage.leaderCriteria,
      derivedAllowedClasses: [],
      derivedAllowedTypes: [],
      hasCostRestriction: true,
      maxAllowedCost: 40,
      hasClassRestriction: false,
      hasTypeRestriction: false,
      matchingSlots: 4,
      totalSlots: 6,
      allSlotsMatch: false,
    };

    const payload = buildAutoTeamExportPayload(
      result,
      [2035],
      2035,
      2035,
      '2026-04-13T06:57:25.964Z',
    );

    expect(payload.coverage.leaderCriteria.hasCostRestriction).toBe(true);
    expect(payload.coverage.leaderCriteria.maxAllowedCost).toBe(40);
  });

  it('marks a duplicated single leader as dual on both captain slots', () => {
    const leader = createCharacterRecord(201, 'Solo Leader');
    const result = createAutoBuildResult([
      { role: 'captain', character: leader, reasonChips: ['Captain slot'] },
      { role: 'friendCaptain', character: leader, reasonChips: ['Friend captain slot'] },
      { role: 'sub', character: createCharacterRecord(202), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(203), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(204), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(205), reasonChips: [] },
    ]);
    const payload = buildAutoTeamExportPayload(result, [201], 201, 201, '2026-03-25T10:00:00.000Z');

    expect(payload.team[0]?.leaderAssignment).toBe('dual');
    expect(payload.team[1]?.leaderAssignment).toBe('dual');
    expect(payload.team[0]?.isLeader).toBe(true);
    expect(payload.team[1]?.isLeader).toBe(true);
  });

  it('does not start a download when the payload is missing', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const urlRef = {
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    };

    downloadAutoTeamExport(null, dom.window.document, urlRef);

    expect(urlRef.createObjectURL).not.toHaveBeenCalled();
    expect(urlRef.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('downloads the current team as json with the expected filename and payload', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const payload = buildAutoTeamExportPayload(
      createAutoBuildResult(),
      [101, 103],
      101,
      102,
      '2026-03-25T10:00:00.000Z',
    );
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:team-json';
      }),
      revokeObjectURL: vi.fn(),
    };
    let downloadedBlob: Blob | null = null;

    downloadAutoTeamExport(payload, dom.window.document, urlRef);

    expect(urlRef.createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:team-json');
    expect(downloadedBlob).not.toBeNull();

    const exportedJson = JSON.parse(await downloadedBlob!.text()) as ReturnType<
      typeof buildAutoTeamExportPayload
    >;

    expect(buildAutoTeamExportFilename(exportedJson.exportedAt)).toBe(
      'auto-team-builder-2026-03-25T10-00-00-000Z.json',
    );
    expect(exportedJson.team).toHaveLength(6);
    expect(exportedJson.team[0]?.leaderAssignment).toBe('captain');
    expect(exportedJson.team[1]?.leaderAssignment).toBe('friendCaptain');
    expect(exportedJson.team[2]?.isFavorite).toBe(true);
    expect(exportedJson.team[0]?.character.detail.characterId).toBe(101);
  });

  it('builds a Settings saved-team import payload from the current result', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.teamName.set('Importable Auto Team');
    page.notes.set('Use on the current quest.');

    expect(page.buildSavedTeamImportPayload('2026-05-05T20:14:45.183Z')).toEqual({
      schemaVersion: 1,
      source: 'saved-teams',
      exportedAt: '2026-05-05T20:14:45.183Z',
      teams: [
        {
          id: 'auto-team-builder-2026-05-05T20-14-45-183Z',
          name: 'Importable Auto Team',
          notes: 'Use on the current quest.',
          shipId: null,
          slots: [101, 102, 103, 104, 105, 106],
          createdAt: '2026-05-05T20:14:45.183Z',
          updatedAt: '2026-05-05T20:14:45.183Z',
        },
      ],
    });
  });
});

describe('AutoTeamBuilderPage leader scope labels', () => {
  it('ignores legacy leader cost restriction fields in the scope summary', async () => {
    const { page } = await createPage();
    const baseResult = createAutoBuildResult();

    await page.ngOnInit();
    page.result.set({
      ...baseResult,
      coverage: {
        ...baseResult.coverage,
        leaderCriteria: {
          ...baseResult.coverage.leaderCriteria,
          derivedAllowedClasses: [],
          derivedAllowedTypes: [],
          hasCostRestriction: true,
          maxAllowedCost: 40,
          hasClassRestriction: false,
          hasTypeRestriction: false,
          matchingSlots: 4,
          totalSlots: 6,
          allSlotsMatch: false,
        },
      },
    });

    expect(page.leaderCriteriaCostLabel()).toBe('Cost 40 or less');
    expect(page.leaderCriteriaScopeSummaryLabel()).toBe(
      'Leader abilities do not restrict class, type, or character tag coverage.',
    );
  });
});

describe('AutoTeamBuilderPage preset export state', () => {
  it('is available even when the page has no selected filters or manual picks', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set([]);
    page.selectedClasses.set([]);
    page.requireUniqueBaseCharacterNames.set(false);
    page.favoritesOnly.set(false);
    page.favoriteShipsOnly.set(false);

    expect(page.canDownloadSelectionJson()).toBe(true);
    expect(page.buildSelectionExportPayload()).toMatchObject({
      source: 'auto-team-builder',
      exportType: 'preset',
      filters: {
        selectedTypes: [],
        selectedClasses: [],
      },
    });
  });

  it('is enabled when the page only has filters, manual picks, or leader state', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    expect(page.canDownloadSelectionJson()).toBe(true);

    await page.ionViewWillEnter();
    page.manualSlots.set(createManualSlots({ sub1: [301] }));
    expect(page.canDownloadSelectionJson()).toBe(true);

    await page.ionViewWillEnter();
    page.manualSlots.set(createManualSlots({ captain: [302] }));
    expect(page.canDownloadSelectionJson()).toBe(true);

    await page.ionViewWillEnter();
    page.excludedCharacterIds.set([303]);
    expect(page.canDownloadSelectionJson()).toBe(true);
  });

  it('keeps preset download available while building and paused', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    page.building.set(true);
    expect(page.canDownloadSelectionJson()).toBe(true);
    expect(page.buildSelectionExportPayload()).not.toBeNull();

    page.building.set(false);
    page.buildPaused.set(true);
    expect(page.canDownloadSelectionJson()).toBe(true);
    expect(page.buildSelectionExportPayload()).not.toBeNull();
  });

  it('builds the preset export payload from the current page selections', async () => {
    const { page, userState } = await createPage();

    await page.ngOnInit();
    userState.favoriteCharacterIds.set([101, 102, 103]);
    userState.favoriteShipIds.set([9001]);
    page.selectedTypes.set(['DEX', 'PSY']);
    page.selectedClasses.set(['Fighter', 'Slasher']);
    page.requiredAbilityDrafts.set([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
      },
    ]);
    page.onRequireAllSelectedTypesToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.onRequireAllSelectedClassesToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.onRequireAllSlotsInLeaderSuperEffectScopeToggle({
      detail: { checked: true },
    } as CustomEvent<{
      checked: boolean;
    }>);
    page.onRequireBothLeadersFullCaptainAbilityCoverageToggle({
      detail: { checked: true },
    } as CustomEvent<{
      checked: boolean;
    }>);
    await page.onFavoritesOnlyToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    await page.onAllowAnyFriendCaptainAutoFillToggle({
      detail: { checked: true },
    } as CustomEvent<{
      checked: boolean;
    }>);
    await page.onFavoriteShipsOnlyToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.manualSlots.set(
      createManualSlots({
        captain: [102, 101],
        friendCaptain: [101, 102],
      }),
    );
    page.lockedCharacterRecords.set({
      101: createCharacterRecord(101),
      102: createCharacterRecord(102),
      103: createCharacterRecord(103),
    });
    page.excludedCharacterIds.set([103]);
    page.excludedShipIds.set([9002]);

    const payload = page.buildSelectionExportPayload('2026-03-25T10:00:00.000Z');

    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      schemaVersion: 31,
      exportedAt: '2026-03-25T10:00:00.000Z',
      source: 'auto-team-builder',
      exportType: 'preset',
      filters: {
        selectedTypes: ['DEX', 'PSY'],
        selectedClasses: ['Fighter', 'Slasher'],
        selectedCharacterTags: [],
        selectedCharacterNames: [],
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 2,
          },
        ],
        requiredCharacterGroups: [],
        enemyMechanics: [],
        requireAllSelectedTypesInTeam: true,
        requireAllSelectedClassesPerCharacter: true,
        requireAllSelectedCharacterTagsInTeam: false,
        requireAllSelectedCharacterNamesInTeam: false,
        requireAllSlotsInLeaderSuperEffectScope: true,
        requireFullCaptainAbilityCoverage: true,
        requireBothLeadersFullCaptainAbilityCoverage: true,
        requireSuperSpecialCriteriaCoverage: false,
        requireSuperTandemCriteriaCoverage: false,
        requireUniqueBaseCharacterNames: true,
        favoritesOnly: true,
        allowAnyFriendCaptainAutoFill: true,
        favoriteCount: 3,
        favoriteShipsOnly: true,
        favoriteShipCount: 1,
        costRange: createEmptyAutoBuildCostRange(),
        leaderCostRange: createEmptyAutoBuildCostRange(),
        subCostRange: createEmptyAutoBuildCostRange(),
      },
      manualSelection: {
        lockedCharacterIds: [102, 101],
        excludedCharacterIds: [103],
        selectedLeaderIds: [102, 101],
        captainLeaderId: 102,
        friendCaptainLeaderId: 101,
        excludedShipIds: [9002],
        manualSlots: createManualSlots({
          captain: [102, 101],
          friendCaptain: [101, 102],
        }),
      },
    });
    expect(payload?.manualSelection.characters).toEqual([
      expect.objectContaining({
        id: 102,
        isLeader: true,
        leaderAssignment: 'captain',
      }),
      expect.objectContaining({
        id: 101,
        isLeader: true,
        leaderAssignment: 'friendCaptain',
      }),
    ]);
    expect(payload?.manualSelection.excludedCharacters).toEqual([
      expect.objectContaining({
        id: 103,
        isLeader: false,
        leaderAssignment: null,
      }),
    ]);
    expect(payload?.manualSelection.excludedShips).toEqual([
      expect.objectContaining({
        id: 9002,
      }),
    ]);
  });

  it('embeds generated team and saved-team import data in the preset export', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.teamName.set('Importable Auto Team');
    page.notes.set('Use on the current quest.');

    const payload = page.buildSelectionExportPayload('2026-05-05T20:14:45.183Z');

    expect(payload?.schemaVersion).toBe(31);
    expect(payload?.generatedTeamExport).toMatchObject({
      source: 'auto-team-builder',
      team: [
        expect.objectContaining({ slotIndex: 0, character: expect.objectContaining({ id: 101 }) }),
        expect.objectContaining({ slotIndex: 1, character: expect.objectContaining({ id: 102 }) }),
        expect.objectContaining({ slotIndex: 2, character: expect.objectContaining({ id: 103 }) }),
        expect.objectContaining({ slotIndex: 3, character: expect.objectContaining({ id: 104 }) }),
        expect.objectContaining({ slotIndex: 4, character: expect.objectContaining({ id: 105 }) }),
        expect.objectContaining({ slotIndex: 5, character: expect.objectContaining({ id: 106 }) }),
      ],
    });
    expect(payload?.savedTeamImport).toMatchObject({
      schemaVersion: 1,
      source: 'saved-teams',
      teams: [
        {
          id: 'auto-team-builder-2026-05-05T20-14-45-183Z',
          name: 'Importable Auto Team',
          notes: 'Use on the current quest.',
          shipId: null,
          slots: [101, 102, 103, 104, 105, 106],
          createdAt: '2026-05-05T20:14:45.183Z',
          updatedAt: '2026-05-05T20:14:45.183Z',
        },
      ],
    });
  });
});

describe('AutoTeamBuilder preset export helpers', () => {
  it('builds the expected preset payload for the current selection snapshot', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      selectedCharacterTags: [],
      selectedCharacterNames: [],
      requiredAbilities: [],
      requiredCharacterGroups: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedCharacterTagsInTeam: false,
      requireAllSelectedCharacterNamesInTeam: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireFullCaptainAbilityCoverage: false,
      requireBothLeadersFullCaptainAbilityCoverage: false,
      requireSuperSpecialCriteriaCoverage: false,
      requireSuperTandemCriteriaCoverage: true,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: true,
      allowAnyFriendCaptainAutoFill: false,
      favoriteCount: 4,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [102],
      }),
      lockedCharacterIds: [101, 102],
      lockedCharacters: [createCharacterRecord(101), createCharacterRecord(102)],
      selectedLeaderIds: [101, 102],
      captainLeaderId: 101,
      friendCaptainLeaderId: 102,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    expect(payload.filters).toEqual({
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      selectedCharacterTags: [],
      selectedCharacterNames: [],
      requiredAbilities: [],
      requiredCharacterGroups: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedCharacterTagsInTeam: false,
      requireAllSelectedCharacterNamesInTeam: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireFullCaptainAbilityCoverage: false,
      requireBothLeadersFullCaptainAbilityCoverage: false,
      requireSuperSpecialCriteriaCoverage: false,
      requireSuperTandemCriteriaCoverage: true,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: true,
      allowAnyFriendCaptainAutoFill: false,
      favoriteCount: 4,
      favoriteShipsOnly: false,
      favoriteShipCount: 0,
      leaderBoostFilters: ['HP', 'ATK'],
      leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
      costRange: createEmptyAutoBuildCostRange(),
      leaderCostRange: createEmptyAutoBuildCostRange(),
      subCostRange: createEmptyAutoBuildCostRange(),
      maxTotalCost: null,
    });
    expect(payload.manualSelection.characters).toEqual([
      expect.objectContaining({
        id: 101,
        isLeader: true,
        leaderAssignment: 'captain',
      }),
      expect.objectContaining({
        id: 102,
        isLeader: true,
        leaderAssignment: 'friendCaptain',
      }),
    ]);
  });

  it('round-trips character tag and name filters through preset export/import', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      selectedCharacterTags: ['Straw Hat Pirates'],
      selectedCharacterNames: ['Zoro', 'luffy'],
      requiredAbilities: [],
      requiredCharacterGroups: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedCharacterTagsInTeam: true,
      requireAllSelectedCharacterNamesInTeam: true,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots(),
      lockedCharacterIds: [],
      lockedCharacters: [],
      selectedLeaderIds: [],
      captainLeaderId: null,
      friendCaptainLeaderId: null,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });
    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'PSY'],
      availableClasses: ['Fighter'],
      abilityCatalogItems: [],
      availableLockedCharacters: [],
    });

    expect(payload.schemaVersion).toBe(31);
    expect(payload.filters.selectedCharacterTags).toEqual(['Straw Hat Pirates']);
    expect(payload.filters.selectedCharacterNames).toEqual(['zoro', 'luffy']);
    expect(result.state.selectedCharacterTags).toEqual(['Straw Hat Pirates']);
    expect(result.state.selectedCharacterNames).toEqual(['zoro', 'luffy']);
    expect(result.state.requireAllSelectedCharacterTagsInTeam).toBe(true);
    expect(result.state.requireAllSelectedCharacterNamesInTeam).toBe(true);
  });

  it('defaults missing character tag and name preset fields for legacy imports', () => {
    const legacyPayload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      requiredCharacterGroups: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots(),
      lockedCharacterIds: [],
      lockedCharacters: [],
      selectedLeaderIds: [],
      captainLeaderId: null,
      friendCaptainLeaderId: null,
    });

    legacyPayload.schemaVersion = 29;
    delete legacyPayload.filters.selectedCharacterTags;
    delete legacyPayload.filters.selectedCharacterNames;
    delete legacyPayload.filters.requireAllSelectedCharacterTagsInTeam;
    delete legacyPayload.filters.requireAllSelectedCharacterNamesInTeam;

    const result = sanitizeAutoTeamSelectionImportPayload(legacyPayload, {
      availableTypes: ['DEX', 'PSY'],
      availableClasses: ['Fighter'],
      abilityCatalogItems: [],
      availableLockedCharacters: [],
    });

    expect(result.state.selectedCharacterTags).toEqual([]);
    expect(result.state.selectedCharacterNames).toEqual([]);
    expect(result.state.requireAllSelectedCharacterTagsInTeam).toBe(false);
    expect(result.state.requireAllSelectedCharacterNamesInTeam).toBe(false);
  });

  it('marks a single selected leader as dual in the preset snapshot', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [201],
        friendCaptain: [201],
      }),
      lockedCharacterIds: [201],
      lockedCharacters: [createCharacterRecord(201, 'Solo Leader')],
      selectedLeaderIds: [201],
      captainLeaderId: 201,
      friendCaptainLeaderId: 201,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    expect(payload.manualSelection.characters[0]).toMatchObject({
      id: 201,
      isLeader: true,
      leaderAssignment: 'dual',
    });
  });

  it('exports leader boost, scoped cost ranges, max total cost, and required manual picks in schema 27 presets', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      leaderBoostRanges: {
        ATK: { min: 5, max: 6 },
        HP: { min: 1.25, max: 1.5 },
      },
      leaderCostRange: { min: 20, max: 60 },
      subCostRange: { min: 10, max: 40 },
      maxTotalCost: 300,
      manualSlots: createManualSlots(
        {
          captain: [201],
          friendCaptain: [201],
        },
        {
          captain: 201,
        },
      ),
      lockedCharacterIds: [201],
      lockedCharacters: [createCharacterRecord(201, 'Solo Leader')],
      selectedLeaderIds: [201],
      captainLeaderId: 201,
      friendCaptainLeaderId: 201,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    expect(payload.schemaVersion).toBe(31);
    expect(payload.filters.leaderBoostRanges).toEqual({
      ATK: { min: 5, max: 6 },
      HP: { min: 1.25, max: 1.5 },
    });
    expect(payload.filters.leaderCostRange).toEqual({ min: 20, max: 60 });
    expect(payload.filters.subCostRange).toEqual({ min: 10, max: 40 });
    expect(payload.filters.maxTotalCost).toBe(300);
    expect(payload.manualSelection.manualSlots.find((slot) => slot.role === 'captain')).toEqual({
      role: 'captain',
      characterIds: [201],
      requiredCharacterId: 201,
    });
  });

  it('does not start a preset download when the payload is missing', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const urlRef = {
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    };

    downloadAutoTeamSelectionExport(null, dom.window.document, urlRef);

    expect(urlRef.createObjectURL).not.toHaveBeenCalled();
    expect(urlRef.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('downloads the preset snapshot as json with the expected filename and payload', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: true,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: true,
      favoriteCount: 2,
      manualSlots: createManualSlots({
        captain: [102],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101, 102],
      lockedCharacters: [createCharacterRecord(101), createCharacterRecord(102)],
      selectedLeaderIds: [102, 101],
      captainLeaderId: 102,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:preset-json';
      }),
      revokeObjectURL: vi.fn(),
    };
    let downloadedBlob: Blob | null = null;

    downloadAutoTeamSelectionExport(payload, dom.window.document, urlRef);

    expect(urlRef.createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:preset-json');
    expect(downloadedBlob).not.toBeNull();

    const exportedJson = JSON.parse(await downloadedBlob!.text()) as ReturnType<
      typeof buildAutoTeamSelectionExportPayload
    >;

    expect(buildAutoTeamSelectionExportFilename(exportedJson.exportedAt)).toBe(
      'auto-team-builder-preset-2026-03-25T10-00-00-000Z.json',
    );
    expect(exportedJson.filters.favoriteCount).toBe(2);
    expect(exportedJson.filters.favoriteShipsOnly).toBe(false);
    expect(exportedJson.filters.favoriteShipCount).toBe(0);
    expect(exportedJson.manualSelection.characters[0]?.leaderAssignment).toBe('friendCaptain');
    expect(exportedJson.manualSelection.characters[1]?.leaderAssignment).toBe('captain');
  });
});

describe('AutoTeamBuilder preset import helpers', () => {
  it('parses the current preset export schema', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    expect(parseAutoTeamSelectionImportPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('sanitizes unsupported imported values with warnings', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_slot_barrier',
          minTurns: 3,
          slotTokens: ['DEX'],
          requiredCharacterCount: 2,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: true,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: true,
      favoriteCount: 2,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    payload.filters.selectedTypes.push('RAINBOW' as never);
    payload.filters.selectedClasses.push('Shooter');
    payload.filters.requiredAbilities.push({
      abilityKey: 'unknown_ability',
      minTurns: 5,
      slotTokens: [],
      requiredCharacterCount: 4,
    });
    payload.manualSelection.lockedCharacterIds.push(999);
    payload.manualSelection.selectedLeaderIds.push(999);

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [
        {
          key: 'remove_slot_barrier',
          label: 'Remove Slot Barrier',
          supportsTurns: true,
          supportsSlotTokens: true,
          availableSlotTokens: ['DEX', 'STR'],
          availableSources: ['specialText'],
          matchCount: 1,
          sampleCharacterIds: [101],
          sampleTexts: [],
        },
      ],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.selectedTypes).toEqual(['DEX']);
    expect(result.state.selectedClasses).toEqual(['Fighter']);
    expect(result.state.requiredAbilities).toEqual([
      {
        abilityKey: 'remove_slot_barrier',
        minTurns: 3,
        slotTokens: ['DEX'],
        requiredCharacterCount: 2,
      },
    ]);
    expect(result.state.lockedCharacterIds).toEqual([101]);
    expect(result.state.selectedLeaderIds).toEqual([101]);
    expect(result.state.captainLeaderId).toBe(101);
    expect(result.state.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result.state.requireUniqueBaseCharacterNames).toBe(false);
    expect(result.state.favoriteShipsOnly).toBe(false);
    expect(result.state.manualSlots).toEqual(
      createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
    );
    expect(result.warnings).toEqual([
      { key: 'preset.warnings.unavailableTypes', params: { count: 1 } },
      { key: 'preset.warnings.unavailableClasses', params: { count: 1 } },
      { key: 'preset.warnings.unsupportedAbilities', params: { count: 1 } },
    ]);
  });

  it('keeps cross-slot manual OR picks when sanitizing imported presets', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101, 102],
        friendCaptain: [101],
        sub1: [102, 103],
        sub2: [103, 104],
      }),
      lockedCharacterIds: [101, 102, 103, 104],
      lockedCharacters: [
        createCharacterRecord(101),
        createCharacterRecord(102),
        createCharacterRecord(103),
        createCharacterRecord(104),
      ],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [],
      availableLockedCharacters: [
        createCharacterRecord(101),
        createCharacterRecord(102),
        createCharacterRecord(103),
        createCharacterRecord(104),
      ],
    });

    expect(result.state.manualSlots).toEqual(
      createManualSlots({
        captain: [101, 102],
        friendCaptain: [101],
        sub1: [102, 103],
        sub2: [103, 104],
      }),
    );
    expect(result.state.lockedCharacterIds).toEqual([101, 102, 103, 104]);
    expect(result.warnings).toEqual([]);
  });

  it('preserves valid required manual picks and clears invalid required manual picks on import', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots(
        {
          captain: [101],
          sub1: [102],
        },
        {
          captain: 101,
          sub1: 999,
        },
      ),
      lockedCharacterIds: [101, 102],
      lockedCharacters: [createCharacterRecord(101), createCharacterRecord(102)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });
    payload.manualSelection.manualSlots.find((slot) => slot.role === 'sub1')!.requiredCharacterId =
      999;

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [],
      availableLockedCharacters: [createCharacterRecord(101), createCharacterRecord(102)],
    });

    expect(result.state.manualSlots.find((slot) => slot.role === 'captain')).toMatchObject({
      characterIds: [101],
      requiredCharacterId: 101,
    });
    expect(result.state.manualSlots.find((slot) => slot.role === 'sub1')).toMatchObject({
      characterIds: [102],
      requiredCharacterId: null,
    });
  });

  it('preserves required manual captain and friend captain picks for 4556 presets', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      selectedClasses: ['Fighter', 'Free Spirit'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: true,
      favoriteCount: 1159,
      manualSlots: createManualSlots(
        {
          captain: [4556],
          friendCaptain: [4556],
        },
        {
          captain: 4556,
          friendCaptain: 4556,
        },
      ),
      lockedCharacterIds: [4556],
      lockedCharacters: [createCharacterRecord(4556)],
      selectedLeaderIds: [4556],
      captainLeaderId: 4556,
      friendCaptainLeaderId: 4556,
      exportedAt: '2026-05-02T11:50:58.655Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Free Spirit'],
      abilityCatalogItems: [],
      availableLockedCharacters: [createCharacterRecord(4556)],
    });

    expect(result.state.manualSlots.find((slot) => slot.role === 'captain')).toMatchObject({
      characterIds: [4556],
      requiredCharacterId: 4556,
    });
    expect(result.state.manualSlots.find((slot) => slot.role === 'friendCaptain')).toMatchObject({
      characterIds: [4556],
      requiredCharacterId: 4556,
    });
    expect(result.state.captainLeaderId).toBe(4556);
    expect(result.state.selectedLeaderIds).toEqual([4556]);
  });

  it('restores leader boost ranges from imported presets', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      leaderBoostRanges: {
        ATK: { min: 5.25, max: 6 },
        HP: { min: 1.3, max: null },
      },
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.leaderBoostRanges).toEqual({
      ATK: { min: 5.25, max: 6 },
      HP: { min: 1.3, max: null },
    });
  });

  it('restores scoped cost ranges from imported presets', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      leaderCostRange: { min: 20, max: 60 },
      subCostRange: { min: 10, max: 40 },
      maxTotalCost: 300,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.leaderCostRange).toEqual({ min: 20, max: 60 });
    expect(result.state.subCostRange).toEqual({ min: 10, max: 40 });
    expect(result.state.maxTotalCost).toBe(300);
  });

  it('round-trips global captain-source required ability requirements in presets', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 1,
          slotScope: 'leader',
          sourceScope: 'captainAbility',
        },
      ],
      enemyMechanics: [],
      battleRequirements: [
        {
          id: 'battle-1',
          title: 'Battle 1',
          enemyMechanics: [],
          requiredCharacterGroups: [],
        },
      ],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [
        {
          key: 'remove_bind',
          label: 'Bind',
          category: 'special',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['captainAbility', 'specialText'],
          matchCount: 10,
          sampleCharacterIds: [101],
          sampleTexts: ['Reduces Bind duration by 5 turns'],
        },
      ],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(payload.schemaVersion).toBe(31);
    expect(result.state.requiredAbilities).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
    expect(result.state.battleRequirements).toEqual([]);
  });

  it('restores legacy cost range imports into both scoped cost ranges', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      costRange: { min: 20, max: 60 },
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });
    const legacyPayload = {
      ...payload,
      schemaVersion: 19,
      filters: {
        ...payload.filters,
        leaderCostRange: undefined,
        subCostRange: undefined,
      },
    };

    const result = sanitizeAutoTeamSelectionImportPayload(
      legacyPayload as AutoTeamSelectionExportPayload,
      {
        availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
        availableClasses: ['Fighter', 'Slasher'],
        abilityCatalogItems: [],
        availableLockedCharacters: [createCharacterRecord(101)],
      },
    );

    expect(result.state.leaderCostRange).toEqual({ min: 20, max: 60 });
    expect(result.state.subCostRange).toEqual({ min: 20, max: 60 });
  });

  it('defaults missing legacy preset character counts to 1', () => {
    const legacyPayload = {
      schemaVersion: 1,
      exportedAt: '2026-03-25T10:00:00.000Z',
      source: 'auto-team-builder',
      exportType: 'preset',
      filters: {
        selectedTypes: ['DEX'],
        selectedClasses: ['Fighter'],
        requiredAbilities: [
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 3,
            slotTokens: ['DEX'],
          },
        ],
        requireAllSelectedTypesInTeam: false,
        requireAllSelectedClassesPerCharacter: false,
        requireAllSlotsInLeaderSuperEffectScope: false,
        favoritesOnly: false,
        favoriteCount: 0,
      },
      manualSelection: {
        lockedCharacterIds: [101],
        selectedLeaderIds: [101],
        captainLeaderId: 101,
        friendCaptainLeaderId: 101,
        characters: [],
      },
    };

    const parsedPayload = parseAutoTeamSelectionImportPayload(JSON.stringify(legacyPayload));
    const result = sanitizeAutoTeamSelectionImportPayload(parsedPayload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [
        {
          key: 'remove_slot_barrier',
          label: 'Remove Slot Barrier',
          supportsTurns: true,
          supportsSlotTokens: true,
          availableSlotTokens: ['DEX', 'STR'],
          availableSources: ['specialText'],
          matchCount: 1,
          sampleCharacterIds: [101],
          sampleTexts: [],
        },
      ],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.requiredAbilities).toEqual([
      {
        abilityKey: 'remove_slot_barrier',
        minTurns: 3,
        slotTokens: ['DEX'],
        requiredCharacterCount: 1,
      },
    ]);
    expect(result.state.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result.state.requireBothLeadersFullCaptainAbilityCoverage).toBe(false);
    expect(result.state.allowAnyFriendCaptainAutoFill).toBe(false);
    expect(result.state.favoriteShipsOnly).toBe(false);
    expect(result.state.leaderBoostRanges).toEqual(createEmptyAutoBuildLeaderBoostRanges());
    expect(result.state.leaderCostRange).toEqual(createEmptyAutoBuildCostRange());
    expect(result.state.subCostRange).toEqual(createEmptyAutoBuildCostRange());
    expect(result.warnings).toEqual([]);
  });

  it('defaults leader super effect scope to false for schema 12 presets without the legacy flag', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });
    const schema12Payload = {
      ...payload,
      schemaVersion: 12 as const,
      filters: { ...payload.filters },
    };

    const parsedPayload = parseAutoTeamSelectionImportPayload(JSON.stringify(schema12Payload));
    const result = sanitizeAutoTeamSelectionImportPayload(parsedPayload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
  });

  it('maps the legacy no-super-leaders flag into leader super effect scope on import', () => {
    const payload = {
      schemaVersion: 13 as const,
      exportedAt: '2026-03-25T10:00:00.000Z',
      source: 'auto-team-builder' as const,
      exportType: 'preset' as const,
      filters: {
        selectedTypes: ['DEX'],
        selectedClasses: ['Fighter'],
        requiredAbilities: [],
        enemyMechanics: [],
        requireAllSelectedTypesInTeam: false,
        requireAllSelectedClassesPerCharacter: false,
        requireAllSlotsInLeaderSuperEffectScope: true,
        requireLeadersWithoutSuperEffects: true,
        requireUniqueBaseCharacterNames: false,
        favoritesOnly: false,
        favoriteCount: 0,
      },
      manualSelection: {
        manualSlots: createManualSlots({
          captain: [101],
          friendCaptain: [101],
        }),
        lockedCharacterIds: [101],
        excludedCharacterIds: [],
        selectedLeaderIds: [101],
        captainLeaderId: 101,
        friendCaptainLeaderId: 101,
        manualShipId: null,
        excludedShipIds: [],
        ship: null,
        characters: [],
        excludedCharacters: [],
        excludedShips: [],
      },
    };

    const parsedPayload = parseAutoTeamSelectionImportPayload(JSON.stringify(payload));
    const result = sanitizeAutoTeamSelectionImportPayload(parsedPayload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.requireAllSlotsInLeaderSuperEffectScope).toBe(true);
  });

  it('restores imported extra-drop requirements into manual drafts', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'extra_drop_any',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createEmptyAutoBuildManualSlots(),
      lockedCharacterIds: [],
      lockedCharacters: [],
      selectedLeaderIds: [],
      captainLeaderId: null,
      friendCaptainLeaderId: null,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: page.availableAbilityCatalogItems(),
      availableLockedCharacters: [],
    });

    await page['applySelectionPresetState'](result.state, []);

    expect(page.requiredAbilityDrafts()).toEqual([]);
    expect(page.requiredAbilitySummaryChips().map((chip) => chip.label)).not.toContain(
      'Any Extra Drop',
    );
  });

  it('restores leader-scoped captain ability requirements without import warnings', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.abilityCatalog.set({
      ...(page.abilityCatalog() ?? {
        generatedAt: '2026-05-03T07:53:03.922Z',
        sourceVersion: 'test',
        abilityCount: 0,
        abilities: [],
      }),
      abilityCount: (page.abilityCatalog()?.abilityCount ?? 0) + 1,
      abilities: [
        {
          key: 'remove_despair',
          label: 'Despair',
          category: 'special',
          groupLabel: 'Reduce Status Effect Duration',
          groupOrder: 6,
          effectOrder: 0,
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['captainAbility', 'specialText'],
          matchCount: 10,
          matchingCharacterIds: [4549],
          turnMatchingCharacterIds: [{ minTurns: 10, characterIds: [4549] }],
          sampleCharacterIds: [4549],
          sampleTexts: ['Reduces Despair duration by 10 turns'],
        },
        ...(page.abilityCatalog()?.abilities ?? []),
      ],
    });

    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_despair',
          minTurns: 8,
          slotTokens: [],
          requiredCharacterCount: 1,
          slotScope: 'leader',
          sourceScope: 'captainAbility',
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createEmptyAutoBuildManualSlots(),
      lockedCharacterIds: [],
      lockedCharacters: [],
      selectedLeaderIds: [],
      captainLeaderId: null,
      friendCaptainLeaderId: null,
      exportedAt: '2026-05-03T07:53:03.922Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: page.availableAbilityCatalogItems(),
      availableLockedCharacters: [],
    });

    await page['applySelectionPresetState'](result.state, []);

    expect(result.warnings).toEqual([]);
    expect(page.captainAbilityDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_despair',
        minTurns: 8,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      }),
    ]);
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_despair',
        minTurns: 8,
        slotTokens: [],
        requiredCharacterCount: 1,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      },
    ]);
  });

  it('roundtrips enemy mechanics alongside effective required counters', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_enemy_barrier',
          minTurns: 3,
          slotTokens: [],
          requiredCharacterCount: 2,
        },
      ],
      enemyMechanics: [
        {
          mechanicKey: 'enemy_barrier',
          category: 'enemyDefense',
          minTurns: 3,
          requiredCharacterCount: 2,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_enemy_barrier',
        },
      ],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [
        {
          key: 'remove_enemy_barrier',
          label: 'Remove Enemy Barrier',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 1,
          sampleCharacterIds: [101],
          sampleTexts: [],
        },
      ],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.enemyMechanics).toEqual([
      {
        mechanicKey: 'enemy_barrier',
        category: 'enemyDefense',
        minTurns: 3,
        requiredCharacterCount: 2,
        triggerTags: [],
        responseTags: [],
        conditionTags: [],
        derivedAbilityKey: 'remove_enemy_barrier',
      },
    ]);
    expect(result.state.requiredAbilities).toEqual([
      {
        abilityKey: 'remove_enemy_barrier',
        minTurns: 3,
        slotTokens: [],
        requiredCharacterCount: 2,
      },
    ]);
  });

  it('preserves duplicate imported ability requirements as separate rows', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_slot_barrier',
          minTurns: 3,
          slotTokens: ['DEX'],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    payload.filters.requiredAbilities.push({
      abilityKey: 'remove_slot_barrier',
      minTurns: 3,
      slotTokens: ['DEX'],
      requiredCharacterCount: 3,
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [
        {
          key: 'remove_slot_barrier',
          label: 'Remove Slot Barrier',
          supportsTurns: true,
          supportsSlotTokens: true,
          availableSlotTokens: ['DEX', 'STR'],
          availableSources: ['specialText'],
          matchCount: 1,
          sampleCharacterIds: [101],
          sampleTexts: [],
        },
      ],
      availableLockedCharacters: [createCharacterRecord(101)],
    });

    expect(result.state.requiredAbilities).toEqual([
      {
        abilityKey: 'remove_slot_barrier',
        minTurns: 3,
        slotTokens: ['DEX'],
        requiredCharacterCount: 1,
      },
      {
        abilityKey: 'remove_slot_barrier',
        minTurns: 3,
        slotTokens: ['DEX'],
        requiredCharacterCount: 3,
      },
    ]);
  });

  it('drops conflicting imported exclusions and keeps manual picks with warnings', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      excludedCharacterIds: [101],
      excludedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      manualShipId: 9001,
      manualShip: createShipRecord(9001),
      excludedShipIds: [9001],
      excludedShips: [createShipRecord(9001)],
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    const result = sanitizeAutoTeamSelectionImportPayload(payload, {
      availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      availableClasses: ['Fighter', 'Slasher'],
      abilityCatalogItems: [],
      availableLockedCharacters: [createCharacterRecord(101)],
      availableShips: [createShipRecord(9001)],
    });

    expect(result.state.manualSlots).toEqual(
      createManualSlots({
        captain: [101],
      }),
    );
    expect(result.state.excludedCharacterIds).toEqual([]);
    expect(result.state.manualShipId).toBe(9001);
    expect(result.state.excludedShipIds).toEqual([]);
    expect(result.warnings).toEqual([
      { key: 'preset.warnings.conflictingExcludedCharacters', params: { count: 1 } },
      { key: 'preset.warnings.conflictingExcludedShips', params: { count: 1 } },
    ]);
  });
});

describe('AutoTeamBuilderPage preset import state', () => {
  it('applies a valid imported preset and clears previous build state', async () => {
    const { page, repository } = await createPage();
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      requiredAbilities: [
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 2,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: true,
      requireAllSlotsInLeaderSuperEffectScope: true,
      requireFullCaptainAbilityCoverage: true,
      requireBothLeadersFullCaptainAbilityCoverage: true,
      requireSuperSpecialCriteriaCoverage: true,
      requireSuperTandemCriteriaCoverage: true,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: true,
      allowAnyFriendCaptainAutoFill: true,
      favoriteCount: 3,
      manualSlots: createManualSlots({
        captain: [102],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101, 102],
      lockedCharacters: [createCharacterRecord(101), createCharacterRecord(102)],
      selectedLeaderIds: [101, 102],
      captainLeaderId: 102,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });
    const importDex = createCharacterRecord(701, 'Imported DEX Fighter', [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        minTurns: 6,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'specialText',
      },
    ]);
    const importPsy = createCharacterRecord(702, 'Imported PSY Slasher', [
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        minTurns: 5,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'specialText',
      },
    ]);

    importDex.type = 'DEX';
    importDex.classes = ['Fighter'];
    importDex.primaryClass = 'Fighter';
    importDex.secondaryClass = null;

    importPsy.type = 'PSY';
    importPsy.classes = ['Slasher'];
    importPsy.primaryClass = 'Slasher';
    importPsy.secondaryClass = null;

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery([importDex, importPsy], query),
    );

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.errorMessage.set('Previous error');
    page.buildProgress.set({
      stage: 'exactAttempt',
      candidateCount: 64,
      completedAttempts: 0,
      totalAttempts: 2,
      attemptCountFinal: false,
      elapsedMs: 18,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.exactAttempt',
      messageParams: {
        current: 1,
        total: 2,
      },
    });
    await page['importSelectionPreset'](
      new File([JSON.stringify(payload)], 'favorite-preset.json', { type: 'application/json' }),
    );

    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.selectedClasses()).toEqual(['Fighter', 'Slasher']);
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    expect(page.lockedCharacterIds()).toEqual([102, 101]);
    expect(page.selectedLeaderIds()).toEqual([102, 101]);
    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [102],
        friendCaptain: [101],
      }),
    );
    expect(page.effectiveCaptainLeaderId()).toBe(102);
    expect(page.effectiveFriendLeaderId()).toBe(101);
    expect(page.requireAllSelectedTypesInTeam()).toBe(true);
    expect(page.requireAllSelectedClassesPerCharacter()).toBe(true);
    expect(page.requireAllSlotsInLeaderSuperEffectScope()).toBe(true);
    expect(page.requireFullCaptainAbilityCoverage()).toBe(true);
    expect(page.requireBothLeadersFullCaptainAbilityCoverage()).toBe(true);
    expect(page.requireSuperSpecialCriteriaCoverage()).toBe(true);
    expect(page.requireSuperTandemCriteriaCoverage()).toBe(true);
    expect(page.requireUniqueBaseCharacterNames()).toBe(true);
    expect(page.favoritesOnly()).toBe(true);
    expect(page.allowAnyFriendCaptainAutoFill()).toBe(true);
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [702, 701],
    );
    expect(page.result()).toBeNull();
    expect(page.errorMessage()).toBe('');
    expect(page.buildProgress()).toBeNull();
    expect(page.presetImportFeedback()).toEqual({
      tone: 'warning',
      title: 'Preset applied with warnings.',
      details: [
        'Loaded settings from favorite-preset.json.',
        'Ignored 1 ability requirements with unsupported turns, slot tokens, or character count.',
      ],
    });
  });

  it('imports v31 embedded generated team into AutoTeamBuilder slots and restores settings', async () => {
    const { page } = await createPage();
    const exportedAt = '2026-05-05T20:14:45.183Z';
    const result = createAutoBuildResult();
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots(),
      lockedCharacterIds: [],
      lockedCharacters: [],
      selectedLeaderIds: [],
      captainLeaderId: null,
      friendCaptainLeaderId: null,
      generatedTeamExport: buildAutoTeamExportPayload(result, [], 101, 102, exportedAt),
      savedTeamImport: {
        schemaVersion: 1,
        source: 'saved-teams',
        exportedAt,
        teams: [
          {
            id: 'auto-team-builder-2026-05-05T20-14-45-183Z',
            name: 'Imported Auto Team',
            notes: 'Bring these slots back.',
            shipId: 9001,
            slots: [101, 102, 103, 104, 105, 106],
            createdAt: exportedAt,
            updatedAt: exportedAt,
          },
        ],
      },
      exportedAt,
    });

    await page.ngOnInit();
    page.selectedTypes.set(['PSY']);
    page.manualSlots.set(createManualSlots({ captain: [201] }));
    await page['importSelectionPreset'](
      new File([JSON.stringify(payload)], 'team-preset.json', { type: 'application/json' }),
    );

    expect(page.selectedTypes()).toEqual(['DEX']);
    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.requireAllSelectedTypesInTeam()).toBe(true);
    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101],
        friendCaptain: [102],
        sub1: [103],
        sub2: [104],
        sub3: [105],
        sub4: [106],
      }),
    );
    expect(page.selectedManualShipId()).toBe(9001);
    expect(page.teamName()).toBe('Imported Auto Team');
    expect(page.notes()).toBe('Bring these slots back.');
    expect(page.presetImportFeedback()).toEqual({
      tone: 'success',
      title: 'Preset applied.',
      details: ['Loaded settings from team-preset.json.'],
    });
  });

  it('applies best-effort sanitization warnings when the imported preset contains invalid values', async () => {
    const { page } = await createPage();
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_slot_barrier',
          minTurns: 2,
          slotTokens: ['DEX'],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
      lockedCharacterIds: [101],
      lockedCharacters: [createCharacterRecord(101)],
      selectedLeaderIds: [101],
      captainLeaderId: 101,
      friendCaptainLeaderId: 101,
      exportedAt: '2026-03-25T10:00:00.000Z',
    });

    payload.filters.selectedTypes.push('RAINBOW' as never);
    payload.filters.selectedClasses.push('Shooter');
    payload.filters.requiredAbilities.push({
      abilityKey: 'unknown_ability',
      minTurns: 4,
      slotTokens: [],
      requiredCharacterCount: 2,
    });
    payload.filters.requiredAbilities[0]!.slotTokens.push('PSY');
    payload.manualSelection.lockedCharacterIds.push(999);
    payload.manualSelection.selectedLeaderIds.push(999);
    payload.manualSelection.captainLeaderId = 999;

    await page.ngOnInit();
    await page['importSelectionPreset'](
      new File([JSON.stringify(payload)], 'mixed-preset.json', { type: 'application/json' }),
    );

    expect(page.selectedTypes()).toEqual(['DEX']);
    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_slot_barrier',
        minTurns: 2,
        slotTokens: ['DEX'],
        requiredCharacterCount: 1,
      },
    ]);
    expect(page.lockedCharacterIds()).toEqual([101]);
    expect(page.selectedLeaderIds()).toEqual([101]);
    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101],
        friendCaptain: [101],
      }),
    );
    expect(page.effectiveCaptainLeaderId()).toBe(101);
    expect(page.presetImportFeedback()).toEqual({
      tone: 'warning',
      title: 'Preset applied with warnings.',
      details: [
        'Loaded settings from mixed-preset.json.',
        'Ignored 1 unavailable imported types from the preset.',
        'Ignored 1 unavailable imported classes from the preset.',
        'Ignored 1 unsupported ability requirements from the preset.',
        'Ignored 1 ability requirements with unsupported turns, slot tokens, or character count.',
      ],
    });
  });

  it('rejects a preset with the wrong schema and keeps the current state intact', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);

    await page['importSelectionPreset'](
      new File(
        [
          JSON.stringify({
            schemaVersion: 3,
            source: 'auto-team-builder',
            exportType: 'preset',
            filters: {},
            manualSelection: {},
          }),
        ],
        'invalid-preset.json',
        { type: 'application/json' },
      ),
    );

    expect(page.selectedTypes()).toEqual(['DEX']);
    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.presetImportFeedback()).toEqual({
      tone: 'error',
      title: 'Preset import failed.',
      details: ['The selected preset does not match the current export schema.'],
    });
  });
});

describe('AutoTeamBuilder saved team preset handoff', () => {
  it('applies a saved team preset from the route, prefers it over enemyId, and clears the transient query param', async () => {
    const { page, router } = await createPage({ routeTeamId: 'team-1', routeEnemyId: 'enemy-1' });

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.currentTeamId.set('saved-team-before-route');

    await page.ionViewWillEnter();

    expect(page.selectedTypes()).toEqual([]);
    expect(page.selectedClasses()).toEqual([]);
    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101],
        friendCaptain: [102],
        sub1: [103],
        sub2: [],
        sub3: [105],
        sub4: [106],
      }),
    );
    expect(page.selectedManualShipId()).toBe(9001);
    expect(page.loadedEnemyPresetName()).toBeNull();
    expect(page.result()).toBeNull();
    expect(page.currentTeamId()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('falls back to the enemy preset flow when the route team id is unknown', async () => {
    const { page, router } = await createPage({
      routeTeamId: 'missing-team',
      routeEnemyId: 'enemy-1',
    });

    await page.ngOnInit();
    await page.ionViewWillEnter();

    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.loadedEnemyPresetName()).toBe('Forest Boss');
    expect(router.navigate).toHaveBeenNthCalledWith(1, [], {
      relativeTo: expect.any(Object),
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(router.navigate).toHaveBeenNthCalledWith(2, [], {
      relativeTo: expect.any(Object),
      queryParams: { enemyId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('ignores missing saved team characters and ship ids during route handoff', async () => {
    const { page, router } = await createPage({ routeTeamId: 'team-with-missing-data' });

    await page.ngOnInit();
    await page.ionViewWillEnter();

    expect(page.manualSlots()).toEqual(
      createManualSlots({
        captain: [101],
        friendCaptain: [],
        sub1: [],
        sub2: [104],
        sub3: [],
        sub4: [],
      }),
    );
    expect(page.selectedManualShipId()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
});

describe('AutoTeamBuilder enemy preset handoff', () => {
  it('applies a saved enemy preset from the route and clears the transient query param', async () => {
    const { page, router } = await createPage({ routeEnemyId: 'enemy-1' });

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());
    page.currentTeamId.set('saved-team-before-enemy');

    await page.ionViewWillEnter();

    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.pageEnemyMechanics()).toEqual([]);
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_enemy_barrier',
        minTurns: 3,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
    expect(page.requireAllSelectedTypesInTeam()).toBe(true);
    expect(page.requireAllSelectedClassesPerCharacter()).toBe(false);
    expect(page.loadedEnemyPresetName()).toBe('Forest Boss');
    expect(page.result()).toBeNull();
    expect(page.currentTeamId()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { enemyId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('ignores an unknown enemy preset id without crashing and keeps default state', async () => {
    const { page, router } = await createPage({ routeEnemyId: 'missing-enemy' });

    await page.ngOnInit();
    await page.ionViewWillEnter();

    expect(page.selectedTypes()).toEqual([...page.availableTypes]);
    expect(page.selectedClasses()).toEqual([...page.availableClasses()]);
    expect(page.loadedEnemyPresetName()).toBeNull();
    expect(router.navigate).toHaveBeenCalledOnce();
  });

  it('uses the prefilled enemy requirements when building after route handoff', async () => {
    const { page, autoTeamBuilder } = await createPage({ routeEnemyId: 'enemy-1' });

    await page.ngOnInit();
    await page.ionViewWillEnter();
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX', 'PSY'],
      expect.objectContaining({
        enemyMechanics: [],
        requiredAbilities: [
          {
            abilityKey: 'remove_enemy_barrier',
            minTurns: 3,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        requireAllSelectedTypesInTeam: true,
        requireAllSelectedClassesPerCharacter: false,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

function createBuilderAbility(
  key: string,
): CharacterDetailRecord['detail']['builderAbilities'][number] {
  return {
    key,
    label: key
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    minTurns: null,
    isCompleteRemoval: false,
    slotTokens: [],
    source: 'specialText',
  };
}

function createCharacterRecord(
  id: number,
  name = `Character ${id}`,
  builderAbilities: CharacterDetailRecord['detail']['builderAbilities'] = [],
): CharacterDetailRecord {
  return {
    id,
    name,
    isIncomplete: false,
    type: id % 2 === 0 ? 'DEX' : 'PSY',
    classes: ['Fighter', 'Slasher'],
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1.3,
    captainAtkBoost: 5,
    captainAverageBoost: 3.15,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 4200, atk: 1800, rcv: 320 },
      growth: 2.4,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: `assets/characters/${id}.png`,
      thumbnailGlobal: `assets/characters/${id}-thumb.png`,
      thumbnailJapan: null,
    },
    imageUrl: `assets/characters/${id}-thumb.png`,
    detailImageUrl: `assets/characters/${id}.png`,
    detail: {
      characterId: id,
      captainAbility: `${name} captain ability`,
      captainAbilityVariants: [
        {
          key: 'base',
          label: 'Base Captain Ability',
          text: `${name} captain ability`,
        },
      ],
      captainNotes: null,
      specialName: `${name} special`,
      specialText: `${name} special text`,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities,
      sailorAbilities: [`${name} sailor`],
      sailorNotes: null,
      potentialAbilities: [{ Name: `${name} potential`, description: [`${name} potential text`] }],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  };
}

function filterCharactersForManualQuery(
  records: CharacterDetailRecord[],
  query: {
    searchTerm: string;
    selectedTypes: string[];
    selectedTypesMatchMode?: 'all' | 'any';
    selectedClasses: string[];
    selectedClassesMatchMode?: 'all' | 'any';
    sortMode?: 'catalog' | 'newest' | 'powerFirst';
    limit?: number;
    offset?: number;
  },
): CharacterDetailRecord[] {
  const normalizedSearchTerm = query.searchTerm.trim().toLowerCase();
  const normalizedTypes = query.selectedTypes.map((type) => type.trim()).filter(Boolean);
  const normalizedClasses = query.selectedClasses
    .map((characterClass) => characterClass.trim())
    .filter(Boolean);

  const filteredRecords = records.filter((record) => {
    const matchesSearchTerm =
      !normalizedSearchTerm || record.name.toLowerCase().includes(normalizedSearchTerm);
    const recordTypes = record.type
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const typeMatches =
      !normalizedTypes.length ||
      (query.selectedTypesMatchMode === 'all'
        ? normalizedTypes.every((type) => recordTypes.includes(type))
        : normalizedTypes.some((type) => recordTypes.includes(type)));
    const classMatches =
      !normalizedClasses.length ||
      (query.selectedClassesMatchMode === 'all'
        ? normalizedClasses.every((characterClass) => record.classes.includes(characterClass))
        : normalizedClasses.some((characterClass) => record.classes.includes(characterClass)));

    return matchesSearchTerm && typeMatches && classMatches;
  });

  const sortedRecords =
    query.sortMode === 'newest'
      ? [...filteredRecords].sort((left, right) => right.id - left.id)
      : query.sortMode === 'powerFirst'
        ? [...filteredRecords].sort((left, right) => right.id - left.id)
        : filteredRecords;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? filteredRecords.length;

  return sortedRecords.slice(offset, offset + limit);
}

function createManualSlots(
  overrides: Partial<Record<AutoBuildManualSlotSelection['role'], number[]>> = {},
  requiredOverrides: Partial<Record<AutoBuildManualSlotSelection['role'], number | null>> = {},
): AutoBuildManualSlotSelection[] {
  return createEmptyAutoBuildManualSlots().map((slot) => ({
    role: slot.role,
    characterIds: [...(overrides[slot.role] ?? [])],
    requiredCharacterId: requiredOverrides[slot.role] ?? null,
  }));
}

function createAutoBuildResult(
  slots: AutoBuildResult['slots'] = [
    { role: 'captain', character: createCharacterRecord(101), reasonChips: ['Captain slot'] },
    {
      role: 'friendCaptain',
      character: createCharacterRecord(102),
      reasonChips: ['Friend captain slot'],
    },
    { role: 'sub', character: createCharacterRecord(103), reasonChips: ['Burst'] },
    { role: 'sub', character: createCharacterRecord(104), reasonChips: ['Utility'] },
    { role: 'sub', character: createCharacterRecord(105), reasonChips: ['Consistency'] },
    { role: 'sub', character: createCharacterRecord(106), reasonChips: ['Damage'] },
  ],
): AutoBuildResult {
  const input: AutoBuildResult['input'] = {
    types: ['DEX', 'PSY'],
    selectedClasses: ['Fighter', 'Slasher'],
    selectedCharacterTags: [],
    selectedCharacterNames: [],
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
    manualSlots: createManualSlots({
      captain: [101],
      friendCaptain: [102],
      sub1: [103],
      sub2: [104],
      sub3: [105],
      sub4: [106],
    }),
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: 101,
    friendCaptainCharacterId: 102,
    manualShipId: null,
    excludedShipIds: [],
    candidateLimit: null,
  };

  return {
    input,
    requestedInput: {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      requiredAbilities: input.requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      requiredCharacterGroups: [],
      enemyMechanics: input.enemyMechanics.map((mechanic) => ({
        ...mechanic,
        triggerTags: [...mechanic.triggerTags],
        responseTags: [...mechanic.responseTags],
        conditionTags: [...mechanic.conditionTags],
      })),
      favoriteShipIds: [...input.favoriteShipIds],
      leaderBoostFilters: [...input.leaderBoostFilters],
      leaderBoostRanges: {
        HP: { ...input.leaderBoostRanges.HP },
        ATK: { ...input.leaderBoostRanges.ATK },
      },
      costRange: { ...input.costRange },
      leaderCostRange: { ...input.leaderCostRange },
      subCostRange: { ...input.subCostRange },
      maxTotalCost: input.maxTotalCost,
      manualSlots: input.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
      })),
      lockedCharacterIds: [...input.lockedCharacterIds],
      excludedCharacterIds: [...input.excludedCharacterIds],
      excludedShipIds: [...input.excludedShipIds],
    },
    relaxation: {
      usedFallback: false,
      droppedTypes: [],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
    },
    shipSelection: null,
    candidateCount: 32,
    coverage: {
      leaderCriteria: {
        source: 'captainAbility',
        coverageMode: 'simpleBoostScope',
        captainLeaderId: 101,
        friendCaptainLeaderId: 102,
        leaderIds: [101, 102],
        leaderNames: ['Character 101', 'Character 102'],
        dualLeaderMode: 'intersection',
        derivedAllowedClasses: ['Fighter', 'Slasher'],
        derivedAllowedTypes: ['DEX', 'PSY'],
        derivedAllowedCharacterTags: [],
        hasCostRestriction: false,
        maxAllowedCost: null,
        hasClassRestriction: true,
        hasTypeRestriction: true,
        hasCharacterTagRestriction: false,
        tagConditionSets: [],
        matchingSlots: 6,
        totalSlots: 6,
        allSlotsMatch: true,
      },
      abilityRequirements: {
        requested: [],
        matched: [],
        missing: [],
        matchesAll: true,
      },
      requiredCharacterGroups: {
        requested: [],
        matched: [],
        missing: [],
        matchesAll: true,
      },
      burst: ['ATK boost'],
      consistency: ['Matching orbs'],
      utility: ['Bind clear'],
      coveredSelectedClasses: ['Fighter', 'Slasher'],
      coveredSelectedTypes: ['DEX', 'PSY'],
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
    slots,
  };
}

async function createPage(
  options: { routeEnemyId?: string | null; routeTeamId?: string | null } = {},
): Promise<{
  page: AutoTeamBuilderPage;
  repository: {
    getDatasetManifest: ReturnType<typeof vi.fn>;
    getAutoBuilderAbilityCatalog: ReturnType<typeof vi.fn>;
    getAutoBuilderCandidates: ReturnType<typeof vi.fn>;
    getAvailableCharacterTags: ReturnType<typeof vi.fn>;
    getShips: ReturnType<typeof vi.fn>;
    getCharactersByIds: ReturnType<typeof vi.fn>;
    searchDetailedCharacters: ReturnType<typeof vi.fn>;
    searchCharacters: ReturnType<typeof vi.fn>;
  };
  autoTeamBuilder: { buildTeam: ReturnType<typeof vi.fn> };
  router: { navigate: ReturnType<typeof vi.fn> };
  route: { snapshot: { queryParamMap: { get: ReturnType<typeof vi.fn> } } };
  userState: {
    favoriteCharacterIds: {
      (): number[];
      set(value: number[]): void;
    };
    favoriteShipIds: {
      (): number[];
      set(value: number[]): void;
    };
    savedTeams: {
      (): Array<Record<string, unknown>>;
      set(value: Array<Record<string, unknown>>): void;
    };
    savedEnemies: {
      (): Array<Record<string, unknown>>;
      set(value: Array<Record<string, unknown>>): void;
    };
    getSavedTeamById: ReturnType<typeof vi.fn>;
    getSavedEnemyById: ReturnType<typeof vi.fn>;
    ready: ReturnType<typeof vi.fn>;
    autoTeamBuilderWorkerPreference: {
      (): { mode: 'auto' | 'manual'; manualCount: number };
      set(value: { mode: 'auto' | 'manual'; manualCount: number }): void;
    };
    resolveAutoTeamBuilderWorkerCount: ReturnType<typeof vi.fn>;
    resolveAutoTeamBuilderWorkerPreference: ReturnType<typeof vi.fn>;
    setAutoTeamBuilderWorkerPreference: ReturnType<typeof vi.fn>;
    saveCharacterBox: ReturnType<typeof vi.fn>;
    saveTeam: ReturnType<typeof vi.fn>;
    toggleFavorite: ReturnType<typeof vi.fn>;
    toggleShipFavorite: ReturnType<typeof vi.fn>;
  };
}> {
  const { AutoTeamBuilderPage } = await import('./auto-team-builder.page');
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue(createManifest()),
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue({
      generatedAt: '2026-03-25T10:00:00.000Z',
      sourceVersion: 'test',
      abilityCount: 4,
      abilities: [
        {
          key: 'extra_drop_any',
          label: 'Any Extra Drop',
          supportsTurns: false,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['captainAbility'],
          matchCount: 26,
          sampleCharacterIds: [1390],
          sampleTexts: ['Guarantees duplicating a drop upon completion of the island.'],
        },
        {
          key: 'extra_drop_guaranteed',
          label: 'Guaranteed Extra Drop',
          supportsTurns: false,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['captainAbility'],
          matchCount: 6,
          sampleCharacterIds: [1390],
          sampleTexts: ['Guarantees duplicating a drop upon completion of the island.'],
        },
        {
          key: 'remove_bind',
          label: 'Bind',
          category: 'special',
          groupLabel: 'Reduce Status Effect Duration',
          groupOrder: 6,
          effectOrder: 1,
          supportsTurns: false,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 10,
          matchingCharacterIds: [101, 102],
          sampleCharacterIds: [101],
          sampleTexts: ['Reduces Bind duration by 5 turns'],
        },
        {
          key: 'remove_atk_down',
          label: 'ATK Down',
          category: 'special',
          groupLabel: 'Reduce Status Effect Duration',
          groupOrder: 6,
          effectOrder: 2,
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 10,
          matchingCharacterIds: [101, 102],
          turnMatchingCharacterIds: [
            { minTurns: 5, characterIds: [101] },
            { minTurns: 7, characterIds: [102] },
          ],
          sampleCharacterIds: [101],
          sampleTexts: ['Reduces ATK Down duration by 5 turns'],
        },
        {
          key: 'remove_slot_barrier',
          label: 'Remove Slot Barrier',
          category: 'legacy',
          supportsTurns: true,
          supportsSlotTokens: true,
          availableSlotTokens: ['DEX', 'STR'],
          availableSources: ['specialText'],
          matchCount: 6,
          sampleCharacterIds: [102],
          sampleTexts: ['Removes [DEX] Slot Barrier completely'],
        },
      ],
    }),
    getAutoBuilderCandidates: vi.fn().mockResolvedValue([]),
    getAvailableCharacterTags: vi
      .fn()
      .mockResolvedValue(['Straw Hat Pirates', 'Minks', 'Worst Generation']),
    getShips: vi.fn().mockResolvedValue([createShipRecord(9001), createShipRecord(9002)]),
    getCharactersByIds: vi
      .fn()
      .mockImplementation(async (characterIds: number[]) =>
        characterIds
          .filter((characterId) => characterId > 0 && characterId < 900)
          .map((characterId) => createCharacterRecord(characterId)),
      ),
    searchDetailedCharacters: vi.fn().mockResolvedValue([]),
    searchCharacters: vi.fn().mockResolvedValue([]),
  };
  const autoTeamBuilder = {
    buildTeam: vi.fn().mockResolvedValue(null),
    resolveCaptainCoveredCandidateRecords: vi
      .fn()
      .mockImplementation((records: CharacterDetailRecord[]) => records),
  };
  const savedTeams = signal([
    createSavedTeam('team-1', {
      shipId: 9001,
      slots: [101, 102, 103, null, 105, 106],
    }),
    createSavedTeam('team-with-missing-data', {
      shipId: 9999,
      slots: [101, 999, null, 104, null, null],
    }),
  ]);
  const savedEnemies = signal([
    {
      id: 'enemy-1',
      name: 'Forest Boss',
      notes: 'Needs bind removal',
      imageDataUrl: null,
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_enemy_barrier',
          minTurns: 3,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [
        {
          mechanicKey: 'enemy_barrier',
          category: 'enemyDefense',
          minTurns: 3,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_enemy_barrier',
        },
      ],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:05:00.000Z',
    },
  ]);
  const autoTeamBuilderWorkerPreference = signal<{ mode: 'auto' | 'manual'; manualCount: number }>({
    mode: 'auto',
    manualCount: 7,
  });
  const resolveWorkerRuntime = () => ({
    ...autoTeamBuilderWorkerPreference(),
    detectedCoreCount: 12,
    effectiveCount:
      autoTeamBuilderWorkerPreference().mode === 'manual'
        ? autoTeamBuilderWorkerPreference().manualCount
        : 4,
    manualMaxCount: 7,
    manualMaxPercent: 58,
  });
  const userState = {
    favoriteCharacterIds: signal<number[]>([101, 102, 103]),
    favoriteShipIds: signal<number[]>([9001]),
    characterBoxes: signal([
      createCharacterBox('box-1', 'Story Box', [201, 202, 203]),
      createCharacterBox('box-empty', 'Empty Box', []),
    ]),
    savedTeams,
    savedEnemies,
    getSavedTeamById: vi.fn(
      (teamId: string) => savedTeams().find((team) => team.id === teamId) ?? null,
    ),
    getSavedEnemyById: vi.fn(
      (enemyId: string) => savedEnemies().find((enemy) => enemy.id === enemyId) ?? null,
    ),
    ready: vi.fn().mockResolvedValue(undefined),
    autoTeamBuilderWorkerPreference,
    resolveAutoTeamBuilderWorkerCount: vi.fn().mockReturnValue(7),
    resolveAutoTeamBuilderWorkerPreference: vi.fn(resolveWorkerRuntime),
    setAutoTeamBuilderWorkerPreference: vi
      .fn()
      .mockImplementation(async (preference: { mode: 'auto' | 'manual'; manualCount: number }) => {
        autoTeamBuilderWorkerPreference.set(preference);
      }),
    saveCharacterBox: vi
      .fn()
      .mockImplementation(async (input: { name: string; characterIds: number[] }) => {
        const nextBox = createCharacterBox(
          `box-${userState.characterBoxes().length + 1}`,
          input.name,
          input.characterIds,
        );

        userState.characterBoxes.set([nextBox, ...userState.characterBoxes()]);

        return nextBox;
      }),
    saveTeam: vi.fn().mockResolvedValue({ id: 'saved-auto-team' }),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
    toggleShipFavorite: vi.fn().mockResolvedValue(undefined),
  };
  const i18n = createI18nStub('auto-team-builder');
  const route = {
    snapshot: {
      queryParamMap: {
        get: vi.fn((key: string) => {
          if (key === 'teamId') {
            return options.routeTeamId ?? null;
          }

          if (key === 'enemyId') {
            return options.routeEnemyId ?? null;
          }

          return null;
        }),
      },
    },
  };
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  return {
    page: new AutoTeamBuilderPage(
      repository as never,
      autoTeamBuilder as never,
      userState as never,
      i18n as never,
      route as never,
      router as never,
    ),
    repository,
    autoTeamBuilder,
    router,
    route,
    userState,
  };
}

function createManifest(): DatasetManifest {
  return {
    generatedAt: '2026-03-25T10:00:00.000Z',
    sourceVersion: 'test',
    characterCount: 10,
    detailCount: 10,
    shipCount: 1,
    rumbleCount: 0,
    availableTypes: ['DEX', 'PSY'],
    availableClasses: ['Fighter', 'Slasher'],
    packs: [],
  };
}

function createCharacterBox(id: string, name: string, characterIds: number[]) {
  return {
    id,
    name,
    characterIds,
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-30T10:05:00.000Z',
  };
}

function createShipRecord(id: number): {
  id: number;
  name: string;
  thumb: null;
  thumbUrl: null;
  description: string;
} {
  return {
    id,
    name: `Ship ${id}`,
    thumb: null,
    thumbUrl: null,
    description: 'Boosts ATK by 1.5x.',
  };
}

function createShipCatalog(
  count: number,
  startId = 9001,
): Array<ReturnType<typeof createShipRecord>> {
  return Array.from({ length: count }, (_value, index) => createShipRecord(startId + index));
}

function createShipListScrollEvent(): Event {
  return {
    target: {
      scrollTop: 760,
      clientHeight: 120,
      scrollHeight: 1000,
    },
  } as Event;
}

function createSavedTeam(
  id: string,
  overrides: Partial<{
    name: string;
    notes: string;
    shipId: number | null;
    slots: Array<number | null>;
  }> = {},
) {
  return {
    id,
    name: overrides.name ?? `Saved Team ${id}`,
    notes: overrides.notes ?? '',
    shipId: overrides.shipId ?? null,
    slots: overrides.slots ?? [101, 102, 103, 104, 105, 106],
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-30T10:05:00.000Z',
  };
}

function createI18nStub(scope: string) {
  const globalTranslations = loadJson('../../../../public/i18n/en.json');
  const scopedTranslations = loadJson(`../../../../public/i18n/${scope}/en.json`);

  return {
    activeLanguage: signal<'en' | 'el'>('en'),
    availableLanguages: [
      { id: 'en', label: 'English' },
      { id: 'el', label: 'Ελληνικά' },
    ] as const,
    preloadScope: vi.fn().mockResolvedValue(undefined),
    ready: vi.fn().mockResolvedValue(undefined),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    translate: (
      key: string,
      params?: Record<string, string | number | boolean | null | undefined>,
      requestedScope?: string,
    ) => {
      const source = requestedScope ? scopedTranslations : globalTranslations;
      const resolved = resolveTranslationValue(source, key);

      if (typeof resolved !== 'string') {
        return key;
      }

      return resolved.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, paramKey: string) =>
        String(params?.[paramKey] ?? ''),
      );
    },
  };
}

function loadJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), relativePath.replace(/^\.\.\/\.\.\/\.\.\/\.\.\//, '')),
      'utf8',
    ),
  ) as Record<string, unknown>;
}

function resolveTranslationValue(source: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[part];
  }, source);
}
