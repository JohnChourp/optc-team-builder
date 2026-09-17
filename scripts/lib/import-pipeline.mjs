import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * 869f138r4. How the seed is built, read from the importer instead of remembered.
 *
 * The wave-2 provenance map records which upstream FIELD produces which app field. This is the
 * mechanical question beside it: which stages run, in what order, and where each hand-maintained
 * overlay in `scripts/data/` is applied.
 *
 * **The format question the subtask opened is already answered**, and recording that is half the
 * point: `optc.db` sat at zero bytes beside the seed, which suggested somebody had opened the
 * question once and closed it without a record.
 * [869f138q7](https://app.clickup.com/t/90121749478/869f138q7) answered it properly - what SHIPS is
 * a gzipped SQLite database, and the SQL text dump stays as the committed source of truth because it
 * is diffable and about twenty scripts read it as text. `docs/dataset-delivery.md` carries the
 * reasoning. Nobody needs to open it a third time.
 *
 * What this adds is the census nothing had: every file under `scripts/data/`, and who reads it.
 * Measured 2026-09-17 that immediately found one nobody reads at all -
 * `manual-character-template.json`, which a maintainer copies by hand when adding a manual
 * character. Legitimate, undocumented, and indistinguishable from dead until somebody looked.
 */

/** A data file with no code reader needs a recorded reason, the way a dataset column does. */
export const READERLESS_DATA_FILE_REASONS = Object.freeze({
  'manual-character-template.json':
    'A template a maintainer copies by hand when adding an entry to manual-characters.json. Read by a person, never by code, and kept beside the file it is a template for.',
});

/**
 * The census's own files, which must not count as readers.
 *
 * `READERLESS_DATA_FILE_REASONS` names the very files it is explaining, so without this the census
 * reads itself as the reader and every readerless file quietly becomes read. Found immediately -
 * the first run reported zero readerless files against one that is genuinely read by nobody.
 */
const CENSUS_OWN_FILES = Object.freeze([
  'scripts/lib/import-pipeline.mjs',
  'scripts/generate-import-pipeline.mjs',
  'docs/import-pipeline.json',
]);

/**
 * Source with its comments removed, because a mention in prose is not a read.
 *
 * Found the hard way: the first version counted `ci-check-routing.mjs` as a reader of
 * `manual-character-template.json` because a COMMENT there explains why that file is readerless. A
 * census that counts its own explanation has stopped measuring anything.
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/(^|[^:])\/\/[^\n]*/gu, '$1');
}

function listSourceFiles(appRoot) {
  const roots = [path.join(appRoot, 'scripts'), path.join(appRoot, 'src')];
  const files = [];

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (!entry.isFile() || entry.name.includes('.spec.')) {
        continue;
      }

      if (/\.(mjs|ts|js)$/u.test(entry.name)) {
        files.push(entryPath);
      }
    }
  };

  for (const root of roots) {
    try {
      if (statSync(root).isDirectory()) {
        walk(root);
      }
    } catch {
      /* A tree that is not there has no readers in it. */
    }
  }

  return files;
}

/** Every `scripts/data/*.json`, and every non-spec source file that names it. */
export function readDataFileReaders(appRoot) {
  const dataDir = path.join(appRoot, 'scripts', 'data');
  const sources = listSourceFiles(appRoot).map((filePath) => ({
    filePath: path.relative(appRoot, filePath).replace(/\\/gu, '/'),
    text: stripComments(readFileSync(filePath, 'utf8')),
  }));

  return readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      readers: sources
        .filter(
          (source) => !CENSUS_OWN_FILES.includes(source.filePath) && source.text.includes(name),
        )
        .map((source) => source.filePath)
        .sort(),
    }));
}

/**
 * The functions `main()` calls, in the order they appear.
 *
 * Source order, not execution order, and the document says so: a nested call like
 * `attachProgressionData(applyPartyConflictKeys(normalizeCharacters(...)))` runs innermost first, so
 * claiming otherwise would be worse than claiming nothing. What the list is good for is
 * completeness - which stages exist at all - and it regenerates when one is added or removed.
 */
export function readImportStages(importerSource) {
  const start = importerSource.indexOf('async function main(');

  if (start < 0) {
    return [];
  }

  const open = importerSource.indexOf('{', start);
  let depth = 0;
  let end = open;

  for (let index = open; index < importerSource.length; index += 1) {
    if (importerSource[index] === '{') {
      depth += 1;
    } else if (importerSource[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  const body = importerSource.slice(open + 1, end);
  const declared = new Set(
    [...importerSource.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/gu)].map(([, name]) => name),
  );

  return [...new Set([...body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/gu)].map(([, name]) => name))]
    .filter((name) => declared.has(name) && name !== 'main')
    .sort();
}

export function buildImportPipelineDocument({ appRoot, importerPath }) {
  const dataFiles = readDataFileReaders(appRoot).map((file) => ({
    ...file,
    readerCount: file.readers.length,
    readerlessReason: file.readers.length
      ? null
      : (READERLESS_DATA_FILE_REASONS[file.name] ?? null),
  }));

  return {
    note: 'Generated by scripts/generate-import-pipeline.mjs from scripts/import-optc-data.mjs and scripts/data/. Do not edit by hand. `stages` is source order, not execution order - a nested call runs innermost first. Row counts per table live in dataset-schema.json and are not duplicated here.',
    formatDecision:
      'The seed is a SQL text dump because it is diffable and about twenty scripts read it as text. What SHIPS is a gzipped SQLite database built from it at build time - see docs/dataset-delivery.md (869f138q7). The zero-byte optc.db that used to sit beside it was removed by 869f138qe.',
    stages: readImportStages(readFileSync(importerPath, 'utf8')),
    dataFileCount: dataFiles.length,
    readerlessDataFileCount: dataFiles.filter((file) => file.readerCount === 0).length,
    dataFiles,
  };
}

/** A data file nobody reads and nobody has explained. */
export function findUnexplainedDataFiles(document) {
  return document.dataFiles
    .filter((file) => file.readerCount === 0 && !file.readerlessReason)
    .map((file) => ({
      kind: 'data-file-with-no-reader',
      name: file.name,
      detail:
        'is read by no script and has no recorded reason - add a reader, delete it, or record why a person reads it',
    }));
}
