import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildStamp } from './write-build-stamp.mjs';
import { formatBuildStampResult, inspectBuildStamp, newestSourceMtime } from './check-build-stamp.mjs';

/**
 * 869f13gbb. Every case here changes the ONE thing the finding is about and watches the verdict
 * move, because a freshness check that cannot go stale is worse than no check at all.
 */

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tree({ builtAt, steps = [], dirty = false, sourceMtime }: {
  builtAt?: string;
  steps?: string[];
  dirty?: boolean;
  sourceMtime?: Date;
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-stamp-'));

  roots.push(root);
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });

  const sourcePath = path.join(root, 'src', 'main.ts');

  await writeFile(sourcePath, 'export const x = 1;\n', 'utf8');

  if (sourceMtime) {
    await utimes(sourcePath, sourceMtime, sourceMtime);
  }

  if (builtAt !== undefined) {
    await writeFile(
      path.join(root, 'dist', 'build-stamp.json'),
      JSON.stringify({ schemaVersion: 1, version: '1.0.0', commit: 'abc123', dirty, builtAt, steps }),
      'utf8',
    );
  }

  return root;
}

const OLD = new Date('2020-01-01T00:00:00.000Z');
const NEW = new Date('2030-01-01T00:00:00.000Z');

describe('is this dist/ safe to reason from?', () => {
  it('says absent when nothing has ever been built, and does not call that a failure', async () => {
    const root = await tree({});

    expect(inspectBuildStamp({ appRoot: root }).state).toBe('absent');
  });

  it('is fresh when the build is newer than every source file', async () => {
    const root = await tree({ builtAt: NEW.toISOString(), sourceMtime: OLD });
    const result = inspectBuildStamp({ appRoot: root });

    expect(result.state).toBe('fresh');
    expect(formatBuildStampResult(result)).toContain('may be reasoned from');
  });

  it('goes stale on the SAME tree once one source file is newer', async () => {
    // the mutation: only the source mtime moves.
    const root = await tree({ builtAt: OLD.toISOString(), sourceMtime: NEW });
    const result = inspectBuildStamp({ appRoot: root });

    expect(result.state).toBe('stale');
    expect(result.findings.join(' ')).toContain('OLDER than its sources');
  });

  it('flags a build made from a dirty tree, because it matches no commit', async () => {
    const root = await tree({ builtAt: NEW.toISOString(), sourceMtime: OLD, dirty: true });

    expect(inspectBuildStamp({ appRoot: root }).findings.join(' ')).toContain('DIRTY');
  });

  /*
   * The 2026-09-12 trap itself: a dist/ that is newer than everything and still missing a step.
   * An mtime comparison alone cannot see this, which is why `steps` is stamped.
   */
  it('flags a missing generation step even when the build is newer than every source', async () => {
    const root = await tree({ builtAt: NEW.toISOString(), sourceMtime: OLD, steps: ['pwa:ngsw:pages'] });
    const result = inspectBuildStamp({ appRoot: root, expectSteps: ['seo:pages'] });

    expect(result.state).toBe('stale');
    expect(result.findings.join(' ')).toContain('seo:pages');
  });

  it('is quiet about a step that DID run', async () => {
    const root = await tree({ builtAt: NEW.toISOString(), sourceMtime: OLD, steps: ['seo:pages'] });

    expect(inspectBuildStamp({ appRoot: root, expectSteps: ['seo:pages'] }).state).toBe('fresh');
  });

  it('refuses to guess when builtAt is unreadable', async () => {
    const root = await tree({ builtAt: 'not-a-date', sourceMtime: OLD });

    expect(inspectBuildStamp({ appRoot: root }).findings.join(' ')).toContain('no readable builtAt');
  });

  it('reports unreadable JSON rather than throwing', async () => {
    const root = await tree({ builtAt: NEW.toISOString() });

    await writeFile(path.join(root, 'dist', 'build-stamp.json'), '{ nope', 'utf8');

    expect(inspectBuildStamp({ appRoot: root }).state).toBe('unreadable');
  });

  it('sees a real file when it walks, so the comparison is not over an empty set', async () => {
    const root = await tree({ builtAt: NEW.toISOString(), sourceMtime: OLD });

    expect(newestSourceMtime(root, ['src'])).toBe(OLD.getTime());
  });
});

describe('the stamp itself', () => {
  it('records the steps that ran, sorted, and a UTC payload timestamp', () => {
    const stamp = buildStamp({ steps: ['seo:pages', 'dataset:binary'], now: new Date(NEW) });

    expect(stamp.steps).toEqual(['dataset:binary', 'seo:pages']);
    expect(stamp.builtAt).toBe(NEW.toISOString());
    expect(stamp.builtAt).toMatch(/Z$/u);
  });
});
