import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./saved-teams-transfer.utils', async () => {
  const actual = await vi.importActual<typeof import('./saved-teams-transfer.utils')>(
    './saved-teams-transfer.utils',
  );

  return {
    ...actual,
    downloadSavedTeamsExport: vi.fn(),
  };
});

import { downloadSavedTeamsExport } from './saved-teams-transfer.utils';
import { SavedTeamsPage } from './saved-teams.page';

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
  IonSpinner: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('SavedTeamsPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('hydrates saved team previews and preserves empty slots', async () => {
    const { page, repository } = createPage();

    await page.ngOnInit();

    expect(page.loading()).toBe(false);
    expect(repository.getDetailedCharactersByIds).toHaveBeenCalledWith([101, 202, 303, 404, 505]);
    expect(repository.getShips).toHaveBeenCalledOnce();
    expect(page.savedTeamCards()).toHaveLength(2);
    expect(page.savedTeamCards()[0]?.slots.map((slot) => slot?.id ?? null)).toEqual([
      101,
      null,
      202,
      null,
      null,
      303,
    ]);
    expect(page.savedTeamCards()[0]).toMatchObject({
      ship: null,
      shipDisplayName: 'No ship',
      shipThumbUrl: null,
      hasShipThumbnail: false,
    });
    expect(page.savedTeamCards()[1]?.slots.map((slot) => slot?.id ?? null)).toEqual([
      404,
      505,
      null,
      null,
      null,
      null,
    ]);
    expect(page.savedTeamCards()[1]).toMatchObject({
      ship: {
        id: 9001,
        name: 'Going Merry',
      },
      shipDisplayName: 'Going Merry',
      shipThumbUrl: 'assets/offline-packs/ship-thumbnails/ship_0001_t2.png',
      hasShipThumbnail: true,
    });
  });

  it('hydrates captain condition status for saved team cards', async () => {
    const { page } = createPage({
      savedTeams: [
        {
          id: 'full-team',
          name: 'Full Team',
          notes: '',
          shipId: null,
          slots: [101, 102, 103, 104, 105, 106],
          createdAt: '2026-03-29T10:00:00.000Z',
          updatedAt: '2026-03-29T10:00:00.000Z',
        },
      ],
    });

    await page.ngOnInit();

    expect(page.savedTeamCards()[0]?.conditionStatus.state).toBe('full');
    expect(page.savedTeamCards()[0]?.conditionStatus.passedLeaderLabels).toEqual([
      'Captain',
      'Friend Captain',
    ]);
  });

  it('selects all teams and enables bulk actions', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.onSelectAllChange({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.selectedTeamIds()).toEqual(['team-1', 'team-2']);
    expect(page.hasSelection()).toBe(true);
    expect(page.allSelected()).toBe(true);
  });

  it('removes a single team after confirm and prunes the selection', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.selectedTeamIds.set(['team-1', 'team-2']);

    await page.confirmAndDeleteTeam('team-1');

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteTeam).toHaveBeenCalledWith('team-1');
    expect(page.selectedTeamIds()).toEqual(['team-2']);
  });

  it('deletes the selected teams in bulk after confirm', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.onSelectAllChange({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    await page.confirmAndDeleteSelectedTeams();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteTeams).toHaveBeenCalledWith(['team-1', 'team-2']);
    expect(page.selectedTeamIds()).toEqual([]);
  });

  it('opens the edit modal with the selected team metadata prefilled', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedTeams()[0]!);

    expect(page.editModalOpen()).toBe(true);
    expect(page.editingTeam()?.id).toBe('team-1');
    expect(page.editTeamName()).toBe('Slashers');
    expect(page.editNotes()).toBe('Burst team');
  });

  it('saves edited team metadata without changing slots or ship', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedTeams()[0]!);
    page.onEditTeamNameChange({ detail: { value: 'Edited Slashers' } } as CustomEvent<{
      value?: string | null;
    }>);
    page.onEditNotesChange({ detail: { value: 'Updated notes' } } as CustomEvent<{
      value?: string | null;
    }>);

    await page.saveEditedTeam();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: 'team-1',
      name: 'Edited Slashers',
      notes: 'Updated notes',
      shipId: null,
      slots: [101, null, 202, null, null, 303],
    });
    expect(page.editModalOpen()).toBe(false);
    expect(page.savedTeams()[0]).toMatchObject({
      id: 'team-1',
      name: 'Edited Slashers',
      notes: 'Updated notes',
      shipId: null,
      slots: [101, null, 202, null, null, 303],
    });
  });

  it('returns detail links only for valid character slots', () => {
    const { page } = createPage({ savedTeams: [] });

    expect(page.getCharacterDetailLink({ id: 707 } as never)).toEqual(['/characters', '707']);
    expect(page.getCharacterDetailLink(null)).toBeNull();
  });

  it('builds the correct auto team builder query params for a saved team', () => {
    const { page } = createPage();

    expect(page.getTeamBuilderQueryParams(page.savedTeams()[0]!)).toEqual({
      teamId: 'team-1',
    });
  });

  it('renders saved team tools and slot previews in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/saved-teams/saved-teams.page.html'),
      'utf8',
    );

    expect(template).toContain("t('title')");
    expect(template).toContain("t('actions.openBuilder')");
    expect(template).toContain("t('actions.exportSingle')");
    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template).toContain("t('tools.export')");
    expect(template).toContain("t('selection.selectAll')");
    expect(template).toContain("t('edit.actions.edit')");
    expect(template).toContain('edit.teamNameLabel');
    expect(template).toContain('edit.notesLabel');
    expect(template).toContain('ion-checkbox');
    expect(template).toContain('ion-input');
    expect(template).toContain('ion-textarea');
    expect(template).toContain('edit-modal-shell');
    expect(template).toContain('saved-team-preview');
    expect(template).toContain('<app-captain-team-condition-status');
    expect(template).toContain('teamCard.conditionStatus');
    expect(template).toContain('captain-condition-panel--full');
    expect(template).toContain('captain-condition-panel--partial');
    expect(template).toContain('saved-team-ship');
    expect(template).toContain("t('ship.label')");
    expect(template).toContain("t('ship.thumbnailAlt'");
    expect(template).toContain('[icon]="shipIcon"');
    expect(template).toContain('[routerLink]="[\'/tabs/auto-team-builder\']"');
    expect(template).toContain('[queryParams]="getTeamBuilderQueryParams(teamCard.team)"');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(currentSlot)"');
    expect(template).not.toContain('openImportModal()');
    expect(template).not.toContain("t('hero.savedEnemiesCta')");
    expect(template).not.toContain('[routerLink]="[\'/tabs/saved-enemies\']"');
    expect(template).toContain('import-dropzone');
  });

  it('exports a single saved team with the shared saved-teams payload', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.exportTeam(page.savedTeams()[0]!);

    expect(vi.mocked(downloadSavedTeamsExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: 'saved-teams',
        teams: [expect.objectContaining({ id: 'team-1' })],
      }),
    );
  });

  it('resets page-local selection and edit modal state without touching saved teams', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.selectedTeamIds.set(['team-1']);
    page.editModalOpen.set(true);
    page.importModalOpen.set(true);
    page.editTeamName.set('Edited team');
    page.editNotes.set('Edited notes');
    page.importFileName.set('teams.json');
    page.importFeedback.set({
      title: 'Loaded',
      details: ['Done'],
      tone: 'success',
    });

    page.resetPage();

    expect(page.selectedTeamIds()).toEqual([]);
    expect(page.editModalOpen()).toBe(false);
    expect(page.importModalOpen()).toBe(false);
    expect(page.editingTeam()).toBeNull();
    expect(page.editTeamName()).toBe('');
    expect(page.editNotes()).toBe('');
    expect(page.importFileName()).toBe('');
    expect(page.importFeedback()).toBeNull();
    expect(page.savedTeams()).toHaveLength(2);
  });

  it('imports teams from a valid saved-teams payload and reports success', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();

    await page['importSavedTeams'](
      new File(
        [
          JSON.stringify({
            schemaVersion: 1,
            source: 'saved-teams',
            exportedAt: '2026-03-29T12:00:00.000Z',
            teams: [
              {
                id: 'team-3',
                name: 'Imported Team',
                notes: 'Imported notes',
                shipId: 9001,
                slots: [101, null, null, null, null, null],
                createdAt: '2026-03-29T12:00:00.000Z',
                updatedAt: '2026-03-29T12:00:00.000Z',
              },
            ],
          }),
        ],
        'teams.json',
        { type: 'application/json' },
      ),
    );

    expect(userState.mergeImportedTeams).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'team-3',
        shipId: 9001,
        slots: [101, null, null, null, null, null],
      }),
    ]);
    expect(page.importing()).toBe(false);
    expect(page.importFileName()).toBe('teams.json');
    expect(page.importFeedback()).toEqual(
      expect.objectContaining({
        tone: 'success',
      }),
    );
    expect(page.savedTeams().some((team) => team.id === 'team-3')).toBe(true);
  });
});

