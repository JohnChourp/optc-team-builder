import '@angular/compiler';
import { signal } from '@angular/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { type AutoBuildAbilityCatalogItem } from '../../core/models/auto-team-builder-ability.models';
import { type SavedEnemy, type SavedTeam } from '../../core/models/optc.models';

/*
 * 869f6td1y. The editor lists a saved enemy's requirements in the one order the loader and the
 * battle fallback use: its own first, then the ones its mechanics imply. It reaches that order
 * through its own call to `appendAbilityRequirementsFromEnemyMechanics` in `openEditModal`, which
 * the page's suite never pinned - reversing that call alone left every test green. This pins it
 * through the real page.
 *
 * Its own file, with the page's harness preamble copied rather than shared, so it never touches
 * `saved-enemies.page.spec.ts`.
 */

type SavedEnemiesPageClass = typeof import('./saved-enemies.page').SavedEnemiesPage;
let SavedEnemiesPage: SavedEnemiesPageClass;

vi.mock('@ionic/angular', () => ({
  IonCheckbox: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({
  IonButton: class {},
}));
vi.mock('@ionic/angular/ion-buttons', () => ({
  IonButtons: class {},
}));
vi.mock('@ionic/angular/ion-content', () => ({
  IonContent: class {},
}));
vi.mock('@ionic/angular/ion-footer', () => ({
  IonFooter: class {},
}));
vi.mock('@ionic/angular/ion-header', () => ({
  IonHeader: class {},
}));
vi.mock('@ionic/angular/ion-menu-button', () => ({
  IonMenuButton: class {},
}));
vi.mock('@ionic/angular/ion-select-option', () => ({
  IonSelectOption: class {},
}));
vi.mock('@ionic/angular/ion-spinner', () => ({
  IonSpinner: class {},
}));
vi.mock('@ionic/angular/ion-title', () => ({
  IonTitle: class {},
}));
vi.mock('@ionic/angular/ion-toolbar', () => ({
  IonToolbar: class {},
}));

function specialAbility(key: string): AutoBuildAbilityCatalogItem {
  return {
    key,
    label: key,
    category: 'special',
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 1,
    sampleCharacterIds: [],
    sampleTexts: [],
  };
}

function createPage() {
  const userState = {
    savedEnemies: signal<SavedEnemy[]>([]),
    savedTeams: signal<SavedTeam[]>([]),
  };
  const page = new SavedEnemiesPage(userState as never, {} as never, {} as never);

  page.abilityCatalog.set({
    generatedAt: '2026-04-20T10:00:00.000Z',
    sourceVersion: 'test',
    abilityCount: 2,
    abilities: [specialAbility('remove_bind'), specialAbility('remove_enemy_barrier')],
  });

  return page;
}

describe('Saved Enemies editor requirement order (869f6td1y)', () => {
  beforeAll(async () => {
    SavedEnemiesPage = (await import('./saved-enemies.page')).SavedEnemiesPage;
  });

  it("lists the enemy's own ability before the one its mechanic implies, in the drafts and the battle", () => {
    const page = createPage();

    // No stored groups or battles: the editor derives both from the ability and the mechanic.
    page.openEditModal({
      id: 'enemy-1',
      name: 'Barrier boss',
      notes: '',
      rawEnemyText: '',
      imageDataUrl: null,
      selectedTypes: [],
      selectedClasses: [],
      requiredAbilities: [
        { abilityKey: 'remove_bind', minTurns: null, slotTokens: [], requiredCharacterCount: 1 },
      ],
      enemyMechanics: [
        {
          mechanicKey: 'enemy_barrier',
          category: 'enemyDefense',
          minTurns: null,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_enemy_barrier',
        },
      ],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:00:00.000Z',
    });

    expect(page.requiredAbilityDrafts().map((draft) => draft.abilityKey)).toEqual([
      'remove_bind',
      'remove_enemy_barrier',
    ]);
    expect(
      page
        .battleRequirements()
        .map((battle) =>
          battle.requiredCharacterGroups.map((group) =>
            group.abilities.map((ability) => ability.abilityKey).join('+'),
          ),
        ),
    ).toEqual([['remove_bind', 'remove_enemy_barrier']]);
  });
});
