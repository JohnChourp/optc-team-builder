import { describe, expect, it } from 'vitest';

import {
  calculateCrewForgeFingerprintVariance,
  compareCrewForgeFingerprints,
} from '../services/crew-forge-fingerprint.utils';
import {
  CREW_FORGE_CONFIDENCE_BANDS,
  CREW_FORGE_CONFIDENCE_LANDMARKS,
  CREW_FORGE_CONFIDENCE_RANGE,
  CREW_FORGE_PREPROCESS_DEFAULTS,
  crewForgeConfidenceBand,
} from './crew-forge-confidence.data';

/**
 * Fingerprints, not images.
 *
 * 869f12x5m asked for "a small committed fixture set with known-correct and
 * known-wrong crops that pins each band". Crops cannot be the fixture: turning
 * an image into a fingerprint needs a canvas, and these specs have no DOM. The
 * fingerprint IS the matcher's input, so pinning fingerprints pins the same
 * thing one honest step closer to the code - and does it deterministically,
 * with no dependence on how a platform decodes a PNG.
 *
 * Sixteen samples rather than the default 256: `compareCrewForgeFingerprints`
 * averages over `min(a.length, b.length)`, so the arithmetic is identical at
 * any size, and sixteen numbers can be read by a human.
 */
const PORTRAIT = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15];
/** The same portrait, every sample off by 0.05 - a good crop of the same character. */
const SAME_CHARACTER_SLIGHTLY_OFF = PORTRAIT.map((value, index) =>
  Math.min(1, Math.max(0, value + (index % 2 ? 0.05 : -0.05))),
);
/** Off by 0.30 - the same picture through a very different capture. */
const SAME_CHARACTER_BADLY_OFF = PORTRAIT.map((value, index) =>
  Math.min(1, Math.max(0, value + (index % 2 ? 0.3 : -0.3))),
);
/** A different character entirely. */
const OTHER_CHARACTER = [0.9, 0.1, 0.85, 0.15, 0.8, 0.2, 0.75, 0.25, 0.7, 0.3, 0.65, 0.35, 0.6, 0.4, 0.55, 0.45];
const BLANK_CROP = new Array(16).fill(0);
const FLAT_GREY_CROP = new Array(16).fill(0.5);

const { matchThreshold } = CREW_FORGE_PREPROCESS_DEFAULTS;

describe('crew forge confidence scale', () => {
  it('pins the exact score of each fixture', () => {
    /*
     * To six decimal places on purpose: a matcher change that moves a fixture
     * should fail with the number it moved to, not with a vague "band changed".
     */
    expect(compareCrewForgeFingerprints(PORTRAIT, PORTRAIT)).toBeCloseTo(1, 6);
    expect(compareCrewForgeFingerprints(PORTRAIT, SAME_CHARACTER_SLIGHTLY_OFF)).toBeCloseTo(0.95, 6);
    expect(compareCrewForgeFingerprints(PORTRAIT, SAME_CHARACTER_BADLY_OFF)).toBeCloseTo(0.719933, 6);
    expect(compareCrewForgeFingerprints(PORTRAIT, OTHER_CHARACTER)).toBeCloseTo(0.642929, 6);
    expect(compareCrewForgeFingerprints(PORTRAIT, BLANK_CROP)).toBeCloseTo(0.472032, 6);
  });

  it('puts each fixture in the band the matcher would', () => {
    const band = (other: number[]) =>
      crewForgeConfidenceBand(compareCrewForgeFingerprints(PORTRAIT, other), matchThreshold);

    expect(band(PORTRAIT)).toBe('matched');
    expect(band(SAME_CHARACTER_SLIGHTLY_OFF)).toBe('matched');
    expect(band(SAME_CHARACTER_BADLY_OFF)).toBe('ambiguous');
    expect(band(OTHER_CHARACTER)).toBe('ambiguous');
    expect(band(BLANK_CROP)).toBe('ambiguous');
  });

  it('shows why the number is not a percentage of correctness', () => {
    /*
     * The finding this whole file exists to record: a COMPLETELY WRONG match
     * still scores in the sixties. A reader - or a future review queue - that
     * treats 60% as "probably right" would accept a different character.
     */
    const wrong = compareCrewForgeFingerprints(PORTRAIT, OTHER_CHARACTER);
    const blank = compareCrewForgeFingerprints(PORTRAIT, BLANK_CROP);

    expect(wrong).toBeGreaterThan(CREW_FORGE_CONFIDENCE_LANDMARKS.unrelatedPortraitsAtLeast);
    expect(blank).toBeGreaterThan(CREW_FORGE_CONFIDENCE_LANDMARKS.blankCropAtLeast);
    expect(wrong, 'a wrong match scores nowhere near zero').toBeGreaterThan(0.5);
    expect(wrong, 'but still nowhere near the threshold').toBeLessThan(matchThreshold);
  });

  it('keeps every score inside the declared range', () => {
    for (const candidate of [PORTRAIT, SAME_CHARACTER_SLIGHTLY_OFF, OTHER_CHARACTER, BLANK_CROP]) {
      const confidence = compareCrewForgeFingerprints(PORTRAIT, candidate);

      expect(confidence).toBeGreaterThanOrEqual(CREW_FORGE_CONFIDENCE_RANGE.min);
      expect(confidence).toBeLessThanOrEqual(CREW_FORGE_CONFIDENCE_RANGE.max);
    }

    expect(compareCrewForgeFingerprints([], []), 'no samples is no confidence').toBe(0);
  });

  it('declares exactly the two bands the matcher produces', () => {
    /*
     * If a third band is ever added here, the matcher has to have grown a second
     * cut-off - and this fails until it has. That is the guard against inventing
     * a "borderline" threshold for the review queue 869f12x41 proposes.
     */
    expect(CREW_FORGE_CONFIDENCE_BANDS.map((band) => band.id)).toEqual(['matched', 'ambiguous']);
  });

  it('keeps emptiness a variance question, not a confidence one', () => {
    /*
     * `empty` is decided before any comparison, from the crop's own variance.
     * A flat grey crop and a black crop are both empty; neither has a low
     * confidence, because neither is compared to anything.
     */
    expect(calculateCrewForgeFingerprintVariance(BLANK_CROP)).toBe(0);
    expect(calculateCrewForgeFingerprintVariance(FLAT_GREY_CROP)).toBe(0);
    expect(calculateCrewForgeFingerprintVariance(PORTRAIT)).toBeCloseTo(0.053125, 6);

    expect(calculateCrewForgeFingerprintVariance(FLAT_GREY_CROP)).toBeLessThanOrEqual(
      CREW_FORGE_PREPROCESS_DEFAULTS.emptyVarianceThreshold,
    );
    expect(calculateCrewForgeFingerprintVariance(PORTRAIT)).toBeGreaterThan(
      CREW_FORGE_PREPROCESS_DEFAULTS.emptyVarianceThreshold,
    );
  });

  it('matches the defaults the matcher and the built-in profile actually use', () => {
    expect(CREW_FORGE_PREPROCESS_DEFAULTS.matchThreshold).toBe(0.92);
    expect(CREW_FORGE_PREPROCESS_DEFAULTS.emptyVarianceThreshold).toBe(0.005);
    expect(CREW_FORGE_PREPROCESS_DEFAULTS.fingerprintSize).toBe(16);
  });
});
