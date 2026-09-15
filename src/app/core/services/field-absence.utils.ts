/**
 * 869f1328r. What "we do not know" looks like, per field family, declared once.
 *
 * The same question recurs across the dataset - a missing stat, a zero cooldown, a null thumbnail,
 * an empty ability string - and until now it was answered wherever it happened to be read. So
 * *"does 0 mean zero or mean unknown?"* had no single answer, and the two are not the same thing
 * to a player: **one is a fact and the other is an absence**.
 *
 * `character-overrides.utils.spec.ts` already pins two sharp cases correctly - negative stats
 * survive an editor save, blank fields read as unknown - but for one surface only. This is the
 * convention those decisions imply, in a form every reader can consume.
 *
 * The region work in the same wave depends on it directly: `thumbnailGlobal: false` means *no
 * thumbnail is installed*, which is NOT *not available on Global*, and reading the first as the
 * second is what made the old field wrong for 927 units.
 */

/**
 * The families, and what absence looks like in each.
 *
 * `absentValue` is what the dataset actually stores when the value is unknown. `zeroIsAFact` says
 * whether `0` is a real measurement in that family - the distinction the whole module exists for.
 */
export const FIELD_ABSENCE_CONVENTIONS = Object.freeze({
  /**
   * HP, ATK, RCV and growth. `null` is unknown; `0` is a real stat and some units genuinely have
   * one. A stat family that treated `0` as absent would hide real units from a sort.
   */
  stat: { absentValue: null, zeroIsAFact: true },
  /**
   * Special cooldowns and max sockets. `null` is unknown - a unit with no special at all, or one
   * whose cooldown upstream never recorded. `0` is a real cooldown (a fully-reduced special).
   */
  cooldown: { absentValue: null, zeroIsAFact: true },
  /**
   * Image paths. `null` is "no asset of this kind", and there is no zero to confuse it with.
   */
  asset: { absentValue: null, zeroIsAFact: false },
  /**
   * Ability and note prose. Absence is `null`, never the empty string: an empty string renders as
   * a blank line where a missing field renders as nothing, and the two look identical in a debug
   * dump while behaving differently on screen.
   */
  prose: { absentValue: null, zeroIsAFact: false },
  /**
   * Per-region release. `null` is "upstream has no flag row for this unit" and `false` is "upstream
   * has a row and it does not say Global". Collapsing the two is the 869f13284 defect exactly.
   */
  regionRelease: { absentValue: null, zeroIsAFact: false },
} as const);

export type FieldAbsenceFamily = keyof typeof FIELD_ABSENCE_CONVENTIONS;

/**
 * Whether a value read from the dataset means "we do not know".
 *
 * `NaN` counts as absent everywhere: it is what `Number(undefined)` produces, so a family that
 * accepted it would let a parse failure read as a measurement.
 */
export function isFieldAbsent(family: FieldAbsenceFamily, value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'number' && Number.isNaN(value)) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (typeof value === 'number' && value === 0) {
    return !FIELD_ABSENCE_CONVENTIONS[family].zeroIsAFact;
  }

  return false;
}

/**
 * What the UI should render for a value, keeping absence distinguishable from zero.
 *
 * Returns `null` for absence so a caller renders its own placeholder - a dash, an em dash, a
 * localised "unknown" - rather than this module inventing copy that would then need translating.
 * The important half is that `0` and absence never return the same thing.
 */
export function formatFieldForDisplay(family: FieldAbsenceFamily, value: unknown): string | null {
  return isFieldAbsent(family, value) ? null : String(value);
}
