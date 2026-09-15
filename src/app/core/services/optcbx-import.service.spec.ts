import { describe, expect, it, vi } from 'vitest';

import { type CharacterListItem } from '../models/optc.models';
import { OptcbxImportService } from './optcbx-import.service';

describe('OptcbxImportService', () => {
  it('parses a valid OPTCbx export with characters only', () => {
    const service = createService();

    const result = service.parseExport(
      JSON.stringify({
        characters: [
          { name: 'Luffy', number: 1001 },
          { name: 'Zoro', number: 1002 },
        ],
      }),
    );

    expect(result.importedNumbers).toEqual([1001, 1002]);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('parses a valid OPTCbx export that also contains thumbnails', () => {
    const service = createService();

    const result = service.parseExport(
      JSON.stringify({
        characters: [{ name: 'Nami', number: 2001 }],
        thumbnails: ['thumb.png'],
      }),
    );

    expect(result.importedNumbers).toEqual([2001]);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('rejects invalid JSON', () => {
    const service = createService();

    expect(() => service.parseExport('{invalid')).toThrow('The selected file is not valid JSON.');
  });

  it('rejects payloads without a valid characters array', () => {
    const service = createService();

    expect(() => service.parseExport(JSON.stringify({ thumbnails: [] }))).toThrow(
      'The selected file is not a raw OPTCbx export.',
    );
  });

  it('removes duplicate character ids from the import', () => {
    const service = createService();

    const result = service.parseExport(
      JSON.stringify({
        characters: [{ number: 3001 }, { number: 3001 }, { number: '3002' }],
      }),
    );

    expect(result.importedNumbers).toEqual([3001, 3002]);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('reports unmatched ids that are not present in the local dataset', async () => {
    const service = createService([createCharacter(4001), createCharacter(4003)]);

    const parsedImport = service.parseExport(
      JSON.stringify({
        characters: [{ number: 4001 }, { number: 4002 }, { number: 4003 }],
      }),
    );
    const result = await service.buildMergeImportResult(parsedImport, []);

    expect(result.matchedIds).toEqual([4001, 4003]);
    expect(result.unmatchedIds).toEqual([4002]);
  });

  it('computes merge counts against existing favorites', async () => {
    const service = createService([
      createCharacter(5001),
      createCharacter(5002),
      createCharacter(5003),
    ]);

    const parsedImport = service.parseExport(
      JSON.stringify({
        characters: [{ number: 5001 }, { number: 5002 }, { number: 5003 }],
      }),
    );
    const result = await service.buildMergeImportResult(parsedImport, [5002, 9999]);
    const mergedIds = service.mergeFavoriteIds(result.matchedIds, [5002, 9999]);

    expect(result.addedCount).toBe(2);
    expect(result.alreadyFavoritedCount).toBe(1);
    expect(mergedIds).toEqual([5001, 5002, 5003, 9999]);
  });
  /**
   * 869f26084. The other direction of the comparison the import has always performed.
   *
   * Until this landed the import only ever reported what it ADDED, and no path removed anything,
   * so a favourites list only grew and the staleness that accumulated was units the reader no
   * longer owns.
   */
  it('reports the favourites this import did not mention', async () => {
    const service = createService([
      createCharacter(5001),
      createCharacter(5002),
      createCharacter(5003),
    ]);

    const result = await service.buildMergeImportResult(
      { importedNumbers: [5001, 5002], duplicatesRemoved: 0 },
      [5001, 5003],
    );

    expect(result.removableIds).toEqual([5003]);
    expect(result.addedCount).toBe(1);
  });

  /**
   * The trap the task names: *"this import did not mention it"* and *"we could not recognise it"*
   * look identical in a count and mean opposite things. A favourite we cannot resolve is evidence
   * about OUR dataset, not about what the reader owns, so removing it would be us deleting their
   * data to cover our own gap.
   */
  it('never offers a favourite it cannot resolve, and counts it separately', async () => {
    const service = createService([createCharacter(5001)]);

    const result = await service.buildMergeImportResult(
      { importedNumbers: [5001], duplicatesRemoved: 0 },
      [5001, 424242],
    );

    expect(result.removableIds).toEqual([]);
    expect(result.unresolvedFavoriteCount).toBe(1);
  });

  it('offers nothing when the import covers every favourite', async () => {
    const service = createService([createCharacter(5001), createCharacter(5002)]);

    const result = await service.buildMergeImportResult(
      { importedNumbers: [5001, 5002], duplicatesRemoved: 0 },
      [5001, 5002],
    );

    expect(result.removableIds).toEqual([]);
    expect(result.unresolvedFavoriteCount).toBe(0);
  });

  it('keeps the reader order of the favourites it offers', async () => {
    const service = createService([
      createCharacter(5001),
      createCharacter(5002),
      createCharacter(5003),
    ]);

    const result = await service.buildMergeImportResult(
      { importedNumbers: [], duplicatesRemoved: 0 },
      [5003, 5001, 5002],
    );

    expect(result.removableIds).toEqual([5003, 5001, 5002]);
  });

  it('removes exactly what the reader chose, leaving the rest alone', async () => {
    const service = createService([]);

    expect(service.removeFavoriteIds([5003], [5001, 5002, 5003], [5003])).toEqual([5001, 5002]);
  });

  /**
   * A caller cannot widen a removal past what the result was willing to offer. Without this, a bug
   * between showing and applying could delete a favourite that was never on screen.
   */
  it('ignores an id that was never offered, rather than trusting the caller', async () => {
    const service = createService([]);

    expect(service.removeFavoriteIds([5001, 5003], [5001, 5002, 5003], [5003])).toEqual([
      5001,
      5002,
    ]);
  });

  it('removes nothing when the reader chose nothing, which is the default', async () => {
    const service = createService([]);

    expect(service.removeFavoriteIds([], [5001, 5002], [5001, 5002])).toEqual([5001, 5002]);
  });
});

/**
 * 869f26084. The stub resolves per ARGUMENT rather than returning one fixed list.
 *
 * `buildMergeImportResult` now calls the repository twice - once for the imported numbers and once
 * for the reader's existing favourites - and a stub that answers both calls identically cannot
 * express the case the whole feature turns on: a favourite that no longer resolves to a character.
 * `universe` is what the shipped dataset contains; anything outside it is unresolvable.
 */
function createService(universe: CharacterListItem[] = []): OptcbxImportService {
  const byId = new Map(universe.map((character) => [character.id, character]));
  const repository = {
    getCharactersByIds: vi.fn(async (ids: number[]) =>
      ids.map((id) => byId.get(id)).filter((character): character is CharacterListItem => Boolean(character)),
    ),
  };

  return new OptcbxImportService(repository as never);
}

function createCharacter(id: number): CharacterListItem {
  return {
    id,
    name: `Character ${id}`,
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1,
    captainAtkBoost: 1,
    captainAverageBoost: 1,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 3000, atk: 1500, rcv: 300 },
      growth: 1,
    },
    regionArtwork: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    regionRelease: { availableOnGlobal: null },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: 'assets/placeholders/character-card.svg',
  };
}
