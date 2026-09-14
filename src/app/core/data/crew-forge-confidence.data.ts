/**
 * What the Crew Forge match confidence number actually means.
 *
 * 869f12x5m. The score decides whether a screenshot match is trusted, and
 * nothing recorded its range, what counts as good, or what it was measured
 * against - so nobody outside the code that produced it could act on it. That
 * is why the score existed and no surface used it.
 *
 * Everything here is READ from the matcher, not chosen for it. The subtask was
 * explicit: do not invent a cut-off.
 *
 * THE FORMULA, from `CrewForgeImageImportService.compareFingerprints`:
 *
 *     confidence = max(0, 1 - sqrt(mean((a[i] - b[i])^2)))
 *
 * over the first `min(a.length, b.length)` samples of two fingerprints. A
 * fingerprint is `fingerprintSize^2` grayscale samples in [0, 1] - 256 of them
 * at the default size of 16.
 *
 * THE RANGE IS [0, 1], AND THAT IS MISLEADING ON ITS OWN.
 *
 * Both inputs are bounded in [0, 1], so the root-mean-square error between two
 * real portraits almost never approaches 1, and the confidence almost never
 * approaches 0. Measured on 2026-09-14 with the formula above:
 *
 *   | what is being compared            | confidence |
 *   | --------------------------------- | ---------- |
 *   | the same crop                     | 1.0000     |
 *   | a crop shifted 0.08 per sample    | 0.9222     |
 *   | a crop shifted 0.10 per sample    | 0.9035     |
 *   | a COMPLETELY DIFFERENT portrait   | 0.60-0.64  |
 *   | an all-black crop                 | 0.43-0.47  |
 *
 * So the useful discrimination happens in a narrow band near the top, and the
 * percentage the Crew Forge screen prints is not a linear "how right is this":
 * **60% is a different character, not a near miss.** Anything reading this score
 * has to compare it against the threshold, never against a human intuition
 * about percentages.
 */

/** The lowest and highest values `compareFingerprints` can return. */
export const CREW_FORGE_CONFIDENCE_RANGE = { min: 0, max: 1 } as const;

/**
 * Measured confidence for comparisons whose answer is known, so the numbers
 * above stay honest if the matcher changes.
 *
 * These are the empirical landmarks, not thresholds. The matcher has exactly
 * one threshold and it is `matchThreshold` below.
 */
export const CREW_FORGE_CONFIDENCE_LANDMARKS = {
  /** The same fingerprint compared with itself. */
  identical: 1,
  /**
   * Two unrelated portraits. Well above zero, which is the surprising part.
   * Measured twice on 2026-09-14: 0.6012 over 256 samples, 0.6429 over 16.
   * Recorded as a bound rather than a figure, because it depends on the crops.
   */
  unrelatedPortraitsAtLeast: 0.55,
  /**
   * A blank crop against a portrait - the floor in practice, not 0.
   * Measured 0.4278 over 256 samples and 0.4720 over 16.
   */
  blankCropAtLeast: 0.4,
} as const;

/**
 * The bands the matcher actually produces. There are TWO, and a third is not
 * invented here.
 *
 * `CrewForgeImageImportService.recognize` assigns a character when
 * `confidence >= profile.preprocess.matchThreshold` and leaves the slot
 * unassigned otherwise. `empty` is decided BEFORE any comparison, from the
 * crop's own variance, so it is not a confidence band at all.
 *
 * A "borderline" band between the two would need a second cut-off that no code
 * uses. 869f12x41 proposes a review queue for low-confidence matches; it should
 * order by confidence ascending and let the reader decide where to stop, rather
 * than cut at a number invented here. Inventing one is how a good feature gets
 * a wrong cut-off nobody can argue with later.
 */
export const CREW_FORGE_CONFIDENCE_BANDS = [
  {
    id: 'matched',
    rule: 'confidence >= profile.preprocess.matchThreshold',
    meaning: 'The slot is assigned this character.',
  },
  {
    id: 'ambiguous',
    rule: 'confidence < profile.preprocess.matchThreshold',
    meaning:
      'The slot is left unassigned and the top three candidates are offered. This is the band a review queue draws from.',
  },
] as const;

/**
 * The defaults a profile starts with, and what each one gates.
 *
 * Both are per-profile and editable by the reader, and both are clamped to
 * [0, 1] by `UserStateService.normalizeUnitInterval` on read - so a profile
 * imported with nonsense cannot widen the match band.
 */
export const CREW_FORGE_PREPROCESS_DEFAULTS = {
  /** Samples per side; the fingerprint is this squared. */
  fingerprintSize: 16,
  /**
   * The ONLY confidence cut-off in the matcher. 0.92 is roughly a 0.08
   * per-sample difference, which is a tight match rather than a loose one.
   */
  matchThreshold: 0.92,
  /**
   * Compared against the crop's VARIANCE, never against confidence. Below it
   * the slot is reported `empty` and no comparison is made at all.
   */
  emptyVarianceThreshold: 0.005,
} as const;

export type CrewForgeConfidenceBandId = (typeof CREW_FORGE_CONFIDENCE_BANDS)[number]['id'];

/** Which band a score falls in, for a given profile threshold. */
export function crewForgeConfidenceBand(
  confidence: number,
  matchThreshold: number,
): CrewForgeConfidenceBandId {
  return confidence >= matchThreshold ? 'matched' : 'ambiguous';
}
