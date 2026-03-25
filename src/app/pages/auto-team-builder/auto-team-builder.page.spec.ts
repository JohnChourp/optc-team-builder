import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord, type DatasetManifest } from '../../core/models/optc.models';
import {
  buildAutoTeamExportFilename,
  buildAutoTeamExportPayload,
  downloadAutoTeamExport,
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
