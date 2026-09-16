import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PARTY_CONFLICT_TWINS,
  collectOverlayFiles,
  compareWithRegister,
  countEntries,
  findMissingHeroImages,
  findSupersededShipOverrides,
  findTwinDivergence,
  findUnmarkedProvenance,
  findUnstagedAbsentIds,
  parseCharacterIds,
  parseShipThumbs,
} from './check-manual-overlay-register.mjs';

/**
 * 869f135t0. The register's value is that a still-needed correction and a stale
 * one stop looking identical, so the tests are about the ways this could quietly
 * describe nothing.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const register = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'scripts/data/manual-overlay-register.json'), 'utf8'),
);

describe('countEntries', () => {
  it('counts an object overlay by its keys and an array overlay by its length', () => {
    expect(countEntries({ a: 1, b: 2 })).toBe(2);
    expect(countEntries([1, 2, 3])).toBe(3);
  });

  it('counts an empty overlay as zero rather than failing', () => {
    expect(countEntries({})).toBe(0);
  });
});

describe('parseShipThumbs', () => {
  const seed = `
      INSERT INTO ships (id, name, thumb, description)
      VALUES (
        63,
        'Ship With Override',
        'ship_0063_t2.png',
        'x'
      );
      INSERT INTO ships (id, name, thumb, description)
      VALUES (
        64,
        'Ship Upstream Fixed',
        NULL,
        'x'
      );`;

  it('reads a thumb and a NULL thumb differently', () => {
    const thumbs = parseShipThumbs(seed);

    expect(thumbs.get(63)).toBe('ship_0063_t2.png');
    expect(thumbs.get(64)).toBeNull();
  });

  it('reads the real seed, so a schema change cannot leave it silently measuring nothing', () => {
    const thumbs = parseShipThumbs(
      readFileSync(path.join(REPO_ROOT, 'public/assets/data/optc-seed.sql'), 'utf8'),
    );

    expect(thumbs.size).toBeGreaterThan(50);
  });
});

describe('findSupersededShipOverrides', () => {
  const overrides = { 63: { file: 'ship_0063_t2.png' } };

  it('stays quiet while the override is what the dataset ships', () => {
    expect(findSupersededShipOverrides(overrides, new Map([[63, 'ship_0063_t2.png']]))).toEqual([]);
  });

  it('reports an override upstream has superseded', () => {
    const superseded = findSupersededShipOverrides(overrides, new Map([[63, 'upstream.png']]));

    expect(superseded).toHaveLength(1);
    expect(superseded[0].shipped).toBe('upstream.png');
  });

  it('reports an override the dataset dropped to NULL, which is still not the override', () => {
    expect(findSupersededShipOverrides(overrides, new Map([[63, null]]))).toHaveLength(1);
  });

  it('says nothing about a ship the dataset does not carry at all', () => {
    expect(findSupersededShipOverrides(overrides, new Map())).toEqual([]);
  });
});

describe('findTwinDivergence', () => {
  it('stays quiet while both copies agree', () => {
    expect(findTwinDivergence({ 3574: ['a'] }, { 3574: ['a'] })).toEqual([]);
  });

  it('reports a value edited in one copy only', () => {
    expect(findTwinDivergence({ 3574: ['a'] }, { 3574: ['b'] })).toEqual(['3574']);
  });

  it('reports an entry added to one copy only, in either direction', () => {
    expect(findTwinDivergence({ 1: ['a'] }, {})).toEqual(['1']);
    expect(findTwinDivergence({}, { 1: ['a'] })).toEqual(['1']);
  });

  it('is order-sensitive within a key, because conflict keys are compared as written', () => {
    expect(findTwinDivergence({ 1: ['a', 'b'] }, { 1: ['b', 'a'] })).toEqual(['1']);
  });
});

describe('compareWithRegister', () => {
  it('reports a data file in neither the register nor the not-an-overlay list', () => {
    const result = compareWithRegister({ overlays: [], notOverlays: [] }, ['new-overlay.json']);

    expect(result.missingFromRegister).toEqual(['new-overlay.json']);
  });

  it('reports a register entry whose file is gone', () => {
    const result = compareWithRegister({ overlays: [{ file: 'gone.json' }], notOverlays: [] }, []);

    expect(result.missingFromDisk).toEqual(['gone.json']);
  });
});


describe('findUnmarkedProvenance', () => {
  /*
   * 869f135rg. The subtask asked for a three-state provenance marker on the
   * character card. Measured 2026-09-15: both character-data overlays are `{}`,
   * and manual-characters.json has not changed since 2026-04-24, when the prune
   * shipped and emptied it - the prune runs at every import, so the middle state
   * has had zero instances for five months and is actively kept there.
   *
   * Built today it would render "upstream" on 4,618 cards and its one useful
   * state would never appear. This is the tripwire instead.
   */
  it('stays quiet while both overlays are empty, which is the state today', () => {
    expect(
      findUnmarkedProvenance(
        { 'builder-ability-corrections.json': 0, 'manual-characters.json': 0 },
        'no marker anywhere',
      ),
    ).toEqual([]);
  });

  it('fires the moment a character-data overlay gains an entry', () => {
    expect(
      findUnmarkedProvenance({ 'manual-characters.json': 1 }, 'no marker anywhere'),
    ).toEqual(['manual-characters.json']);
  });

  it('names the builder-ability overlay too, not only manual characters', () => {
    expect(
      findUnmarkedProvenance({ 'builder-ability-corrections.json': 3 }, 'no marker anywhere'),
    ).toEqual(['builder-ability-corrections.json']);
  });

  it('stays quiet once the marker exists, so it cannot nag after the work is done', () => {
    expect(
      findUnmarkedProvenance({ 'manual-characters.json': 1 }, 'const dataProvenance = ...'),
    ).toEqual([]);
  });

  it('ignores an overlay it does not govern - images are not a number that looks wrong', () => {
    expect(
      findUnmarkedProvenance({ 'character-image-overrides.json': 44 }, 'no marker anywhere'),
    ).toEqual([]);
  });
});

