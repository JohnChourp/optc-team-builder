/**
 * 869f138qm. The ability catalogue is an index over the database, so it can be re-derived from it.
 *
 * `assets/data/optc-auto-builder-abilities.json` and `assets/data/optc-seed.sql` are written by the
 * same import, from the same upstream, on the same release. The catalogue's per-key character lists
 * are not extra facts: the importer parses each character's ability text, stores the result in that
 * character's `character_details.detail_json.builderAbilities`, and the catalogue is the inverted
 * index of exactly those rows. Measured 2026-09-17: every one of the 241 keys a character actually
 * has re-derives from the database with identical id sets.
 *
 * What the database cannot express, and why the file still exists: the 22 keys no character has
 * (a definition with an empty index is not a row), and each key's presentation metadata - label,
 * category, group, order - which lives in the importer's ability definitions rather than in the
 * data. Those are the reason for the artifact. The id lists are the reason it can drift.
 *
 * So this module re-derives the lists independently, from the same rule the app would use if it
 * built the index itself, and the guard compares them. It deliberately does not import the
 * importer's accumulator: a copy of the code under test proves the file was written, not that it is
 * right.
 */

/** Every catalogue field that is an id list, with the rule that decides membership. */
export const DERIVED_ID_LISTS = Object.freeze([
  {
    field: 'matchingCharacterIds',
    kind: 'matching-character-ids-diverged',
    matches: () => true,
  },
  {
    field: 'completeRemovalCharacterIds',
    kind: 'complete-removal-character-ids-diverged',
    matches: (ability) => ability.isCompleteRemoval === true,
  },
  {
    field: 'captainAbilityMatchingCharacterIds',
    kind: 'captain-ability-matching-character-ids-diverged',
    matches: (ability) => ability.source === 'captainAbility',
  },
  {
    field: 'captainAbilityCompleteRemovalCharacterIds',
    kind: 'captain-ability-complete-removal-character-ids-diverged',
    matches: (ability) => ability.isCompleteRemoval === true && ability.source === 'captainAbility',
  },
]);

/** The same, for the fields grouped by `minTurns`. */
export const DERIVED_TURN_LISTS = Object.freeze([
  {
    field: 'turnMatchingCharacterIds',
    kind: 'turn-matching-character-ids-diverged',
    matches: () => true,
  },
  {
    field: 'captainAbilityTurnMatchingCharacterIds',
    kind: 'captain-ability-turn-matching-character-ids-diverged',
    matches: (ability) => ability.source === 'captainAbility',
  },
]);

function hasTurns(ability) {
  return Number.isFinite(ability.minTurns) && ability.minTurns > 0;
}

function turnsOf(ability) {
  return Math.floor(ability.minTurns);
}

/**
 * `{ characterId, builderAbilities }` rows in, one entry per ability key out. Only what a key
 * actually matched - a key no character has simply has no entry, which is how the guard tells a
 * definition-only key from one whose index went missing.
 */
export function indexBuilderAbilities(rows) {
  const index = new Map();

  for (const row of rows) {
    const characterId = row.characterId;

    for (const ability of row.builderAbilities ?? []) {
      if (typeof ability?.key !== 'string') {
        continue;
      }

      let entry = index.get(ability.key);

      if (!entry) {
        entry = {
          key: ability.key,
          ids: new Map(DERIVED_ID_LISTS.map((list) => [list.field, new Set()])),
          turns: new Map(DERIVED_TURN_LISTS.map((list) => [list.field, new Map()])),
        };
        index.set(ability.key, entry);
      }

      for (const list of DERIVED_ID_LISTS) {
        if (list.matches(ability)) {
          entry.ids.get(list.field).add(characterId);
        }
      }

      if (hasTurns(ability)) {
        for (const list of DERIVED_TURN_LISTS) {
          if (!list.matches(ability)) {
            continue;
          }

          const byTurns = entry.turns.get(list.field);
          const minTurns = turnsOf(ability);
          const ids = byTurns.get(minTurns) ?? new Set();

          ids.add(characterId);
          byTurns.set(minTurns, ids);
        }
      }
    }
  }

  return index;
}

/** The same rows, keyed by character, for the checks that ask "does this character really?". */
export function mapAbilitiesByCharacter(rows) {
  return new Map(rows.map((row) => [row.characterId, row.builderAbilities ?? []]));
}

