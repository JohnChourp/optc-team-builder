import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildCatalog, comparableCatalog, readDetailRows } from './generate-unresolved-clauses.mjs';
import {
  collectUnresolvedClauses,
  createUnresolvedClauseCatalog,
  MAPPED_TRIGGER_CLAUSES,
} from './lib/unresolved-clauses.mjs';

/*
 * 869f127f6. These degradations are DELIBERATE - the app shows the game's own English rather than
 * inventing a translation - so nothing here treats one as a defect. What is tested is that they are
 * counted, that a mapped clause is not counted, and that the record is a stable function of the
 * dataset so a CHANGE in it means something.
 */

function detail(characterId: number, tier: Record<string, unknown>) {
  return {
    characterId,
    detail: { captainAbilityCoverage: { entries: [{ key: 'captain', tiers: [tier] }] } },
  };
}

describe('collectUnresolvedClauses', () => {
  it('counts a trigger clause the catalogue does not map', () => {
    const items = collectUnresolvedClauses([
      detail(1, { triggerConditions: [{ rawClause: 'HP is above 99%' }] }),
    ]);

    expect(items).toEqual([
      { kind: 'triggerClause', clause: 'HP is above 99%', instances: 1, characterIds: [1] },
    ]);
  });

  it('does NOT count a clause the catalogue maps, because that one is translated', () => {
    const items = collectUnresolvedClauses([
      detail(1, { triggerConditions: [{ rawClause: MAPPED_TRIGGER_CLAUSES[0] }] }),
    ]);

    expect(items).toEqual([]);
  });

  it('counts a team condition that carries only a raw clause', () => {
    const items = collectUnresolvedClauses([
      detail(1, { teamConditions: [{ rawClause: 'this character is your Captain' }] }),
    ]);

    expect(items[0]).toMatchObject({ kind: 'teamConditionRawOnly', instances: 1 });
  });

  it('does not count a team condition the catalogue can translate from structured fields', () => {
    const items = collectUnresolvedClauses([
      detail(1, { teamConditions: [{ rawClause: 'a [STR] character', types: ['STR'] }] }),
    ]);

    expect(items).toEqual([]);
  });

  it('groups the same clause across characters and counts instances', () => {
    const items = collectUnresolvedClauses([
      detail(1, { triggerConditions: [{ rawClause: 'when they are rewinded' }] }),
      detail(2, { triggerConditions: [{ rawClause: 'when they are rewinded' }] }),
    ]);

    expect(items[0]).toMatchObject({ instances: 2, characterIds: [1, 2] });
  });

  it('caps the character ids it keeps, because this is a count and not a roster index', () => {
    const rows = Array.from({ length: 40 }, (_value, index) =>
      detail(index + 1, { triggerConditions: [{ rawClause: 'when they are rewinded' }] }),
    );
    const [item] = collectUnresolvedClauses(rows);

    expect(item!.instances).toBe(40);
    expect(item!.characterIds).toHaveLength(5);
  });

  it('orders the most-repeated first, so the clause worth mapping next is at the top', () => {
    const items = collectUnresolvedClauses([
      detail(1, { triggerConditions: [{ rawClause: 'rare' }] }),
      detail(2, { triggerConditions: [{ rawClause: 'common' }] }),
      detail(3, { triggerConditions: [{ rawClause: 'common' }] }),
    ]);

    expect(items.map((item) => item.clause)).toEqual(['common', 'rare']);
  });

  it('ignores an empty clause rather than recording a blank row', () => {
    expect(collectUnresolvedClauses([detail(1, { triggerConditions: [{ rawClause: '  ' }] })])).toEqual(
      [],
    );
  });
});

describe('createUnresolvedClauseCatalog', () => {
  it('totals INSTANCES, matching the shape optc-unresolved-images.json already uses', () => {
    const catalog = createUnresolvedClauseCatalog(
      [
        detail(1, { triggerConditions: [{ rawClause: 'a' }, { rawClause: 'a' }] }),
        detail(2, { teamConditions: [{ rawClause: 'b' }] }),
      ],
      '36',
      'now',
    );

    expect(catalog).toMatchObject({
      sourceVersion: '36',
      total: 3,
      distinctClauses: 2,
      byKind: { teamConditionRawOnly: 1, triggerClause: 2 },
    });
  });

  it('is empty, not absent, when nothing degrades', () => {
    expect(createUnresolvedClauseCatalog([], '36', 'now')).toMatchObject({
      total: 0,
      distinctClauses: 0,
      items: [],
    });
  });
});

describe('the mapped-clause list', () => {
  it('agrees with the catalogue the app actually uses', () => {
    /*
     * `MAPPED_TRIGGER_CLAUSES` is a second copy: it lives in `.mjs` because the dataset chain has
     * no TypeScript loader, while the app's own list is a `const` in
     * `captain-coverage-tier-view.utils.ts`. A second copy is a thing that drifts, so this reads
     * the real one and asserts they are the same set - which is what makes the duplication safe
     * rather than merely convenient.
     */
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/core/services/captain-coverage-tier-view.utils.ts'),
      'utf8',
    );
    const block = source.slice(
      source.indexOf('CAPTAIN_TIER_FIXED_TRIGGER_CLAUSES'),
      source.indexOf('};', source.indexOf('CAPTAIN_TIER_FIXED_TRIGGER_CLAUSES')),
    );
    const appClauses = [...block.matchAll(/'([^']+)':\s*'/gu)].map((match) => match[1]);

    expect(appClauses.length).toBeGreaterThan(0);
    expect([...appClauses].sort()).toEqual([...MAPPED_TRIGGER_CLAUSES].sort());
  });
});

describe('the committed catalog', () => {
  it('is a stable function of the dataset - the same input twice gives the same file', () => {
    const first = comparableCatalog(buildCatalog({ generatedAt: 'a' }));
    const second = comparableCatalog(buildCatalog({ generatedAt: 'b' }));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('matches the shipped dataset', () => {
    // The lane runs this as `--check`; asserting it here too means a stale file fails in the spec
    // as well as the command, which is what stops it being fixed by deleting the command.
    const committed = JSON.parse(
      readFileSync(path.join(process.cwd(), 'public/assets/data/optc-unresolved-clauses.json'), 'utf8'),
    );

    expect(comparableCatalog(committed)).toEqual(comparableCatalog(buildCatalog({})));
  });

  it('actually records something, so an empty file cannot pass as agreement', () => {
    // Measured 2026-09-13: 519 trigger-clause instances and 67 raw-only team conditions. The point
    // is not the exact number - it moves with upstream - but that the record is not vacuous.
    const catalog = buildCatalog({});

    expect(catalog.total).toBeGreaterThan(100);
    expect(catalog.distinctClauses).toBeGreaterThan(10);
  });

  it('reads every detail row in the seed', () => {
    expect(readDetailRows({}).length).toBeGreaterThan(1000);
  });
});