describe('parseCharacterIds', () => {
  it('reads the real seed, so a schema change cannot leave it measuring nothing', () => {
    const ids = parseCharacterIds(
      readFileSync(path.join(REPO_ROOT, 'public/assets/data/optc-seed.sql'), 'utf8'),
    );

    expect(ids.size).toBeGreaterThan(4000);
    expect(ids.has(1)).toBe(true);
    /* 869f135u6. The measurement this whole check rests on: 5601 is NOT shipped. */
    expect(ids.has(5601)).toBe(false);
  });
});

describe('findUnstagedAbsentIds', () => {
  /*
   * 869f135u6. 30 of the 44 character-image overrides name ids the dataset does
   * not carry, and they are STAGED rather than stale - every `source: 'upstream'`
   * entry is for an absent id and every `source: 'manual'` entry for a present
   * one. The register declares them; this reports anything that appears outside
   * that declaration.
   */
  it('stays quiet while every absent id is declared staged', () => {
    expect(findUnstagedAbsentIds({ 5601: {} }, new Set([1]), [5601])).toEqual([]);
  });

  it('reports an absent id nobody staged', () => {
    expect(findUnstagedAbsentIds({ 5601: {} }, new Set([1]), [])).toEqual([5601]);
  });

  it('says nothing about an override for an id the dataset has', () => {
    expect(findUnstagedAbsentIds({ 4202: {} }, new Set([4202]), [])).toEqual([]);
  });

  it('accepts a staged list written as strings, because JSON keys are strings', () => {
    expect(findUnstagedAbsentIds({ 5601: {} }, new Set([1]), ['5601'])).toEqual([]);
  });

  it('partitions the real overlay exactly, with no id in both halves', () => {
    const overrides = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'scripts/data/character-image-overrides.json'), 'utf8'),
    );
    const characterIds = parseCharacterIds(
      readFileSync(path.join(REPO_ROOT, 'public/assets/data/optc-seed.sql'), 'utf8'),
    );
    const absent = findUnstagedAbsentIds(overrides, characterIds, []);

    expect(absent).toHaveLength(30);
    expect(Object.keys(overrides)).toHaveLength(44);

    /*
     * The correlation is the evidence that these are staged. If it ever breaks -
     * a `manual` entry for an absent id, or an `upstream` entry for a present one
     * - the staged/stale story no longer holds and this must be re-measured.
     */
    for (const [id, entry] of Object.entries(overrides)) {
      const isAbsent = absent.includes(Number(id));

      expect(entry.source, `character ${id}`).toBe(isAbsent ? 'upstream' : 'manual');
    }
  });
});

