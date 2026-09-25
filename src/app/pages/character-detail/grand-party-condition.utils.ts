/**
 * 869f63gz7. A Grand Party Burst Condition, read into the sentence the Character screen shows.
 *
 * Grand Party fields three Rumble teams under one GP Leader, whose Burst fires once a condition is
 * met. Upstream stores the condition as data - `[{ "count": 2, "type": "defeat", "team": "crew" }]` -
 * and the Character screen used to print exactly that, as `Count` / `Type` / `Team` rows.
 *
 * The meaning of each shape is upstream's own: `gpconditionToString` in the community database's
 * `characters-directives.js` renders `defeat` as "After {count} {team} are defeated", a `time` with
 * no comparator as "At Exactly {count} seconds", and so on. This follows it type for type, so the
 * words are the database's reading, not ours.
 *
 * Measured on the shipped seed, 2026-09-25: 511 units carry a condition, always a one-element
 * array, in 11 types; 391 of them are "after 2 crew members are defeated".
 *
 * Strict on purpose: a type this does not list, a team it does not know, a missing or non-positive
 * count, or ANY key beyond the ones its type uses comes back unread, and the screen shows it as
 * readable `Key: value` text. An extra key can change the meaning - a `defeat` limited to one family
 * is not "after 2 crew members are defeated" - so reading past it would be a guess.
 */

/** The sentence a condition reads as - a key under `grandParty.condition` in the page's scope. */
export type GrandPartyConditionKey =
  | 'defeatCrew'
  | 'defeatEnemies'
  | 'specialCrew'
  | 'specialEnemies'
  | 'timeAfter'
  | 'timeExactly'
  | 'damageTimes'
  | 'damageDealt'
  | 'damageTaken'
  | 'hitsTaken'
  | 'debuffsTaken'
  | 'attacksLanded'
  | 'debuffLanded'
  | 'actions';

export type GrandPartyConditionReading =
  | {
      readonly key: GrandPartyConditionKey;
      readonly count: number;
      /** Names the sentence quotes as they are: an attack style, a debuff, an action. */
      readonly names: Readonly<Record<string, string>>;
    }
  | { readonly key: null; readonly value: unknown };

type ConditionRecord = Record<string, unknown>;

interface ConditionShape {
  /** Keys besides `type` and `count` that this type uses. `comparator` may be absent on `time`. */
  readonly keys: readonly string[];
  readonly read: (condition: ConditionRecord) => GrandPartyConditionKey | null;
}

function readTeam(
  condition: ConditionRecord,
  keysByTeam: Readonly<Record<string, GrandPartyConditionKey>>,
): GrandPartyConditionKey | null {
  const team = condition['team'];

  return typeof team === 'string' && Object.hasOwn(keysByTeam, team)
    ? (keysByTeam[team] ?? null)
    : null;
}

const SHAPES: Readonly<Record<string, ConditionShape>> = {
  defeat: {
    keys: ['team'],
    read: (condition) => readTeam(condition, { crew: 'defeatCrew', enemies: 'defeatEnemies' }),
  },
  special: {
    keys: ['team'],
    // Upstream writes the enemy side both ways: `enemies` on most units, `enemy` on two.
    read: (condition) =>
      readTeam(condition, { crew: 'specialCrew', enemies: 'specialEnemies', enemy: 'specialEnemies' }),
  },
  time: {
    keys: ['comparator'],
    read: (condition) =>
      condition['comparator'] === undefined
        ? 'timeExactly'
        : condition['comparator'] === 'after'
          ? 'timeAfter'
          : null,
  },
  damage: { keys: [], read: () => 'damageTimes' },
  dmgdealt: { keys: [], read: () => 'damageDealt' },
  dmgreceived: { keys: [], read: () => 'damageTaken' },
  hitreceived: { keys: [], read: () => 'hitsTaken' },
  dbfreceived: { keys: [], read: () => 'debuffsTaken' },
  attack: { keys: ['attack'], read: () => 'attacksLanded' },
  debuff: { keys: ['attribute'], read: () => 'debuffLanded' },
  action: { keys: ['action'], read: () => 'actions' },
};

/** The names a sentence quotes, by the key that holds them. */
const QUOTED_NAMES = ['attack', 'attribute', 'action'] as const;

/**
 * Every condition in a unit's `gpcondition`, in order. Upstream writes an array; a lone object is
 * read as one condition. Several conditions come back as several readings - how they combine is not
 * written anywhere, so no joining word is invented for them.
 */
export function readGrandPartyConditions(value: unknown): GrandPartyConditionReading[] {
  if (value === null || value === undefined) {
    return [];
  }

  return (Array.isArray(value) ? value : [value]).map((condition) => readCondition(condition));
}

function readCondition(condition: unknown): GrandPartyConditionReading {
  if (!isConditionRecord(condition)) {
    return { key: null, value: condition };
  }

  const type = condition['type'];
  const shape = typeof type === 'string' && Object.hasOwn(SHAPES, type) ? SHAPES[type] : undefined;
  const count = condition['count'];

  if (!shape || typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
    return { key: null, value: condition };
  }

  const allowed = new Set(['type', 'count', ...shape.keys]);
  const names: Record<string, string> = {};

  for (const name of QUOTED_NAMES) {
    if (shape.keys.includes(name)) {
      const quoted = condition[name];

      if (typeof quoted !== 'string' || !quoted.trim()) {
        return { key: null, value: condition };
      }

      names[name] = quoted.trim();
    }
  }

  const key = Object.keys(condition).every((field) => allowed.has(field))
    ? shape.read(condition)
    : null;

  return key ? { key, count, names } : { key: null, value: condition };
}

function isConditionRecord(value: unknown): value is ConditionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
