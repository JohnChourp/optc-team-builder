import { stripComments } from './import-pipeline.mjs';

/**
 * 869f63gtp. A register of every file in upstream's `common/data`, read or unread - generated, not
 * remembered.
 *
 * Upstream's directory holds 32 files and the importer read 10 of them when this was written, plus
 * `common/js/utils.js`. The reasons for the other 22 lived in one code comment that named two of
 * them, and the generated record of the import named no upstream file at all. So nobody could tell
 * a file that was judged and left out from one nobody had ever opened - and three files the app
 * turned out to need (`families.js`, `aliases.js`, `shops.js`) sat unread through seven waves, the
 * kind of gap that recurred when `banners.js` appeared upstream on 2026-09-20 and nothing noticed.
 *
 * Three inputs, and only one of them is written by hand:
 *
 *  - WHICH files are read is extracted from the importer's own source, never retyped;
 *  - WHAT upstream holds - each file's size and its last change - is a listing fetched from GitHub
 *    by `npm run dataset:pipeline -- --refresh-upstream` and recorded in the document;
 *  - WHY an unread file is unread is `UNREAD_UPSTREAM_FILES` below.
 *
 * The check (`npm run dataset:pipeline -- --check`, in the `import-pipeline` lane) fails when the
 * three disagree: a file the importer reads that the listing lacks, a listed file nobody classified,
 * a classified file the importer reads after all, or a classification for a file upstream no longer
 * has. The nightly release check fetches the live listing and reports - without blocking anything -
 * a file upstream added that the register does not classify.
 */

export const UPSTREAM_REGISTER_REPOSITORY = '2Shankz/optc-db.github.io';
export const UPSTREAM_DATA_DIRECTORY = 'common/data';

export const UPSTREAM_FILE_STATUSES = Object.freeze([
  'read',
  'pending',
  'deliberately-unread',
  'never-evaluated',
]);

const EXECUTABLE =
  'Executable: functions over the reference damage calculator\'s own battle state (`p.unit`, `p.percHP`, `$scope`), not data. The app reads the same abilities as text from details.js and parses them itself.';

/**
 * Every upstream `common/data` file the importer does NOT read, and why.
 *
 * `never-evaluated` is a statement, not a placeholder: nobody has judged whether the app needs the
 * file. It says so rather than letting silence imply a decision. `pending` names the open work that
 * adopts the file; when that work merges and the importer reads it, the check fails until the row
 * is deleted - the register and the importer may not disagree.
 */
export const UNREAD_UPSTREAM_FILES = Object.freeze({
  'aliases.js': {
    status: 'pending',
    reason:
      'Adopted by 869f63gm1 (search by the names players use), whose importer change was open and unmerged when this row was written.',
  },
  'altspecials.js': { status: 'deliberately-unread', reason: EXECUTABLE },
  'availableClasses.js': {
    status: 'never-evaluated',
    reason: null,
  },
  'availableTags.js': {
    status: 'never-evaluated',
    reason: null,
  },
  'banners.js': {
    status: 'pending',
    reason:
      'Adopted by 869f63gm1 (how to get a unit: the friend point banner), whose importer change was open and unmerged when this row was written.',
  },
  'capspecials.js': { status: 'deliberately-unread', reason: EXECUTABLE },
  'captains.js': { status: 'deliberately-unread', reason: EXECUTABLE },
  'defenses.js': {
    status: 'never-evaluated',
    reason: null,
  },
  'effects.js': { status: 'deliberately-unread', reason: EXECUTABLE },
  'events.js': { status: 'deliberately-unread', reason: EXECUTABLE },
  'festival.js': {
    status: 'never-evaluated',
    reason: null,
  },
  'filterOptions.js': {
    status: 'never-evaluated',
    reason: null,
  },
  'format-rumble-json.sh': {
    status: 'deliberately-unread',
    reason: 'Tooling: the shell script upstream uses to sort and reformat rumble.json. It holds no data.',
  },
  'json.html': {
    status: 'deliberately-unread',
    reason:
      'Tooling: a page that prints units.js, details.js or cooldowns.js as JSON in a browser - three files the importer already reads directly.',
  },
  'matchers.js': {
    status: 'never-evaluated',
    reason: null,
  },
  'rumble.js': {
    status: 'deliberately-unread',
    reason:
      'A duplicate: the Pirate Rumble data again as a window.rumble script. The importer reads the same data as rumble.json, which needs no evaluation.',
  },
  'rumble.schema.json': {
    status: 'deliberately-unread',
    reason:
      'Tooling: the JSON Schema upstream validates rumble.json against. It describes a file the importer reads and holds no data itself.',
  },
  'sailors.js': { status: 'deliberately-unread', reason: EXECUTABLE },
  'shops.js': {
    status: 'pending',
    reason:
      'Adopted by 869f63gm1 (how to get a unit: the shops that sell it), whose importer change was open and unmerged when this row was written.',
  },
  'specials.js': { status: 'deliberately-unread', reason: EXECUTABLE },
  'zombies.js': {
    status: 'never-evaluated',
    reason: null,
  },
});

