/**
 * 869f1328p. What each ability tag in the filter bar MEANS, and how many characters carry it.
 *
 * The builders filter on derived ability tags, and those tags come out of parsing ability prose.
 * The rules live in the parser, so a player who filters on a tag and sees a unit missing cannot
 * tell whether the unit lacks the ability or merely words it differently - and neither can we.
 *
 * This records, per tag: the phrasings that produce it, how many characters carry it in the
 * shipped dataset, and where the tag comes from when no regex produces it. Regenerated with the
 * dataset, so an upstream rewording shows up as a COUNT THAT MOVED rather than as a filter that
 * quietly narrowed.
 */

/**
 * How far a tag's match count may move before the lane demands a look.
 *
 * Deliberately a threshold and not equality. `optc-release` regenerates the dataset and commits it
 * straight to `main`, and a routine data release adds a handful of characters to a 4,618-row
 * roster - well under a tenth of a percent. An equality check would turn every automatic data
 * release red, which is how a guard trains people to ignore it. These numbers pass normal growth
 * and fail a parser rewording.
 */
export const ABILITY_TAG_DRIFT_RELATIVE = 0.1;
export const ABILITY_TAG_DRIFT_ABSOLUTE_FLOOR = 25;

/**
 * Tags whose absence for a given phrasing is DELIBERATE, recorded so a reader who expected a match
 * finds the reason rather than filing it as a bug.
 *
 * Extracted by hand from the parser's own comments, which explain these at length. A tag without an
 * entry is not a failure - most tags have no interesting near-miss - but a tag WITH one has the
 * answer beside the count instead of 1,500 lines away.
 */
export const ABILITY_TAG_NEAR_MISSES = Object.freeze({
  special_damage:
    'Does NOT match defensive uses of the word: "[BOMB] orbs will deal N% less damage to the crew" and "reduces damage received" both contain "damage" and neither deals any.',
  special_damage_other:
    'Means TYPELESS damage, where the type-matchup multiplier is forced to x1. Does NOT include plain "True" damage, which ignores enemy DEF but is still typed and still respects the matchup - that stays under special_damage.',
});

/** Every `/re/flags` literal inside a chunk of source, as its pattern text. */
function readPatternLiterals(body) {
  return [...body.matchAll(/\/((?:[^/\\\n]|\\.)+)\/[a-z]*/gu)].map((match) => match[1]);
}

/**
 * The parser declares matchers in THREE shapes, and a reader who handles one of them silently
 * reports the other two as "no phrasing produces this tag" - which is the quietly-wrong record
 * this artifact exists to prevent. Measured while building it: handling only the tuple form found
 * 51 of 86 matcher keys and called the other 35 structured-upstream fields.
 *
 *   1. `['key', [/re/]]`                  - tuple, inline or across lines
 *   2. `{ key: 'key', patterns: [/re/] }` - object, used by the crewmate matchers
 *   3. `['key', NAMED_PATTERNS]`          - tuple referencing a module constant
 */
export function parseAbilityMatcherPatterns(parserSource) {
  const byKey = new Map();
  const namedPatternConstants = new Map();

  for (const match of parserSource.matchAll(
    /^const ([A-Z][A-Z0-9_]*(?:PATTERNS|MATCHERS))\s*=\s*\[([\s\S]*?)^\];/gmu,
  )) {
    namedPatternConstants.set(match[1], readPatternLiterals(match[2]));
  }

  const record = (key, patterns) => {
    if (!byKey.has(key) && patterns.length) {
      byKey.set(key, patterns);
    }
  };

  // Shape 3 first: a constant reference carries no literal of its own to find.
  for (const match of parserSource.matchAll(/\[\s*'([a-z_]+)',\s*([A-Z][A-Z0-9_]*)\s*\]/gu)) {
    record(match[1], namedPatternConstants.get(match[2]) ?? []);
  }

  // Shape 2.
  for (const match of parserSource.matchAll(
    /key:\s*'([a-z_]+)',\s*\n\s*patterns:\s*\[([\s\S]*?)\],/gu,
  )) {
    record(match[1], readPatternLiterals(match[2]));
  }

  // Shape 1.
  for (const match of parserSource.matchAll(
    /\[\s*'([a-z_]+)',\s*(?:\/\/[^\n]*\n\s*)*\[([\s\S]*?)\],?\s*\]/gu,
  )) {
    record(match[1], readPatternLiterals(match[2]));
  }

  return byKey;
}

