import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterBox, type CharacterDetailRecord } from '../../core/models/optc.models';
import {
  CharacterSupportFinderComponent,
  SUPPORT_FINDER_LIST_LIMIT,
} from './character-support-finder.component';

vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));

/*
 * 869f63gy0. The support finder card: it loads the catalogue only when asked, says so when it
 * cannot, narrows to a box, and shows a long list whole on request.
 */

function record(id: number, supports: string[] = []): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
    type: 'STR',
    classes: ['Fighter'],
    cost: 30,
    families: [`Unit ${id}`],
    detail: {
      characterTags: [],
      supportData: supports.map((sentence) => ({
        supportedCharactersText: sentence,
        levelDescriptions: [],
      })),
    },
  } as unknown as CharacterDetailRecord;
}

function create(getDetailedCharacterCatalog: () => Promise<CharacterDetailRecord[]>) {
  const boxes = signal<CharacterBox[]>([]);
  const repository = { getDetailedCharacterCatalog: vi.fn(getDetailedCharacterCatalog) };
  const userState = { characterBoxes: boxes, readyCharacterBoxes: vi.fn(async () => undefined) };
  const component = new CharacterSupportFinderComponent(repository as never, userState as never);

  component.character = ON_SCREEN;

  return { component, repository, boxes };
}

const ON_SCREEN = record(1);
const CATALOG = [
  ON_SCREEN,
  ...Array.from({ length: SUPPORT_FINDER_LIST_LIMIT + 5 }, (_, index) =>
    record(index + 2, ['All characters']),
  ),
];

describe('support finder card', () => {
  it('reads nothing until the reader opens it, and reads the catalogue once', async () => {
    const { component, repository } = create(async () => CATALOG);

    expect(component.result()).toBeNull();
    expect(repository.getDetailedCharacterCatalog).not.toHaveBeenCalled();

    await component.open();
    await component.open();

    expect(repository.getDetailedCharacterCatalog).toHaveBeenCalledTimes(1);
  });

  it('says when the catalogue fails, and tries again on request', async () => {
    let fail = true;
    const { component } = create(async () => {
      if (fail) {
        throw new Error('offline');
      }

      return CATALOG;
    });

    await component.open();
    expect(component.failed()).toBe(true);

    fail = false;
    await component.open();
    expect(component.failed()).toBe(false);
    expect(component.catalog()).toHaveLength(CATALOG.length);
  });

  it('narrows to the chosen box and shows a long list whole on request', async () => {
    const { component, boxes } = create(async () => CATALOG);

    boxes.set([{ id: 'b', name: 'Box', characterIds: [2, 3], createdAt: '', updatedAt: '' }]);
    await component.open();

    const all = component.result()!.receives.yes;

    expect(all).toHaveLength(SUPPORT_FINDER_LIST_LIMIT + 5);
    expect(component.shown('receives-yes', all)).toHaveLength(SUPPORT_FINDER_LIST_LIMIT);
    expect(component.hiddenCount('receives-yes', all)).toBe(5);

    component.showAll('receives-yes');
    expect(component.shown('receives-yes', all)).toHaveLength(all.length);
    expect(component.hiddenCount('receives-yes', all)).toBe(0);

    component.onBoxChange({ target: { value: 'b' } } as unknown as Event);
    expect(component.result()!.receives.yes.map((unit) => unit.id)).toEqual([2, 3]);

    component.onBoxChange({ target: { value: 'all' } } as unknown as Event);
    expect(component.selectedBoxId()).toBeNull();
  });
});
