import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterDetail, type CharacterDetailRecord } from '../../core/models/optc.models';
import { ManualTeamBuilderPage } from './manual-team-builder.page';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f6td4p. The Manual Team Builder put a Support-only character in any seat it was dropped on.
 * Every seat refuses one now - Captain and Friend Captain too, since it has no Captain Ability -
 * and each refusal says why. It stays in the candidate list, and a saved team that already holds
 * one is named in the validation panel rather than emptied.
 */

const SUPPORT = [{ supportedCharactersText: 'Blade', levelDescriptions: ['Reduces Poison.'] }];
const BIBLO = createRecord(4645, 'Biblo', { supportData: SUPPORT });
const LUFFY = createRecord(1, 'Monkey D. Luffy', {
  captainAbility: 'Boosts ATK of all characters by 2x',
  specialText: 'Deals 5x damage',
});

function createPage(): ManualTeamBuilderPage {
  const page = new ManualTeamBuilderPage(
    { favoriteShipIds: signal<number[]>([]) } as never,
    {} as never,
    {
      translate: (key: string, parameters?: Record<string, unknown>) =>
        [key, ...Object.values(parameters ?? {})].join('|'),
    } as never,
    {} as never,
    {} as never,
  );

  page.candidates.set([BIBLO, LUFFY]);

  return page;
}

describe('Manual Team Builder - a Support-only character', () => {
  it('keeps its card in the list, refused for every seat with the reason', () => {
    const page = createPage();

    for (const seat of [0, 1, 2, 5]) {
      page.selectedSlotIndex.set(seat);

      const [biblo, luffy] = page.candidateCards();

      expect(biblo?.character.id).toBe(BIBLO.id);
      expect(biblo?.supportOnly).toBe(true);
      expect(biblo?.isAssignableToActiveSlot).toBe(false);
      expect(biblo?.supportLabel).toBe('picker.supportOnly');
      // The control: the card beside it is still assignable to the same seat.
      expect(luffy?.isAssignableToActiveSlot).toBe(true);
      expect(luffy?.supportLabel).toBeNull();
    }
  });

  it('refuses the assignment, the Captain seat included, and says why', () => {
    const page = createPage();

    page.selectedSlotIndex.set(0);
    page.assignCharacter(BIBLO);

    expect(page.slots()[0]).toBeNull();
    expect(page.dragFeedbackMessage()).toBe('drag.invalidSupportOnly|Biblo');

    page.assignCharacter(LUFFY);

    expect(page.slots()[0]?.id).toBe(LUFFY.id);
  });

  it('refuses a drop on any seat, marks the seat while it is dragged over, and says why', () => {
    const page = createPage();
    const drag = { preventDefault: () => undefined } as DragEvent;

    for (const seat of [1, 3]) {
      page.dragState.set({ characterId: BIBLO.id, sourceSlotIndex: null });
      page.onSlotDragOver(drag, seat);

      expect(page.invalidDropSlotIndex()).toBe(seat);

      page.onSlotDrop(drag, seat);

      expect(page.slots()[seat]).toBeNull();
      expect(page.dragFeedbackMessage()).toBe('drag.invalidSupportOnly|Biblo');
    }

    // The control: the same drag over the same seat is accepted for an ordinary unit.
    page.dragState.set({ characterId: LUFFY.id, sourceSlotIndex: null });
    page.onSlotDragOver(drag, 3);

    expect(page.invalidDropSlotIndex()).toBeNull();
  });

  it('names the seat of a team saved before the rule, and keeps the team as it is', () => {
    const page = createPage();

    page.slots.set([LUFFY, null, BIBLO, null, null, null]);

    const message = page.validationMessages().find((entry) => entry.key === 'supportOnly');

    expect(message?.copy).toBe('validation.supportOnly.copy|condition.slotLabel|3');
    expect(message?.tone).toBe('error');
    expect(page.slots()[2]?.id).toBe(BIBLO.id);

    // The control: the same team without the Support-only character raises nothing.
    page.slots.set([LUFFY, null, null, null, null, null]);

    expect(page.validationMessages().some((entry) => entry.key === 'supportOnly')).toBe(false);
  });
});

function createRecord(
  id: number,
  name: string,
  detail: Partial<CharacterDetail>,
): CharacterDetailRecord {
  return {
    id,
    name,
    searchText: name.toLowerCase(),
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 5,
    cost: 1,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: null,
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
      rumbleData: null,
      ...detail,
    },
  } satisfies CharacterDetailRecord;
}
