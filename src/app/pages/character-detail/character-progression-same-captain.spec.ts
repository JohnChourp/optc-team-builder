import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type CharacterDetailRecord,
  type CharacterProgression,
} from '../../core/models/optc.models';
import { CharacterDetailPage } from './character-detail.page';
import {
  buildEvolutionCard,
  resolveCheaperSameCaptainAbilityForms,
  type CaptainAbilityForm,
} from './character-progression.presenter';

vi.mock('@ionic/angular', () => ({ IonIcon: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gn4. On the Character screen's evolution chain, an earlier form that keeps the IDENTICAL
 * Captain Ability at a lower cost says "Same Captain Ability · cost N" - the unevolved Legend guides
 * tell players to lead with under a cost cap. Identical means the text and every variant after the
 * app's HTML normalisation; similar is never enough.
 */

const WHITEBEARD_TEXT =
  'Boosts ATK of all characters by 3x if HP is below 30% at the start of the turn';

function form(
  id: number,
  cost: number,
  captainAbility: string | null,
  variantTexts: string[] = captainAbility ? [captainAbility] : [],
): CaptainAbilityForm {
  return {
    id,
    cost,
    detail: {
      captainAbility,
      captainAbilityVariants: variantTexts.map((text) => ({
        key: 'captain',
        label: 'Captain Ability',
        text,
      })),
    },
  };
}

describe('resolveCheaperSameCaptainAbilityForms', () => {
  it('marks an earlier form with the identical Captain Ability and a lower cost, with its cost', () => {
    const evolved = form(261, 55, WHITEBEARD_TEXT);

    expect([
      ...resolveCheaperSameCaptainAbilityForms(evolved, [form(260, 40, WHITEBEARD_TEXT)]),
    ]).toEqual([[260, 40]]);
  });

  it('marks nothing at the same or a higher cost - there is nothing to save', () => {
    const evolved = form(261, 55, WHITEBEARD_TEXT);

    expect(
      resolveCheaperSameCaptainAbilityForms(evolved, [form(260, 55, WHITEBEARD_TEXT)]).size,
    ).toBe(0);
    expect(
      resolveCheaperSameCaptainAbilityForms(evolved, [form(260, 60, WHITEBEARD_TEXT)]).size,
    ).toBe(0);
  });

  it('never marks a similar Captain Ability, in the text or in any variant', () => {
    const evolved = form(261, 55, WHITEBEARD_TEXT);
    const oneNumberApart = WHITEBEARD_TEXT.replace('3x', '2.75x');

    expect(
      resolveCheaperSameCaptainAbilityForms(evolved, [form(260, 40, oneNumberApart)]).size,
    ).toBe(0);
    expect(
      resolveCheaperSameCaptainAbilityForms(evolved, [
        form(260, 40, WHITEBEARD_TEXT, [WHITEBEARD_TEXT, 'Boosts ATK of all characters by 2x']),
      ]).size,
    ).toBe(0);
  });

  it('compares after the HTML normalisation the app reads captain text through', () => {
    const evolved = form(261, 55, 'Boosts ATK &amp; HP of all characters by 2x');
    const earlier = form(260, 40, 'Boosts ATK & HP of all  characters by 2x ');

    expect(resolveCheaperSameCaptainAbilityForms(evolved, [earlier]).get(260)).toBe(40);
  });

  it('marks nothing for a character with no Captain Ability', () => {
    expect(resolveCheaperSameCaptainAbilityForms(form(2, 5, null), [form(1, 1, null)]).size).toBe(
      0,
    );
  });
});

describe('buildEvolutionCard - the note on an earlier form', () => {
  const progression: CharacterProgression = {
    characterId: 261,
    maxSockets: null,
    specialCooldownMax: null,
    specialCooldownMin: null,
    evolvesTo: [],
    evolvesFrom: [259, 260],
    dropSources: [],
  };
  const names = new Map([
    [259, 'Someone Else'],
    [260, 'Edward Newgate'],
  ]);

  it('puts the cost beside the one earlier form that qualifies, and nothing beside the other', () => {
    const card = buildEvolutionCard(
      progression,
      (characterId) => names.get(characterId) ?? null,
      new Map([[260, 40]]),
    );
    const evolvesFrom = card?.lists.find((list) => list.labelKey === 'progression.evolvesFrom');

    expect(evolvesFrom?.items).toEqual(['Someone Else', 'Edward Newgate']);
    expect(evolvesFrom?.notes).toEqual([
      null,
      { key: 'progression.sameCaptainAbility', params: { cost: 40 } },
    ]);
  });

  it('adds no notes at all when no earlier form qualifies', () => {
    const card = buildEvolutionCard(progression, (characterId) => names.get(characterId) ?? null);

    expect(card?.lists[0]).not.toHaveProperty('notes');
  });
});

describe('the Character screen', () => {
  it("fetches the earlier forms' details in the one query it already made, and marks them", async () => {
    const progression: CharacterProgression = {
      characterId: 261,
      maxSockets: 5,
      specialCooldownMax: null,
      specialCooldownMin: null,
      evolvesTo: [],
      evolvesFrom: [260],
      dropSources: [],
    };
    const repository = {
      getCharacterProgression: vi.fn(async () => progression),
      getDetailedCharactersByIds: vi.fn(async (ids: number[]) =>
        ids.map((id) => ({ ...form(id, 40, WHITEBEARD_TEXT), name: 'Edward Newgate' })),
      ),
      getCharactersByIds: vi.fn(),
    };
    const page = new CharacterDetailPage(
      {} as never,
      repository as never,
      { favoriteCharacterIds: signal<number[]>([]) } as never,
      {} as never,
      { translate: (key: string) => key } as never,
    );

    await (
      page as unknown as { loadProgression(character: CharacterDetailRecord): Promise<void> }
    ).loadProgression(form(261, 55, WHITEBEARD_TEXT) as unknown as CharacterDetailRecord);

    const evolvesFrom = page
      .progressionCards()
      .flatMap((card) => card.lists)
      .find((list) => list.labelKey === 'progression.evolvesFrom');

    expect(repository.getDetailedCharactersByIds).toHaveBeenCalledTimes(1);
    expect(repository.getCharactersByIds).not.toHaveBeenCalled();
    expect(evolvesFrom?.items).toEqual(['Edward Newgate']);
    expect(evolvesFrom?.notes?.[0]).toEqual({
      key: 'progression.sameCaptainAbility',
      params: { cost: 40 },
    });
  });

  it('shows the note in both languages, with the cost', () => {
    for (const language of ['en', 'el']) {
      const copy = JSON.parse(
        readFileSync(
          resolve(process.cwd(), `public/i18n/character-detail/${language}.json`),
          'utf8',
        ),
      ) as { progression: Record<string, string> };

      expect(copy.progression['sameCaptainAbility']).toMatch(
        /Captain Ability · cost \{\{cost\}\}/u,
      );
    }

    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/character-detail/character-detail.page.html'),
      'utf8',
    );

    expect(template).toMatch(
      /@if \(list\.notes\?\.\[\$index\]; as note\) \{\s*<small[^>]*>\s*\{\{ t\(note\.key, note\.params\) \}\}/u,
    );
  });
});

describe('over the shipped seed', () => {
  it("marks Whitebeard's cost-40 form on the cost-55 Whitebeard's chain", () => {
    const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
    const forms = new Map([260, 261].map((id) => [id, readSeedForm(seed, id)]));
    const evolvesFrom = readSeedEvolvesFrom(seed, 261);

    expect(evolvesFrom).toContain(260);
    expect(
      resolveCheaperSameCaptainAbilityForms(
        forms.get(261)!,
        evolvesFrom.map((id) => forms.get(id)).filter((entry) => entry !== undefined),
      ).get(260),
    ).toBe(40);
  });
});

/** One character's cost and Captain Ability, read from the committed seed. */
function readSeedForm(seed: string, id: number): CaptainAbilityForm {
  const detail = seed.match(
    new RegExp(
      `INSERT INTO character_details \\(character_id, detail_json\\)\\s*VALUES \\(${id}, '((?:[^']|'')*)'\\);`,
      'u',
    ),
  );
  const row = seed.match(
    new RegExp(
      `INSERT INTO characters \\(([^)]*)\\) VALUES \\(\\n\\s*${id},\\n([\\s\\S]*?)\\n\\s*\\);`,
      'u',
    ),
  );

  if (!detail || !row) {
    throw new Error(`The shipped seed has no character ${id}.`);
  }

  const columns = row[1]!.split(',').map((column) => column.trim());
  const values = [String(id), ...row[2]!.split('\n').map((line) => line.trim().replace(/,$/u, ''))];

  return {
    id,
    cost: Number(values[columns.indexOf('cost')]),
    detail: JSON.parse(detail[1]!.replace(/''/gu, "'")),
  };
}

function readSeedEvolvesFrom(seed: string, id: number): number[] {
  const row = seed.match(
    new RegExp(
      `INSERT INTO character_evolutions \\(character_id, evolves_to_json, evolves_from_json\\)\\s*VALUES \\(\\s*${id},\\s*'(?:[^']|'')*',\\s*'((?:[^']|'')*)'\\s*\\);`,
      'u',
    ),
  );

  return row ? (JSON.parse(row[1]!) as number[]) : [];
}
