/**
 * The two numbers Crew Forge's screenshot matcher decides on.
 *
 * 869f12x5m. These were private methods of `CrewForgeImageImportService`, which
 * meant the scale that decides whether a match is trusted could not be pinned by
 * a test, and could not be read by any surface that wanted to act on it. The
 * bodies are unchanged; only their address is.
 *
 * `src/app/core/data/crew-forge-confidence.data.ts` describes what the values
 * mean and what they were measured at. This file is how they are produced.
 */

/**
 * How alike two fingerprints are, in [0, 1].
 *
 * `1` is identical. It is NOT a percentage of correctness: both inputs are
 * bounded in [0, 1], so two completely different portraits still score around
 * 0.6 and a blank crop around 0.43. Compare against the profile's
 * `matchThreshold`, never against an intuition about percentages.
 */
export function compareCrewForgeFingerprints(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);

  if (!length) {
    return 0;
  }

  let sum = 0;

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    sum += difference * difference;
  }

  const rootMeanSquareError = Math.sqrt(sum / length);

  return Math.max(0, 1 - rootMeanSquareError);
}

/**
 * How much a crop varies from its own mean.
 *
 * Compared against `emptyVarianceThreshold` BEFORE any matching, to decide that
 * a slot is empty. It is not a confidence and shares no scale with one.
 */
export function calculateCrewForgeFingerprintVariance(fingerprint: number[]): number {
  if (!fingerprint.length) {
    return 0;
  }

  const mean = fingerprint.reduce((sum, value) => sum + value, 0) / fingerprint.length;

  return (
    fingerprint.reduce((sum, value) => {
      const difference = value - mean;

      return sum + difference * difference;
    }, 0) / fingerprint.length
  );
}
