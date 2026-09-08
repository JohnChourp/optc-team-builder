#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Web Worker bundling guard.
 *
 * Three services run their heavy pass in a Worker and fall back to running it
 * in-thread when the Worker cannot be constructed. That fallback is deliberate
 * and correct - it runs the SAME function, so the answer is right either way -
 * but it is also completely silent: `createWorker()` returns `null` inside a
 * bare `catch`, the service latches `workerUnavailable` so it never retries,
 * and nothing anywhere records that the fast path was abandoned. A worker that
 * stops being emitted therefore degrades the page forever without a single
 * error.
 *
 * Nothing caught that. `e2e/smoke.spec.ts` asserts a non-zero result count,
 * which passes identically on the fallback, because the fallback calls the same
 * function. `verify:local` does build production - the `pwa-shell` lane does -
 * but nothing looked at whether a worker chunk came out of it.
 *
 * There are two ways a worker stops being emitted, and only one announces
 * itself:
 *
 *   A. THE MODULE CANNOT BE BUNDLED - deleted, syntax error, bad import.
 *      `@angular/build` pushes the sub-build's errors into the main result, so
 *      `ng build` fails. Already covered.
 *
 *   B. THE CALL SITE STOPS MATCHING THE TRANSFORMER. Angular rewrites
 *      `new Worker(new URL('<literal>', import.meta.url))` into a reference to
 *      an emitted chunk, and its own transformer header says "Unsupported
 *      worker expressions will be left in their origin form". Hoist the URL to
 *      a const, wrap it in a helper, use a template literal with a
 *      substitution, or drop `import.meta.url`, and the node is returned
 *      untouched: NO error, NO warning, no chunk, and shipped code asking for a
 *      path that does not exist. Nothing on main caught B.
 *
 * So this guard has two phases. Phase 1 re-implements the transformer's
 * predicate over the source and fails at the file and line, which is where a
 * refactor should be reported. Phase 2 checks the built output, which is ground
 * truth about what actually ships.
 *
 * Run: npm run worker-bundling:check   (after npm run build)
 */

/** Angular names every emitted worker chunk this way, and nothing else. */
export const WORKER_CHUNK_PATTERN = /^worker-[A-Z0-9]{8}\.[cm]?js$/u;

/**
 * `worker-basic.min.js` is Angular's SERVICE worker and is not an app worker.
 * It is listed here so the exclusion is deliberate rather than an accident of
 * the pattern above - a looser pattern would count it and make the totals wrong.
 */
export const NON_APP_WORKER_FILES = ['worker-basic.min.js', 'ngsw-worker.js', 'safety-worker.js'];

export function normalizePath(value) {
  return String(value ?? '').split(path.sep).join('/');
}

function listSourceFiles(root) {
  const files = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        files.push(full);
      }
    }
  };

  if (existsSync(root)) {
    walk(root);
  }

  return files.sort();
}

/**
 * Every `new Worker(...)` / `new SharedWorker(...)` in a source file, classified
 * as conforming to the transformer's predicate or not.
 *
 * The predicate is Angular's, not ours: one or two arguments, the first a
 * `new URL(...)` with exactly two arguments, the first of those a plain string
 * literal and the second `import.meta.url`. A near-miss is the whole point of
 * the check, so it is reported rather than skipped.
 */
export function findWorkerCallSites(source, file) {
  const sites = [];
  const pattern = /new\s+(Shared)?Worker\s*\(/gu;
  let match = pattern.exec(source);

  while (match) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = open;

    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '(') {
        depth += 1;
      } else if (source[index] === ')') {
        depth -= 1;

        if (depth === 0) {
          end = index;
          break;
        }
      }
    }

    const args = source.slice(open + 1, end);
    const line = source.slice(0, match.index).split('\n').length;
    const urlMatch = /^\s*new\s+URL\s*\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/u.exec(
      args,
    );

    sites.push({
      file: normalizePath(file),
      line,
      conforms: Boolean(urlMatch),
      specifier: urlMatch ? urlMatch[2] : null,
      expression: args.trim().split('\n')[0].slice(0, 120),
    });

    match = pattern.exec(source);
  }

  return sites;
}

/** Phase 1: the source still says what the bundler needs it to say. */
export function inspectWorkerSources(appRoot) {
  const findings = [];
  const sites = [];

  for (const file of listSourceFiles(path.join(appRoot, 'src'))) {
    const source = readFileSync(file, 'utf8');

    for (const site of findWorkerCallSites(source, path.relative(appRoot, file))) {
      if (!site.conforms) {
        findings.push({
          kind: 'unbundlable-worker-expression',
          file: site.file,
          line: site.line,
          detail:
            `new Worker(${site.expression}) does not match the form Angular can rewrite. ` +
            'It needs new URL(<string literal>, import.meta.url) as its first argument. ' +
            'Angular leaves an unsupported expression untouched with no error, so no chunk is ' +
            'emitted and the service falls back in-thread forever.',
        });

        continue;
      }

      const resolved = path.join(path.dirname(file), `${site.specifier}.ts`);

      if (!existsSync(resolved)) {
        findings.push({
          kind: 'missing-worker-module',
          file: site.file,
          line: site.line,
          detail: `${site.specifier} does not resolve to a .ts file beside ${site.file}.`,
        });

        continue;
      }

      sites.push({ ...site, module: normalizePath(path.relative(appRoot, resolved)) });
    }
  }

  if (sites.length === 0 && findings.length === 0) {
    findings.push({
      kind: 'no-worker-call-sites',
      detail:
        'No conforming new Worker(new URL(...)) call site was found anywhere in src/. Either every ' +
        'worker was removed, or this scan stopped matching - and a guard that finds nothing ' +
        'passes everything.',
    });
  }

  return { findings, sites };
}

