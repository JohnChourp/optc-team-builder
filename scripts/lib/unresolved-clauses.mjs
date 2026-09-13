/**
 * 869f127f6. The degradations that are deliberate, and were therefore invisible.
 *
 * `optc-unresolved-images.json` already makes one class of missing data countable, and that is the
 * right shape: a committed, regenerated record, so a rise after an upstream release is a signal
 * rather than a discovery months later. Nothing did the same for text.
 *
 * Two degradations happen by design and reported nothing:
 *
 *  - a condition line whose tail is raw parser English keeps that English after a Greek prefix,
 *    because inventing a translation for text the dataset spells in English would be worse;
 *  - a fixed trigger clause the catalogue maps verbatim falls through to the raw clause unchanged
 *    when upstream rewords it. That is a GOOD failure mode - the app degrades to the game's own
 *    English instead of breaking - and an unreported one, so nobody learns upstream changed.
 *
 * Measured on 2026-09-13: **105 distinct** unmapped trigger clauses across **519 instances**, and
 * **67** team conditions carrying only a raw clause. None of that appeared anywhere.
 *
 * This is explicitly NOT a failure. Degrading to the game's own English is the owner's rule. The
 * count exists so a change in it can be noticed.
 */

/**
 * The clauses the tier view maps to their own translated keys. Kept here as data rather than
 * imported from the TypeScript module because this runs in the dataset chain, which has no TS
 * loader - and the spec asserts the two lists agree, so they cannot drift apart silently.
 */
export const MAPPED_TRIGGER_CLAUSES = Object.freeze([
  'if they have a beneficial orb',
  'if they have the applicable tag',
]);

/** A team condition is structured when the catalogue has something to translate it FROM. */
function hasStructuredTargets(condition) {
  return Boolean(
    (condition?.types ?? []).length ||
      (condition?.classes ?? []).length ||
      (condition?.characterTags ?? []).length,
  );
}

/**
 * Every clause the app will show in the game's own English, grouped and counted.
 *
 * `characterIds` is capped: the point is that the clause exists and how often, not an index of the
 * roster. A handful of ids is enough to go and look at one.
 */
export function collectUnresolvedClauses(details, { maxCharacterIdsPerItem = 5 } = {}) {
  const mapped = new Set(MAPPED_TRIGGER_CLAUSES);
  const byClause = new Map();

  const record = (kind, clause, characterId) => {
    const text = String(clause ?? '').trim();

    if (!text) {
      return;
    }

    const key = `${kind}${text}`;
    const existing = byClause.get(key);

    if (existing) {
      existing.instances += 1;

      if (existing.characterIds.length < maxCharacterIdsPerItem) {
        existing.characterIds.push(characterId);
      }

      return;
    }

    byClause.set(key, { kind, clause: text, instances: 1, characterIds: [characterId] });
  };

  for (const { characterId, detail } of details) {
    for (const entry of detail?.captainAbilityCoverage?.entries ?? []) {
      for (const tier of entry?.tiers ?? []) {
        for (const trigger of tier?.triggerConditions ?? []) {
          const clause = trigger?.rawClause;

          if (clause && !mapped.has(String(clause))) {
            record('triggerClause', clause, characterId);
          }
        }

        for (const condition of tier?.teamConditions ?? []) {
          if (!hasStructuredTargets(condition) && condition?.rawClause) {
            record('teamConditionRawOnly', condition.rawClause, characterId);
          }
        }
      }
    }
  }

  // Most-repeated first, then alphabetical, so the file is stable between runs and the clause worth
  // mapping next is the one at the top.
  return [...byClause.values()].sort(
    (left, right) =>
      right.instances - left.instances ||
      left.kind.localeCompare(right.kind) ||
      left.clause.localeCompare(right.clause),
  );
}

export function createUnresolvedClauseCatalog(details, sourceVersion, generatedAt, options = {}) {
  const items = collectUnresolvedClauses(details, options);
  const byKind = {};

  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + item.instances;
  }

  return {
    generatedAt,
    sourceVersion,
    // `total` counts INSTANCES, matching optc-unresolved-images.json, where total is how much is
    // missing rather than how many kinds of thing are.
    total: items.reduce((sum, item) => sum + item.instances, 0),
    distinctClauses: items.length,
    byKind: Object.fromEntries(Object.entries(byKind).sort(([left], [right]) => left.localeCompare(right))),
    items,
  };
}