/**
 * Tags whose turns are read from ANOTHER tag's structured data rather than from prose of their own.
 *
 * `STRUCTURED_TURN_SOURCE_ALIASES` maps 23 support and crewmate recovery tags onto the underlying
 * effect key. They have no phrasing because they need none - and calling them
 * `structured-upstream-field` alongside genuinely unparsed tags would blur two different answers
 * into one, which is the kind of near-enough record this whole wave exists to stop.
 */
export function parseStructuredTurnAliases(parserSource) {
  const aliases = new Map();
  const match = parserSource.match(
    /const STRUCTURED_TURN_SOURCE_ALIASES = new Map\(\[([\s\S]*?)^\]\);/mu,
  );

  if (!match) {
    return aliases;
  }

  for (const row of match[1].matchAll(/\[\s*'([a-z_]+)',\s*\[([^\]]*)\]\s*\]/gu)) {
    aliases.set(
      row[1],
      [...row[2].matchAll(/'([a-z_]+)'/gu)].map((alias) => alias[1]),
    );
  }

  return aliases;
}

export function buildAbilityTagCatalogue({ abilityCatalogue, parserSource, generatedAt }) {
  const patternsByKey = parseAbilityMatcherPatterns(parserSource);
  const aliasesByKey = parseStructuredTurnAliases(parserSource);
  const tags = (abilityCatalogue.abilities ?? []).map((ability) => {
    const patterns = patternsByKey.get(ability.key) ?? null;
    const aliases = aliasesByKey.get(ability.key) ?? null;

    return {
      key: ability.key,
      label: ability.label,
      category: ability.category,
      matchCount: ability.matchCount ?? 0,
      /*
       * `null` is a real answer and not a gap: 263 tags ship and only some are produced by a
       * regex over ability prose. The rest are derived from structured upstream fields, where the
       * "phrasing that produces it" question does not arise.
       */
      sourcePhrasings: patterns,
      ...(aliases ? { structuredTurnSources: aliases } : {}),
      derivation: patterns
        ? 'ability-prose-matcher'
        : aliases
          ? 'structured-turns-from-another-tag'
          : 'structured-upstream-field',
      ...(ABILITY_TAG_NEAR_MISSES[ability.key]
        ? { knownNearMiss: ABILITY_TAG_NEAR_MISSES[ability.key] }
        : {}),
    };
  });

  return {
    generatedAt,
    note: 'Generated by scripts/generate-ability-tag-catalogue.mjs from the shipped ability catalogue and the parser. Do not edit by hand. Match counts move with the dataset; the lane fails only when one moves further than ABILITY_TAG_DRIFT_RELATIVE / ABILITY_TAG_DRIFT_ABSOLUTE_FLOOR allow.',
    tagCount: tags.length,
    proseMatchedTagCount: tags.filter((tag) => tag.sourcePhrasings).length,
    structuredTurnAliasTagCount: tags.filter(
      (tag) => tag.derivation === 'structured-turns-from-another-tag',
    ).length,
    tags,
  };
}

/**
 * Compares a freshly measured catalogue against the committed one and reports only the tags whose
 * count moved further than the threshold allows.
 *
 * Returns `[]` when the committed file does not exist yet, because a first run has nothing to
 * drift from and failing it would only teach people to pass `--write`.
 */
export function findAbilityTagDrift(committed, measured) {
  if (!committed?.tags?.length) {
    return [];
  }

  const drift = [];
  const committedByKey = new Map(committed.tags.map((tag) => [tag.key, tag]));

  for (const tag of measured.tags) {
    const previous = committedByKey.get(tag.key);

    if (!previous) {
      continue;
    }

    const delta = Math.abs(tag.matchCount - previous.matchCount);
    const allowed = Math.max(
      ABILITY_TAG_DRIFT_ABSOLUTE_FLOOR,
      Math.round(previous.matchCount * ABILITY_TAG_DRIFT_RELATIVE),
    );

    if (delta > allowed) {
      drift.push(
        `${tag.key}: ${previous.matchCount} -> ${tag.matchCount} (moved ${delta}, allowed ${allowed}). A tag that moves this far means the parser or the upstream wording changed - check which, then regenerate.`,
      );
    }
  }

  for (const tag of committed.tags) {
    if (!measured.tags.some((measuredTag) => measuredTag.key === tag.key)) {
      drift.push(`${tag.key}: was in the catalogue and is gone. A tag the filter bar offered has disappeared.`);
    }
  }

  return drift;
}
