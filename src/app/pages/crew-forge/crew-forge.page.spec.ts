import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CrewForgePage } from './crew-forge.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonMenuButton: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

describe('CrewForgePage', () => {
  it('starts with an empty-state view before any roster picks exist', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    expect(page.buildReady()).toBe(false);
    expect(page.emptyStateVisible()).toBe(true);
    expect(page.noResultStateVisible()).toBe(false);
  });

  it('calls the ranked-roster builder with locked leaders and the selected pool', async () => {
    const { page, autoTeamBuilder } = createPage();

    await page.ngOnInit();
    page.setCaptain(101);
    page.setFriendCaptain(102);
    page.togglePoolCharacter(103);
    page.togglePoolCharacter(104);
    page.togglePoolCharacter(105);
    page.togglePoolCharacter(106);

    await page.buildTeams();

    expect(autoTeamBuilder.buildRankedTeamsFromRoster).toHaveBeenCalledWith(
      expect.objectContaining({
        rosterCharacterIds: [101, 102, 103, 104, 105, 106],
        captainCharacterId: 101,
        friendCaptainCharacterId: 102,
        resultLimit: 50,
        requireUniqueBaseCharacterNames: true,
      }),
      expect.objectContaining({
        workerCount: 3,
      }),
    );
  });

  it('shows a no-result state when the ranked builder returns no teams', async () => {
    const { page, autoTeamBuilder } = createPage();

    autoTeamBuilder.buildRankedTeamsFromRoster.mockResolvedValue({
      results: [],
      totalResults: 0,
      limit: 50,
    });

    await page.ngOnInit();
    page.setCaptain(101);
    page.togglePoolCharacter(102);
    page.togglePoolCharacter(103);
    page.togglePoolCharacter(104);
    page.togglePoolCharacter(105);
    page.togglePoolCharacter(106);

    await page.buildTeams();

    expect(page.results()).toEqual([]);
    expect(page.errorMessage()).toBe("results.empty");
    expect(page.noResultStateVisible()).toBe(true);
  });

  it('keeps earlier results stable when loading more cards', async () => {
    const { page, autoTeamBuilder } = createPage();

    autoTeamBuilder.buildRankedTeamsFromRoster.mockResolvedValue({
      results: Array.from({ length: 12 }, (_, index) => createRankedResult(index + 1)),
      totalResults: 12,
      limit: 50,
    });

    await page.ngOnInit();
    page.setCaptain(101);
    page.setFriendCaptain(102);
    page.togglePoolCharacter(103);
    page.togglePoolCharacter(104);
    page.togglePoolCharacter(105);
    page.togglePoolCharacter(106);

    await page.buildTeams();

    expect(page.visibleResults()).toHaveLength(10);
    expect(page.visibleResults()[0]?.teamKey).toBe('team-1');

    page.loadMoreResults();

    expect(page.visibleResults()).toHaveLength(12);
    expect(page.visibleResults()[0]?.teamKey).toBe('team-1');
    expect(page.visibleResults()[10]?.teamKey).toBe('team-11');
  });

  it('renders menu access, roster controls, and ranked result copy in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/crew-forge/crew-forge.page.html'),
      'utf8',
    );

    expect(template).toContain('<ion-buttons slot="start">');
    expect(template).toContain('<ion-menu-button autoHide="false"></ion-menu-button>');
    expect(template).toContain("t('actions.build')");
    expect(template).toContain("t('results.distinctAbilities')");
    expect(template).toContain("t('results.loadMore')");
  });
});

function createPage() {
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      availableTypes: ['DEX', 'STR'],
      availableClasses: ['Fighter', 'Slasher'],
    }),
  };
  const characterCatalogCache = {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    queryCharacters: vi.fn().mockImplementation(({ offset, limit }) =>
      createCatalogCharacters().slice(offset, offset + limit),
    ),
    getCharactersByIds: vi.fn().mockImplementation((ids: number[]) =>
      createCatalogCharacters().filter((character) => ids.includes(character.id)),
    ),
  };
  const autoTeamBuilder = {
    buildRankedTeamsFromRoster: vi.fn().mockResolvedValue({
      results: [createRankedResult(1)],
      totalResults: 1,
      limit: 50,
    }),
  };
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: signal<number[]>([101, 103]),
    characterBoxes: signal([
      {
        id: 'box-1',
        name: 'Main Box',
        characterIds: [101, 102, 103, 104],
      },
    ]),
    resolveAutoTeamBuilderWorkerCount: vi.fn().mockReturnValue(3),
  };
  const i18n = {
    translate: vi.fn().mockImplementation((key: string) => key),
  };

  return {
    page: new CrewForgePage(
      repository as never,
      characterCatalogCache as never,
      autoTeamBuilder as never,
      userState as never,
      i18n as never,
    ),
    autoTeamBuilder,
  };
}

function createCatalogCharacters() {
  return Array.from({ length: 12 }, (_, index) => ({
    id: 101 + index,
    name: `Character ${101 + index}`,
    imageUrl: `character-${101 + index}.png`,
    type: index % 2 === 0 ? 'DEX' : 'STR',
    primaryClass: 'Fighter',
    secondaryClass: index % 3 === 0 ? 'Slasher' : null,
  }));
}

function createRankedResult(index: number) {
  const ids = [index * 10 + 1, index * 10 + 2, index * 10 + 3, index * 10 + 4, index * 10 + 5, index * 10 + 6];

  return {
    teamKey: `team-${index}`,
    candidateCount: 6,
    input: {} as never,
    coverage: {
      utility: ['bind', 'paralysis'],
      burst: ['atkBoost'],
      consistency: ['matchingOrbs'],
    },
    slots: [
      createSlot('captain', ids[0]),
      createSlot('friendCaptain', ids[1]),
      createSlot('sub', ids[2]),
      createSlot('sub', ids[3]),
      createSlot('sub', ids[4]),
      createSlot('sub', ids[5]),
    ],
    abilityBreakdown: {
      distinctAbilityCount: 8,
      allAbilities: [],
      uniqueAbilities: [{ key: 'remove_bind', label: 'Remove Bind', count: 1, characterIds: [ids[2]] }],
      duplicateAbilities: [{ key: 'remove_paralysis', label: 'Remove Paralysis', count: 2, characterIds: [ids[3], ids[4]] }],
    },
    ranking: {
      distinctAbilityCount: 8,
      utilityCoverageCount: 2,
      burstCoverageCount: 1,
      consistencyCoverageCount: 1,
      powerScore: 10,
      recencyScore: 4,
    },
  };
}

function createSlot(role: string, id: number) {
  return {
    role,
    reasonChips: [],
    character: {
      id,
      name: `Character ${id}`,
      imageUrl: `character-${id}.png`,
      detail: {
        builderAbilities: [],
      },
    },
  };
}
