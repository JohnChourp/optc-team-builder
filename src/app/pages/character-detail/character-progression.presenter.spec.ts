import { describe, expect, it } from 'vitest';

import { type CharacterProgression } from '../../core/models/optc.models';
import {
  buildDropSourceCard,
  buildEvolutionCard,
  buildInvestmentCard,
  buildProgressionCards,
  collectProgressionCharacterIds,
  summarizeDropSources,
  summarizeMaterials,
} from './character-progression.presenter';

/*
 * 869f1935z. The rule this surface exists to honour is that an ABSENT drop source is a silence,
 * not a negative - `drops.js` covers 1,620 of 4,618 characters and the rest are overwhelmingly
 * sugo-only, not unobtainable. Several tests below exist only to pin that.
 */

function progression(overrides: Partial<CharacterProgression> = {}): CharacterProgression {
  return {
    characterId: 1,
    maxSockets: null,
    specialCooldownMax: null,
    specialCooldownMin: null,
    evolvesTo: [],
    evolvesFrom: [],
    dropSources: [],
    ...overrides,
  };
}

const resolveName = (characterId: number): string | null =>
  ({ 1: 'Luffy', 2: 'Luffy - Pistol', 78: 'Red Skull', 115: 'Rainbow Turtle' })[characterId] ?? null;

describe('buildInvestmentCard', () => {
  it('shows zero socket slots, because zero is an answer', () => {
    /*
     * 239 units genuinely have no socket slot. A falsiness check would hide exactly the fact a
     * player needs before spending a socket book on the wrong unit.
     */
    const card = buildInvestmentCard(progression({ maxSockets: 0 }));

    expect(card?.rows).toEqual([{ labelKey: 'progression.socketSlots', value: '0' }]);
  });

  it('shows the cooldown as a range', () => {
    const card = buildInvestmentCard(
      progression({ specialCooldownMax: 12, specialCooldownMin: 9 }),
    );

    expect(card?.rows[0]).toEqual({
      labelKey: 'progression.specialCooldown',
      value: '12 → 9',
    });
  });

  it('shows a single number when the special never speeds up', () => {
    const card = buildInvestmentCard(progression({ specialCooldownMax: 5, specialCooldownMin: 5 }));

    expect(card?.rows[0]?.value).toBe('5');
  });

  it('is omitted entirely when nothing is known', () => {
    expect(buildInvestmentCard(progression())).toBeNull();
  });
});

describe('buildEvolutionCard', () => {
  it('leads with where it came from, which is the direction a player asks in', () => {
    const card = buildEvolutionCard(progression({ evolvesFrom: [1] }), resolveName);

    expect(card?.lists[0]).toEqual({ labelKey: 'progression.evolvesFrom', items: ['Luffy'] });
  });

  it('lists the target first and then what it costs', () => {
    const card = buildEvolutionCard(
      progression({
        evolvesTo: [
          {
            toId: 2,
            materials: [
              { characterId: 78, token: null },
              { characterId: 115, token: null },
            ],
          },
        ],
      }),
      resolveName,
    );

    expect(card?.lists[0]?.items).toEqual(['Luffy - Pistol', 'Red Skull', 'Rainbow Turtle']);
  });

  it('collapses repeated materials, because five ink lines say one thing', () => {
    /*
     * Seen live on 3878, which renders `ink ink ink ink ink` without this. Counting them is the
     * work this surface exists to remove.
     */
    const card = buildEvolutionCard(
      progression({
        evolvesTo: [
          {
            toId: 2,
            materials: [
              { characterId: null, token: 'ink' },
              { characterId: null, token: 'ink' },
              { characterId: null, token: 'ink' },
            ],
          },
        ],
      }),
      resolveName,
    );

    expect(card?.lists[0]?.items).toEqual(['Luffy - Pistol', 'ink \u00d73']);
  });

  it('renders a non-character material by its token', () => {
    // `"ink"` and the skulls are farmed. Dropping them makes an evolution read as free.
    const card = buildEvolutionCard(
      progression({
        evolvesTo: [{ toId: 2, materials: [{ characterId: null, token: 'skullQCK' }] }],
      }),
      resolveName,
    );

    expect(card?.lists[0]?.items).toEqual(['Luffy - Pistol', 'skullQCK']);
  });

  it('keeps a branch whose evolution needs no material', () => {
    const card = buildEvolutionCard(
      progression({ evolvesTo: [{ toId: 2, materials: [] }] }),
      resolveName,
    );

    expect(card?.lists[0]?.items).toEqual(['Luffy - Pistol']);
  });

  it('falls back to the id when a name cannot be resolved, rather than dropping the entry', () => {
    const card = buildEvolutionCard(progression({ evolvesFrom: [4242] }), resolveName);

    expect(card?.lists[0]?.items).toEqual(['#4242']);
  });
});

