/**
 * 869f63gv6. What the import keeps of a dual or VS unit's forms, and what it drops - declared by
 * the module that reads them, so the provenance record is generated from the same declaration the
 * importer runs on.
 *
 * Upstream's `units.js` is keyed by id. A dual or VS unit has one extra key per form - `1983-1` and
 * `1983-2` for #1983 Smoker & Tashigi - and each carries a full unit row. The import used to read
 * those rows for their TYPE alone, merged into the unit's comma-joined `type`, and drop the rest
 * with no record anywhere: the form's name, its classes (169 of 414 forms differ from their unit,
 * measured 2026-09-23), its combo (171) and its stats. `normalizeCharacterForms` in the importer
 * now keeps them, as `character_forms` rows.
 */

/**
 * The fields of an upstream `units.js` row, in upstream's own documented order: `[ "Name", "Type",
 * [Classes], Stars, Cost, Combo, Sockets, maxLVL, EXPToMax, lvl1HP, lvl1ATK, lvl1RCV, MAXHP, MAXATK,
 * MAXRCV, Growth Rate ]`. The row's `id` is its key and is not a field of it.
 */
export const UPSTREAM_UNIT_ROW_FIELDS = Object.freeze([
  'name',
  'type',
  'class',
  'stars',
  'cost',
  'combo',
  'sockets',
  'maxLevel',
  'maxEXP',
  'minHP',
  'minATK',
  'minRCV',
  'maxHP',
  'maxATK',
  'maxRCV',
  'growth',
]);

/** Each form field the import keeps: the upstream field it reads and the column it lands in. */
export const FORM_UPSTREAM_SOURCES = Object.freeze({
  name: { upstream: 'name', column: 'name' },
  type: { upstream: 'type', column: 'type' },
  classes: { upstream: 'class', column: 'classes_json' },
  combo: { upstream: 'combo', column: 'combo' },
  minHp: { upstream: 'minHP', column: 'min_hp' },
  minAtk: { upstream: 'minATK', column: 'min_atk' },
  minRcv: { upstream: 'minRCV', column: 'min_rcv' },
  maxHp: { upstream: 'maxHP', column: 'max_hp' },
  maxAtk: { upstream: 'maxATK', column: 'max_atk' },
  maxRcv: { upstream: 'maxRCV', column: 'max_rcv' },
});

export const FORM_TABLE = 'character_forms';

/**
 * Every row field a form does NOT keep - computed, never typed. Each one is empty in every form row
 * (a form shares its unit's rarity, cost, sockets, level cap and growth), and the importer checks
 * that on every import instead of assuming it.
 */
export const FORM_DROPPED_FIELDS = Object.freeze(
  UPSTREAM_UNIT_ROW_FIELDS.filter(
    (field) => !Object.values(FORM_UPSTREAM_SOURCES).some((source) => source.upstream === field),
  ),
);

export const FORM_DROPPED_REASON =
  'Empty in every form row: a form shares its unit\'s rarity, cost, sockets, level cap and growth. The import fails when a form row carries a value here, rather than drop it without a trace.';

/** `null`, `undefined`, blank text and an empty list are empty; `0` is a value. */
export function isEmptyUpstreamValue(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}
