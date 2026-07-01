import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  captureJsonDownloads,
  readJsonDownloadPayload,
  restoreJsonDownloadCapture,
} from '../../testing/download-capture';
import { buildSavedTeamShareCode } from './saved-teams-transfer.utils';

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

vi.mock('@ionic/angular', () => ({}));

type SavedTeamsPageClass = typeof import('./saved-teams.page').SavedTeamsPage;
let SavedTeamsPage: SavedTeamsPageClass;

describe('SavedTeamsPage', () => {
  beforeAll(async () => {
    SavedTeamsPage = (await import('./saved-teams.page')).SavedTeamsPage;
  });

  afterEach(() => {
    restoreJsonDownloadCapture();
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

  it('shows storage recovery warnings from repaired local saved teams', async () => {
    const { page } = createPage({
      storageRecovery: {
        droppedCount: 2,
        repairedCount: 1,
        reset: false,
      },
    });

    await page.ngOnInit();

    expect(page.actionFeedback()).toEqual({
      details: ['Repaired 1 saved teams.', 'Removed 2 corrupted saved-team records.'],
      title: 'Saved teams storage repaired',
      tone: 'warning',
    });
  });

  it('consumes storage recovery warnings after the first display', async () => {
    const { page, userState } = createPage({
      storageRecovery: {
        droppedCount: 1,
        repairedCount: 0,
        reset: false,
      },
    });

    await page.ngOnInit();

    expect(page.actionFeedback()).toMatchObject({
      title: 'Saved teams storage repaired',
      tone: 'warning',
    });

    page.actionFeedback.set({
      details: ['Copied.'],
      title: 'Copied',
      tone: 'success',
    });

    await page.ionViewWillEnter();

    expect(userState.consumeSavedTeamsStorageRecovery).toHaveBeenCalledTimes(2);
    expect(page.actionFeedback()).toEqual({
      details: ['Copied.'],
      title: 'Copied',
      tone: 'success',
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

  it('builds deduped ability filters split by leader and crew slots', async () => {
    const { page } = createPage({
      characterAbilities: {
        101: [
          createAbility('make_slots_favorable', 'Make Slots Favorable', 'captainAbility'),
          createAbility('make_slots_favorable', 'Make Slots Favorable', 'captainAbility'),
          createAbility('remove_bind', 'Remove Bind', 'specialText', { minTurns: 6 }),
        ],
        202: [createAbility('boost_atk', 'Boost ATK', 'specialText')],
        303: [createAbility('support_bind', 'Support Bind', 'supportData', { minTurns: 2 })],
        404: [createAbility('remove_despair', 'Remove Despair', 'captainAbility')],
      },
    });

    await page.ngOnInit();

    const leaderSection = page.abilityFilterSections().find((section) => section.origin === 'leader');
    const crewSection = page.abilityFilterSections().find((section) => section.origin === 'crew');

    expect(leaderSection?.categories.find((category) => category.category === 'captain')?.abilities).toEqual([
      expect.objectContaining({
        label: 'Make Slots Favorable',
        teamCount: 1,
      }),
      expect.objectContaining({
        label: 'Remove Despair',
        teamCount: 1,
      }),
    ]);
    expect(leaderSection?.categories.find((category) => category.category === 'special')?.abilities).toEqual([
      expect.objectContaining({
        label: 'Remove Bind',
        metadataLabel: '6 turns - Special',
        teamCount: 1,
      }),
    ]);
    expect(crewSection?.categories.find((category) => category.category === 'special')?.abilities).toEqual([
      expect.objectContaining({
        label: 'Boost ATK',
        teamCount: 1,
      }),
    ]);
    expect(crewSection?.categories.find((category) => category.category === 'support')?.abilities).toEqual([
      expect.objectContaining({
        label: 'Support Bind',
        metadataLabel: '2 turns - Support',
        teamCount: 1,
      }),
    ]);
  });

  it('filters saved teams by all selected leader and crew abilities', async () => {
    const { page } = createPage({
      characterAbilities: {
        101: [createAbility('make_slots_favorable', 'Make Slots Favorable', 'captainAbility')],
        202: [createAbility('boost_atk', 'Boost ATK', 'specialText')],
        404: [createAbility('remove_despair', 'Remove Despair', 'captainAbility')],
        505: [createAbility('boost_atk', 'Boost ATK', 'specialText')],
      },
    });

    await page.ngOnInit();

    const leaderCaptainAbility = page
      .abilityFilterSections()
      .find((section) => section.origin === 'leader')
      ?.categories.find((category) => category.category === 'captain')
      ?.abilities.find((ability) => ability.label === 'Make Slots Favorable');
    const crewBoostAbility = page
      .abilityFilterSections()
      .find((section) => section.origin === 'crew')
      ?.categories.find((category) => category.category === 'special')
      ?.abilities.find((ability) => ability.label === 'Boost ATK');

    expect(leaderCaptainAbility).toBeDefined();
    expect(crewBoostAbility).toBeDefined();

    page.toggleAbilityFilter('leader', leaderCaptainAbility!.identity);
    page.toggleAbilityFilter('crew', crewBoostAbility!.identity);

    expect(page.filteredSavedTeamCards().map((card) => card.team.id)).toEqual(['team-1']);
    expect(page.savedTeamTotalLabel()).toBe('1 matching of 2 total');
  });

  it('prunes selected teams hidden by ability filters and resets ability filters', async () => {
    const { page } = createPage({
      characterAbilities: {
        101: [createAbility('make_slots_favorable', 'Make Slots Favorable', 'captainAbility')],
        404: [createAbility('remove_despair', 'Remove Despair', 'captainAbility')],
      },
    });

    await page.ngOnInit();
    page.selectedTeamIds.set(['team-1', 'team-2']);
    const leaderCaptainAbility = page
      .abilityFilterSections()
      .find((section) => section.origin === 'leader')
      ?.categories.find((category) => category.category === 'captain')
      ?.abilities.find((ability) => ability.label === 'Make Slots Favorable');

    expect(leaderCaptainAbility).toBeDefined();

    page.toggleAbilityFilter('leader', leaderCaptainAbility!.identity);

    expect(page.filteredSavedTeamCards().map((card) => card.team.id)).toEqual(['team-1']);
    expect(page.selectedTeamIds()).toEqual(['team-1']);

    page.resetPage();

    expect(page.hasAbilityFilters()).toBe(false);
    expect(page.filteredSavedTeamCards().map((card) => card.team.id)).toEqual(['team-1', 'team-2']);
    expect(page.selectedTeamIds()).toEqual([]);
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

  it('opens and closes the team destination modal for a saved team', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.openTeamDestinationModal(page.savedTeams()[0]!);

    expect(page.openTeamModalOpen()).toBe(true);
    expect(page.openingTeam()?.id).toBe('team-1');

    page.resetOpenTeamModal();

    expect(page.openTeamModalOpen()).toBe(false);
    expect(page.openingTeam()).toBeNull();
  });

  it('builds the shared team handoff query params for destination routes', () => {
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
    expect(template).toContain("t('actions.openTeam')");
    expect(template).toContain('openTeamDestinationModal(teamCard.team)');
    expect(template).toContain('openImportModal()');
    expect(template).toContain('[isOpen]="openTeamModalOpen()"');
    expect(template).toContain('(didDismiss)="resetOpenTeamModal()"');
    expect(template).toContain("t('openTeam.destinations.auto.title')");
    expect(template).toContain("t('openTeam.destinations.captainCoverage.copy')");
    expect(template).toContain("t('openTeam.destinations.manual.title')");
    expect(template).toContain("t('actions.exportSingle')");
    expect(template).toContain("t('actions.copyShareLink')");
    expect(template).toContain("t('actions.copyShareCode')");
    expect(template).toContain("t('actions.copyJson')");
    expect(template).toContain("t('guide.cta')");
    expect(template).toContain("t('guide.importLink')");
    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template).toContain("t('tools.export')");
    expect(template).toContain("t('tools.copyJson')");
    expect(template).toContain('copySelectedTeamsJson()');
    expect(template).toContain('copyTeamShareLink(teamCard.team)');
    expect(template).toContain('copyTeamShareCode(teamCard.team)');
    expect(template).toContain('copyTeamJson(teamCard.team)');
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
    expect(template).toContain('[routerLink]="[\'/tabs/captain-coverage\']"');
    expect(template).toContain('[routerLink]="[\'/tabs/manual-team-builder\']"');
    expect(template).toContain('[queryParams]="getTeamBuilderQueryParams(team)"');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(currentSlot)"');
    expect(template).toContain('abilityFilterSections()');
    expect(template).toContain('filteredSavedTeamCards()');
    expect(template).toContain('data-testid="saved-teams-ability-filter-panel"');
    expect(template).toContain("'saved-team-ability-chip-'");
    expect(template).toContain('toggleAbilityFilter(section.origin, ability.identity)');
    expect(template).toContain("t('abilityFilters.title')");
    expect(template).not.toContain("t('hero.savedEnemiesCta')");
    expect(template).not.toContain('[routerLink]="[\'/tabs/saved-enemies\']"');
    expect(template).toContain('import-dropzone');
    expect(template).toContain('import-paste-panel');
    expect(template).toContain('importPastedTeams()');
  });

  it('exports a single saved team with the shared saved-teams payload', async () => {
    const { page } = createPage();
    const downloads = captureJsonDownloads();

    await page.ngOnInit();
    page.exportTeam(page.savedTeams()[0]!);

    await expect(readJsonDownloadPayload(downloads)).resolves.toMatchObject({
      schemaVersion: 1,
      source: 'saved-teams',
      teams: [expect.objectContaining({ id: 'team-1' })],
    });
  });

  it('copies selected saved teams as JSON to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { page } = createPage();

    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await page.ngOnInit();
    page.selectedTeamIds.set(['team-1']);

    await page.copySelectedTeamsJson();

    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toMatchObject({
      schemaVersion: 1,
      source: 'saved-teams',
      teams: [expect.objectContaining({ id: 'team-1' })],
    });
    expect(page.actionFeedback()).toMatchObject({ tone: 'success' });
  });

  it('copies a self-contained manual builder share link for a saved team', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { page } = createPage();

    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await page.ngOnInit();

    await page.copyTeamShareLink(page.savedTeams()[0]!);

    const copiedUrl = writeText.mock.calls[0]?.[0] as string;
    const parsedUrl = new URL(copiedUrl, 'http://localhost');

    expect(parsedUrl.pathname).toBe('/tabs/manual-team-builder');
    expect(parsedUrl.searchParams.get('teamShare')).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(page.actionFeedback()).toMatchObject({ tone: 'success' });
  });

  it('imports a pasted raw saved team share code', async () => {
    const importedTeam = {
      id: 'team-shared',
      name: 'Shared Team',
      notes: 'From link',
      shipId: 9001,
      slots: [101, null, null, null, null, null],
      createdAt: '2026-03-29T12:00:00.000Z',
      updatedAt: '2026-03-29T12:00:00.000Z',
    };
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.importTextContent.set(buildSavedTeamShareCode(importedTeam, '2026-03-29T12:00:00.000Z'));

    await page.importPastedTeams();

    expect(userState.mergeImportedTeams).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'team-shared',
        shipId: 9001,
        slots: [101, null, null, null, null, null],
      }),
    ]);
    expect(page.importFeedback()).toMatchObject({ tone: 'success' });
  });

  it('resets page-local selection and edit modal state without touching saved teams', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.selectedTeamIds.set(['team-1']);
    page.editModalOpen.set(true);
    page.importModalOpen.set(true);
    page.openTeamModalOpen.set(true);
    page.openingTeam.set(page.savedTeams()[0]!);
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
    expect(page.openTeamModalOpen()).toBe(false);
    expect(page.openingTeam()).toBeNull();
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

  it('shows import feedback before asynchronously clearing unavailable imported slots', async () => {
    const { page, repository, userState } = createPage();
    let resolveLookup: (characters: ReturnType<typeof createCharacter>[]) => void = () => {};
    const characterLookup = new Promise<ReturnType<typeof createCharacter>[]>((resolve) => {
      resolveLookup = resolve;
    });

    repository.getCharactersByIds.mockReturnValueOnce(characterLookup);

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
                slots: [101, 999999, null, null, null, null],
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

    expect(userState.mergeImportedTeams).toHaveBeenCalledTimes(1);
    expect(page.importFeedback()?.details).not.toContain('Cleared 1 unknown character slots.');

    resolveLookup([createCharacter(101, 'Unit 101')]);
    await flushPromises();

    expect(userState.mergeImportedTeams).toHaveBeenCalledTimes(2);
    expect(userState.mergeImportedTeams).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: 'team-3',
        slots: [101, null, null, null, null, null],
      }),
    ]);
    expect(page.importFeedback()?.details).toContain('Cleared 1 unknown character slots.');
  });

  it('does not replay unavailable-slot cleanup over a changed imported team', async () => {
    const { page, repository, userState } = createPage();
    let resolveLookup: (characters: ReturnType<typeof createCharacter>[]) => void = () => {};
    const characterLookup = new Promise<ReturnType<typeof createCharacter>[]>((resolve) => {
      resolveLookup = resolve;
    });

    repository.getCharactersByIds.mockReturnValueOnce(characterLookup);

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
                slots: [101, 999999, null, null, null, null],
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

    page.savedTeams.set(
      page
        .savedTeams()
        .map((team) =>
          team.id === 'team-3' ? { ...team, slots: [101, null, null, null, null, null] } : team,
        ),
    );

    resolveLookup([createCharacter(101, 'Unit 101')]);
    await flushPromises();

    expect(userState.mergeImportedTeams).toHaveBeenCalledTimes(1);
    expect(page.savedTeams().find((team) => team.id === 'team-3')?.slots).toEqual([
      101,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

function createPage(
  overrides: {
    characterAbilities?: Record<number, NormalizedBuilderAbility[]>;
    savedTeams?: ReturnType<typeof buildSavedTeams>;
    storageRecovery?: {
      droppedCount: number;
      repairedCount: number;
      reset: boolean;
    } | null;
  } = {},
) {
  const savedTeams = signal(overrides.savedTeams ?? buildSavedTeams());
  const savedTeamsStorageRecovery = signal(overrides.storageRecovery ?? null);
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    readySavedTeams: vi.fn().mockResolvedValue(undefined),
    savedTeams,
    savedTeamsStorageRecovery,
    consumeSavedTeamsStorageRecovery: vi.fn().mockImplementation(() => {
      const summary = savedTeamsStorageRecovery();

      savedTeamsStorageRecovery.set(null);

      return summary;
    }),
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
        ids.map((id) => createCharacter(id, `Unit ${id}`, overrides.characterAbilities?.[id])),
      ),
    getDetailedCharactersByIds: vi
      .fn()
      .mockImplementation(async (ids: number[]) =>
        ids.map((id) => createCharacter(id, `Unit ${id}`, overrides.characterAbilities?.[id])),
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
    preloadScope: vi.fn().mockResolvedValue(undefined),
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

      if (key === 'storageRecovery.title') {
        return 'Saved teams storage repaired';
      }

      if (key === 'storageRecovery.reset') {
        return 'Local saved-teams storage was invalid and has been reset.';
      }

      if (key === 'storageRecovery.repaired') {
        return `Repaired ${params?.['count'] ?? 0} saved teams.`;
      }

      if (key === 'storageRecovery.dropped') {
        return `Removed ${params?.['count'] ?? 0} corrupted saved-team records.`;
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

      if (key === 'abilityFilters.metadata.turns') {
        return `${params?.['count'] ?? 0} turns`;
      }

      if (key === 'abilityFilters.sources.captainAbility') {
        return 'Captain';
      }

      if (key === 'abilityFilters.sources.specialText') {
        return 'Special';
      }

      if (key === 'abilityFilters.sources.supportData') {
        return 'Support';
      }

      if (key === 'totalFiltered') {
        return `${params?.['count'] ?? 0} matching of ${params?.['total'] ?? 0} total`;
      }

      if (key === 'total') {
        return `${params?.['count'] ?? 0} total`;
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

async function flushPromises(turns = 6): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

function createCharacter(
  id: number,
  name: string,
  builderAbilities: NormalizedBuilderAbility[] = [],
) {
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
      builderAbilities,
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

function createAbility(
  key: string,
  label: string,
  source: AutoBuildAbilitySource,
  overrides: Partial<NormalizedBuilderAbility> = {},
): NormalizedBuilderAbility {
  return {
    key,
    label,
    minTurns: null,
    isCompleteRemoval: false,
    slotTokens: [],
    source,
    ...overrides,
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
