import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type CharacterDetailRecord, type ShipRecord } from '../../core/models/optc.models';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonMenuButton: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSpinner: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

vi.mock('@ionic/angular', () => ({}));

import { ManualTeamBuilderPage } from './manual-team-builder.page';

describe('ManualTeamBuilderPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders as a standalone manual team page with ship and condition components', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/manual-team-builder/manual-team-builder.page.html'),
      'utf8',
    );

    expect(template).toContain('manual-team-builder-shell');
    expect(template).toContain('manual-team-slots');
    expect(template).toContain('<app-ship-picker');
    expect(template).toContain('<app-captain-team-condition-status');
    expect(template).not.toContain('auto-team-builder');
  });

  it('preloads page scopes and ships on init', async () => {
    const { page, repository, i18n } = createPage();

    await page.ngOnInit();

    expect(i18n.preloadScope).toHaveBeenCalledWith('manual-team-builder');
    expect(i18n.preloadScope).toHaveBeenCalledWith('ship-picker');
    expect(repository.getShips).toHaveBeenCalledOnce();
    expect(page.loading()).toBe(false);
    expect(page.ships().map((ship) => ship.id)).toEqual([9001, 9002]);
  });

  it('blocks save when no slots are selected', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    await page.saveTeam();

    expect(userState.saveTeam).not.toHaveBeenCalled();
  });

  it('saves six id or null slots with the selected ship id', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.teamName.set('Manual Crew');
    page.notes.set('Built by hand');
    page.selectedShipId.set(9001);
    page.slots.set([
      createCharacterRecord(201, 'Manual Captain'),
      null,
      createCharacterRecord(203, 'Manual Sub 1'),
      null,
      null,
      createCharacterRecord(206, 'Manual Sub 4'),
    ]);

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: undefined,
      name: 'Manual Crew',
      notes: 'Built by hand',
      shipId: 9001,
      slots: [201, null, 203, null, null, 206],
    });
    expect(page.currentTeamId()).toBe('saved-manual-team');
    expect(page.saveUiLocked()).toBe(false);
    expect(page.saveFeedbackError()).toBe('');
  });

  it('opens and searches the character picker, then assigns and clears a slot', async () => {
    const matchingCharacter = createCharacterRecord(302, 'Manual Search Result');
    const { page, repository } = createPage({
      characters: [createCharacterRecord(301, 'Other Candidate'), matchingCharacter],
    });
    const stopPropagation = vi.fn();

    await page.ngOnInit();
    await page.openCharacterPicker(3);

    expect(page.selectedSlotIndex()).toBe(3);
    expect(page.pickerModalOpen()).toBe(true);
    expect(repository.searchDetailedCharacters).toHaveBeenCalledWith(
      expect.objectContaining({
        searchTerm: '',
        selectedTypes: [],
        selectedClasses: [],
        sortMode: 'powerFirst',
      }),
    );

    await page.onSearchChange({
      detail: { value: 'Manual Search' },
    } as CustomEvent<{ value: string }>);

    expect(page.searchTerm()).toBe('Manual Search');
    expect(page.candidates()).toEqual([matchingCharacter]);

    page.assignCharacter(matchingCharacter);

    expect(page.slots()[3]).toBe(matchingCharacter);
    expect(page.pickerModalOpen()).toBe(false);

    page.clearSlot(3, { stopPropagation } as unknown as Event);

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(page.slots()[3]).toBeNull();
  });

  it('navigates from filled slots and ignores empty slots', async () => {
    const { page, router } = createPage();

    await page.ngOnInit();
    page.slots.set([createCharacterRecord(401), null, null, null, null, null]);

    await page.openSlotDetail(0);
    await page.openSlotDetail(1);

    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/characters', '401']);
  });

  it('filters character candidates by max total cost while excluding Friend Captain cost', async () => {
    const captain = createCharacterRecord(501, 'Captain');
    const friendCaptain = createCharacterRecord(502, 'Friend Captain');
    const fittingSub = createCharacterRecord(503, 'Fitting Sub');
    const expensiveSub = createCharacterRecord(504, 'Expensive Sub');
    const { page } = createPage();

    captain.cost = 70;
    friendCaptain.cost = 999;
    fittingSub.cost = 30;
    expensiveSub.cost = 31;

    await page.ngOnInit();
    page.maxTotalCost.set(100);
    page.slots.set([captain, friendCaptain, null, null, null, null]);
    page.selectedSlotIndex.set(2);
    page.candidates.set([fittingSub, expensiveSub]);

    expect(page.budgetCost()).toBe(70);
    expect(page.remainingCost()).toBe(30);
    expect(page.candidateCards().map((card) => card.character.id)).toEqual([503]);

    page.selectedSlotIndex.set(1);

    expect(page.candidateCards().map((card) => card.character.id)).toEqual([503, 504]);
  });

  it('uses ship picker events to set, clear, and favorite ships', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.openShipPicker();
    page.saveShipSelection(9002);

    expect(page.selectedShipId()).toBe(9002);
    expect(page.selectedShipLabel()).toBe('Ship 9002');
    expect(page.shipPickerOpen()).toBe(false);

    page.openShipPicker();
    page.saveShipSelection(null);

    expect(page.selectedShipId()).toBeNull();
    expect(page.selectedShipLabel()).toBe('No ship selected');

    await page.toggleShipFavorite(9002);

    expect(userState.toggleShipFavorite).toHaveBeenCalledWith(9002);
    expect(page.favoriteShipIds()).toEqual([9001, 9002]);
  });

  it('computes captain condition status for fixed manual slots', async () => {
    const { page } = createPage();
    const slots = [601, 602, 603, 604, 605, 606].map((id) => createCharacterRecord(id));

    slots[0]!.detail.captainAbility = 'Boosts ATK of all characters by 5x.';
    slots[1]!.detail.captainAbility = 'Boosts HP of all characters by 1.3x.';

    await page.ngOnInit();
    page.slots.set(slots);

    expect(page.conditionStatus().state).toBe('full');
    expect(page.conditionStatus().passedLeaderLabels).toEqual(['Captain', 'Friend Captain']);
  });
});

