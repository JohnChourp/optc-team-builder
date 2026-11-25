import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterBox, type CharacterEvolutionLinks } from '../../core/models/optc.models';
import { SavedTeamsEvolutionMaterialsComponent } from './saved-teams-evolution-materials.component';

vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));

/*
 * 869f63gzu. The evolution materials card: it reads the chain back from the teams' units, sums
 * from the chosen box, tells a box failure apart from an evolution failure, and drops a load that
 * a newer selection replaced.
 */

const LINKS: CharacterEvolutionLinks[] = [
  {
    characterId: 1,
    evolvesTo: [{ toId: 2, materials: [{ characterId: 80, token: null }] }],
    evolvesFrom: [],
  },
  {
    characterId: 2,
    evolvesTo: [{ toId: 3, materials: [{ characterId: null, token: '3-skull' }] }],
    evolvesFrom: [1],
  },
  { characterId: 3, evolvesTo: [], evolvesFrom: [2] },
];

function box(id: string, characterIds: number[]): CharacterBox {
  return { id, name: id, characterIds, createdAt: '', updatedAt: '' };
}

function create(options: { boxesFail?: boolean } = {}) {
  const boxes = signal<CharacterBox[]>([box('main', [1]), box('other', [2])]);
  const repository = {
    getCharacterEvolutionsByIds: vi.fn(async (ids: number[]) =>
      LINKS.filter((entry) => ids.includes(entry.characterId)),
    ),
    getCharactersByIds: vi.fn(async (ids: number[]) =>
      ids.map((id) => ({ id, name: `Unit ${id}` })),
    ),
    getCharacterDropSourcesByIds: vi.fn(async (ids: number[]) =>
      ids.map((characterId) => ({
        characterId,
        dropSources: [{ group: 'Story', stage: 'Stage A', dropId: '1', slot: '1', global: true }],
      })),
    ),
  };
  const userState = {
    characterBoxes: boxes,
    readyCharacterBoxes: vi.fn(async () => {
      if (options.boxesFail) {
        throw new Error('storage');
      }
    }),
  };
  const component = new SavedTeamsEvolutionMaterialsComponent(
    repository as never,
    userState as never,
  );

  return { component, repository, boxes };
}

/** Waits for the load the `characterIds` input starts. */
async function settled(component: SavedTeamsEvolutionMaterialsComponent): Promise<void> {
  await vi.waitFor(() => expect(component.loading()).toBe(false));
}

describe('evolution materials card', () => {
  it('walks back from the team to the box, then sums with names and drops', async () => {
    const { component, repository } = create();

    component.characterIds = [3, 3];
    await settled(component);

    // 3, then 2, then 1: one query per level.
    expect(repository.getCharacterEvolutionsByIds.mock.calls.map(([ids]) => ids)).toEqual([
      [3],
      [2],
      [1],
    ]);
    expect(component.result()).toEqual({
      materials: [
        {
          key: 'c:80',
          count: 1,
          characterId: 80,
          name: 'Unit 80',
          skullOfName: null,
          drops: ['Stage A (Story)'],
        },
        {
          key: 't:3-skull',
          count: 1,
          characterId: null,
          name: '3-skull',
          skullOfName: 'Unit 3',
          drops: [],
        },
      ],
      evolve: [{ characterId: 3, name: 'Unit 3', fromName: 'Unit 1', steps: 2 }],
      notInBox: [],
      ownedCount: 0,
    });
  });

  it('follows the chosen box, reports it, and takes it back from the page', async () => {
    const { component } = create();
    const emitted: Array<string | null> = [];

    component.boxIdChange.subscribe((boxId) => emitted.push(boxId));
    component.characterIds = [3];
    await settled(component);

    component.onBoxChange({ target: { value: 'other' } } as unknown as Event);

    expect(emitted).toEqual(['other']);
    expect(component.result()?.evolve).toEqual([
      { characterId: 3, name: 'Unit 3', fromName: 'Unit 2', steps: 1 },
    ]);

    component.boxId = null;
    expect(component.shownBoxId()).toBe('main');
  });

  it('says the boxes could not be read, not the evolutions', async () => {
    const { component } = create({ boxesFail: true });

    component.characterIds = [3];
    await settled(component);

    expect(component.boxesFailed()).toBe(true);
    expect(component.failed()).toBe(false);
  });

  it('says the evolutions could not be read', async () => {
    const { component, repository } = create();

    repository.getCharacterEvolutionsByIds.mockRejectedValue(new Error('db'));
    component.characterIds = [3];
    await settled(component);

    expect(component.failed()).toBe(true);
    expect(component.boxesFailed()).toBe(false);
  });

  it('drops a load that a newer selection replaced', async () => {
    const { component, repository } = create();
    let release!: () => void;
    const held = new Promise<void>((done) => (release = done));

    repository.getCharacterEvolutionsByIds.mockImplementationOnce(async () => {
      await held;
      throw new Error('stale');
    });

    component.characterIds = [3];
    const second = component.load();

    await second;
    release();
    await new Promise((done) => setTimeout(done, 0));

    expect(component.failed()).toBe(false);
    expect(component.loading()).toBe(false);
    expect(component.result()?.evolve).toHaveLength(1);
  });

  it('links to the Character Boxes page by its real route', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/pages/saved-teams/saved-teams-evolution-materials.component.html',
      ),
      'utf8',
    );
    const routes = readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf8');

    expect(template).toContain('routerLink="/tabs/character-boxes"');
    expect(routes).toMatch(/path: 'tabs'[\s\S]*path: 'character-boxes'/u);
  });
});
