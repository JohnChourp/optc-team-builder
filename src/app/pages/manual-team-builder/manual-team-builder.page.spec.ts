import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AutoBuildAbilityCatalog } from '../../core/models/auto-team-builder-ability.models';
import { type AbilityRequirementDraft } from '../../core/services/ability-requirement-draft.utils';
import {
  type CharacterDetailRecord,
  type DatasetManifest,
  type ShipRecord,
} from '../../core/models/optc.models';
import { buildSavedTeamShareCode } from '../saved-teams/saved-teams-transfer.utils';

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
  IonSelect: class {},
  IonSelectOption: class {},
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
    expect(template).toContain('manual-team-workbench');
    expect(template).toContain('manual-team-slots');
    expect(template).toContain('manual-team-summary-card');
    expect(template).toContain('manual-team-picker__filters');
    expect(template).toContain('manual-team-picker-slot-rail');
    expect(template).toContain("'manual-team-slot-edit-' + index");
    expect(template).toContain("'manual-team-candidate-' + candidateCard.character.id");
    expect(template).toContain('manual-team-clear-zone');
    expect(template).toContain('<app-ability-filter-rail');
    expect(template).toContain('<app-ability-requirement-picker');
    expect(template).toContain('<app-special-ability-picker');
    expect(template).toContain('<app-ship-picker');
    expect(template).toContain('<app-captain-team-condition-status');
    expect(template).toContain('<app-character-ability-groups');
    expect(template).not.toContain('auto-team-builder');
  });

  it('preloads page scopes and ships on init', async () => {
    const { page, repository, i18n } = createPage();

    await page.ngOnInit();

    expect(i18n.preloadScope).toHaveBeenCalledWith('manual-team-builder');
    expect(i18n.preloadScope).toHaveBeenCalledWith('ship-picker');
    expect(repository.getShips).toHaveBeenCalledOnce();
    expect(repository.getDatasetManifest).toHaveBeenCalledOnce();
    expect(repository.getAutoBuilderAbilityCatalog).toHaveBeenCalledOnce();
    expect(repository.getAvailableCharacterTags).toHaveBeenCalledOnce();
    expect(page.loading()).toBe(false);
    expect(page.ships().map((ship) => ship.id)).toEqual([9001, 9002]);
    expect(page.availableTypes()).toEqual(['DEX', 'STR', 'QCK', 'PSY', 'INT']);
    expect(page.availableCharacterTags()).toEqual(['orb boost', 'utility']);
  });

  it('loads a saved team from the route with all six slots, ship, name, and notes', async () => {
    const team = createSavedTeam({
      id: 'team-1',
      name: 'Loaded Manual Crew',
      notes: 'From saved teams',
      shipId: 9002,
      slots: [701, 702, null, 704, 705, 706],
    });
    const { page, router, userState } = createPage({
      routeTeamId: 'team-1',
      savedTeams: [team],
      characters: [701, 702, 704, 705, 706].map((id) => createCharacterRecord(id)),
    });

    await page.ngOnInit();
    await page.ionViewWillEnter();

    expect(userState.readySavedTeams).toHaveBeenCalledOnce();
    expect(page.slots().map((slot) => slot?.id ?? null)).toEqual([701, 702, null, 704, 705, 706]);
    expect(page.selectedShipId()).toBe(9002);
    expect(page.teamName()).toBe('Loaded Manual Crew');
    expect(page.notes()).toBe('From saved teams');
    expect(page.currentTeamId()).toBe('team-1');
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('clears missing saved team characters and unavailable ships during route load', async () => {
    const team = createSavedTeam({
      id: 'team-with-missing-data',
      shipId: 9999,
      slots: [801, 9999, null, 804, null, null],
    });
    const { page } = createPage({
      routeTeamId: 'team-with-missing-data',
      savedTeams: [team],
      characters: [801, 804].map((id) => createCharacterRecord(id)),
    });

    await page.ngOnInit();
    await page.ionViewWillEnter();

    expect(page.slots().map((slot) => slot?.id ?? null)).toEqual([
      801,
      null,
      null,
      804,
      null,
      null,
    ]);
    expect(page.selectedShipId()).toBeNull();
  });

  it('clears an unknown saved team route id without changing the manual draft', async () => {
    const { page, router } = createPage({ routeTeamId: 'missing-team' });

    await page.ngOnInit();
    page.teamName.set('Existing Draft');
    page.slots.set([createCharacterRecord(901), null, null, null, null, null]);

    await page.ionViewWillEnter();

    expect(page.teamName()).toBe('Existing Draft');
    expect(page.slots().map((slot) => slot?.id ?? null)).toEqual([
      901,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('loads a shared team from the route as an unsaved manual draft', async () => {
    const sharedTeam = createSavedTeam({
      id: 'team-from-link',
      name: 'Shared Manual Crew',
      notes: 'Shared notes',
      shipId: 9002,
      slots: [701, 702, null, 704, 705, 706],
    });
    const { page, router, userState } = createPage({
      routeTeamShare: buildSavedTeamShareCode(sharedTeam, '2026-05-10T11:00:00.000Z'),
      characters: [701, 702, 704, 705, 706].map((id) => createCharacterRecord(id)),
    });

    await page.ngOnInit();
    await page.ionViewWillEnter();

    expect(userState.readySavedTeams).not.toHaveBeenCalled();
    expect(page.slots().map((slot) => slot?.id ?? null)).toEqual([701, 702, null, 704, 705, 706]);
    expect(page.selectedShipId()).toBe(9002);
    expect(page.teamName()).toBe('Shared Manual Crew');
    expect(page.notes()).toBe('Shared notes');
    expect(page.currentTeamId()).toBeNull();
    expect(page.sharedTeamFeedbackError()).toBe('');
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamShare: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: undefined,
      name: 'Shared Manual Crew',
      notes: 'Shared notes',
      shipId: 9002,
      slots: [701, 702, null, 704, 705, 706],
    });
  });

  it('clears an invalid shared team route code and shows an error without changing the draft', async () => {
    const { page, router } = createPage({ routeTeamShare: 'invalid share code' });

    await page.ngOnInit();
    page.teamName.set('Existing Draft');
    page.slots.set([createCharacterRecord(901), null, null, null, null, null]);

    await page.ionViewWillEnter();

    expect(page.teamName()).toBe('Existing Draft');
    expect(page.slots().map((slot) => slot?.id ?? null)).toEqual([
      901,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(page.sharedTeamFeedbackError()).toBe(
      'The shared team link or code could not be loaded.',
    );
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamShare: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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
    expect(page.candidateCards().map((card) => card.character.id)).toEqual([503, 504]);
    expect(page.candidateCards().map((card) => card.isAssignableToActiveSlot)).toEqual([
      true,
      false,
    ]);

    page.selectedSlotIndex.set(1);

    expect(page.candidateCards().map((card) => card.character.id)).toEqual([503, 504]);
    expect(page.candidateCards().every((card) => card.isAssignableToActiveSlot)).toBe(true);
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

  it('computes live summary totals and cost validation messages', async () => {
    const { page } = createPage();
    const captain = createCharacterRecord(701, 'Budget Captain');
    const friendCaptain = createCharacterRecord(702, 'Budget Friend Captain');
    const sub = createCharacterRecord(703, 'Budget Sub');

    captain.cost = 60;
    friendCaptain.cost = 999;
    sub.cost = 45;
    captain.stats.max = { hp: 100, atk: 40, rcv: 10 };
    friendCaptain.stats.max = { hp: 200, atk: 50, rcv: 20 };
    sub.stats.max = { hp: 300, atk: 60, rcv: 30 };

    await page.ngOnInit();
    page.maxTotalCost.set(100);
    page.slots.set([captain, friendCaptain, sub, null, null, null]);

    expect(page.filledSlotCount()).toBe(3);
    expect(page.budgetCost()).toBe(105);
    expect(page.totalHp()).toBe(600);
    expect(page.totalAtk()).toBe(150);
    expect(page.totalRcv()).toBe(60);
    expect(page.teamSummaryMetrics().find((metric) => metric.key === 'filled')?.value).toBe(
      '3 / 6',
    );
    expect(page.teamSummaryMetrics().find((metric) => metric.key === 'cost')?.value).toBe(
      '105 / 100',
    );
    expect(page.validationMessages().some((message) => message.key === 'cost')).toBe(true);
  });

  it('applies type, class, and cost picker filters through repository search', async () => {
    const { page, repository } = createPage();

    await page.ngOnInit();
    await page.openCharacterPicker(0);
    await page.onTypeFilterChange(createValueEvent('STR'));
    await page.onClassFilterChange(createValueEvent('Shooter'));
    await page.onCandidateMinCostChange(createValueEvent('20'));
    await page.onCandidateMaxCostChange(createValueEvent('60'));

    const calls = repository.searchDetailedCharacters.mock.calls;
    const lastQuery = calls[calls.length - 1]?.[0];

    expect(lastQuery).toEqual(
      expect.objectContaining({
        selectedTypes: ['STR'],
        selectedTypesMatchMode: 'any',
        selectedClasses: ['Shooter'],
        selectedClassesMatchMode: 'any',
        costRange: { min: 20, max: 60 },
        sortMode: 'powerFirst',
        limit: 48,
      }),
    );
  });

  it('applies ability picker filters as allowed character ids through repository search', async () => {
    const removeBindSpecialist = createCharacterRecord(801, 'Remove Bind Specialist');
    const orbBooster = createCharacterRecord(802, 'Orb Booster');
    const unrelated = createCharacterRecord(803, 'Unrelated Candidate');
    const { page, repository } = createPage({
      characters: [removeBindSpecialist, orbBooster, unrelated],
    });

    await page.ngOnInit();
    await page.openCharacterPicker(0);
    await page.saveSpecialAbilityPicker([createAbilityDraft('remove_bind')]);

    const calls = repository.searchDetailedCharacters.mock.calls;
    const lastQuery = calls[calls.length - 1]?.[0];

    expect([...(lastQuery?.allowedCharacterIds ?? [])].sort()).toEqual([801, 802]);
    expect(page.candidates().map((character) => character.id)).toEqual([801, 802]);
    expect(page.hasActiveCandidateFilters()).toBe(true);
    expect(page.abilityFilterRailItems().find((item) => item.category === 'special')?.count).toBe(
      1,
    );
  });

  it('intersects ability filters with local character tag filtering', async () => {
    const taggedMatch = createCharacterRecord(901, 'Tagged Match');
    const taggedMismatch = createCharacterRecord(902, 'Tagged Mismatch');
    const untaggedMatch = createCharacterRecord(903, 'Untagged Match');

    taggedMatch.detail.characterTags = ['utility'];
    taggedMismatch.detail.characterTags = ['utility'];
    untaggedMatch.detail.characterTags = ['damage'];

    const { page, repository } = createPage({
      characters: [taggedMatch, taggedMismatch, untaggedMatch],
    });

    await page.ngOnInit();
    await page.openCharacterPicker(0);
    await page.saveCaptainAbilityPicker([createAbilityDraft('captain_boost')]);
    await page.onCharacterTagFilterChange(createValueEvent('utility'));

    expect(repository.getDetailedCharacterCatalog).toHaveBeenCalled();
    expect(page.candidates().map((character) => character.id)).toEqual([901]);
  });

  it('clears ability filters with the candidate filter reset action', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    await page.openCharacterPicker(0);
    await page.saveSupportAbilityPicker([createAbilityDraft('support_slot_change')]);

    expect(page.supportAbilityDrafts()).toHaveLength(1);
    expect(page.hasActiveCandidateFilters()).toBe(true);

    await page.clearCandidateFilters();

    expect(page.supportAbilityDrafts()).toEqual([]);
    expect(page.hasActiveCandidateFilters()).toBe(false);
  });

  it('uses the detailed catalog for local character tag filtering', async () => {
    const tagged = createCharacterRecord(801, 'Tagged Utility');
    const untagged = createCharacterRecord(802, 'Untagged Utility');

    tagged.type = 'STR';
    tagged.classes = ['Shooter'];
    tagged.detail.characterTags = ['orb boost', 'utility'];
    untagged.type = 'STR';
    untagged.classes = ['Shooter'];
    untagged.detail.characterTags = ['defense'];

    const { page, repository } = createPage({ characters: [tagged, untagged] });

    await page.ngOnInit();
    await page.openCharacterPicker(0);
    await page.onTypeFilterChange(createValueEvent('STR'));
    await page.onClassFilterChange(createValueEvent('Shooter'));
    await page.onCharacterTagFilterChange(createValueEvent('orb boost'));

    expect(repository.getDetailedCharacterCatalog).toHaveBeenCalled();
    expect(page.candidates().map((character) => character.id)).toEqual([801]);
  });

  it('supports drag/drop assign, swap, clear, and invalid cost feedback', async () => {
    const { page } = createPage();
    const candidate = createCharacterRecord(901, 'Dragged Candidate');
    const swapTarget = createCharacterRecord(902, 'Swap Target');
    const expensiveCaptain = createCharacterRecord(903, 'Expensive Captain');

    candidate.cost = 10;
    swapTarget.cost = 20;
    expensiveCaptain.cost = 45;

    await page.ngOnInit();
    page.maxTotalCost.set(100);
    page.candidates.set([candidate]);

    page.onCandidateDragStart(createDragEvent(), candidate);
    page.onSlotDrop(createDragEvent(), 2);

    expect(page.slots()[2]?.id).toBe(901);

    page.slots.set([null, null, candidate, swapTarget, null, null]);
    page.onSlotDragStart(createDragEvent(), 2);
    page.onSlotDrop(createDragEvent(), 3);

    expect(page.slots()[2]?.id).toBe(902);
    expect(page.slots()[3]?.id).toBe(901);

    page.onSlotDragStart(createDragEvent(), 3);
    page.onClearDropZoneDrop(createDragEvent());

    expect(page.slots()[3]).toBeNull();

    page.maxTotalCost.set(50);
    page.slots.set([expensiveCaptain, null, null, null, null, null]);
    page.candidates.set([candidate]);
    page.onCandidateDragStart(createDragEvent(), candidate);
    page.onSlotDrop(createDragEvent(), 2);

    expect(page.slots()[2]).toBeNull();
    expect(page.dragFeedbackMessage()).toBe('Cannot drop with max cost 50.');
  });

  it('resolves captain branch selector options and scope chips', async () => {
    const { page } = createPage();
    const captain = createDualCaptainRecord();

    await page.ngOnInit();
    page.slots.set([captain, null, null, null, null, null]);
    page.captainBranchModes.set({ 0: 'both', 1: null });

    expect(page.captainBranchOptions(0).map((option) => option.mode)).toEqual([
      'character1',
      'character2',
      'both',
    ]);
    expect(page.captainScopeChips(0).map((chip) => chip.label)).toEqual([
      'Captain Ability (Character 1) Tier 1: Crew-wide',
      'Captain Ability (Character 2) Tier 1: Subset',
    ]);

    page.onCaptainBranchModeChange(0, createValueEvent('character2'));

    expect(page.captainBranchModes()[0]).toBe('character2');
    expect(page.captainScopeChips(0).map((chip) => chip.label)).toEqual([
      'Captain Ability (Character 2) Tier 1: Subset',
    ]);
  });
});

function createPage(
  options: {
    characters?: CharacterDetailRecord[];
    routeTeamShare?: string | null;
    routeTeamId?: string | null;
    savedTeams?: Array<ReturnType<typeof createSavedTeam>>;
    ships?: ShipRecord[];
  } = {},
): {
  page: ManualTeamBuilderPage;
  repository: {
    getAutoBuilderAbilityCatalog: ReturnType<typeof vi.fn>;
    getAvailableCharacterTags: ReturnType<typeof vi.fn>;
    getDatasetManifest: ReturnType<typeof vi.fn>;
    getDetailedCharacterCatalog: ReturnType<typeof vi.fn>;
    getShips: ReturnType<typeof vi.fn>;
    getDetailedCharactersByIds: ReturnType<typeof vi.fn>;
    searchDetailedCharacters: ReturnType<typeof vi.fn>;
  };
  route: { snapshot: { queryParamMap: { get: ReturnType<typeof vi.fn> } } };
  router: { navigate: ReturnType<typeof vi.fn> };
  userState: {
    favoriteShipIds: {
      (): number[];
      set(value: number[]): void;
    };
    ready: ReturnType<typeof vi.fn>;
    getSavedTeamById: ReturnType<typeof vi.fn>;
    readySavedTeams: ReturnType<typeof vi.fn>;
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
  const savedTeams = signal(options.savedTeams ?? []);
  const favoriteShipIds = signal<number[]>([9001]);
  const userState = {
    favoriteShipIds,
    ready: vi.fn().mockResolvedValue(undefined),
    readyFavoriteShipIds: vi.fn().mockResolvedValue(undefined),
    readySavedTeams: vi.fn().mockResolvedValue(undefined),
    getSavedTeamById: vi.fn(
      (teamId: string) => savedTeams().find((team) => team.id === teamId) ?? null,
    ),
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
    getDatasetManifest: vi.fn().mockResolvedValue(createManifest()),
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue(createAbilityCatalog()),
    getAvailableCharacterTags: vi.fn().mockResolvedValue(['orb boost', 'utility']),
    getDetailedCharacterCatalog: vi.fn().mockResolvedValue(characters),
    getDetailedCharactersByIds: vi
      .fn()
      .mockImplementation(async (ids: number[]) =>
        ids.map((id) => characters.find((character) => character.id === id)).filter(Boolean),
      ),
    searchDetailedCharacters: vi
      .fn()
      .mockImplementation(
        async (query: {
          allowedCharacterIds?: number[];
          searchTerm: string;
          limit?: number;
          offset?: number;
        }) => {
          const searchTerm = query.searchTerm.trim().toLowerCase();
          const allowedCharacterIdSet =
            query.allowedCharacterIds === undefined ? null : new Set(query.allowedCharacterIds);
          const filteredCharacters = characters.filter((character) => {
            if (allowedCharacterIdSet && !allowedCharacterIdSet.has(character.id)) {
              return false;
            }

            return searchTerm ? character.name.toLowerCase().includes(searchTerm) : true;
          });
          const offset = query.offset ?? 0;
          const limit = query.limit ?? filteredCharacters.length;

          return filteredCharacters.slice(offset, offset + limit);
        },
      ),
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

        if (key === 'common.defaults.untitledCrew') {
          return 'Untitled Crew';
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

        if (key === 'summary.metrics.filled.value') {
          return `${params?.['filled'] ?? 0} / ${params?.['total'] ?? 0}`;
        }

        if (key === 'summary.metrics.cost.valueWithMax') {
          return `${params?.['used'] ?? 0} / ${params?.['max'] ?? 0}`;
        }

        if (key === 'summary.metrics.cost.supportWithMax') {
          return `${params?.['remaining'] ?? 0} cost remaining.`;
        }

        if (key === 'summary.metrics.cost.supportNoMax') {
          return 'Friend Captain cost is excluded.';
        }

        if (key === 'picker.costBlocked') {
          return `Max cost ${params?.['max'] ?? 0} exceeded.`;
        }

        if (key === 'picker.filters.costError') {
          return `Min ${params?.['min'] ?? 0} cannot exceed max ${params?.['max'] ?? 0}.`;
        }

        if (key === 'drag.invalidCost') {
          return `Cannot drop with max cost ${params?.['max'] ?? 0}.`;
        }

        if (key === 'captainHelper.branches.both') {
          return 'Both branches';
        }

        if (key === 'captainHelper.branches.side') {
          return `${params?.['name'] ?? ''} branch`;
        }

        if (key === 'captainHelper.scopeChip') {
          return `${params?.['label'] ?? ''}: ${params?.['scope'] ?? ''}`;
        }

        if (key === 'captainHelper.tierScopeChip') {
          return `${params?.['label'] ?? ''} Tier ${params?.['tier'] ?? ''}: ${
            params?.['scope'] ?? ''
          }`;
        }

        if (key === 'captainHelper.scopes.crew-wide') {
          return 'Crew-wide';
        }

        if (key === 'captainHelper.scopes.subset') {
          return 'Subset';
        }

        if (key === 'captainHelper.scopes.captain-only') {
          return 'Captain only';
        }

        if (key === 'captainHelper.scopes.none') {
          return 'No coverage';
        }

        if (key === 'captainHelper.rawScope') {
          return 'Captain ability text available';
        }

        if (key === 'save.error') {
          return 'Manual team could not be saved.';
        }

        if (key === 'shareImport.error') {
          return 'The shared team link or code could not be loaded.';
        }

        return key;
      },
    ),
  };
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };
  const route = {
    snapshot: {
      queryParamMap: {
        get: vi.fn((key: string) => {
          if (key === 'teamId') {
            return options.routeTeamId ?? null;
          }

          if (key === 'teamShare') {
            return options.routeTeamShare ?? null;
          }

          return null;
        }),
      },
    },
  };

  return {
    page: new ManualTeamBuilderPage(
      userState as never,
      repository as never,
      i18n as never,
      route as never,
      router as never,
    ),
    repository,
    route,
    router,
    userState,
    i18n,
  };
}

function createSavedTeam(
  overrides: Partial<{
    id: string;
    name: string;
    notes: string;
    shipId: number | null;
    slots: Array<number | null>;
  }> = {},
) {
  return {
    id: overrides.id ?? 'team-1',
    name: overrides.name ?? 'Saved Team',
    notes: overrides.notes ?? '',
    shipId: overrides.shipId ?? null,
    slots: overrides.slots ?? [101, null, null, null, null, null],
    createdAt: '2026-05-10T10:00:00.000Z',
    updatedAt: '2026-05-10T10:00:00.000Z',
  };
}

function createManifest(overrides: Partial<DatasetManifest> = {}): DatasetManifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceVersion: 'test',
    characterCount: 2,
    detailCount: 2,
    shipCount: 2,
    rumbleCount: 0,
    availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    availableClasses: ['Fighter', 'Slasher'],
    packs: [],
    ...overrides,
  };
}

function createAbilityCatalog(
  overrides: Partial<AutoBuildAbilityCatalog> = {},
): AutoBuildAbilityCatalog {
  return {
    generatedAt: '2026-05-16T00:00:00.000Z',
    sourceVersion: 'test',
    abilityCount: 1,
    abilities: [
      {
        key: 'captain_boost',
        label: 'Captain Boost',
        category: 'legacy',
        groupLabel: 'Captain effects',
        groupOrder: 0,
        effectOrder: 0,
        supportsTurns: false,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['captainAbility'],
        matchCount: 2,
        matchingCharacterIds: [901, 903],
        captainAbilityMatchingCharacterIds: [901, 903],
        sampleCharacterIds: [901],
        sampleTexts: ['Boosts crew ATK.'],
      },
      {
        key: 'remove_bind',
        label: 'Remove Bind',
        category: 'special',
        groupLabel: 'Debuff removal',
        groupOrder: 1,
        effectOrder: 1,
        supportsTurns: true,
        supportsSlotTokens: true,
        availableSlotTokens: ['crew'],
        availableSources: ['specialText'],
        matchCount: 2,
        matchingCharacterIds: [801, 802],
        sampleCharacterIds: [801],
        sampleTexts: ['Removes Bind by 5 turns.'],
      },
      {
        key: 'sailor_boost',
        label: 'Sailor Boost',
        category: 'crewmate',
        groupLabel: 'Crewmate utility',
        groupOrder: 2,
        effectOrder: 1,
        supportsTurns: false,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['sailorAbilities'],
        matchCount: 1,
        matchingCharacterIds: [101],
        sampleCharacterIds: [101],
        sampleTexts: ['Boosts base stats as sailor.'],
      },
      {
        key: 'potential_reduce_damage',
        label: 'Reduce Damage',
        category: 'potential',
        groupLabel: 'Potential utility',
        groupOrder: 3,
        effectOrder: 1,
        supportsTurns: false,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['potentialAbilities'],
        matchCount: 1,
        matchingCharacterIds: [102],
        sampleCharacterIds: [102],
        sampleTexts: ['Potential damage reduction.'],
      },
      {
        key: 'support_slot_change',
        label: 'Support Slot Change',
        category: 'support',
        groupLabel: 'Support utility',
        groupOrder: 4,
        effectOrder: 1,
        supportsTurns: false,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['supportData'],
        matchCount: 1,
        matchingCharacterIds: [101],
        sampleCharacterIds: [101],
        sampleTexts: ['Changes slots from support.'],
      },
    ],
    ...overrides,
  };
}

function createAbilityDraft(abilityKey: string): AbilityRequirementDraft {
  return {
    draftId: `${abilityKey}-draft`,
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
    slotScope: 'any',
  };
}

function createCharacterRecord(id: number, name = `Character ${id}`): CharacterDetailRecord {
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

function createDualCaptainRecord(): CharacterDetailRecord {
  const captain = createCharacterRecord(1001, 'Dual Captain');
  const firstText = 'Boosts ATK of [STR] characters by 5x.';
  const secondText = 'Boosts ATK of [DEX] characters by 5x.';

  captain.type = 'STR,DEX';
  captain.detail.captainAbility = firstText;
  captain.detail.captainAbilityVariants = [
    {
      key: 'character1',
      label: 'Captain Ability (Character 1)',
      text: firstText,
    },
    {
      key: 'character2',
      label: 'Captain Ability (Character 2)',
      text: secondText,
    },
  ];
  captain.detail.captainAbilityCoverage = {
    entries: [
      {
        key: 'character1',
        label: 'Captain Ability (Character 1)',
        tiers: [
          {
            tier: 1,
            kind: 'baseline',
            scope: 'crew-wide',
            characterConditions: {
              universal: true,
              fallbackOther: false,
              selfOnly: false,
              types: [],
              classes: [],
              characterTags: [],
            },
            teamConditions: [],
            fieldConditions: [],
            triggerConditions: [],
            clauses: ['Boosts ATK of [STR] characters by 5x'],
          },
        ],
      },
      {
        key: 'character2',
        label: 'Captain Ability (Character 2)',
        tiers: [
          {
            tier: 1,
            kind: 'baseline',
            scope: 'subset',
            characterConditions: {
              universal: false,
              fallbackOther: false,
              selfOnly: false,
              types: ['DEX'],
              classes: [],
              characterTags: [],
            },
            teamConditions: [],
            fieldConditions: [],
            triggerConditions: [],
            clauses: ['Boosts ATK of [DEX] characters by 5x'],
          },
        ],
      },
    ],
  };

  return captain;
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

function createValueEvent(value: string | null): CustomEvent<{ value: string | null }> {
  return {
    detail: { value },
  } as CustomEvent<{ value: string | null }>;
}

function createDragEvent(): DragEvent {
  return {
    preventDefault: vi.fn(),
    currentTarget: {},
    dataTransfer: {
      dropEffect: 'none',
      effectAllowed: 'all',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    },
  } as unknown as DragEvent;
}
