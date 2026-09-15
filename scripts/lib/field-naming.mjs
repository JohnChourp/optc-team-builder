/**
 * 869f1328c. Names in the character model that promise more than the value delivers.
 *
 * The worked example is settled: `RegionAvailability` held three booleans derived from which
 * image assets exist, and it was named for availability. It is now `CharacterRegionArtwork` -
 * a name that matches the measurement - with the real flag beside it. This generalises the rule
 * so the next one cannot arrive the same way.
 *
 * **Why a name check and not a comment.** This repository's comments are unusually good, and that
 * is exactly the problem: a comment carried the figure 486 after the real number became 960, and
 * only a re-measurement caught it. A name and a type cannot drift the same way, because the
 * compiler and the tests read them.
 */

/**
 * Words that assert a fact about the WORLD, and the kinds of value that cannot support one.
 *
 * A boolean derived from whether an asset is installed, a count derived from a sample, or a flag
 * derived from a string match are all measurements of OUR data, not of the game. A field that
 * measures one of those may not be named for the other.
 */
export const WORLD_CLAIM_WORDS = Object.freeze([
  'availability',
  'released',
  'release',
  'obtainable',
  'unlocked',
]);

/**
 * Bare `available` is deliberately NOT a claim word, and this is the reason.
 *
 * The first version of this list included it and flagged seven names on its first run -
 * `availableTriggerTags`, `availableSlotTokens`, `availableSources` and the rest. Every one is a
 * UI option list on a catalogue item: *which trigger tags this item offers*, a fact about OUR
 * catalogue that reads as such. Declaring seven false positives would have made the allowlist
 * longer than the rule, and a guard that flags correct names is one people learn to switch off.
 *
 * What DID mislead was the abstract noun - `RegionAvailability`, a thing whose whole identity is
 * the claim - and the `availableOn<Place>` shape, which asserts obtainability somewhere. Those two
 * are caught; `available<Things>` is not.
 */
const WORLD_CLAIM_PATTERNS = [/^available(?:On|In)[A-Z]/u, /Availability$/u];

/**
 * Names that carry a world-claim word and are allowed to, because they genuinely measure the
 * world. Each entry records WHY, so the allowlist is a set of decisions rather than a mute list.
 *
 * An entry here is a claim someone made on purpose. An unlisted name that trips the check is not.
 */
export const DECLARED_WORLD_CLAIMS = Object.freeze({
  CharacterRegionRelease:
    "Reads upstream's own per-region release flag (`common/data/flags.js`, `global: 1`) - the same source the reference community database uses for its Global units / Japan exclusives filters. It measures the world, so it may be named for it.",
  regionRelease:
    'The CharacterRecord field holding CharacterRegionRelease. It genuinely measures the world - upstream\'s release flag - and is deliberately a SEPARATE field from regionArtwork so the two can never again be read as one.',
  availableOnGlobal:
    'The field of CharacterRegionRelease. `true` / `false` / `null`, where `null` is "upstream has no row" and is never rendered as a claim.',
  availableTypes:
    'Which character types the SHIPPED DATASET contains, on DatasetManifest. Scoped to the dataset by its owning type rather than to the game, and read only to populate filter options.',
  availableClasses: 'As availableTypes.',
});

/**
 * Names whose SUFFIX says what they measure, so a world-claim word inside them is not a promise.
 *
 * `thumbnailGlobal` contains no claim word at all; this covers the shape where one would otherwise
 * be read out of a compound, such as a field ending in `Installed` or `Count`.
 */
const MEASUREMENT_SUFFIXES = ['Installed', 'Count', 'Path', 'Url', 'Text', 'Key', 'Id', 'Ids'];

export function extractModelFieldNames(modelSource) {
  const names = new Set();

  for (const match of modelSource.matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??:/gmu)) {
    names.add(match[1]);
  }

  for (const match of modelSource.matchAll(/^export\s+interface\s+([A-Za-z_$][\w$]*)/gmu)) {
    names.add(match[1]);
  }

  for (const match of modelSource.matchAll(/^export\s+type\s+([A-Za-z_$][\w$]*)/gmu)) {
    names.add(match[1]);
  }

  return [...names];
}

export function findWorldClaimViolations(names) {
  const violations = [];

  for (const name of names) {
    if (Object.hasOwn(DECLARED_WORLD_CLAIMS, name)) {
      continue;
    }

    if (MEASUREMENT_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
      continue;
    }

    const lowered = name.toLowerCase();
    const claim =
      WORLD_CLAIM_WORDS.find((word) => lowered.includes(word)) ??
      (WORLD_CLAIM_PATTERNS.some((pattern) => pattern.test(name)) ? 'availability' : undefined);

    if (claim) {
      violations.push(
        `${name}: the name claims "${claim}" - a fact about the game. If it measures that, declare it in DECLARED_WORLD_CLAIMS with what it reads. If it measures our own data, rename it for what it measures, the way RegionAvailability became CharacterRegionArtwork.`,
      );
    }
  }

  return violations.sort();
}

/**
 * The name the defect shipped under. Asserting it is GONE is what stops the rename being quietly
 * reverted by a merge, and costs one string compare.
 */
export const RETIRED_MISLEADING_NAMES = Object.freeze({
  RegionAvailability:
    'Renamed to CharacterRegionArtwork by 869f13284: its three booleans are derived from which image assets exist, and it disagreed with the real release flag for 927 of 4,397 units. Do not reintroduce it.',
  regionAvailability: 'The field of the same. Renamed to regionArtwork by 869f13284.',
});

export function findRetiredNameReturns(names) {
  return names
    .filter((name) => Object.hasOwn(RETIRED_MISLEADING_NAMES, name))
    .map((name) => `${name} is back. ${RETIRED_MISLEADING_NAMES[name]}`);
}
