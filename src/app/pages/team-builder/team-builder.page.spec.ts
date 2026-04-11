import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { TeamBuilderPage } from './team-builder.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonItem: class {},
  IonLabel: class {},
  IonList: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('TeamBuilderPage', () => {
  it('saves manual teams through the shared user state contract', async () => {
    const { page, userState } = createPage();

    page.teamName.set('Manual Crew');
    page.notes.set('Shared persistence');
    page.selectedShipId.set(9001);
    page.slotCharacters.set([
      { id: 101 } as never,
      null,
      { id: 202 } as never,
      null,
      null,
      { id: 303 } as never,
    ]);

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: undefined,
      name: 'Manual Crew',
      notes: 'Shared persistence',
      shipId: 9001,
      slots: [101, null, 202, null, null, 303],
    });
  });

  it('returns a detail route only for occupied slots', () => {
    const { page } = createPage();

    expect(
      page.getCharacterDetailLink({
        id: 101,
      } as never),
    ).toEqual(['/characters', '101']);
    expect(page.getCharacterDetailLink(null)).toBeNull();
  });

  it('updates the selected ship through the shared picker save flow', () => {
    const { page } = createPage();

    page.openShipPicker();
    expect(page.shipPickerOpen()).toBe(true);

    page.saveShipSelection(9001);

    expect(page.selectedShipId()).toBe(9001);
    expect(page.shipPickerOpen()).toBe(false);
  });

  it('toggles ship favorites through the shared picker contract', async () => {
    const { page, userState } = createPage();

    await page.toggleShipFavorite(9002);

    expect(userState.toggleShipFavorite).toHaveBeenCalledWith(9002);
  });

  it('keeps slot selection independent from detail navigation availability', () => {
    const { page } = createPage();

    page.selectSlot(4);

    expect(page.selectedSlotIndex()).toBe(4);
    expect(page.getCharacterDetailLink(page.slotCharacters()[4])).toBeNull();
  });

  it('renders a dedicated slot detail action without adding it to candidate cards', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/team-builder/team-builder.page.html'),
      'utf8',
    );

    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template).toContain('[value]="candidateSearchTerm()"');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(slot)"');
    expect(template.match(/common\.actions\.viewDetails/g)).toHaveLength(1);
    expect(template).toContain('(click)="assignCharacter(candidate)"');
    expect(template).toContain('<app-ship-picker');
    expect(template).toContain('[favoriteShipIds]="favoriteShipIds()"');
    expect(template).toContain('(toggleFavoriteShip)="toggleShipFavorite($event)"');
    expect(template).not.toContain('<ion-select');
  });

  it('resets the builder draft, slot selection and candidate search state', async () => {
    const { page, repository } = createPage();

    page.teamName.set('Manual Crew');
    page.notes.set('Shared persistence');
    page.selectedShipId.set(9001);
    page.selectedSlotIndex.set(4);
    page.currentTeamId.set('saved-team-1');
    page.candidateSearchTerm.set('Luffy');
    page.slotCharacters.set([
      { id: 101 } as never,
      null,
      { id: 202 } as never,
      null,
      null,
      { id: 303 } as never,
    ]);

    await page.resetPage();

    expect(page.teamName()).toBe('New Crew');
    expect(page.notes()).toBe('');
    expect(page.selectedShipId()).toBeNull();
    expect(page.selectedSlotIndex()).toBe(0);
    expect(page.currentTeamId()).toBeNull();
    expect(page.candidateSearchTerm()).toBe('');
    expect(page.slotCharacters()).toEqual(Array.from({ length: 6 }, () => null));
    expect(repository.searchCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      limit: 24,
      offset: 0,
    });
  });
});

function createPage() {
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: signal<number[]>([]),
    favoriteShipIds: signal<number[]>([]),
    savedTeams: signal([]),
    saveTeam: vi.fn().mockResolvedValue({
      id: 'saved-team-1',
    }),
    deleteTeam: vi.fn(),
    toggleFavorite: vi.fn(),
    toggleShipFavorite: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    getShips: vi.fn().mockResolvedValue([]),
    searchCharacters: vi.fn().mockResolvedValue([]),
    getCharactersByIds: vi.fn().mockResolvedValue([]),
  };
  const i18n = {
    activeLanguage: signal<'en' | 'el'>('en'),
    availableLanguages: [
      { id: 'en', label: 'English' },
      { id: 'el', label: 'Ελληνικά' },
    ] as const,
    preloadScope: vi.fn().mockResolvedValue(undefined),
    ready: vi.fn().mockResolvedValue(undefined),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string) => {
      if (key === 'common.defaults.newCrew') {
        return 'New Crew';
      }

      return key;
    }),
  };
  const page = new TeamBuilderPage(repository as never, userState as never, i18n as never);

  return { page, repository, userState, i18n };
}
