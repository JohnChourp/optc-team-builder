import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../../core/models/optc.models';
import { CaptainCoverageFilterRunnerService } from '../../core/services/captain-coverage-filter-runner.service';
import { type PreferencesAdapterService } from '../../core/services/preferences-adapter.service';
import { UserStateService } from '../../core/services/user-state.service';
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
 * 869f6td2b. A second Save from Captain Coverage wiped the team's notes and ship.
 *
 * The page has no notes and no ship of its own, and it sent '' and null on EVERY save. Its "View
 * saved teams" link navigates forward, so the page stays alive with the saved team's id: notes and
 * a ship added in Saved Teams or Manual Team Builder were then wiped by the next Save here, rename
 * included. Measured before the fix: {"notes":"Stage 3: stall 2 turns","shipId":12} came back as
 * {"notes":"","shipId":null}.
 *
 * The page is driven against the REAL UserStateService over an in-memory store, so what is asserted
 * is what a reader would find in Saved Teams, not what the page meant to send. The page's other
 * saving behaviour lives in `captain-coverage.page.spec.ts`; this harness is a trimmed copy on
 * purpose (a new topic gets its own file).
 */
describe('Captain Coverage save over a team edited elsewhere', () => {
  afterEach(() => {
    try {
      globalThis.sessionStorage?.clear();
    } catch {
      // No storage in this environment; nothing to clear.
    }
  });

  const leader = createCharacter(1001, 'Boosts ATK of all characters by 2x.');
  const subs = [2001, 2002, 2003, 2004].map((id) => createCharacter(id));

  it('keeps the notes and ship another screen added, and still saves the rename', async () => {
    const { page, userState } = await buildTeamOnPage();

    await page.saveTeam();

    const teamId = page.currentTeamId();

    expect(teamId).not.toBeNull();
    expect(readTeam(userState, teamId)).toEqual({
      name: 'Kizuna crew',
      notes: '',
      shipId: null,
      slots: [1001, null, 2001, 2002, 2003, 2004],
    });

    // Saved Teams / Manual Team Builder: the reader picks a ship and writes notes on the same team.
    await userState.saveTeam({
      id: teamId!,
      name: 'Kizuna crew',
      notes: 'Stage 3: stall 2 turns',
      shipId: 12,
      slots: [1001, null, 2001, 2002, 2003, 2004],
    });

    // Back on the page that stayed alive: a rename does not forget the saved team's id.
    page.onTeamNameChange({ detail: { value: 'Kizuna crew v2' } } as CustomEvent<{ value?: string | null }>);
    await page.saveTeam();

    expect(page.currentTeamId()).toBe(teamId);
    expect(userState.savedTeams()).toHaveLength(1);
    expect(readTeam(userState, teamId)).toEqual({
      name: 'Kizuna crew v2',
      notes: 'Stage 3: stall 2 turns',
      shipId: 12,
      slots: [1001, null, 2001, 2002, 2003, 2004],
    });
  });

  it('keeps an empty ship and empty notes empty when the other screen cleared them', async () => {
    const { page, userState } = await buildTeamOnPage();

    await page.saveTeam();

    const teamId = page.currentTeamId();

    await userState.saveTeam({
      id: teamId!,
      name: 'Kizuna crew',
      notes: 'Stage 3: stall 2 turns',
      shipId: 12,
      slots: [1001, null, 2001, 2002, 2003, 2004],
    });
    await userState.saveTeam({
      id: teamId!,
      name: 'Kizuna crew',
      notes: '',
      shipId: null,
      slots: [1001, null, 2001, 2002, 2003, 2004],
    });
    await page.saveTeam();

    expect(readTeam(userState, teamId)).toMatchObject({ notes: '', shipId: null });
  });

  it('starts a new team with no notes and no ship once the team on screen changed', async () => {
    const { page, userState } = await buildTeamOnPage();

    await page.saveTeam();

    const firstTeamId = page.currentTeamId();

    await userState.saveTeam({
      id: firstTeamId!,
      name: 'Kizuna crew',
      notes: 'Stage 3: stall 2 turns',
      shipId: 12,
      slots: [1001, null, 2001, 2002, 2003, 2004],
    });

    // A different sub is a different team: the page forgets the saved id, as it always has, and the
    // new team takes nothing from the old one.
    await page.clearTeamSlot(5);
    await page.saveTeam();

    const secondTeamId = page.currentTeamId();

    expect(secondTeamId).not.toBe(firstTeamId);
    expect(readTeam(userState, secondTeamId)).toMatchObject({
      notes: '',
      shipId: null,
      slots: [1001, null, 2001, 2002, 2003, null],
    });
    expect(readTeam(userState, firstTeamId)).toMatchObject({
      notes: 'Stage 3: stall 2 turns',
      shipId: 12,
    });
  });

  it('saves the team again with nothing to keep when it was deleted in between', async () => {
    const { page, userState } = await buildTeamOnPage();

    await page.saveTeam();

    const teamId = page.currentTeamId();

    await userState.deleteTeam(teamId!);
    await page.saveTeam();

    expect(readTeam(userState, teamId)).toEqual({
      name: 'Kizuna crew',
      notes: '',
      shipId: null,
      slots: [1001, null, 2001, 2002, 2003, 2004],
    });
  });

  async function buildTeamOnPage() {
    const { page, userState } = createPage([leader, ...subs]);

    await page.ngOnInit();
    page.onTeamNameChange({ detail: { value: 'Kizuna crew' } } as CustomEvent<{ value?: string | null }>);
    await page.setTeamSlotCharacter(0, leader);

    for (const [index, sub] of subs.entries()) {
      await page.setTeamSlotCharacter(index + 2, sub);
    }

    return { page, userState };
  }
});

function readTeam(userState: UserStateService, teamId: string | null) {
  const team = teamId ? userState.getSavedTeamById(teamId) : null;

  return team ? { name: team.name, notes: team.notes, shipId: team.shipId, slots: team.slots } : null;
}

function createPage(characters: Array<CharacterDetailRecord & CharacterListItem>) {
  const byId = new Map(characters.map((character) => [character.id, character]));
  const store = new Map<string, string>();
  const preferences = {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
  };
  const userState = new UserStateService(
    { translate: vi.fn((key: string) => key) } as never,
    preferences as unknown as PreferencesAdapterService,
  );
  const page = new CaptainCoveragePage(
    {
      getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue(null),
      getDatasetManifest: vi.fn().mockResolvedValue({ schemaVersion: 1, characterCount: characters.length }),
      getCharacterById: vi.fn((id: number) => Promise.resolve(byId.get(id) ?? null)),
      searchDetailedCharacters: vi.fn().mockResolvedValue(characters),
      getAvailableCharacterTags: vi.fn().mockResolvedValue([]),
    } as never,
    { catalog: signal<CharacterListItem[]>(characters), ensureLoaded: vi.fn().mockResolvedValue(undefined) } as never,
    userState,
    {
      preloadScope: vi.fn().mockResolvedValue(undefined),
      translate: vi.fn((key: string) => key),
    } as never,
    { snapshot: { queryParamMap: { get: vi.fn(() => null) } } } as never,
    { navigate: vi.fn().mockResolvedValue(true) } as never,
    { create: vi.fn() } as never,
    new CaptainCoverageFilterRunnerService() as never,
  );

  return { page, userState };
}

function createCharacter(
  id: number,
  captainAbility: string | null = null,
): CharacterDetailRecord & CharacterListItem {
  return {
    id,
    name: `Character ${id}`,
    searchText: '',
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter', 'Slasher'],
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    stars: 5,
    cost: 30,
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
