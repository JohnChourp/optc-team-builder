/**
 * 869f127dh. What the browser lanes never had: MEMORY.
 *
 * The flake-triage work of 869dwc3za built most of this already -
 * `summarize-playwright-failures.mjs` groups a run's failures by browser, file, title, retry count
 * and a normalized error signature, and `playwright-quarantine.mjs` validates a deliberate
 * quarantine. Both are real and both are per-run: the summary is an artifact of one run, and
 * `e2e/quarantine.json` holds only what a human decided to quarantine. So nothing made a repeat
 * VISIBLE AS A REPEAT, and every browser failure re-opened the same question with the answer
 * re-derived by hand.
 *
 * This is the missing half: a committed, append-only ledger keyed by
 * `project + spec + normalized signature`, so the second occurrence reads as the second occurrence.
 *
 * Quarantine stays a DELIBERATE act. Nothing here writes `e2e/quarantine.json`, and nothing here
 * excludes a spec from a run - a record informs that decision and never makes it. That separation
 * is the point: a ledger that could quarantine on its own would hide the regressions it is meant to
 * help tell apart from flakes.
 */

export const FLAKE_LEDGER_SCHEMA_VERSION = 1;

/** Occurrences kept per record. Enough to see a pattern, bounded so the file cannot grow forever. */
export const MAX_OCCURRENCES_PER_RECORD = 20;

/** A separator no project, spec or signature can contain, so two keys cannot collide by accident. */
const KEY_SEPARATOR = ' :: ';

export function buildFlakeKey({ project = 'unknown', spec = 'unknown', signature = 'unknown' } = {}) {
  return [project, spec, signature].join(KEY_SEPARATOR);
}

export function createEmptyFlakeLedger() {
  return { schemaVersion: FLAKE_LEDGER_SCHEMA_VERSION, records: [] };
}

/**
 * A failure as the ledger stores it, from the summariser's own shape. `browser` becomes `project`
 * and `file` becomes `spec` here, because that is what the reader calls them - and the signature is
 * passed through rather than recomputed, so there is exactly one place that decides when two
 * failures are the same failure.
 */
export function toFlakeObservation(failure, { runId = null, at } = {}) {
  return {
    project: String(failure?.browser ?? 'unknown'),
    spec: String(failure?.file ?? 'unknown'),
    title: String(failure?.title ?? 'unknown'),
    signature: String(failure?.errorSignature ?? 'unknown failure'),
    runId: runId === null || runId === undefined ? null : String(runId),
    at,
  };
}

