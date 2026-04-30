import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_RUMBLE_BUFF_FOCUS } from '../../core/models/auto-team-builder-rumble.models';
import { type SavedRumbleTeam } from '../../core/models/saved-rumble-team.models';
import { SavedRumbleTeamsPage } from './saved-rumble-teams.page';

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
  IonSpinner: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('SavedRumbleTeamsPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('hydrates saved Rumble team preview cards', async () => {
    const { page, repository } = createPage();

    await page.ngOnInit();

    expect(repository.getCharactersByIds).toHaveBeenCalledWith([1001, 1002, 1003]);
    expect(page.loading()).toBe(false);
    expect(page.savedRumbleTeamCards()).toHaveLength(1);
    expect(page.savedRumbleTeamCards()[0]).toMatchObject({
      teamCount: 1,
      opponentCount: 1,
    });
    expect(page.savedRumbleTeamCards()[0]?.slots.map((slot) => slot?.id ?? null)).toEqual([
      1001, 1002,
    ]);
  });

  it('builds the Auto Rumble Builder query params for a saved team', () => {
    const { page } = createPage();

    expect(page.getRumbleBuilderQueryParams({ id: 'rumble-1' })).toEqual({
      savedRumbleTeamId: 'rumble-1',
    });
  });

  it('edits saved Rumble team name and notes', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedRumbleTeams()[0]!);
    page.onEditRumbleTeamNameChange({ detail: { value: ' Updated Rumble' } } as never);
    page.onEditNotesChange({ detail: { value: 'Notes' } } as never);
    await page.saveEditedRumbleTeam();

    expect(userState.saveRumbleTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'rumble-1',
        name: 'Updated Rumble',
        notes: 'Notes',
      }),
    );
    expect(page.editModalOpen()).toBe(false);
  });

  it('deletes a saved Rumble team after confirmation', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { page, userState } = createPage();

    await page.ngOnInit();
    await page.confirmAndDeleteRumbleTeam('rumble-1');

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteRumbleTeam).toHaveBeenCalledWith('rumble-1');
    expect(page.savedRumbleTeams()).toHaveLength(0);
  });

  it('renders load, edit, delete, and builder links in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/saved-rumble-teams/saved-rumble-teams.page.html'),
      'utf8',
    );

    expect(template).toContain("scope: 'saved-rumble-teams'");
    expect(template).toContain('[queryParams]="getRumbleBuilderQueryParams(card.team)"');
    expect(template).toContain("t('actions.load')");
    expect(template).toContain("t('actions.edit')");
    expect(template).toContain('confirmAndDeleteRumbleTeam(card.team.id)');
  });
});

function createPage() {
  const savedRumbleTeams = signal<SavedRumbleTeam[]>([createSavedRumbleTeam()]);
  const userState = {
    savedRumbleTeams,
    ready: vi.fn().mockResolvedValue(undefined),
    saveRumbleTeam: vi.fn().mockImplementation(async (input: SavedRumbleTeam) => {
      const nextTeam = {
        ...savedRumbleTeams()[0]!,
        ...input,
        updatedAt: '2026-04-30T10:00:00.000Z',
      };

      savedRumbleTeams.set([nextTeam]);
      return nextTeam;
    }),
    deleteRumbleTeam: vi.fn().mockImplementation(async (teamId: string) => {
      savedRumbleTeams.set(savedRumbleTeams().filter((team) => team.id !== teamId));
    }),
  };
  const repository = {
    getCharactersByIds: vi.fn().mockImplementation(async (ids: number[]) =>
      ids.map((id) => ({
        id,
        name: `Unit ${id}`,
        imageUrl: `assets/${id}.png`,
      })),
    ),
  };
  const i18n = {
    translate: vi.fn((key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    ),
  };
  const page = new SavedRumbleTeamsPage(userState as never, repository as never, i18n as never);

  return { page, repository, userState };
}

function createSavedRumbleTeam(): SavedRumbleTeam {
  return {
    id: 'rumble-1',
    name: 'Rumble 1',
    notes: '',
    settings: {
      types: [],
      selectedClasses: [],
      onlySelectedTypes: false,
      onlySelectedClasses: false,
      favoritesOnly: false,
      favoriteCharacterIds: [],
      opponentSlots: [],
      buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
      requireFullTeam: true,
    },
    teams: [
      {
        activeSlots: [
          { characterId: 1001, index: 0, reasonChips: [], role: 'active', score: 100 },
          { characterId: 1002, index: 1, reasonChips: [], role: 'active', score: 90 },
        ],
        benchSlots: [],
        candidateCount: 2,
        classCoverage: ['Fighter'],
        droppedClasses: [],
        droppedTypes: [],
        input: {
          types: [],
          selectedClasses: [],
          onlySelectedTypes: false,
          onlySelectedClasses: false,
          favoritesOnly: false,
          favoriteCharacterIds: [],
          opponentSlots: [],
          buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
          requireFullTeam: true,
        },
        requestedClasses: [],
        requestedTypes: [],
        resolvedClasses: [],
        resolvedTypes: [],
        roleCoverage: ['attacker'],
        selectedCount: 2,
        topFactors: [],
        totalScore: 190,
        typeCoverage: ['DEX'],
      },
    ],
    selectedTeamIndex: 0,
    opponentActiveCharacterIds: [1003, null, null, null, null],
    opponentBenchCharacterIds: [null, null, null],
    opponentAwarenessEnabled: true,
    createdAt: '2026-04-30T09:00:00.000Z',
    updatedAt: '2026-04-30T09:00:00.000Z',
  };
}