function sortedIds(ids) {
  return [...ids].sort((left, right) => left - right);
}

/** A few ids either side of the difference, so a failure says which characters moved. */
function describeDifference(fromCatalogue, fromDatabase) {
  const missing = sortedIds([...fromDatabase].filter((id) => !fromCatalogue.has(id)));
  const extra = sortedIds([...fromCatalogue].filter((id) => !fromDatabase.has(id)));
  const parts = [];

  if (missing.length) {
    parts.push(`${missing.length} in the database but not the catalogue (${missing.slice(0, 5).join(', ')})`);
  }

  if (extra.length) {
    parts.push(`${extra.length} in the catalogue but not the database (${extra.slice(0, 5).join(', ')})`);
  }

  return parts.join('; ');
}

function sameIds(fromCatalogue, fromDatabase) {
  return (
    fromCatalogue.size === fromDatabase.size && [...fromCatalogue].every((id) => fromDatabase.has(id))
  );
}

function catalogueIdSet(ability, field) {
  return new Set(ability[field] ?? []);
}

function catalogueTurnMap(ability, field) {
  const byTurns = new Map();

  for (const group of ability[field] ?? []) {
    const ids = byTurns.get(group.minTurns) ?? new Set();

    for (const id of group.characterIds ?? []) {
      ids.add(id);
    }

    byTurns.set(group.minTurns, ids);
  }

  return byTurns;
}

/** Shape, not policy: the same normalisation the importer applies before it indexes a value. */
function normalizeEffectTargetScope(value) {
  const scope = typeof value === 'string' ? value.trim() : '';

  return scope === 'crew' || scope === 'captains' || scope === 'self' || scope === 'subs'
    ? scope
    : 'any';
}

function normalizeSlotTokens(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry).trim().toUpperCase()).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right),
      )
    : [];
}

