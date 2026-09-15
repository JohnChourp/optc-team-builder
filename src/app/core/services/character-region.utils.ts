import {
  type CharacterRegionRelease,
  type CharacterRegionArtwork,
} from '../models/optc.models';

/**
 * 869f13282. Which version of One Piece Treasure Cruise the reader plays.
 *
 * Stored as a preference, `all` by default, so an existing reader's catalogue is byte-identical
 * after the update that introduces this. Owner decision, 2026-09-15: default off, and an
 * out-of-region unit is **marked, never hidden** - the catalogue stays a complete reference for a
 * reader looking something up on a friend's behalf.
 */
export const CHARACTER_REGION_PREFERENCES = ['all', 'global', 'japan'] as const;

export type CharacterRegionPreference = (typeof CHARACTER_REGION_PREFERENCES)[number];

export const DEFAULT_CHARACTER_REGION_PREFERENCE: CharacterRegionPreference = 'all';

/**
 * `unknown` is a third state and not a polite `out-of-region`.
 *
 * 221 of 4,618 units carry no upstream flag row at all (measured 2026-09-15), and every manually
 * added character is in the same position. The badge renders nothing for them: saying "Japan only"
 * about a unit we have no data for is the exact failure this work replaced.
 */
export type CharacterRegionStatus = 'in-region' | 'out-of-region' | 'unknown';

export function normalizeCharacterRegionPreference(value: unknown): CharacterRegionPreference {
  return CHARACTER_REGION_PREFERENCES.includes(value as CharacterRegionPreference)
    ? (value as CharacterRegionPreference)
    : DEFAULT_CHARACTER_REGION_PREFERENCE;
}

/**
 * Where a unit stands relative to the version the reader plays.
 *
 * **Why `japan` can never return `out-of-region`, and that is not a bug.** The upstream dataset is
 * the Japanese roster; `flags.js` marks with `global: 1` the subset that has also reached Global.
 * There is no Global-exclusive flag in it, and inventing one from the absence of another flag would
 * be a second proxy of exactly the kind 869f13284 removed. So a reader who plays Japan can obtain
 * everything this dataset holds, and the honest answer is `in-region` for every unit. The option
 * still earns its place: it is how that reader says "stop asking me about regions".
 */
export function resolveCharacterRegionStatus(
  release: CharacterRegionRelease | null | undefined,
  preference: CharacterRegionPreference,
): CharacterRegionStatus {
  if (preference === 'all') {
    return 'in-region';
  }

  const availableOnGlobal = release?.availableOnGlobal ?? null;

  if (preference === 'japan') {
    return 'in-region';
  }

  if (availableOnGlobal === null) {
    return 'unknown';
  }

  return availableOnGlobal ? 'in-region' : 'out-of-region';
}

/**
 * The predicate behind the opt-in "only units I can get" filter and the builder pool restriction.
 *
 * An `unknown` unit passes. A filter that silently dropped the 221 units we hold no release data
 * for would answer a different question than the one the reader asked, and would do it invisibly.
 */
export function isCharacterAvailableInRegion(
  release: CharacterRegionRelease | null | undefined,
  preference: CharacterRegionPreference,
): boolean {
  return resolveCharacterRegionStatus(release, preference) !== 'out-of-region';
}

/**
 * 869f1328c. Restated here because the name no longer says it: nothing on
 * {@link CharacterRegionArtwork} answers an availability question. Kept as a typed function rather
 * than a comment so a reader who reaches for the artwork flags has somewhere correct to land.
 */
export function hasArtworkForRegion(
  artwork: CharacterRegionArtwork | null | undefined,
  region: 'global' | 'japan',
): boolean {
  if (!artwork) {
    return false;
  }

  return region === 'global' ? artwork.thumbnailGlobal : artwork.thumbnailJapan;
}

/**
 * The SQL half of {@link isCharacterAvailableInRegion}, for the repository's indexed query path.
 *
 * `COALESCE(..., 1)` is the sentinel rule expressed in SQL: `json_extract` returns `1`, `0` or
 * `NULL`, and a `NULL` - the 221 units upstream carries no flag row for - must survive the filter
 * exactly as it does in memory. Without the `COALESCE` every `NULL` comparison is `NULL`, which
 * SQLite treats as false, and the filter would silently drop the units we know least about.
 *
 * Returns `null` when the preference filters nothing, so a caller adds no clause at all rather than
 * a tautology. `character-region.utils.spec.ts` pins this against the in-memory predicate over
 * every combination, so the two paths cannot drift.
 */
export function buildCharacterRegionSqlClause(
  preference: CharacterRegionPreference,
  columnReference = 'region_release_json',
): string | null {
  if (preference !== 'global') {
    return null;
  }

  return `COALESCE(json_extract(${columnReference}, '$.availableOnGlobal'), 1) <> 0`;
}
