import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterEvolutionLinks } from '../../core/models/optc.models';
import { CharacterBoxesEvolutionMaterialsComponent } from './character-boxes-evolution-materials.component';

vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));

/*
 * 869f63gzu, second part. The box card: it reads the chain on from the box's units, evolves each
 * to its final form, lists the units with a choice apart, and drops a load a newer box replaced.
 */

// 1 → 2 → 3 is one chain; 10 can become 11 or 12.
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
  {
    characterId: 10,
    evolvesTo: [
      { toId: 11, materials: [{ characterId: 80, token: null }] },
      { toId: 12, materials: [{ characterId: 81, token: null }] },
    ],
    evolvesFrom: [],
  },
  { characterId: 11, evolvesTo: [], evolvesFrom: [10] },
  { characterId: 12, evolvesTo: [], evolvesFrom: [10] },
];

function create() {
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
  const component = new CharacterBoxesEvolutionMaterialsComponent(repository as never);

  return { component, repository };
}

async function settled(component: CharacterBoxesEvolutionMaterialsComponent): Promise<void> {
  await vi.waitFor(() => expect(component.loading()).toBe(false));
}

describe('box evolution materials card', () => {
  it('walks on from the box to each final form, and lists a choice apart', async () => {
    const { component, repository } = create();

    component.characterIds = [1, 10, 3];
    await settled(component);

    // The box's units, then the later forms not read yet: one query per level.
    expect(repository.getCharacterEvolutionsByIds.mock.calls.map(([ids]) => ids)).toEqual([
      [1, 3, 10],
      [2, 11, 12],
    ]);
    // 1 is skipped: its later form 3 is in the box. 3 is final. 10 has a choice.
    expect(component.result()).toEqual({
      boxSize: 3,
      materials: [],
      evolve: [],
      choice: [{ characterId: 10, name: 'Unit 10', finalNames: ['Unit 11', 'Unit 12'] }],
      finalCount: 1,
      laterOwnedCount: 1,
    });

    component.characterIds = [1];
    await settled(component);

    expect(component.result()).toEqual({
      boxSize: 1,
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
      evolve: [{ characterId: 1, name: 'Unit 1', finalName: 'Unit 3', steps: 2 }],
      choice: [],
      finalCount: 0,
      laterOwnedCount: 0,
    });
  });

  it('keeps the last totals while a changed box is read', async () => {
    const { component, repository } = create();
    let release!: () => void;
    const held = new Promise<void>((done) => (release = done));

    component.characterIds = [1];
    await settled(component);
    repository.getCharacterEvolutionsByIds.mockImplementationOnce(async (ids: number[]) => {
      await held;

      return LINKS.filter((entry) => ids.includes(entry.characterId));
    });
    component.characterIds = [1, 10];

    // 10 has no links yet: it must not show up as an already final unit meanwhile.
    expect(component.loading()).toBe(true);
    expect(component.result()).toMatchObject({ boxSize: 1, finalCount: 0, choice: [] });

    release();
    await settled(component);

    expect(component.result()).toMatchObject({ boxSize: 2, finalCount: 0 });
    expect(component.result()?.choice).toHaveLength(1);
  });

  it('says an empty box is empty', async () => {
    const { component, repository } = create();

    component.characterIds = [5];
    await settled(component);
    component.characterIds = [];
    await settled(component);

    expect(component.result()?.boxSize).toBe(0);
    expect(repository.getCharacterEvolutionsByIds).toHaveBeenCalledTimes(1);
  });

  it('does not read again when the box holds the same units', async () => {
    const { component, repository } = create();

    component.characterIds = [1, 3];
    await settled(component);
    component.characterIds = [3, 1, 1];

    expect(repository.getCharacterEvolutionsByIds).toHaveBeenCalledTimes(2);
  });

  it('says the evolutions could not be read', async () => {
    const { component, repository } = create();

    repository.getCharacterEvolutionsByIds.mockRejectedValue(new Error('db'));
    component.characterIds = [1];
    await settled(component);

    expect(component.failed()).toBe(true);
  });

  it('drops a load that a newer box replaced', async () => {
    const { component, repository } = create();
    let release!: () => void;
    const held = new Promise<void>((done) => (release = done));

    repository.getCharacterEvolutionsByIds.mockImplementationOnce(async () => {
      await held;
      throw new Error('stale');
    });

    component.characterIds = [10];
    component.characterIds = [1];
    await settled(component);
    release();
    await new Promise((done) => setTimeout(done, 0));

    expect(component.failed()).toBe(false);
    expect(component.result()?.evolve).toHaveLength(1);
  });
});