function normalizeEffectValue(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * The scope index and the captain effect matches are checked one way only, and deliberately.
 *
 * Both are filtered by `CAPTAIN_STRUCTURED_EFFECT_KEYS`, a list of keys the importer decides are
 * captain structured effects - a policy, not something the data states. Re-deriving them in full
 * would mean copying that list here, and a guard holding a copy of the rule it checks proves only
 * that the copy matches. So the direction that needs no policy is checked instead: every character
 * these lists name must really carry that key, with that scope, with that value, in the seed. That
 * is the direction a stale catalogue fails - it keeps naming characters whose rows have moved on.
 * The other direction, that nothing eligible was left out, stays with the importer.
 */
function auditScopeSubsets(ability, abilitiesByCharacter, findings) {
  for (const scopeEntry of ability.effectTargetScopeMatchingCharacterIds ?? []) {
    const scope = scopeEntry.effectTargetScope;
    const listedIds = new Set(scopeEntry.characterIds ?? []);

    for (const group of scopeEntry.turnMatchingCharacterIds ?? []) {
      for (const id of group.characterIds ?? []) {
        listedIds.add(id);
      }
    }

    for (const id of scopeEntry.completeRemovalCharacterIds ?? []) {
      listedIds.add(id);
    }

    const absent = sortedIds(
      [...listedIds].filter(
        (id) =>
          !(abilitiesByCharacter.get(id) ?? []).some(
            (entry) =>
              entry.key === ability.key && normalizeEffectTargetScope(entry.effectTargetScope) === scope,
          ),
      ),
    );

    if (absent.length) {
      findings.push({
        kind: 'effect-target-scope-not-in-database',
        detail: `${ability.key} scope ${scope}: ${absent.length} character(s) listed with no such scope in the seed (${absent.slice(0, 5).join(', ')})`,
      });
    }
  }

  for (const match of ability.captainAbilityEffectMatches ?? []) {
    const slotTokens = normalizeSlotTokens(match.slotTokens).join(',');
    const scope = match.effectTargetScope ?? 'any';
    const value = match.minEffectValue ?? null;
    const found = (abilitiesByCharacter.get(match.characterId) ?? []).some(
      (entry) =>
        entry.key === ability.key &&
        entry.source === 'captainAbility' &&
        normalizeEffectTargetScope(entry.effectTargetScope) === scope &&
        normalizeEffectValue(entry.minEffectValue) === value &&
        normalizeSlotTokens(entry.slotTokens).join(',') === slotTokens,
    );

    if (!found) {
      findings.push({
        kind: 'captain-ability-effect-match-not-in-database',
        detail: `${ability.key}: character ${match.characterId} is listed with scope ${scope}, value ${value ?? 'none'}, slots [${slotTokens}] - the seed has no captain ability matching that`,
      });
    }
  }
}

/**
 * The catalogue against the database it was built from. `characterIds` is every id the database
 * has, so a list naming a character the seed does not contain is caught too - that is the shape a
 * half-regenerated pair takes when the roster shrank.
 */
export function auditAbilityCatalogue({ catalogue, index, characterIds, abilitiesByCharacter }) {
  const findings = [];
  const abilities = catalogue?.abilities;

  if (!Array.isArray(abilities)) {
    return {
      ok: false,
      findings: [
        {
          kind: 'catalogue-unreadable',
          detail: 'the catalogue has no `abilities` array - it is not the file the importer writes',
        },
      ],
      definitionOnlyKeys: [],
    };
  }

  const knownCharacterIds = characterIds instanceof Set ? characterIds : new Set(characterIds ?? []);
  const abilitiesByCharacterId = abilitiesByCharacter ?? new Map();
  const catalogueKeys = new Set();
  const definitionOnlyKeys = [];

  for (const ability of abilities) {
    catalogueKeys.add(ability.key);

    const entry = index.get(ability.key);
    const matching = catalogueIdSet(ability, 'matchingCharacterIds');

    if (ability.matchCount !== matching.size) {
      findings.push({
        kind: 'match-count-diverged',
        detail: `${ability.key}: matchCount is ${ability.matchCount}, matchingCharacterIds holds ${matching.size}`,
      });
    }

    if (!entry) {
      if (matching.size) {
        findings.push({
          kind: 'ability-missing-from-database',
          detail: `${ability.key}: the catalogue names ${matching.size} character(s), no character in the seed has the key`,
        });
      } else {
        definitionOnlyKeys.push(ability.key);
      }

      continue;
    }

    for (const list of DERIVED_ID_LISTS) {
      const fromCatalogue = catalogueIdSet(ability, list.field);
      const fromDatabase = entry.ids.get(list.field);

      if (!sameIds(fromCatalogue, fromDatabase)) {
        findings.push({
          kind: list.kind,
          detail: `${ability.key}.${list.field}: ${describeDifference(fromCatalogue, fromDatabase)}`,
        });
      }
    }

    for (const list of DERIVED_TURN_LISTS) {
      const fromCatalogue = catalogueTurnMap(ability, list.field);
      const fromDatabase = entry.turns.get(list.field);
      const turnValues = new Set([...fromCatalogue.keys(), ...fromDatabase.keys()]);

      for (const minTurns of [...turnValues].sort((left, right) => left - right)) {
        const catalogueIds = fromCatalogue.get(minTurns) ?? new Set();
        const databaseIds = fromDatabase.get(minTurns) ?? new Set();

        if (!sameIds(catalogueIds, databaseIds)) {
          findings.push({
            kind: list.kind,
            detail: `${ability.key}.${list.field} at ${minTurns} turn(s): ${describeDifference(catalogueIds, databaseIds)}`,
          });
        }
      }
    }

    auditScopeSubsets(ability, abilitiesByCharacterId, findings);

    if (knownCharacterIds.size) {
      const unknown = sortedIds([...matching].filter((id) => !knownCharacterIds.has(id)));

      if (unknown.length) {
        findings.push({
          kind: 'unknown-character-id',
          detail: `${ability.key}: ${unknown.length} id(s) with no row in the seed (${unknown.slice(0, 5).join(', ')})`,
        });
      }
    }
  }

  for (const key of index.keys()) {
    if (!catalogueKeys.has(key)) {
      findings.push({
        kind: 'ability-missing-from-catalogue',
        detail: `${key}: ${index.get(key).ids.get('matchingCharacterIds').size} character(s) in the seed have it, the catalogue has no entry`,
      });
    }
  }

  return { ok: findings.length === 0, findings, definitionOnlyKeys };
}