export function validateFlakeLedger(raw) {
  const errors = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['ledger must be an object'], ledger: createEmptyFlakeLedger() };
  }

  if (raw.schemaVersion !== FLAKE_LEDGER_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${FLAKE_LEDGER_SCHEMA_VERSION}, got ${raw.schemaVersion}`);
  }

  if (!Array.isArray(raw.records)) {
    errors.push('records must be an array');

    return { ok: false, errors, ledger: createEmptyFlakeLedger() };
  }

  raw.records.forEach((record, index) => {
    for (const field of ['project', 'spec', 'signature', 'firstSeen', 'lastSeen']) {
      if (typeof record?.[field] !== 'string' || record[field].trim() === '') {
        errors.push(`records[${index}].${field} must be a non-empty string`);
      }
    }

    if (!Number.isInteger(record?.count) || record.count < 1) {
      errors.push(`records[${index}].count must be a positive integer`);
    }

    if (!Array.isArray(record?.occurrences) || record.occurrences.length === 0) {
      errors.push(`records[${index}].occurrences must be a non-empty array`);
    } else if (record.occurrences.length > MAX_OCCURRENCES_PER_RECORD) {
      errors.push(
        `records[${index}].occurrences keeps ${record.occurrences.length}, more than the ${MAX_OCCURRENCES_PER_RECORD} kept per record`,
      );
    }

    /*
     * The count is what a reader acts on, and the occurrence list is trimmed, so the two are
     * allowed to disagree in one direction only: a count BELOW the kept occurrences means the
     * ledger was edited by hand into a state it cannot have reached.
     */
    if (
      Number.isInteger(record?.count) &&
      Array.isArray(record?.occurrences) &&
      record.count < record.occurrences.length
    ) {
      errors.push(`records[${index}].count is lower than the occurrences it keeps`);
    }
  });

  return { ok: errors.length === 0, errors, ledger: raw };
}

function sortRecords(records) {
  return [...records].sort(
    (left, right) =>
      right.count - left.count ||
      String(right.lastSeen).localeCompare(String(left.lastSeen)) ||
      buildFlakeKey(left).localeCompare(buildFlakeKey(right)),
  );
}

/**
 * The ledger with these observations folded in. Pure: it neither reads nor writes a file, which is
 * what lets the merge rules be driven directly by a test rather than through a browser run.
 *
 * Observations from ONE run collapse into one occurrence per key. A spec that failed on three
 * retries inside a single run flaked once, not three times, and counting retries would make a
 * single bad run look like a standing pattern - which is the exact mistake this ledger exists to
 * stop a reader making by hand.
 */
export function mergeFlakeObservations(
  ledger,
  observations,
  { maxOccurrences = MAX_OCCURRENCES_PER_RECORD } = {},
) {
  const next = {
    schemaVersion: FLAKE_LEDGER_SCHEMA_VERSION,
    records: (ledger?.records ?? []).map((record) => ({
      ...record,
      occurrences: [...(record.occurrences ?? [])],
    })),
  };
  const byKey = new Map(next.records.map((record) => [buildFlakeKey(record), record]));
  const seenThisRun = new Set();

  for (const observation of observations ?? []) {
    const key = buildFlakeKey(observation);

    if (seenThisRun.has(key)) {
      continue;
    }

    seenThisRun.add(key);

    const occurrence = { at: observation.at, runId: observation.runId ?? null };
    const existing = byKey.get(key);

    if (!existing) {
      const record = {
        project: observation.project,
        spec: observation.spec,
        title: observation.title,
        signature: observation.signature,
        firstSeen: observation.at,
        lastSeen: observation.at,
        count: 1,
        occurrences: [occurrence],
      };

      next.records.push(record);
      byKey.set(key, record);
      continue;
    }

    existing.count += 1;
    existing.lastSeen = observation.at;
    // The title can change without changing the failure - a renamed test is the same flake - so the
    // newest wins rather than the first, and the key deliberately does not include it.
    existing.title = observation.title;
    existing.occurrences.push(occurrence);

    if (existing.occurrences.length > maxOccurrences) {
      existing.occurrences = existing.occurrences.slice(-maxOccurrences);
    }
  }

  next.records = sortRecords(next.records);

  return next;
}

/** The records a reader should look at first: seen more than once. */
export function findRepeatedFlakes(ledger) {
  return sortRecords((ledger?.records ?? []).filter((record) => record.count > 1));
}

export function formatFlakeLedgerSummary(ledger) {
  const records = ledger?.records ?? [];
  const repeats = findRepeatedFlakes(ledger);

  if (records.length === 0) {
    return '[flake-ledger] no browser failures recorded.';
  }

  const lines = [
    `[flake-ledger] ${records.length} recorded failure signature(s); ${repeats.length} seen more than once.`,
  ];

  for (const record of repeats) {
    lines.push(
      `- ${record.count}x ${record.project} ${record.spec} - ${record.title}`,
      `  first ${record.firstSeen}, last ${record.lastSeen}`,
      `  ${record.signature}`,
    );
  }

  if (repeats.length > 0) {
    lines.push(
      '[flake-ledger] A repeat is evidence, not a decision. Quarantine stays deliberate - see e2e/README.md.',
    );
  }

  return lines.join('\n');
}
