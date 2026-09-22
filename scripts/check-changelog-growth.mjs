#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The changelog grows forever, and every player pays for it on every release.
 *
 * 869f13gb7 asked one question first - is `whats-new.data.ts` in the initial bundle
 * or a lazy chunk - on the reasoning that the answer decides whether this is urgent
 * or merely worth watching. Measured on 2026-09-22 against v0.6.2's build, the
 * answer is BOTH, and neither half is what the question expected:
 *
 *   - It is NOT initial. `main-*.js` reaches it through two dynamic `import()`
 *     hops, so the initial graph - 21 files, 1,505,399 raw bytes - does not contain
 *     it. First paint does not pay for it at all.
 *   - It IS prefetched. `ngsw-config.json`'s `app` asset group takes `/*.js` at
 *     `installMode: prefetch`, so the service worker downloads the whole chunk on
 *     install and on every update, whether or not anybody opens What's new.
 *
 * So the cost is not first paint. It is that every active player re-downloads the
 * entire changelog every time it changes - and it changes on EVERY release, because
 * a release is what adds an entry.
 *
 * The arithmetic, measured rather than assumed:
 *
 *   entries                     201        (154 on 2026-09-12)
 *   source                  634,428 bytes  (~3,156 per entry)
 *   compiled chunk          598,248 bytes  (~2,976 per entry, 94% of source)
 *   releases in 14 days          66        = 4.7 per day, from `git for-each-ref`
 *   growth                  ~14.8 KB/day   -> ~5.3 MB/year
 *
 * That last row is why this is a budget and not a note. Nothing about the rate is
 * hypothetical: the nightly `check-optc-db-release` chain dispatches a release with
 * no human involved whenever upstream data moves, and it did so 66 times in a
 * fortnight.
 *
 * WHY A HARD FAILURE IS SAFE HERE. `scripts/release-and-tag.sh` does not run
 * `verify:local`; it runs `check-release-whats-new-ready.mjs`,
 * `check-dataset-spec-pins.mjs` and `check-secrets.mjs`. So this lane cannot break
 * the unattended chain - it fails for a human, in a pull request, which is the only
 * place the decision it forces can actually be taken.
 *
 * WHAT TO DO WHEN IT FIRES. Not raise the ceiling. The option already scoped in
 * 869f13gb7 is to split by era: recent entries compiled in, older ones behind their
 * own lazily-loaded chunk, which keeps the no-fetch property for the entries anyone
 * actually reads. The reason the data is a TypeScript constant rather than a fetched
 * asset is recorded and still correct - every prefetched asset here is unhashed, and
 * a mid-deploy window where `ngsw.json` is new while an asset body is old is what
 * breaks a service-worker install - so "just fetch it" is not the answer.
 *
 * Run: npm run whats-new:growth
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CHANGELOG_FILE = 'src/app/core/data/whats-new.data.ts';

/**
 * Deliberately a runway rather than a round number.
 *
 * 1,000,000 bytes is roughly 24 days past the 2026-09-22 measurement at the
 * measured 4.7 releases a day. Short on purpose: 5.3 MB a year is fast enough that
 * a ceiling a year out would be a ceiling nobody ever meets, and the whole point of
 * option 3 was to make the growth visible BEFORE it matters rather than after.
 */
export const CHANGELOG_BYTE_BUDGET = 1_000_000;

/** Measured 2026-09-22, v0.6.2. Both halves, because the ratio is the useful part. */
export const MEASURED = {
  date: '2026-09-22',
  version: '0.6.2',
  entries: 201,
  sourceBytes: 634_428,
  compiledChunkBytes: 598_248,
  releasesPerDay: 4.7,
};

export function checkChangelogGrowth({ sourceBytes, entries, budget = CHANGELOG_BYTE_BUDGET }) {
  const errors = [];
  const bytesPerEntry = entries > 0 ? sourceBytes / entries : 0;
  const bytesPerDay = bytesPerEntry * MEASURED.releasesPerDay;
  const daysOfRunway = bytesPerDay > 0 ? Math.floor((budget - sourceBytes) / bytesPerDay) : Infinity;

  if (sourceBytes > budget) {
    errors.push(
      `${CHANGELOG_FILE} is ${sourceBytes.toLocaleString('en-US')} bytes, over its ${budget.toLocaleString('en-US')}-byte budget. ` +
        `Every player re-downloads this chunk on every release because ngsw-config.json prefetches /*.js. ` +
        `Do not raise the ceiling: split the entries by era so only the recent ones are compiled in (869f13gb7).`,
    );
  }

  return { errors, bytesPerEntry, bytesPerDay, daysOfRunway };
}

function main() {
  const file = path.join(projectRoot, CHANGELOG_FILE);
  const sourceBytes = statSync(file).size;
  const entries = (readFileSync(file, 'utf8').match(/^ {2}\{\n {4}version: '/gmu) ?? []).length;
  const { errors, bytesPerEntry, bytesPerDay, daysOfRunway } = checkChangelogGrowth({
    sourceBytes,
    entries,
  });

  if (errors.length) {
    console.error('changelog growth check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `[whats-new] ${entries} entries, ${sourceBytes.toLocaleString('en-US')} bytes ` +
      `(${Math.round(bytesPerEntry).toLocaleString('en-US')}/entry, ~${Math.round(bytesPerDay / 1024)} KB/day at ${MEASURED.releasesPerDay} releases/day). ` +
      `Budget ${CHANGELOG_BYTE_BUDGET.toLocaleString('en-US')}; about ${daysOfRunway} day(s) of runway. ` +
      `Lazy chunk, but service-worker prefetched - every player pays it on every release.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
