import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../../core/models/optc.models';
import { CaptainCoverageFilterRunnerService } from '../../core/services/captain-coverage-filter-runner.service';
import { CaptainCoveragePage } from './captain-coverage.page';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-progress-bar', () => ({ IonProgressBar: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f13c5c. "See who this Captain boosts" on a character page opens Captain Coverage with
 * `?captain=<id>`. These cover that handoff on its own; the page's other behaviour, and `?teamId=`
 * alone, live in `captain-coverage.page.spec.ts`, whose harness this file copies in trimmed form on
 * purpose (a new topic gets its own file).
 */
describe('Captain Coverage ?captain= handoff', () => {
  afterEach(() => {
    try {
      globalThis.sessionStorage?.clear();
    } catch {
      // No storage in this environment; nothing to clear.
    }
  });

  const leader = createCharacter({ id: 1001, name: 'Leader', captainAbility: 'Boosts ATK of all characters by 2x.' });
  const noCaptainAbility = createCharacter({ id: 2001, name: 'Evolver' });
  const savedLeader = createCharacter({ id: 1002, name: 'Saved Leader', captainAbility: 'Boosts HP of all characters by 1.5x.' });

  it('starts a fresh team with that character as Captain, then clears the parameter', async () => {
    const { page, router } = createPage({ params: { captain: '1001' } });

    await page.ngOnInit();

    expect(page.selectedTeamSlots().map((slot) => slot?.id ?? null)).toEqual([1001, null, null, null, null, null]);
    expect(page.selectedCaptainDetail()?.id).toBe(1001);
    expect(page.teamName()).toBe('New Crew');
    expect(page.currentTeamId()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { captain: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it.each([
    ['a character with no Captain Ability', '2001'],
    ['an id that is not a number', 'abc'],
    ['a fraction', '1001.5'],
    ['a negative id', '-1001'],
    // Number('0x3E9') is 1001, a real Captain here: only digits are read as an id.
    ['a hex spelling of a real Captain', '0x3E9'],
    ['an id nobody has', '9999'],
  ])('drops %s, keeps the team on screen, and still clears the parameter', async (_label, raw) => {
    const { page, router } = createPage({ params: { captain: raw } });

    page.teamName.set('Work in progress');
    page.selectedTeamSlots.set([savedLeader, null, null, null, null, null]);
    page.selectedCaptainDetail.set(savedLeader);

    await page.ngOnInit();

    expect(page.selectedTeamSlots().map((slot) => slot?.id ?? null)).toEqual([1002, null, null, null, null, null]);
    expect(page.teamName()).toBe('Work in progress');
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { captain: null } }));
  });

  it('lets ?teamId= win when both arrive', async () => {
    const { page, router } = createPage({
      params: { captain: '1001', teamId: 'team-1' },
      savedTeams: [{ id: 'team-1', name: 'Saved', slots: [1002, null, null, null, null, null] }],
    });

    await page.ngOnInit();

    expect(page.selectedTeamSlots().map((slot) => slot?.id ?? null)).toEqual([1002, null, null, null, null, null]);
    expect(page.selectedCaptainDetail()?.id).toBe(1002);
    expect(page.teamName()).toBe('Saved');
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { captain: null } }));
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { teamId: null } }));
  });

  it('applies on returning to a page that is already open', async () => {
    const { page, params } = createPage({ params: {} });

    await page.ngOnInit();
    expect(page.selectedTeamSlots().every((slot) => slot === null)).toBe(true);

    params['captain'] = '1001';
    await page.ionViewWillEnter();

    expect(page.selectedTeamSlots()[0]?.id).toBe(1001);
    expect(page.selectedCaptainDetail()?.id).toBe(1001);
  });

  function createPage({
    params,
    savedTeams = [],
  }: {
    params: Record<string, string>;
    savedTeams?: Array<{ id: string; name: string; slots: Array<number | null> }>;
  }) {
    const all = [leader, noCaptainAbility, savedLeader];
    const byId = new Map(all.map((character) => [character.id, character]));
    const route = { snapshot: { queryParamMap: { get: vi.fn((key: string) => params[key] ?? null) } } };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    const page = new CaptainCoveragePage(
      {
        getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue(null),
        getDatasetManifest: vi.fn().mockResolvedValue({ schemaVersion: 1, characterCount: all.length }),
        getCharacterById: vi.fn((id: number) => Promise.resolve(byId.get(id) ?? null)),
        searchDetailedCharacters: vi.fn().mockResolvedValue(all),
        getAvailableCharacterTags: vi.fn().mockResolvedValue([]),
      } as never,
      { catalog: signal<CharacterListItem[]>(all), ensureLoaded: vi.fn().mockResolvedValue(undefined) } as never,
      {
        characterBoxes: signal([]),
        favoriteCharacterIds: signal([]),
        getSavedTeamById: vi.fn((teamId: string) => {
          const team = savedTeams.find((candidate) => candidate.id === teamId);

          return team
            ? { ...team, notes: '', shipId: null, createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z' }
            : null;
        }),
        ready: vi.fn().mockResolvedValue(undefined),
        readyCharacterBoxes: vi.fn().mockResolvedValue(undefined),
        readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
        readySavedTeams: vi.fn().mockResolvedValue(undefined),
        saveTeam: vi.fn().mockResolvedValue({ id: 'saved' }),
      } as never,
      {
        preloadScope: vi.fn().mockResolvedValue(undefined),
        translate: vi.fn((key: string) => (key === 'common.defaults.newCrew' ? 'New Crew' : key)),
      } as never,
      route as never,
      router as never,
      { create: vi.fn() } as never,
      new CaptainCoverageFilterRunnerService() as never,
    );

    return { page, router, params };
  }
});

function createCharacter({
  id,
  name,
  captainAbility = null,
}: {
  id: number;
  name: string;
  captainAbility?: string | null;
}): CharacterDetailRecord & CharacterListItem {
  return {
    id,
    name,
    searchText: '',
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter', 'Slasher'],
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    stars: 5,
    cost: 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: { min: { hp: null, atk: null, rcv: null }, max: { hp: null, atk: null, rcv: null }, growth: null },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility,
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
      superTandemData: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  };
}