describe('findMissingHeroImages', () => {
  /*
   * 869f135u6. The generated home page hardcodes three hero images, and one of
   * them - 5601.png - belongs to a character the dataset does not carry. The file
   * exists only because a character-image override materialises it, so pruning
   * the staged overrides would have put a broken image on the front page with
   * nothing to catch it.
   */
  const generator = "src: 'assets/exact-character-images/5601.png',";

  it('reports a hero image that is not on disk', () => {
    expect(findMissingHeroImages(generator, () => false)).toEqual([
      'assets/exact-character-images/5601.png',
    ]);
  });

  it('stays quiet while the file is there', () => {
    expect(findMissingHeroImages(generator, () => true)).toEqual([]);
  });

  it('reads the real generator, so a renamed hero cannot slip past it', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'scripts/generate-seo-pages.mjs'), 'utf8');

    expect(findMissingHeroImages(source, () => false)).toHaveLength(3);
  });
});

describe('the committed register', () => {
  it('classifies every overlay as a correction or a definition', () => {
    for (const overlay of register.overlays) {
      expect(['correction', 'definition']).toContain(overlay.kind);
    }
  });

  it('gives every overlay a reason, a removal condition and a staleness signal', () => {
    for (const overlay of register.overlays) {
      expect(overlay.why.length, `${overlay.file} has no reason`).toBeGreaterThan(30);
      expect(overlay.removeWhen.length, `${overlay.file} has no removal condition`).toBeGreaterThan(
        20,
      );
      expect(overlay.staleSignal.length, `${overlay.file} has no stale signal`).toBeGreaterThan(10);
      expect(overlay.appliedBy, `${overlay.file} names no consumer`).toBeTruthy();
    }
  });

  /*
   * A definition is not a patch over upstream, so it cannot expire. Saying that a
   * definition expires "when upstream catches up" would be the exact confusion
   * this register exists to remove.
   */
  it('never claims a definition can be superseded by upstream', () => {
    for (const overlay of register.overlays.filter((entry) => entry.kind === 'definition')) {
      expect(overlay.removeWhen, overlay.file).toMatch(/Never by upstream/u);
    }
  });

  it('describes every data file that is not listed as not-an-overlay', () => {
    const described = new Set([
      ...register.overlays.map((overlay) => overlay.file),
      ...register.notOverlays,
      'manual-overlay-register.json',
    ]);

    for (const file of collectOverlayFiles()) {
      expect(described.has(file), `${file} is undescribed`).toBe(true);
    }
  });

  it('records an entry count that matches the file on disk', () => {
    for (const overlay of register.overlays) {
      const actual = countEntries(
        JSON.parse(readFileSync(path.join(REPO_ROOT, 'scripts/data', overlay.file), 'utf8')),
      );

      expect(actual, `${overlay.file} count drifted`).toBe(overlay.entryCount);
    }
  });

  it('declares every staged image id with a reason', () => {
    const overlay = register.overlays.find(
      (entry) => entry.file === 'character-image-overrides.json',
    );

    expect(overlay.stagedIds).toHaveLength(30);
    expect(overlay.stagedWhy.length).toBeGreaterThan(200);
  });

  it('names both copies of the duplicated party-conflict overlay', () => {
    expect(PARTY_CONFLICT_TWINS.app).toContain('src/app/core/data/');
    expect(PARTY_CONFLICT_TWINS.scripts).toContain('scripts/data/');
  });
});