/**
 * The upstream paths the importer fetches, from its source with the comments removed - a path
 * named in prose is not a read. A path the importer BUILDS at run time cannot be listed, so it
 * refuses rather than under-report.
 */
export function extractImporterUpstreamReads(importerSource) {
  const code = stripComments(importerSource);

  if (/common\/(?:data|js)\/\$\{/u.test(code)) {
    throw new Error(
      'The importer builds an upstream path at run time; the register can only list paths the importer names.',
    );
  }

  return [
    ...new Set(
      [...code.matchAll(/['"`](common\/(?:data|js)\/[\w.-]+)['"`]/gu)].map(([, filePath]) => filePath),
    ),
  ].sort();
}

/** The `common/data` file names among the importer's reads. */
export function readUpstreamDataFileNames(importerReads) {
  const prefix = `${UPSTREAM_DATA_DIRECTORY}/`;

  return importerReads
    .filter((filePath) => filePath.startsWith(prefix))
    .map((filePath) => filePath.slice(prefix.length))
    .sort();
}

function compareNames(left, right) {
  return left.localeCompare(right, 'en');
}

/**
 * The register, from the importer's reads, a recorded upstream listing and the classifications.
 *
 * `listing` is `{ repository, directory, commit, listedAt, files: [{ name, bytes, lastChanged }] }`.
 */
export function buildUpstreamFileRegister({
  importerSource,
  listing,
  classifications = UNREAD_UPSTREAM_FILES,
}) {
  const importerReads = extractImporterUpstreamReads(importerSource);
  const readNames = new Set(readUpstreamDataFileNames(importerReads));
  const files = [...(listing?.files ?? [])]
    .map((file) => {
      const classification = classifications[file.name] ?? null;
      const status = readNames.has(file.name) ? 'read' : (classification?.status ?? 'unclassified');

      return {
        name: file.name,
        bytes: file.bytes,
        lastChanged: file.lastChanged,
        status,
        reason: status === 'read' ? null : (classification?.reason ?? null),
      };
    })
    .sort((left, right) => compareNames(left.name, right.name));
  const statusCounts = Object.fromEntries(
    [...UPSTREAM_FILE_STATUSES, 'unclassified'].map((status) => [
      status,
      files.filter((file) => file.status === status).length,
    ]),
  );

  return {
    note: 'Every file in upstream common/data. `status` read is extracted from scripts/import-optc-data.mjs; every other status, and its reason, is UNREAD_UPSTREAM_FILES in scripts/lib/upstream-file-register.mjs. Sizes and last changes are the listing fetched by `npm run dataset:pipeline -- --refresh-upstream` at `commit`.',
    repository: listing?.repository ?? UPSTREAM_REGISTER_REPOSITORY,
    directory: listing?.directory ?? UPSTREAM_DATA_DIRECTORY,
    commit: listing?.commit ?? null,
    listedAt: listing?.listedAt ?? null,
    fileCount: files.length,
    statusCounts,
    importerAlsoReads: importerReads.filter(
      (filePath) => !filePath.startsWith(`${UPSTREAM_DATA_DIRECTORY}/`),
    ),
    files,
  };
}

/** The listing a register was built from, so an offline rebuild can reuse it. */
export function readRecordedListing(register) {
  if (!register || !Array.isArray(register.files)) {
    return null;
  }

  return {
    repository: register.repository,
    directory: register.directory,
    commit: register.commit,
    listedAt: register.listedAt,
    files: register.files.map(({ name, bytes, lastChanged }) => ({ name, bytes, lastChanged })),
  };
}

/** Where the register, the importer and the classifications disagree. Empty means they agree. */
export function findUpstreamRegisterDisagreements({
  importerSource,
  register,
  classifications = UNREAD_UPSTREAM_FILES,
}) {
  const findings = [];
  const readNames = readUpstreamDataFileNames(extractImporterUpstreamReads(importerSource));
  const listedNames = new Set((register?.files ?? []).map((file) => file.name));

  for (const name of readNames) {
    if (!listedNames.has(name)) {
      findings.push({
        kind: 'read-file-not-listed',
        name,
        detail: `the importer reads ${UPSTREAM_DATA_DIRECTORY}/${name}, which the recorded upstream listing does not have - refresh it with \`npm run dataset:pipeline -- --refresh-upstream\``,
      });
    }

    if (name in classifications) {
      findings.push({
        kind: 'classified-file-is-read',
        name,
        detail: `UNREAD_UPSTREAM_FILES classifies ${name} as ${classifications[name].status}, but the importer reads it - delete its row`,
      });
    }
  }

  for (const file of register?.files ?? []) {
    if (file.status === 'unclassified') {
      findings.push({
        kind: 'unclassified-file',
        name: file.name,
        detail: `upstream has ${UPSTREAM_DATA_DIRECTORY}/${file.name}, which the importer does not read and nobody classified - add it to UNREAD_UPSTREAM_FILES, as never-evaluated if nobody has judged it`,
      });
    }
  }

  for (const [name, classification] of Object.entries(classifications)) {
    if (!UPSTREAM_FILE_STATUSES.includes(classification?.status) || classification.status === 'read') {
      findings.push({
        kind: 'invalid-classification',
        name,
        detail: `"${classification?.status}" is not a status an unread file can have`,
      });
    }

    if (
      ['deliberately-unread', 'pending'].includes(classification?.status) &&
      !String(classification.reason ?? '').trim()
    ) {
      findings.push({
        kind: 'classification-without-reason',
        name,
        detail: `a ${classification.status} file has to say why`,
      });
    }

    if (!listedNames.has(name)) {
      findings.push({
        kind: 'classification-without-file',
        name,
        detail: `UNREAD_UPSTREAM_FILES classifies ${name}, which the recorded upstream listing does not have - delete the row, or refresh the listing`,
      });
    }
  }

  return findings;
}

/**
 * Upstream's live file names against the register. Used by the nightly release check, where it is
 * a finding to report, never a reason to stop.
 */
export function compareUpstreamListingWithRegister({ listedNames, register }) {
  const registered = new Set(
    (register?.files ?? []).filter((file) => file.status !== 'unclassified').map((file) => file.name),
  );
  const live = new Set(listedNames);

  return {
    unclassifiedFiles: [...live].filter((name) => !registered.has(name)).sort(compareNames),
    missingFiles: [...registered].filter((name) => !live.has(name)).sort(compareNames),
  };
}

function buildApiHeaders(token) {
  return {
    'User-Agent': 'optc-team-builder-upstream-register',
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchGithubJson(url, { fetchImpl, token }) {
  const response = await fetchImpl(url, { headers: buildApiHeaders(token) });

  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${url}`);
  }

  return response.json();
}

/**
 * The file names (and sizes) in upstream's `common/data` at `ref` - one API request. With
 * `withLastChange`, one more request per file for the date of the last commit that touched it.
 */
export async function fetchUpstreamDataListing({
  repository = UPSTREAM_REGISTER_REPOSITORY,
  ref = 'master',
  withLastChange = false,
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || '',
} = {}) {
  const apiBase = `https://api.github.com/repos/${repository}`;
  const entries = await fetchGithubJson(
    `${apiBase}/contents/${UPSTREAM_DATA_DIRECTORY}?ref=${encodeURIComponent(ref)}`,
    { fetchImpl, token },
  );

  if (!Array.isArray(entries)) {
    throw new Error(`GitHub did not answer a directory listing for ${repository}/${UPSTREAM_DATA_DIRECTORY}.`);
  }

  const files = entries
    .filter((entry) => entry?.type === 'file' && typeof entry.name === 'string')
    .map((entry) => ({ name: entry.name, bytes: Number(entry.size ?? 0), lastChanged: null }))
    .sort((left, right) => compareNames(left.name, right.name));

  if (withLastChange) {
    for (const file of files) {
      const commits = await fetchGithubJson(
        `${apiBase}/commits?path=${encodeURIComponent(`${UPSTREAM_DATA_DIRECTORY}/${file.name}`)}&sha=${encodeURIComponent(ref)}&per_page=1`,
        { fetchImpl, token },
      );

      file.lastChanged = commits?.[0]?.commit?.committer?.date ?? null;
    }
  }

  return { repository, directory: UPSTREAM_DATA_DIRECTORY, files };
}
