import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PARTY_CONFLICT_TWINS,
  collectOverlayFiles,
  compareWithRegister,
  countEntries,
  findSupersededShipOverrides,
  findTwinDivergence,
  findUnmarkedProvenance,
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

  it('names both copies of the duplicated party-conflict overlay', () => {
    expect(PARTY_CONFLICT_TWINS.app).toContain('src/app/core/data/');
    expect(PARTY_CONFLICT_TWINS.scripts).toContain('scripts/data/');
  });
});
