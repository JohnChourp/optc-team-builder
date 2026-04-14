import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import {
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
} from './auto-team-builder-export.utils';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
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

  it('passes the unique-base-name toggle to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.onRequireUniqueBaseCharacterNamesToggle({
      detail: { checked: true },
    } as CustomEvent<{
      checked: boolean;
    }>);
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

  it('does not pass a leader super special criteria toggle to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.not.objectContaining({
        requireLeaderSuperSpecialCriteria: expect.anything(),
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
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

  it('passes picker-selected extra-drop requirements to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.saveAbilityPicker([
      {
        draftId: 'drop-guaranteed',
        abilityKey: 'extra_drop_guaranteed',
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
            abilityKey: 'extra_drop_guaranteed',
            requiredCharacterCount: 1,
          }),
        ]),
      }),
      expect.any(Object),
    );
  });

  it('keeps picker-selected extra-drop abilities in the manual requirement drafts', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    await page.saveAbilityPicker([
      {
        draftId: 'drop-any',
        abilityKey: 'extra_drop_any',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);

    expect(page.requiredAbilityDrafts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          abilityKey: 'extra_drop_any',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        }),
      ]),
    );
    expect(page.requiredAbilitySummaryChips().map((chip) => chip.label)).toContain(
      'Any Extra Drop',
    );
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'extra_drop_any',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
  });

  it('keeps extra-drop requirements in manual leader slot filters', async () => {
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
    page.activeManualSlotRole.set('captain');

    expect(page.manualCandidateFilters().requiredAbilities).toEqual([
      {
        abilityKey: 'extra_drop_guaranteed',
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

  it('filters manual leader cards by extra-drop while leaving sub cards unfiltered', async () => {
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
        draftId: 'drop-guaranteed',
        abilityKey: 'extra_drop_guaranteed',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);

    page.activeManualSlotRole.set('captain');
    expect(page.manualCandidateCards().map((card) => card.character.id)).toEqual([401]);

    page.activeManualSlotRole.set('sub1');
    expect(page.manualCandidateCards().map((card) => card.character.id)).toEqual([402, 401]);
  });

  it('keeps favorite-only auto-fill enabled when disable confirmation is cancelled', async () => {
    const { page, alertController, alertState } = await createPage();

    await page.ngOnInit();
    alertState.nextRole = 'cancel';

    await page.onFavoritesOnlyToggle({ detail: { checked: false } } as CustomEvent<{
      checked: boolean;
    }>);

    expect(page.favoritesOnly()).toBe(true);
    expect(alertController.create).toHaveBeenCalledOnce();
  });

  it('disables favorite ship mode after confirmation', async () => {
    const { page, alertController, alertState } = await createPage();

    await page.ngOnInit();
    alertState.nextRole = 'confirm';

    await page.onFavoriteShipsOnlyToggle({ detail: { checked: false } } as CustomEvent<{
      checked: boolean;
    }>);

    expect(page.favoriteShipsOnly()).toBe(false);
    expect(alertController.create).toHaveBeenCalledOnce();
  });

  it('asks for confirmation before disabling unique-name matching', async () => {
    const { page, alertController, alertState } = await createPage();

    await page.ngOnInit();
    alertState.nextRole = 'confirm';

    await page.onRequireUniqueBaseCharacterNamesToggle({
      detail: { checked: false },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.requireUniqueBaseCharacterNames()).toBe(false);
    expect(alertController.create).toHaveBeenCalledOnce();
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
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 2,
          },
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 2,
            slotTokens: ['DEX'],
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
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
      }),
    ]);
    expect(repository.searchDetailedCharacters).toHaveBeenCalledTimes(2);
  });

  it('derives direct counters from enemy mechanics and refreshes the manual candidate pool on save', async () => {
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
    expect(page.pageRequiredAbilities()).toEqual([
      {
        abilityKey: 'remove_enemy_barrier',
        minTurns: 3,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
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
      createManualSlots({
        captain: [101, 102],
        sub1: [103, 104],
      }),
    );
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        manualSlots: createManualSlots({
          captain: [101, 102],
          sub1: [103, 104],
        }),
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
    ).toBe('Remove Bind (>=2 chars • 5 turns)');
    expect(
      page.formatAbilityRequirement({
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      }),
    ).toBe('Remove Bind (5 turns)');
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
        minTurns: 5,
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

  it('renders detail actions only on selected leader and result cards', async () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/auto-team-builder/auto-team-builder.page.html'),
      'utf8',
    );

    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template.match(/common\.actions\.viewDetails/g)).toHaveLength(3);
    expect(template).toContain('[routerLink]="getCharacterDetailLink(candidateCard.character)"');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(slot.character)"');
    expect(template).toContain('(click)="saveTeam()"');
    expect(template).toContain('<ng-lottie');
    expect(template).toContain('[disabled]="saveUiLocked()"');
    expect(template).toContain('{{ saveButtonLabel() }}');
    expect(template).toContain('<app-enemy-mechanic-picker');
    expect(template).toContain('<app-ability-requirement-picker');
    expect(template).not.toContain('<app-ship-picker');
    expect(template).toContain('favoriteShipsOnlyToggleLabel()');
    expect(template).toContain('[value]="manualShipSearchTerm()"');
    expect(template).toContain('(ionInput)="onManualShipSearchChange($event)"');
    expect(template).toContain('(scroll)="onManualShipListScroll($event)"');
    expect(template).toContain('(scroll)="onExcludedShipListScroll($event)"');
    expect(template).toContain("t('ships.actions.selected')");
    expect(template).toContain('(click)="toggleShipFavorite(shipCard.ship.id)"');
    expect(template).toContain('<cdk-virtual-scroll-viewport');
    expect(template).toContain(
      '(scrolledIndexChange)="onManualCandidatesScrolledIndexChange($event)"',
    );
    expect(template).toContain(
      '(scrolledIndexChange)="onExcludedCandidatesScrolledIndexChange($event)"',
    );
    expect(template).toContain('*cdkVirtualFor=');
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
    expect(template).toContain('(click)="toggleExcludedCharacter(slot.character)"');
    expect(template).toContain("t('exclude.actions.addShip')");
    expect(template).toContain("t('exclude.actions.add')");
    expect(template).toContain('@if (current.shipSelection; as shipSelection)');
    expect(template).not.toContain('leaderSuperSpecialCriteriaToggleLabel()');
    expect(template).toContain("t('fallback.ignoredLeaderSuperSpecialCriteria')");
  });

  it('resets the full page state through resetPage', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.selectedClasses.set(['Fighter']);
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
    page.saveFeedbackVisible.set(true);
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
    expect(page.saveFeedbackVisible()).toBe(false);
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
          totalAttempts: 31744,
          elapsedMs: 25,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          messageKey: 'progress.exactAttempt',
          messageParams: {
            current: 1,
            total: 31744,
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
    await page.onRequireUniqueBaseCharacterNamesToggle({
      detail: { checked: true },
    } as CustomEvent<{
      checked: boolean;
    }>);
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

  it('exposes stable loading progress rows with placeholder slots', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    page.buildProgress.set({
      stage: 'fallbackAttempt',
      candidateCount: 1200,
      completedAttempts: 3503,
      totalAttempts: 31744,
      elapsedMs: 54000,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: ['STR', 'INT'],
      currentDroppedClasses: [],
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
        key: 'attempt',
        text: 'Attempt 3504 / 31744',
        displayText: 'Attempt 3504 / 31744',
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
      {
        key: 'droppedTypes',
        text: 'Ignoring types: STR / INT',
        displayText: 'Ignoring types: STR / INT',
        visible: true,
        tone: 'fallback',
      },
      {
        key: 'droppedClasses',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'fallback',
      },
      {
        key: 'superSpecialCriteria',
        text: '',
        displayText: '\u00A0',
        visible: false,
        tone: 'fallback',
      },
    ]);
  });

  it('shows the worst-case fallback eta row when an estimate is available', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.buildProgress.set({
      stage: 'fallbackAttempt',
      candidateCount: 1200,
      completedAttempts: 3504,
      totalAttempts: 31744,
      elapsedMs: 91000,
      estimatedRemainingMs: 61000,
      averageFallbackAttemptMs: 15000,
      completedFallbackAttempts: 2,
      currentDroppedTypes: [],
      currentDroppedClasses: ['Fighter'],
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.fallbackAttempt',
      messageParams: {
        current: 3505,
        total: 31744,
      },
    });

    expect(page.buildWorstCaseEtaLabel()).toBe(
      'Approx. worst-case to check the remaining fallbacks: ~1m 1s',
    );
    expect(page.loadingProgressRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'eta',
          text: 'Approx. worst-case to check the remaining fallbacks: ~1m 1s',
          displayText: 'Approx. worst-case to check the remaining fallbacks: ~1m 1s',
          visible: true,
          tone: 'fallback',
        }),
      ]),
    );
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
        minTurns: 1,
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

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
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

    expect(repository.searchDetailedCharacters).toHaveBeenCalledTimes(2);
    expect(repository.searchDetailedCharacters.mock.calls).toEqual([
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

  it('prioritizes stronger picker candidates before demoted high-cost outliers', async () => {
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
      [705, 702, 703, 701, 706, 704],
    );
    expect(
      page.excludedCandidates().map((candidate: CharacterDetailRecord) => candidate.id),
    ).toEqual([705, 702, 703, 701, 706, 704]);
  });

  it('loads more manual and excluded candidates in 10-item batches when the virtual list nears the end', async () => {
    const { page, repository } = await createPage();
    const records = Array.from({ length: 26 }, (_, index) =>
      createCharacterRecord(600 + index, `Paged Candidate ${index + 1}`),
    );

    repository.searchDetailedCharacters.mockImplementation(async (query) =>
      filterCharactersForManualQuery(records, query),
    );

    await page.ngOnInit();

    await page.onManualCandidatesScrolledIndexChange(6);
    await page.onExcludedCandidatesScrolledIndexChange(6);

    expect(repository.searchDetailedCharacters.mock.calls).toEqual([
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
            elapsedMs: 18,
            estimatedRemainingMs: null,
            averageFallbackAttemptMs: null,
            completedFallbackAttempts: 0,
            currentDroppedTypes: [],
            currentDroppedClasses: [],
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

  it('saves immediately and keeps the save UI locked for 3 seconds', async () => {
    vi.useFakeTimers();
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

    const savePromise = page.saveTeam();

    await Promise.resolve();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: undefined,
      name: 'Auto Crew',
      notes: 'Generated from filters',
      shipId: 9001,
      slots: [101, 102, 103, 104, 105, 106],
    });
    expect(page.currentTeamId()).toBe('saved-auto-team');
    expect(page.saveUiLocked()).toBe(true);
    expect(page.saveFeedbackVisible()).toBe(true);
    expect(page.saveFeedbackError()).toBe('');

    await vi.advanceTimersByTimeAsync(2999);
    expect(page.saveUiLocked()).toBe(true);
    expect(page.saveFeedbackVisible()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await savePromise;

    expect(page.saveUiLocked()).toBe(false);
    expect(page.saveFeedbackVisible()).toBe(false);
  });

  it('reuses the current saved team id when saving the same generated result again', async () => {
    vi.useFakeTimers();
    const { page, userState } = await createPage();

    userState.saveTeam
      .mockResolvedValueOnce({ id: 'saved-auto-team' })
      .mockResolvedValueOnce({ id: 'saved-auto-team' });

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());

    const firstSavePromise = page.saveTeam();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3000);
    await firstSavePromise;

    const secondSavePromise = page.saveTeam();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3000);
    await secondSavePromise;

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

  it('ignores repeated save clicks while the 3-second feedback window is active', async () => {
    vi.useFakeTimers();
    const { page, userState } = await createPage();

    await page.ngOnInit();
    page.result.set(createAutoBuildResult());

    const firstSavePromise = page.saveTeam();
    await Promise.resolve();

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenCalledTimes(1);
    expect(page.saveUiLocked()).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    await firstSavePromise;
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
    expect(page.saveFeedbackVisible()).toBe(false);
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
});

describe('AutoTeamBuilderPage leader cost scope labels', () => {
  it('shows the leader cost restriction when present', async () => {
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
      '4 / 6 slots match the derived leader scope.',
    );
  });
});

describe('AutoTeamBuilderPage preset export state', () => {
  it('is disabled when the page has no selected filters or manual picks', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set([]);
    page.selectedClasses.set([]);
    page.requireUniqueBaseCharacterNames.set(false);
    page.favoritesOnly.set(false);
    page.favoriteShipsOnly.set(false);

    expect(page.canDownloadSelectionJson()).toBe(false);
    expect(page.buildSelectionExportPayload()).toBeNull();
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
    await page.onRequireUniqueBaseCharacterNamesToggle({
      detail: { checked: true },
    } as CustomEvent<{
      checked: boolean;
    }>);
    await page.onFavoritesOnlyToggle({ detail: { checked: true } } as CustomEvent<{
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
      schemaVersion: 11,
      exportedAt: '2026-03-25T10:00:00.000Z',
      source: 'auto-team-builder',
      exportType: 'preset',
      filters: {
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
        requireUniqueBaseCharacterNames: true,
        favoritesOnly: true,
        favoriteCount: 3,
        favoriteShipsOnly: true,
        favoriteShipCount: 1,
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
});

describe('AutoTeamBuilder preset export helpers', () => {
  it('builds the expected preset payload for the current selection snapshot', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: true,
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
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: true,
      favoriteCount: 4,
      favoriteShipsOnly: false,
      favoriteShipCount: 0,
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

  it('marks a single selected leader as dual in the preset snapshot', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
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
    expect(result.state.favoriteShipsOnly).toBe(false);
    expect(result.warnings).toEqual([]);
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

    expect(page.requiredAbilityDrafts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          abilityKey: 'extra_drop_any',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        }),
      ]),
    );
    expect(page.requiredAbilitySummaryChips().map((chip) => chip.label)).toContain(
      'Any Extra Drop',
    );
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

  it('merges duplicate imported ability requirements by keeping the max character count', () => {
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
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: true,
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
      elapsedMs: 18,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
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
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 2,
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
    expect(page.requireUniqueBaseCharacterNames()).toBe(true);
    expect(page.favoritesOnly()).toBe(true);
    expect(page.manualCandidates().map((candidate: CharacterDetailRecord) => candidate.id)).toEqual(
      [702, 701],
    );
    expect(page.result()).toBeNull();
    expect(page.errorMessage()).toBe('');
    expect(page.buildProgress()).toBeNull();
    expect(page.presetImportFeedback()).toEqual({
      tone: 'success',
      title: 'Preset applied.',
      details: ['Loaded settings from favorite-preset.json.'],
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
    expect(page.pageEnemyMechanics()).toEqual([
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

function createCharacterRecord(
  id: number,
  name = `Character ${id}`,
  builderAbilities: CharacterDetailRecord['detail']['builderAbilities'] = [],
): CharacterDetailRecord {
  return {
    id,
    name,
    type: id % 2 === 0 ? 'DEX' : 'PSY',
    classes: ['Fighter', 'Slasher'],
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    stars: 6,
    cost: 55,
    combo: 4,
    maxLevel: 99,
    maxExperience: 5000000,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 4200, atk: 1800, rcv: 320 },
      growth: 2.4,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: true,
    },
    assets: {
      exactLocal: `assets/characters/${id}.png`,
      thumbnailGlobal: `assets/characters/${id}-thumb.png`,
      thumbnailJapan: null,
      fullTransparent: `assets/characters/${id}-full.png`,
    },
    imageUrl: `assets/characters/${id}-thumb.png`,
    detailImageUrl: `assets/characters/${id}-full.png`,
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
      partyConflictKeys: [],
      builderAbilities,
      sailorAbilities: [`${name} sailor`],
      sailorNotes: null,
      limitBreak: [{ description: `${name} limit break` }],
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

function resolvePowerFirstCostBucket(cost: number): number {
  return cost >= 1 && cost <= 65 ? 0 : 1;
}

function sortCharactersForPowerFirst(records: CharacterDetailRecord[]): CharacterDetailRecord[] {
  return [...records].sort((left, right) => {
    const bucketDifference =
      resolvePowerFirstCostBucket(left.cost) - resolvePowerFirstCostBucket(right.cost);

    if (bucketDifference !== 0) {
      return bucketDifference;
    }

    if (resolvePowerFirstCostBucket(left.cost) === 0 && left.cost !== right.cost) {
      return right.cost - left.cost;
    }

    return right.id - left.id;
  });
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
        ? sortCharactersForPowerFirst(filteredRecords)
        : filteredRecords;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? filteredRecords.length;

  return sortedRecords.slice(offset, offset + limit);
}

function createManualSlots(
  overrides: Partial<Record<AutoBuildManualSlotSelection['role'], number[]>> = {},
): AutoBuildManualSlotSelection[] {
  return createEmptyAutoBuildManualSlots().map((slot) => ({
    role: slot.role,
    characterIds: [...(overrides[slot.role] ?? [])],
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
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
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
      enemyMechanics: input.enemyMechanics.map((mechanic) => ({
        ...mechanic,
        triggerTags: [...mechanic.triggerTags],
        responseTags: [...mechanic.responseTags],
        conditionTags: [...mechanic.conditionTags],
      })),
      favoriteShipIds: [...input.favoriteShipIds],
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
      ignoredLeaderSuperSpecialCriteria: false,
    },
    shipSelection: null,
    candidateCount: 32,
    coverage: {
      leaderCriteria: {
        source: 'captainAbility',
        captainLeaderId: 101,
        friendCaptainLeaderId: 102,
        leaderIds: [101, 102],
        leaderNames: ['Character 101', 'Character 102'],
        dualLeaderMode: 'intersection',
        derivedAllowedClasses: ['Fighter', 'Slasher'],
        derivedAllowedTypes: ['DEX', 'PSY'],
        hasCostRestriction: false,
        maxAllowedCost: null,
        hasClassRestriction: true,
        hasTypeRestriction: true,
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
      burst: ['ATK boost'],
      consistency: ['Matching orbs'],
      utility: ['Bind clear'],
      coveredSelectedClasses: ['Fighter', 'Slasher'],
      coveredSelectedTypes: ['DEX', 'PSY'],
      coversAllSelectedClasses: true,
      coversAllSelectedTypes: true,
      selectedClassMatches: 6,
      selectedTypeMatches: 6,
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
    getShips: ReturnType<typeof vi.fn>;
    getCharactersByIds: ReturnType<typeof vi.fn>;
    searchDetailedCharacters: ReturnType<typeof vi.fn>;
    searchCharacters: ReturnType<typeof vi.fn>;
  };
  autoTeamBuilder: { buildTeam: ReturnType<typeof vi.fn> };
  alertController: { create: ReturnType<typeof vi.fn> };
  alertState: { nextRole: 'cancel' | 'confirm'; lastConfig: unknown };
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
    resolveAutoTeamBuilderWorkerCount: ReturnType<typeof vi.fn>;
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
          label: 'Remove Bind',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 10,
          sampleCharacterIds: [101],
          sampleTexts: ['Reduces Bind duration by 5 turns'],
        },
        {
          key: 'remove_slot_barrier',
          label: 'Remove Slot Barrier',
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
  };
  const alertState: { nextRole: 'cancel' | 'confirm'; lastConfig: unknown } = {
    nextRole: 'confirm',
    lastConfig: null,
  };
  const alertController = {
    create: vi.fn().mockImplementation(async (config: unknown) => {
      alertState.lastConfig = config;

      return {
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ role: alertState.nextRole }),
      };
    }),
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
    resolveAutoTeamBuilderWorkerCount: vi.fn().mockReturnValue(7),
    saveCharacterBox: vi.fn().mockImplementation(async (input: { name: string; characterIds: number[] }) => {
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
      alertController as never,
    ),
    repository,
    autoTeamBuilder,
    alertController,
    alertState,
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
