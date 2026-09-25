import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type CharacterDetail,
  type CharacterDetailRecord,
  type CharacterListItem,
} from '../../core/models/optc.models';
import { createCaptainCoverageFilterState } from '../../core/services/captain-coverage-filter.utils';
import { CaptainCoveragePage } from './captain-coverage.page';

vi.mock('@ionic/angular', () => ({
  AlertController: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-progress-bar', () => ({ IonProgressBar: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f6td4p. On Captain Coverage a Support-only character already had no crown - it has no Captain
 * Ability - but its "Add to team" button put it in a sub slot. The card keeps its place in the
 * result list and the button says why it is refused; a saved team that already holds one is marked
 * on its slot, never emptied.
 */

const SUPPORT = [{ supportedCharactersText: 'Blade', levelDescriptions: ['Reduces Poison.'] }];
const BIBLO = createRecord(4645, 'Biblo', { supportData: SUPPORT });
const LUFFY = createRecord(1, 'Monkey D. Luffy', {
  captainAbility: 'Boosts ATK of all characters by 2x',
  specialText: 'Deals 5x damage',
});

function translate(key: string, parameters?: Record<string, unknown>): string {
  return [key, ...Object.values(parameters ?? {})].join('|');
}

interface CardView {
  character: CharacterListItem;
  assignableSlotIndex: number | null;
  subSlotBlockedReason: string | null;
  canBeLeader: boolean;
}

interface PageProbe {
  hydrateResultCards(ids: readonly number[]): CardView[];
  addToTeamBlockedLabel(card: CardView): string;
  setTeamSlotCharacter(index: number, character: CharacterListItem): Promise<void>;
  assignCharacterFromResult(card: CardView): void;
  isSupportOnlyTeamCharacter(character: CharacterListItem | null): boolean;
  selectedTeamSlots: ReturnType<typeof signal<Array<CharacterListItem | null>>>;
}

function createPage(team: Array<CharacterListItem | null> = [null, null, null, null, null, null]) {
  const page = Object.create(CaptainCoveragePage.prototype) as CaptainCoveragePage;
  const records = [BIBLO, LUFFY];

  Object.assign(page, {
    i18n: { translate },
    selectedTeamSlots: signal(team),
    selectedCaptainDetail: () => null,
    selectedFriendCaptainDetail: () => null,
    allCharactersById: () => new Map(records.map((record) => [record.id, record])),
    allCharacterDetailsById: () => new Map(records.map((record) => [record.id, record])),
    captainCoverageFilterState: () => createCaptainCoverageFilterState(),
    selectedAbilityRequirements: () => [],
    captainAbilityRequirements: () => [],
    selectedAbilityRequirementCount: () => 0,
    // The page's own rule: only a character with a Captain Ability can lead.
    allowedCaptainIdSet: () => new Set([LUFFY.id]),
    allowedCaptainIds: () => [LUFFY.id],
    maxTotalCost: () => null,
    visibleResultCount: () => 0,
    clearSavedTeamDraftState: () => undefined,
    persistTeamDraft: () => undefined,
    keepPagePositionAfterTeamChange: () => undefined,
  });

  return page as unknown as PageProbe;
}

describe('Captain Coverage - a Support-only character', () => {
  it('keeps its card and loses the sub button, with the reason, and no crown', () => {
    const page = createPage();
    const [biblo, luffy] = page.hydrateResultCards([BIBLO.id, LUFFY.id]);

    expect(biblo?.character.id).toBe(BIBLO.id);
    expect(biblo?.assignableSlotIndex).toBeNull();
    expect(biblo?.subSlotBlockedReason).toBe('supportOnly');
    expect(biblo?.canBeLeader).toBe(false);
    expect(page.addToTeamBlockedLabel(biblo!)).toBe('captain-coverage.team.actions.supportOnly');
    // The control: the same card builder hands an ordinary unit a sub slot.
    expect(luffy?.assignableSlotIndex).toBe(2);
    expect(luffy?.subSlotBlockedReason).toBeNull();
  });

  it('is refused by the single write path, whichever seat is asked', async () => {
    const page = createPage();

    for (const index of [0, 1, 2, 5]) {
      await page.setTeamSlotCharacter(index, BIBLO);
    }

    page.assignCharacterFromResult({
      character: BIBLO,
      assignableSlotIndex: 3,
      subSlotBlockedReason: null,
      canBeLeader: false,
    });

    expect(page.selectedTeamSlots()).toEqual([null, null, null, null, null, null]);

    // The control: the same write path fills a seat with an ordinary unit.
    await page.setTeamSlotCharacter(2, LUFFY);

    expect(page.selectedTeamSlots()[2]?.id).toBe(LUFFY.id);
  });

  it('is marked on the seat of a team saved before the rule, and kept there', () => {
    const page = createPage([LUFFY, null, BIBLO, null, null, null]);

    expect(page.isSupportOnlyTeamCharacter(page.selectedTeamSlots()[2] ?? null)).toBe(true);
    expect(page.isSupportOnlyTeamCharacter(page.selectedTeamSlots()[0] ?? null)).toBe(false);
    expect(page.selectedTeamSlots()[2]?.id).toBe(BIBLO.id);

    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/captain-coverage/captain-coverage.page.html'),
      'utf8',
    );

    expect(template).toMatch(
      /@if \(isSupportOnlyTeamCharacter\(slot\)\) \{\s*<small[^>]*>\s*\{\{ t\('team\.slots\.supportOnly'\) \}\}/u,
    );
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
