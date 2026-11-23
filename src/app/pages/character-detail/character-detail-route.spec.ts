import '@angular/compiler';
import { signal } from '@angular/core';
import { convertToParamMap, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { CharacterDetailPage } from './character-detail.page';

vi.mock('@ionic/angular', () => ({ IonIcon: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gy0. The support finder links one character to another, and the router keeps the page
 * for /characters/1 -> /characters/2. The page follows the id in the address; before this it
 * read the id once and kept showing the first character under the second one's address.
 */

function record(id: number): CharacterDetailRecord {
  return {
    id,
    name: `Unit ${id}`,
    detail: { rumbleData: null },
  } as unknown as CharacterDetailRecord;
}

function createPage(params: BehaviorSubject<ParamMap>, delays: Record<number, number> = {}) {
  const repository = {
    getCharacterById: vi.fn(
      (id: number) =>
        new Promise<CharacterDetailRecord>((resolve) =>
          setTimeout(() => resolve(record(id)), delays[id] ?? 0),
        ),
    ),
    getCharacterProgression: vi.fn(async () => null),
    getAutoBuilderAbilityCatalog: vi.fn(async () => null),
    getDatasetManifest: vi.fn(async () => null),
  };
  const userState = {
    favoriteCharacterIds: signal<number[]>([]),
    readySavedTeams: vi.fn(async () => undefined),
    readyFavoriteCharacterIds: vi.fn(async () => undefined),
    readyGameRegionPreference: vi.fn(async () => undefined),
    markRecent: vi.fn(async () => undefined),
  };
  const page = new CharacterDetailPage(
    { paramMap: params } as never,
    repository as never,
    userState as never,
    {} as never,
    { translate: (key: string) => key } as never,
  );

  return { page, repository, userState };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

describe('character detail: the address decides the character', () => {
  it('opens the character of a new address on the same page', async () => {
    const params = new BehaviorSubject(convertToParamMap({ id: '2934' }));
    const { page } = createPage(params);

    page.ngOnInit();
    await settle();
    expect(page.character()?.id).toBe(2934);
    expect(page.loading()).toBe(false);

    params.next(convertToParamMap({ id: '1' }));
    await settle();
    expect(page.character()?.id).toBe(1);
    expect(page.loading()).toBe(false);

    page.ngOnDestroy();
  });

  it('never lets a slow earlier load overwrite a later address', async () => {
    const params = new BehaviorSubject(convertToParamMap({ id: '2934' }));
    const { page, userState } = createPage(params, { 2934: 20 });

    page.ngOnInit();
    params.next(convertToParamMap({ id: '1' }));
    await settle();

    expect(page.character()?.id).toBe(1);
    expect(page.loading()).toBe(false);
    // The abandoned load does not count as a visit either.
    expect(userState.markRecent.mock.calls).toEqual([[1]]);
  });

  it('shows no character for an address with no valid id', async () => {
    const params = new BehaviorSubject(convertToParamMap({ id: '2934' }));
    const { page } = createPage(params);

    page.ngOnInit();
    await settle();
    params.next(convertToParamMap({ id: 'not-a-number' }));
    await settle();

    expect(page.character()).toBeNull();
    expect(page.loading()).toBe(false);
  });

  it('stops following the address once the page is gone', async () => {
    const params = new BehaviorSubject(convertToParamMap({ id: '2934' }));
    const { page, repository } = createPage(params);

    page.ngOnInit();
    await settle();
    page.ngOnDestroy();
    params.next(convertToParamMap({ id: '1' }));
    await settle();

    expect(repository.getCharacterById).toHaveBeenCalledTimes(1);
    expect(page.character()?.id).toBe(2934);
  });
});