function createPage(
  options: { characters?: CharacterDetailRecord[]; ships?: ShipRecord[] } = {},
): {
  page: ManualTeamBuilderPage;
  repository: {
    getShips: ReturnType<typeof vi.fn>;
    searchDetailedCharacters: ReturnType<typeof vi.fn>;
  };
  router: { navigate: ReturnType<typeof vi.fn> };
  userState: {
    favoriteShipIds: {
      (): number[];
      set(value: number[]): void;
    };
    ready: ReturnType<typeof vi.fn>;
    saveTeam: ReturnType<typeof vi.fn>;
    toggleShipFavorite: ReturnType<typeof vi.fn>;
  };
  i18n: {
    preloadScope: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
  };
} {
  const characters = options.characters ?? [
    createCharacterRecord(101, 'Monkey D. Luffy'),
    createCharacterRecord(102, 'Roronoa Zoro'),
  ];
  const ships = options.ships ?? [createShipRecord(9001), createShipRecord(9002)];
  const favoriteShipIds = signal<number[]>([9001]);
  const userState = {
    favoriteShipIds,
    ready: vi.fn().mockResolvedValue(undefined),
    readyFavoriteShipIds: vi.fn().mockResolvedValue(undefined),
    saveTeam: vi.fn().mockResolvedValue({ id: 'saved-manual-team' }),
    toggleShipFavorite: vi.fn().mockImplementation(async (shipId: number) => {
      favoriteShipIds.set(
        favoriteShipIds().includes(shipId)
          ? favoriteShipIds().filter((favoriteShipId) => favoriteShipId !== shipId)
          : [...favoriteShipIds(), shipId],
      );
    }),
  };
  const repository = {
    getShips: vi.fn().mockResolvedValue(ships),
    searchDetailedCharacters: vi
      .fn()
      .mockImplementation(async (query: { searchTerm: string; limit?: number; offset?: number }) => {
        const searchTerm = query.searchTerm.trim().toLowerCase();
        const filteredCharacters = searchTerm
          ? characters.filter((character) => character.name.toLowerCase().includes(searchTerm))
          : characters;
        const offset = query.offset ?? 0;
        const limit = query.limit ?? filteredCharacters.length;

        return filteredCharacters.slice(offset, offset + limit);
      }),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn(
      (
        key: string,
        params?: Record<string, string | number | boolean | null | undefined>,
        _scope?: string,
      ) => {
        if (key === 'common.defaults.newCrew') {
          return 'New Crew';
        }

        if (key === 'actions.assign') {
          return 'Assign';
        }

        if (key === 'actions.assigned') {
          return 'Assigned';
        }

        if (key === 'ship.none') {
          return 'No ship selected';
        }

        if (key === 'condition.roles.captain') {
          return 'Captain';
        }

        if (key === 'condition.roles.friendCaptain') {
          return 'Friend Captain';
        }

        if (key === 'condition.slotLabel') {
          return `Slot ${params?.['slot'] ?? ''}`;
        }

        if (key === 'costBudget.support.default') {
          return 'No max team cost.';
        }

        if (key === 'costBudget.support.active') {
          return `${params?.['used'] ?? 0} / ${params?.['max'] ?? 0} cost used. ${
            params?.['remaining'] ?? 0
          } remaining.`;
        }

        if (key === 'costBudget.range.overBudget') {
          return `${params?.['used'] ?? 0} / ${params?.['max'] ?? 0} cost used.`;
        }

        if (key === 'save.error') {
          return 'Manual team could not be saved.';
        }

        return key;
      },
    ),
  };
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  return {
    page: new ManualTeamBuilderPage(
      userState as never,
      repository as never,
      i18n as never,
      router as never,
    ),
    repository,
    router,
    userState,
    i18n,
  };
}

function createCharacterRecord(
  id: number,
  name = `Character ${id}`,
): CharacterDetailRecord {
  return {
    id,
    name,
    searchText: '',
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
      captainAbility: null,
      captainAbilityVariants: [],
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
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  };
}

function createShipRecord(id: number): ShipRecord {
  return {
    id,
    name: `Ship ${id}`,
    thumb: null,
    thumbUrl: null,
    description: 'Boosts ATK by 1.5x.',
  };
}