describe('summarizeDropSources', () => {
  it('collapses several slots of one stage into one line', () => {
    /*
     * A character commonly drops from slots 1, 2 and 3 of the same stage. Listing each turns three
     * useful stages into fifteen indistinguishable lines.
     */
    const lines = summarizeDropSources([
      { group: 'Story Island', stage: 'Fushia Village', dropId: 'story1', slot: '1', global: true },
      { group: 'Story Island', stage: 'Fushia Village', dropId: 'story1', slot: '2', global: true },
      { group: 'Story Island', stage: 'Fushia Village', dropId: 'story1', slot: '3', global: true },
    ]);

    expect(lines).toEqual(['Fushia Village (Story Island)']);
  });

  it('marks a stage that is not on global', () => {
    const lines = summarizeDropSources([
      { group: 'Raid', stage: 'Mihawk', dropId: 'raid1', slot: '1', global: false },
    ]);

    expect(lines).toEqual(['Mihawk (Raid, JP only)']);
  });

  it('treats a stage as global when any of its slots is', () => {
    const lines = summarizeDropSources([
      { group: 'Raid', stage: 'Mihawk', dropId: 'raid1', slot: '1', global: false },
      { group: 'Raid', stage: 'Mihawk', dropId: 'raid1', slot: '2', global: true },
    ]);

    expect(lines).toEqual(['Mihawk (Raid)']);
  });

  it('falls back to the drop id when a stage has no name', () => {
    const lines = summarizeDropSources([
      { group: 'Special', stage: '', dropId: 'special42', slot: '1', global: true },
    ]);

    expect(lines).toEqual(['special42 (Special)']);
  });

  it('does not merge two stages whose names contain a separator character', () => {
    // The key is a JSON pair, not a joined string, because stage names are free upstream text.
    const lines = summarizeDropSources([
      { group: 'A|B', stage: 'C', dropId: '1', slot: '1', global: true },
      { group: 'A', stage: 'B|C', dropId: '2', slot: '1', global: true },
    ]);

    expect(lines).toHaveLength(2);
  });
});

describe('buildDropSourceCard', () => {
  it('renders NOTHING when no source is recorded, rather than claiming it is not farmable', () => {
    /*
     * The whole rule. Most characters have no `drops.js` entry and are sugo-only, not
     * unobtainable - so the absence must stay silent.
     */
    expect(buildDropSourceCard(progression())).toBeNull();
  });

  it('renders the stages when sources exist', () => {
    const card = buildDropSourceCard(
      progression({
        dropSources: [
          { group: 'Coliseum', stage: 'Doflamingo', dropId: 'col1', slot: '5', global: true },
        ],
      }),
    );

    expect(card?.lists[0]?.items).toEqual(['Doflamingo (Coliseum)']);
  });
});

describe('collectProgressionCharacterIds', () => {
  it('collects every id the cards will need a name for, once', () => {
    const ids = collectProgressionCharacterIds(
      progression({
        evolvesFrom: [1],
        evolvesTo: [
          { toId: 2, materials: [{ characterId: 1, token: null }] },
          { toId: 3, materials: [{ characterId: null, token: 'ink' }] },
        ],
      }),
    );

    expect(ids.sort((left, right) => left - right)).toEqual([1, 2, 3]);
  });
});

describe('buildProgressionCards', () => {
  it('returns nothing for a character the upstream graph never mentions', () => {
    expect(buildProgressionCards(progression(), resolveName)).toEqual([]);
  });

  it('returns nothing at all when there is no progression row', () => {
    expect(buildProgressionCards(null, resolveName)).toEqual([]);
  });

  it('orders the cards investment, evolution, drops', () => {
    const cards = buildProgressionCards(
      progression({
        maxSockets: 4,
        evolvesFrom: [1],
        dropSources: [{ group: 'Raid', stage: 'X', dropId: 'x', slot: '1', global: true }],
      }),
      resolveName,
    );

    expect(cards.map((card) => card.titleKey)).toEqual([
      'sections.investment',
      'sections.evolution',
      'sections.dropSources',
    ]);
  });
});

describe('summarizeMaterials', () => {
  it('keeps a single material as-is', () => {
    expect(summarizeMaterials(['Red Skull'])).toEqual(['Red Skull']);
  });

  it('counts repeats and preserves first-appearance order', () => {
    expect(summarizeMaterials(['ink', 'Red Skull', 'ink', 'ink'])).toEqual([
      'ink \u00d73',
      'Red Skull',
    ]);
  });
});
