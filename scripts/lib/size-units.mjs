/**
 * 869f138r0. The same file has four sizes, and a number without one of them is unusable.
 *
 * `optc-seed.sql` is the worked example the task gave, and every row of it is a different answer to
 * "how big is it?" (**re-measured 2026-09-20 at v0.5.3**; the figures this block shipped with were
 * from before v0.4.21 and had drifted by about 9%):
 *
 * | Question | Answer |
 * | --- | ---: |
 * | Bytes on disk | 27,751,668 |
 * | Bytes over the wire, as it was served | 27,751,668 - no encoding, which is what 869f138q7 fixed |
 * | Bytes over the wire, compressed | 2,332,820 |
 * | Bytes in the service-worker cache | the raw bytes, because a response is cached decoded |
 * | Bytes after parsing into SQLite | never measured |
 *
 * The abilities catalogue tells it differently and worse: 795,904 raw against 137,886 gzipped is a
 * **near six-fold** difference, so two people quoting "796 KB" and "138 KB" are describing the same
 * file and will not realise they agree.
 *
 * **Every number above is a snapshot and every release that imports characters moves it.** They are
 * here to show that one file has four sizes, not to be quoted as current - which is exactly the
 * mistake this module exists to prevent. Re-measure before citing one.
 *
 * So every byte budget declares which one it is, and the report fails on a row that does not. This
 * is not documentation - `unit: 'bytes'` was already there and said nothing, which is precisely the
 * failure: a field that looks like it answers the question while answering a different one.
 */

export const SIZE_UNITS = Object.freeze({
  /** The file as it exists, uncompressed. What `ls` reports and what a build log prints. */
  raw: 'raw bytes, uncompressed, as the file exists',
  /**
   * The same file compressed, as an estimate of what crosses the network.
   *
   * An estimate and not a measurement: the host chooses its own encoding and level, so this is what
   * the harness computed, not what a reader's browser received.
   */
  gzip: 'compressed bytes, an estimate of what crosses the network',
  /**
   * What the service worker stores on the device.
   *
   * Equal to `raw` for every asset, and worth its own name anyway: a response is cached DECODED, so
   * host compression never shrinks what the device holds, and reading a cached figure as a download
   * cost is the mistake this unit exists to stop.
   */
  cached: 'bytes as the service worker stores them on the device, always decoded',
  /** The cost in memory after parsing. Nothing measures this yet, and no row may claim it falsely. */
  parsed: 'bytes held in memory after parsing',
});

export const SIZE_UNIT_NAMES = Object.freeze(Object.keys(SIZE_UNITS));

/** Rows measured in something other than bytes need no size unit; a byte row must declare one. */
export function requiresSizeUnit(row) {
  return row?.unit === 'bytes';
}

export function isValidSizeUnit(value) {
  return typeof value === 'string' && Object.hasOwn(SIZE_UNITS, value);
}

/**
 * Every byte row that does not say which of the four it is.
 *
 * Returns findings rather than throwing, so the report can list all of them at once: a row at a
 * time would mean one run per missing declaration.
 */
export function findUndeclaredSizeUnits(rows) {
  return (rows ?? [])
    .filter((row) => requiresSizeUnit(row) && !isValidSizeUnit(row.sizeUnit))
    .map((row) => ({
      kind: isValidSizeUnit(row.sizeUnit) ? 'unknown-size-unit' : 'missing-size-unit',
      metricKey: row.metricKey ?? '(unnamed)',
      metricLabel: row.metricLabel ?? '',
      detail:
        row.sizeUnit === undefined
          ? `declares no sizeUnit - add one of ${SIZE_UNIT_NAMES.join(', ')}`
          : `declares sizeUnit "${row.sizeUnit}", which is not one of ${SIZE_UNIT_NAMES.join(', ')}`,
    }));
}