/** Phase 2: the build actually emitted a chunk for each of them. */
export function inspectWorkerBundle(distDir, sites) {
  const findings = [];

  if (!existsSync(distDir)) {
    return {
      findings: [
        {
          kind: 'missing-dist',
          detail: `${normalizePath(distDir)} does not exist. Run npm run build first.`,
        },
      ],
      chunks: [],
    };
  }

  const entries = readdirSync(distDir);
  const chunks = entries.filter(
    (name) => WORKER_CHUNK_PATTERN.test(name) && !NON_APP_WORKER_FILES.includes(name),
  );

  if (chunks.length !== sites.length) {
    findings.push({
      kind: 'worker-chunk-count-mismatch',
      detail:
        `${sites.length} worker call site(s) in src/, but ${chunks.length} emitted worker chunk(s) ` +
        `in ${normalizePath(distDir)}: ${chunks.join(', ') || '(none)'}. A call site the ` +
        'transformer did not rewrite emits nothing and reports nothing.',
    });
  }

  const bundles = entries.filter((name) => name.endsWith('.js') && !chunks.includes(name));
  const bundleSources = bundles.map((name) => readFileSync(path.join(distDir, name), 'utf8'));

  for (const chunk of chunks) {
    const referenced = bundleSources.some((source) =>
      new RegExp(`new URL\\(\\s*["'\`]${chunk.replace('.', '\\.')}["'\`]`, 'u').test(source),
    );

    if (!referenced) {
      findings.push({
        kind: 'orphaned-worker-chunk',
        detail: `${chunk} was emitted but no bundle constructs a Worker from it.`,
      });
    }
  }

  /*
   * The sharpest signal available: if a SOURCE module name survives inside a
   * `new URL(` in the output, the transformer did not rewrite that call and the
   * shipped code is asking for a path that does not exist. That is mode B,
   * observed directly rather than inferred from a count.
   */
  for (const site of sites) {
    const literal = site.specifier;

    for (const [index, source] of bundleSources.entries()) {
      if (new RegExp(`new URL\\(\\s*["'\`][^"'\`]*${literal}["'\`]`, 'u').test(source)) {
        findings.push({
          kind: 'unrewritten-worker-specifier',
          detail:
            `${bundles[index]} still contains new URL("${literal}"), so Angular did not rewrite ` +
            `${site.file}:${site.line}. The shipped code asks for a module that is not there.`,
        });
      }
    }
  }

  return { findings, chunks };
}

export function inspectWorkerBundling({ appRoot = process.cwd(), distDir, skipBundle = false } = {}) {
  const source = inspectWorkerSources(appRoot);
  const resolvedDist =
    distDir ?? path.join(appRoot, 'dist/optc-team-builder/browser');

  if (skipBundle || source.findings.length > 0) {
    return {
      ok: source.findings.length === 0,
      findings: source.findings,
      sites: source.sites,
      chunks: [],
      checkedBundle: false,
    };
  }

  const bundle = inspectWorkerBundle(resolvedDist, source.sites);

  return {
    ok: bundle.findings.length === 0,
    findings: bundle.findings,
    sites: source.sites,
    chunks: bundle.chunks,
    checkedBundle: true,
  };
}

export function formatWorkerBundlingResult(result) {
  const lines = ['# Web Worker bundling check', ''];

  lines.push(
    `Found ${result.sites.length} worker call site(s)${
      result.checkedBundle ? `, ${result.chunks.length} emitted chunk(s)` : ' (source only)'
    }.`,
  );

  for (const site of result.sites) {
    lines.push(`- ${site.file}:${site.line} -> ${site.module}`);
  }

  lines.push('');

  if (result.ok) {
    lines.push('Status: passed - every worker call site is bundlable and emitted.');
  } else {
    lines.push('Status: FAILED');

    for (const finding of result.findings) {
      lines.push(
        `- [${finding.kind}] ${finding.file ? `${finding.file}:${finding.line} ` : ''}${finding.detail}`,
      );
    }
  }

  return lines.join('\n');
}

function main() {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const skipBundle = process.argv.includes('--skip-bundle');
  const distFlag = process.argv.indexOf('--dist-dir');
  const result = inspectWorkerBundling({
    appRoot,
    skipBundle,
    distDir: distFlag === -1 ? undefined : process.argv[distFlag + 1],
  });

  process.stdout.write(`${formatWorkerBundlingResult(result)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
