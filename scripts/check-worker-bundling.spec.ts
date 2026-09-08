import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  NON_APP_WORKER_FILES,
  WORKER_CHUNK_PATTERN,
  findWorkerCallSites,
  inspectWorkerBundle,
  inspectWorkerBundling,
  inspectWorkerSources,
} from './check-worker-bundling.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-worker-bundling-'));
  tempDirs.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}

const CONFORMING = `
export function createWorker(): Worker {
  return new Worker(new URL('demo.worker', import.meta.url), { type: 'module' });
}
`;

describe('check-worker-bundling', () => {
  it('accepts the form Angular can rewrite', () => {
    const sites = findWorkerCallSites(CONFORMING, 'src/demo.service.ts');

    expect(sites).toHaveLength(1);
    expect(sites[0]?.conforms).toBe(true);
    expect(sites[0]?.specifier).toBe('demo.worker');
  });

  /*
   * The whole reason this guard exists. `createWorkerTransformer` requires
   * literally `new Worker(new URL(<string literal>, import.meta.url))` and its
   * own header says "Unsupported worker expressions will be left in their origin
   * form" - so each of these builds cleanly, emits no chunk, prints no warning,
   * and leaves the service falling back in-thread forever.
   *
   * Measured on the real repo: hoisting the URL to a const made `ng build`
   * SUCCEED with no error and no warning, dropped the emitted worker chunks from
   * 3 to 2, and left the source specifier sitting in the shipped bundle.
   */
  it.each([
    ['the URL hoisted to a const', "const url = new URL('demo.worker', import.meta.url);\nnew Worker(url, { type: 'module' });"],
    ['a template literal with a substitution', "new Worker(new URL(`${base}.worker`, import.meta.url));"],
    ['no import.meta.url', "new Worker(new URL('demo.worker', someOtherBase));"],
    ['a bare string specifier', "new Worker('demo.worker.js');"],
    ['a helper call', 'new Worker(resolveWorkerUrl(), { type: "module" });'],
  ])('rejects %s', (_label, source) => {
    const sites = findWorkerCallSites(source, 'src/demo.service.ts');

    expect(sites).toHaveLength(1);
    expect(sites[0]?.conforms).toBe(false);
  });

  it('reports an unbundlable call site at its file and line', async () => {
    const appRoot = await makeRoot({
      'src/demo.service.ts': "const url = new URL('demo.worker', import.meta.url);\nexport const w = new Worker(url);\n",
      'src/demo.worker.ts': 'export {};\n',
    });

    const result = inspectWorkerSources(appRoot);

    expect(result.findings.map((finding) => finding.kind)).toContain(
      'unbundlable-worker-expression',
    );
    expect(result.findings[0]?.file).toBe('src/demo.service.ts');
    expect(result.findings[0]?.line).toBe(2);
  });

  it('rejects a specifier that resolves to nothing', async () => {
    const appRoot = await makeRoot({ 'src/demo.service.ts': CONFORMING });

    const result = inspectWorkerSources(appRoot);

    expect(result.findings.map((finding) => finding.kind)).toContain('missing-worker-module');
  });

  /*
   * A guard that reads no call site would pass every tree, which is the failure
   * mode the brain records for a scanner whose pattern silently stops matching.
   */
  it('fails when it finds no worker call site at all', async () => {
    const appRoot = await makeRoot({ 'src/demo.service.ts': 'export const x = 1;\n' });

    const result = inspectWorkerSources(appRoot);

    expect(result.findings.map((finding) => finding.kind)).toContain('no-worker-call-sites');
  });

  it('fails when the build emitted fewer chunks than there are call sites', async () => {
    const distDir = await makeRoot({
      'worker-AAAAAAAA.js': 'self.onmessage = () => {};\n',
      'main-BBBBBBBB.js': 'new URL("worker-AAAAAAAA.js", import.meta.url);\n',
    });

    const result = inspectWorkerBundle(distDir, [
      { file: 'a.ts', line: 1, specifier: 'a.worker' },
      { file: 'b.ts', line: 1, specifier: 'b.worker' },
    ]);

    expect(result.findings.map((finding) => finding.kind)).toContain(
      'worker-chunk-count-mismatch',
    );
  });

  /*
   * The sharpest signal: a SOURCE module name surviving inside a `new URL(` in
   * the output means the transformer did not rewrite that call, observed
   * directly rather than inferred from a count.
   */
  it('fails when a source worker specifier survives into the bundle', async () => {
    const distDir = await makeRoot({
      'worker-AAAAAAAA.js': 'self.onmessage = () => {};\n',
      'main-BBBBBBBB.js':
        'new URL("worker-AAAAAAAA.js", import.meta.url);\nnew URL("demo.worker", import.meta.url);\n',
    });

    const result = inspectWorkerBundle(distDir, [{ file: 'a.ts', line: 1, specifier: 'demo.worker' }]);

    expect(result.findings.map((finding) => finding.kind)).toContain(
      'unrewritten-worker-specifier',
    );
  });

  it('fails on a chunk nothing constructs a Worker from', async () => {
    const distDir = await makeRoot({
      'worker-AAAAAAAA.js': 'self.onmessage = () => {};\n',
      'main-BBBBBBBB.js': 'console.log("no worker here");\n',
    });

    const result = inspectWorkerBundle(distDir, [{ file: 'a.ts', line: 1, specifier: 'a.worker' }]);

    expect(result.findings.map((finding) => finding.kind)).toContain('orphaned-worker-chunk');
  });

  /*
   * Angular's own service-worker files sit in the same directory. Counting them
   * as app workers would make every total wrong, so the exclusion is asserted
   * rather than left to the shape of the pattern.
   */
  it('does not count Angular service-worker files as app workers', async () => {
    const distDir = await makeRoot({
      'worker-AAAAAAAA.js': 'self.onmessage = () => {};\n',
      'worker-basic.min.js': 'self.onmessage = () => {};\n',
      'ngsw-worker.js': 'self.onmessage = () => {};\n',
      'safety-worker.js': 'self.onmessage = () => {};\n',
      'main-BBBBBBBB.js': 'new URL("worker-AAAAAAAA.js", import.meta.url);\n',
    });

    const result = inspectWorkerBundle(distDir, [{ file: 'a.ts', line: 1, specifier: 'a.worker' }]);

    expect(result.chunks).toEqual(['worker-AAAAAAAA.js']);
    expect(result.findings).toEqual([]);

    for (const name of NON_APP_WORKER_FILES) {
      if (WORKER_CHUNK_PATTERN.test(name)) {
        expect(result.chunks).not.toContain(name);
      }
    }
  });

  it('says so rather than passing when dist has not been built', async () => {
    const appRoot = await makeRoot({
      'src/demo.service.ts': CONFORMING,
      'src/demo.worker.ts': 'export {};\n',
    });

    const result = inspectWorkerBundling({ appRoot, distDir: path.join(appRoot, 'nope') });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.kind)).toContain('missing-dist');
  });

  it('passes a tree whose source and bundle agree', async () => {
    const appRoot = await makeRoot({
      'src/demo.service.ts': CONFORMING,
      'src/demo.worker.ts': 'export {};\n',
      'dist/browser/worker-AAAAAAAA.js': 'self.onmessage = () => {};\n',
      'dist/browser/main-BBBBBBBB.js': 'new URL("worker-AAAAAAAA.js", import.meta.url);\n',
    });

    const result = inspectWorkerBundling({
      appRoot,
      distDir: path.join(appRoot, 'dist/browser'),
    });

    expect(result.ok).toBe(true);
    expect(result.sites).toHaveLength(1);
    expect(result.chunks).toEqual(['worker-AAAAAAAA.js']);
  });

  it('keeps every shipped worker under the guard', () => {
    const result = inspectWorkerSources(process.cwd());

    expect(result.findings).toEqual([]);
    expect(result.sites.map((site) => site.module).sort()).toEqual([
      'src/app/core/services/auto-team-builder-rumble.worker.ts',
      'src/app/core/services/auto-team-builder.worker.ts',
      'src/app/core/services/captain-coverage-filter.worker.ts',
    ]);
  });
});