function createPage(overrides: { savedTeams?: ReturnType<typeof buildSavedTeams> } = {}) {
  const savedTeams = signal(overrides.savedTeams ?? buildSavedTeams());
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    savedTeams,
    deleteTeam: vi.fn().mockImplementation(async (teamId: string) => {
      savedTeams.set(savedTeams().filter((team) => team.id !== teamId));
    }),
    deleteTeams: vi.fn().mockImplementation(async (teamIds: string[]) => {
      const targetIds = new Set(teamIds);
      savedTeams.set(savedTeams().filter((team) => !targetIds.has(team.id)));
    }),
    mergeImportedTeams: vi
      .fn()
      .mockImplementation(async (teams: ReturnType<typeof buildSavedTeams>) => {
        const currentTeams = savedTeams();
        const currentTeamMap = new Map(currentTeams.map((team) => [team.id, team] as const));
        const mergedTeams: typeof teams = [];
        const importedTeamIds = new Set<string>();
        let addedCount = 0;
        let updatedCount = 0;

        teams.forEach((team) => {
          if (importedTeamIds.has(team.id)) {
            return;
          }

          importedTeamIds.add(team.id);

          if (currentTeamMap.has(team.id)) {
            updatedCount += 1;
          } else {
            addedCount += 1;
          }

          mergedTeams.push(team);
        });

        savedTeams.set([
          ...mergedTeams,
          ...currentTeams.filter((team) => !importedTeamIds.has(team.id)),
        ]);

        return {
          addedCount,
          updatedCount,
          teams: mergedTeams,
        };
      }),
    saveTeam: vi
      .fn()
      .mockImplementation(
        async (input: {
          id?: string;
          name: string;
          notes: string;
          shipId: number | null;
          slots: Array<number | null>;
        }) => {
          const existing = savedTeams().find((team) => team.id === input.id);
          const nextTeam = {
            id: input.id ?? 'team-new',
            name: input.name.trim(),
            notes: input.notes.trim(),
            shipId: input.shipId,
            slots: input.slots,
            createdAt: existing?.createdAt ?? '2026-03-29T12:00:00.000Z',
            updatedAt: '2026-03-29T12:05:00.000Z',
          };

          savedTeams.set(
            existing
              ? savedTeams().map((team) => (team.id === nextTeam.id ? nextTeam : team))
              : [nextTeam, ...savedTeams()],
          );

          return nextTeam;
        },
      ),
  };
  const repository = {
    getCharactersByIds: vi
      .fn()
      .mockImplementation(async (ids: number[]) =>
        ids.map((id) => createCharacter(id, `Unit ${id}`)),
      ),
    getDetailedCharactersByIds: vi
      .fn()
      .mockImplementation(async (ids: number[]) =>
        ids.map((id) => createCharacter(id, `Unit ${id}`)),
      ),
    getShips: vi
      .fn()
      .mockResolvedValue([
        createShip(
          9001,
          'Going Merry',
          'ship_0001_t2.png',
          'assets/offline-packs/ship-thumbnails/ship_0001_t2.png',
        ),
      ]),
  };
  const i18n = {
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === 'confirm.deleteSingle') {
        return `Delete ${params?.['name'] ?? ''}`;
      }

      if (key === 'confirm.deleteSelected') {
        return `Delete ${params?.['count'] ?? 0}`;
      }

      if (key === 'common.defaults.untitledCrew') {
        return 'Untitled Crew';
      }

      if (key === 'import.successTitle') {
        return 'Import completed';
      }

      if (key === 'import.warningTitle') {
        return 'Import completed with warnings';
      }

      if (key === 'import.errorTitle') {
        return 'Import failed';
      }

      if (key === 'import.loadedFromFile') {
        return `Loaded ${params?.['fileName'] ?? ''}.`;
      }

      if (key === 'import.stats.added') {
        return `Added ${params?.['count'] ?? 0} new teams.`;
      }

      if (key === 'import.stats.updated') {
        return `Updated ${params?.['count'] ?? 0} existing teams.`;
      }

      if (key === 'import.stats.invalid') {
        return `Skipped ${params?.['count'] ?? 0} invalid teams.`;
      }

      if (key === 'import.stats.duplicates') {
        return `Collapsed ${params?.['count'] ?? 0} duplicate ids from the import.`;
      }

      if (key === 'import.stats.unknownSlots') {
        return `Cleared ${params?.['count'] ?? 0} unknown character slots.`;
      }

      if (key === 'import.errors.generic') {
        return 'Generic import error';
      }

      if (key === 'ship.noShipLabel') {
        return 'No ship';
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

      return key;
    }),
  };
  const page = new SavedTeamsPage(userState as never, repository as never, i18n as never);

  return { page, repository, userState, i18n };
}

