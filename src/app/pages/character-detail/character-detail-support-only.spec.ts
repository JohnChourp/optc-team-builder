import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterDetail, type CharacterDetailRecord } from '../../core/models/optc.models';
import { CharacterDetailPage } from './character-detail.page';

vi.mock('@ionic/angular', () => ({ IonIcon: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

/*
 * 869f6td4p. The Character screen says when a character can only go in a Support slot - it is
 * where a reader looks a unit up, and the team screens that refuse one give the same reason.
 */

const SUPPORT = [{ supportedCharactersText: 'Blade', levelDescriptions: ['Reduces Poison.'] }];

function createPage(): CharacterDetailPage {
  return new CharacterDetailPage(
    {} as never,
    {} as never,
    { favoriteCharacterIds: signal<number[]>([]) } as never,
    {} as never,
    { translate: (key: string) => key } as never,
  );
}

describe('character detail: the Support-only note', () => {
  it('is shown for a Support-only character and for nobody else', () => {
    const page = createPage();

    page.character.set(createRecord(4645, 'Biblo', { supportData: SUPPORT }));
    expect(page.supportOnly()).toBe(true);

    // The two controls: support data with a Captain Ability, and no support data at all.
    page.character.set(
      createRecord(4, 'Monkey D. Luffy - Gear 2', {
        supportData: SUPPORT,
        captainAbility: 'Boosts ATK of Fighter characters by 2x',
      }),
    );
    expect(page.supportOnly()).toBe(false);

    page.character.set(createRecord(78, 'Red Robber Penguin', {}));
    expect(page.supportOnly()).toBe(false);
  });

  it('renders one line, only when it applies', () => {
    const template = read('src/app/pages/character-detail/character-detail.page.html');
    const at = template.indexOf('data-test="character-support-only"');

    expect(at).toBeGreaterThan(-1);
    expect(template.slice(0, at)).toMatch(/@if \(supportOnly\(\)\) \{\s*<p[^>]*$/u);
    expect(template.slice(at, template.indexOf('</p>', at))).toContain("t('hero.supportOnly')");
  });

  it.each(['en', 'el'])('has %s copy that names the Support slot', (language) => {
    const copy = JSON.parse(read(`public/i18n/character-detail/${language}.json`)) as {
      hero: Record<string, string>;
    };

    // "Support" is the game's own term and stays English in Greek too.
    expect(copy.hero['supportOnly']).toMatch(/Support slot/u);
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
