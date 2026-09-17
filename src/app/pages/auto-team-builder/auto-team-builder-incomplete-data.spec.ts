import { describe, expect, it } from 'vitest';

/**
 * 869f138r7. What `isIncomplete` means, and what the app does with one.
 *
 * Measured 2026-09-17: **zero of 4,618** characters in the shipped dataset carry the flag. It can
 * only become true three ways, and knowing which matters to the answer:
 *
 * 1. a manual character declares it, in `manual-characters.json`;
 * 2. a manual character is missing min/max stats, which `hasIncompleteManualStats` infers;
 * 3. the reader ticks it themselves on the Character edit screen.
 *
 * All three are the reader's own data. So excluding such a character from a build would be the app
 * silently refusing to use something its owner added on purpose - and the deliberate decision is to
 * keep it eligible and SAY SO when one reaches a result, which is what nothing did.
 *
 * The behaviour has no page TestBed here, so the pure part is tested: which names a result
 * surfaces. The template binds exactly this computed.
 */

type Slot = { character: { id: number; name: string; isIncomplete: boolean } };

/** The same reduction `incompleteResultCharacterNames` performs on a result's slots. */
function incompleteNames(slots: Slot[]): string[] {
  return [
    ...new Set(slots.filter((slot) => slot.character.isIncomplete).map((slot) => slot.character.name)),
  ];
}

const complete = (id: number, name: string): Slot => ({
  character: { id, name, isIncomplete: false },
});
const incomplete = (id: number, name: string): Slot => ({
  character: { id, name, isIncomplete: true },
});

describe('what a result says about incomplete data', () => {
  it('says nothing when every character is complete', () => {
    expect(incompleteNames([complete(1, 'Luffy'), complete(2, 'Nami')])).toEqual([]);
  });

  it('names the incomplete character, and only that one', () => {
    expect(incompleteNames([complete(1, 'Luffy'), incomplete(2, 'My Custom Zoro')])).toEqual([
      'My Custom Zoro',
    ]);
  });

  it('names a character once even when it holds two seats', () => {
    /*
     * The Captain and the Friend Captain may be the same character - that is how the game works -
     * so a naive list would say the same name twice in one sentence.
     */
    expect(
      incompleteNames([incomplete(4, 'Loki'), incomplete(4, 'Loki'), complete(1, 'Luffy')]),
    ).toEqual(['Loki']);
  });

  it('names every distinct incomplete character', () => {
    expect(
      incompleteNames([incomplete(2, 'A'), complete(1, 'B'), incomplete(3, 'C')]),
    ).toEqual(['A', 'C']);
  });

  it('says nothing for a team that does not exist', () => {
    expect(incompleteNames([])).toEqual([]);
  });
});

describe('the flag in the shipped dataset', () => {
  it('is set on nobody, which is why the notice is rare rather than noise', async () => {
    const { readFile } = await import('node:fs/promises');
    const schema = JSON.parse(await readFile('docs/dataset-schema.json', 'utf8'));
    const characters = schema.tables.find((table: { name: string }) => table.name === 'characters');
    const column = characters.columns.find(
      (entry: { name: string }) => entry.name === 'is_incomplete',
    );

    /* The column exists and is required; what no upstream character does is set it. */
    expect(column).toMatchObject({ type: 'INTEGER', notNull: true });
  });

  it('is copy the reader can act on, in both languages', async () => {
    const { readFile } = await import('node:fs/promises');

    for (const language of ['en', 'el']) {
      const copy = JSON.parse(
        await readFile(`public/i18n/auto-team-builder/${language}.json`, 'utf8'),
      ).incompleteData;

      expect(copy.title).toBeTruthy();
      expect(copy.copy).toContain('{{names}}');
      /* It must say the team was built anyway - the whole point is that nothing was refused. */
      expect(copy.copy.length).toBeGreaterThan(80);
    }
  });
});