function buildSavedTeams() {
  return [
    {
      id: 'team-1',
      name: 'Slashers',
      notes: 'Burst team',
      shipId: null,
      slots: [101, null, 202, null, null, 303],
      createdAt: '2026-03-29T10:00:00.000Z',
      updatedAt: '2026-03-29T10:00:00.000Z',
    },
    {
      id: 'team-2',
      name: 'Auto Crew',
      notes: 'Saved from auto builder',
      shipId: 9001,
      slots: [404, 505, null, null, null, null],
      createdAt: '2026-03-29T11:00:00.000Z',
      updatedAt: '2026-03-29T11:00:00.000Z',
    },
  ];
}

function createCharacter(id: number, name: string) {
  const captainAbility =
    id === 101
      ? 'Boosts ATK of all characters by 5x.'
      : id === 102
        ? 'Boosts HP of all characters by 1.3x.'
        : null;

  return {
    id,
    name,
    searchText: '',
    isIncomplete: false,
    type: id % 2 === 0 ? 'DEX' : 'PSY',
    classes: ['Fighter', 'Slasher'],
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    stars: 5,
    cost: 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionAvailability: {
      exactLocal: false,
      thumbnailGlobal: false,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: `assets/${id}.png`,
    detailImageUrl: `assets/${id}.png`,
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
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  };
}

function createShip(id: number, name: string, thumb: string | null, thumbUrl: string | null) {
  return {
    id,
    name,
    thumb,
    thumbUrl,
    description: `${name} effect`,
  };
}
