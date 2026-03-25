import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord, type DatasetManifest } from '../../core/models/optc.models';
import { AutoTeamBuildCancelledError } from '../../core/services/auto-team-builder.engine';
import {
  buildAutoTeamExportFilename,
  buildAutoTeamExportPayload,
  buildAutoTeamSelectionExportFilename,
  buildAutoTeamSelectionExportPayload,
  downloadAutoTeamExport,
  downloadAutoTeamSelectionExport,
} from './auto-team-builder-export.utils';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

describe('AutoTeamBuilderPage special-support toggle', () => {
  it('passes the special-support toggle to the builder service', async () => {
    const { page, autoTeamBuilder } = await createPage();

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    page.onRequireAllSpecialsSupportToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    await page.buildTeam();

    expect(autoTeamBuilder.buildTeam).toHaveBeenCalledWith(
      ['Fighter'],
      ['DEX'],
      expect.objectContaining({
        requireAllSpecialsSupportTeam: true,
      }),
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('resets the special-support toggle when the page state is reset', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.onRequireAllSpecialsSupportToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);

    expect(page.requireAllSpecialsSupportTeam()).toBe(true);

    await page.ionViewWillEnter();

    expect(page.requireAllSpecialsSupportTeam()).toBe(false);
  });

  it('updates build progress from the service execution callback', async () => {
    const { page, autoTeamBuilder } = await createPage();

    autoTeamBuilder.buildTeam.mockImplementation(
      async (
        _selectedClasses: string[],
        _selectedTypes: string[],
        _constraints: unknown,
        executionOptions?: { onProgress?: (snapshot: any) => void },
      ) => {
        executionOptions?.onProgress?.({
          stage: 'exactAttempt',
          candidateCount: 1242,
          completedAttempts: 0,
          totalAttempts: 31744,
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          message: 'Exact attempt 1 / 31744',
        });

        return null;
      },
    );

    await page.ngOnInit();
    page.selectedClasses.set(['Fighter']);
    page.selectedTypes.set(['DEX']);
    await page.buildTeam();

    expect(page.errorMessage()).toContain('Δοκιμάστηκαν');
    expect(page.building()).toBe(false);
    expect(page.buildProgress()).toBeNull();
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
      currentDroppedTypes: ['STR', 'INT'],
      currentDroppedClasses: [],
      message: 'Fallback attempt 3504 / 31744',
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
        key: 'candidatePool',
        text: '1200 candidates στο current search pool',
        displayText: '1200 candidates στο current search pool',
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
    ]);
  });

  it('cancels the active build and restores the previous result', async () => {
    const { page, autoTeamBuilder } = await createPage();
    const previousResult = createAutoBuildResult();

    autoTeamBuilder.buildTeam.mockImplementation(
      async (
        _selectedClasses: string[],
        _selectedTypes: string[],
        _constraints: unknown,
        executionOptions?: { signal?: AbortSignal; onProgress?: (snapshot: any) => void },
      ) =>
        new Promise<null>((resolve, reject) => {
          executionOptions?.onProgress?.({
            stage: 'exactAttempt',
            candidateCount: 64,
            completedAttempts: 0,
            totalAttempts: 2,
            currentDroppedTypes: [],
            currentDroppedClasses: [],
            message: 'Exact attempt 1 / 2',
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
    const payload = buildAutoTeamExportPayload(
      result,
      [201],
      201,
      201,
      '2026-03-25T10:00:00.000Z',
    );

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

describe('AutoTeamBuilderPage preset export state', () => {
  it('is disabled when the page has no selected filters or manual picks', async () => {
    const { page } = await createPage();

    await page.ngOnInit();

    expect(page.canDownloadSelectionJson()).toBe(false);
    expect(page.buildSelectionExportPayload()).toBeNull();
  });

  it('is enabled when the page only has filters, manual picks, or leader state', async () => {
    const { page } = await createPage();

    await page.ngOnInit();
    page.selectedTypes.set(['DEX']);
    expect(page.canDownloadSelectionJson()).toBe(true);

    await page.ionViewWillEnter();
    page.lockCharacter(createCharacterRecord(301));
    expect(page.canDownloadSelectionJson()).toBe(true);

    await page.ionViewWillEnter();
    page.selectedLeaderIds.set([302]);
    expect(page.canDownloadSelectionJson()).toBe(true);
  });

  it('builds the preset export payload from the current page selections', async () => {
    const { page, userState } = await createPage();

    await page.ngOnInit();
    userState.favoriteCharacterIds.set([101, 102, 103]);
    page.selectedTypes.set(['DEX', 'PSY']);
    page.selectedClasses.set(['Fighter', 'Slasher']);
    page.onRequireAllSelectedTypesToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.onRequireAllSelectedClassesToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.onRequireAllSpecialsSupportToggle({ detail: { checked: true } } as CustomEvent<{
      checked: boolean;
    }>);
    page.onFavoritesOnlyToggle({ detail: { checked: true } } as CustomEvent<{ checked: boolean }>);
    page.lockCharacter(createCharacterRecord(101));
    page.lockCharacter(createCharacterRecord(102));
    page.toggleLeaderCharacter(101);
    page.toggleLeaderCharacter(102);
    page.setCaptainLeader(102);

    const payload = page.buildSelectionExportPayload('2026-03-25T10:00:00.000Z');

    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      schemaVersion: 1,
      exportedAt: '2026-03-25T10:00:00.000Z',
      source: 'auto-team-builder',
      exportType: 'preset',
      filters: {
        selectedTypes: ['DEX', 'PSY'],
        selectedClasses: ['Fighter', 'Slasher'],
        requireAllSelectedTypesInTeam: true,
        requireAllSelectedClassesPerCharacter: true,
        requireAllSpecialsSupportTeam: true,
        favoritesOnly: true,
        favoriteCount: 3,
      },
      manualSelection: {
        lockedCharacterIds: [101, 102],
        selectedLeaderIds: [101, 102],
        captainLeaderId: 102,
        friendCaptainLeaderId: 101,
      },
    });
    expect(payload?.manualSelection.characters).toEqual([
      expect.objectContaining({
        id: 101,
        isLeader: true,
        leaderAssignment: 'friendCaptain',
      }),
      expect.objectContaining({
        id: 102,
        isLeader: true,
        leaderAssignment: 'captain',
      }),
    ]);
  });
});

describe('AutoTeamBuilder preset export helpers', () => {
  it('builds the expected preset payload for the current selection snapshot', () => {
    const payload = buildAutoTeamSelectionExportPayload({
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: true,
      favoritesOnly: true,
      favoriteCount: 4,
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
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: true,
      favoritesOnly: true,
      favoriteCount: 4,
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
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: false,
      favoritesOnly: false,
      favoriteCount: 0,
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
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: true,
      requireAllSpecialsSupportTeam: true,
      favoritesOnly: true,
      favoriteCount: 2,
      lockedCharacterIds: [101, 102],
      lockedCharacters: [createCharacterRecord(101), createCharacterRecord(102)],
      selectedLeaderIds: [101, 102],
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
    expect(exportedJson.manualSelection.characters[0]?.leaderAssignment).toBe('friendCaptain');
    expect(exportedJson.manualSelection.characters[1]?.leaderAssignment).toBe('captain');
  });
});

function createCharacterRecord(id: number, name = `Character ${id}`): CharacterDetailRecord {
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
      specialName: `${name} special`,
      specialText: `${name} special text`,
      specialNotes: null,
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
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSpecialsSupportTeam: false,
    favoritesOnly: false,
    lockedCharacterIds: [],
    captainCharacterId: 101,
    friendCaptainCharacterId: 102,
    candidateLimit: 1200,
  };

  return {
    input,
    requestedInput: {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      lockedCharacterIds: [...input.lockedCharacterIds],
    },
    relaxation: {
      usedFallback: false,
      droppedTypes: [],
      droppedClasses: [],
    },
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
        hasClassRestriction: true,
        hasTypeRestriction: true,
        matchingSlots: 6,
        totalSlots: 6,
        allSlotsMatch: true,
      },
      specialSupport: {
        source: 'specialText',
        enabled: false,
        matchingSlots: 4,
        totalSlots: 6,
        allSlotsMatch: false,
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

async function createPage(): Promise<{
  page: any;
  autoTeamBuilder: { buildTeam: ReturnType<typeof vi.fn> };
  userState: {
    favoriteCharacterIds: {
      (): number[];
      set(value: number[]): void;
    };
    ready: ReturnType<typeof vi.fn>;
    toggleFavorite: ReturnType<typeof vi.fn>;
  };
}> {
  const { AutoTeamBuilderPage } = await import('./auto-team-builder.page');
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue(createManifest()),
    searchCharacters: vi.fn().mockResolvedValue([]),
  };
  const autoTeamBuilder = {
    buildTeam: vi.fn().mockResolvedValue(null),
  };
  const userState = {
    favoriteCharacterIds: signal<number[]>([]),
    ready: vi.fn().mockResolvedValue(undefined),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
  };

  return {
    page: new AutoTeamBuilderPage(
      repository as never,
      autoTeamBuilder as never,
      userState as never,
    ),
    autoTeamBuilder,
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
