import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { tmpdir } from 'node:os';
import path from 'node:path';

import YAML from 'yaml';

import { afterEach, describe, expect, it } from 'vitest';

import {
  APP_CI_TRIGGER_ALLOWLIST,
  BRAIN_CI_TRIGGER_ALLOWLIST,
  formatCiTriggerResult,
  inspectCiTriggers,
  inspectPagesDeployConcurrency,
  PAGES_DEPLOY_CONCURRENCY_GROUP,
  PAGES_DEPLOY_SURFACES,
  inspectAllowedEventRefs,
  readTriggerEvents,
  readTriggerFilter,
} from './check-github-ci-triggers.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-ci-triggers-'));
  tempDirs.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}

function workflow(onBlock: string[]) {
  return [
    'name: Example',
    'on:',
    ...onBlock,
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '',
  ].join('\n');
}

describe('check-github-ci-triggers', () => {

  /*
   * The allowlist granted an EVENT, not the refs it was granted for. So the one
   * automatic trigger this repo allows - publishing production Pages from a
   * push to main - would have kept passing if it were widened to every branch,
   * or gained a `tags:` filter that publishes from every tag.
   */
  describe('allowlisted events are pinned to the refs they were granted for', () => {
    const allowed = { reason: 'the deploy itself', branches: ['main'] };
    const base = { repo: 'app', workflowPath: '.github/workflows/deploy-pages.yml', event: 'push' };

    it('accepts exactly the granted branches', () => {
      expect(inspectAllowedEventRefs({ ...base, allowed, declared: { branches: ['main'] } })).toEqual(
        [],
      );
    });

    it.each([
      ['no branch filter at all', null, /every branch/u],
      ['a widened branch list', { branches: ['main', 'develop'] }, /allowlisted for main but declares/u],
      ['an empty branch list', { branches: [] }, /every branch/u],
      ['a tags filter', { branches: ['main'], tags: ['v*'] }, /declares "tags"/u],
      ['a branches-ignore filter', { branches: ['main'], 'branches-ignore': ['x'] }, /branches-ignore/u],
    ])('rejects %s', (_label, declared, pattern) => {
      const findings = inspectAllowedEventRefs({ ...base, allowed, declared });

      expect(findings.length).toBeGreaterThan(0);
      expect(findings.map((finding) => finding.message).join(' ')).toMatch(pattern);
    });

    it('still grants the event outright when the entry is a bare reason string', () => {
      expect(
        inspectAllowedEventRefs({ ...base, allowed: 'just a reason', declared: { branches: ['x'] } }),
      ).toEqual([]);
    });

    /*
     * The guard is only worth having if the repo's OWN entry uses it. Measured:
     * revert the shipped entry to a bare reason string and every other test
     * here still passes, because they all construct their own `allowed`. This
     * is the one that pins the real allowlist to the narrow form.
     */
    it('pins the shipped allowlist entry to a branch list, not a bare grant', () => {
      expect(APP_CI_TRIGGER_ALLOWLIST).toHaveLength(1);

      const entry = APP_CI_TRIGGER_ALLOWLIST[0]!;

      expect(entry.workflowPath).toBe('.github/workflows/deploy-pages.yml');
      expect(Object.keys(entry.events)).toEqual(['push']);
      expect(
        entry.events.push,
        'a bare string grants push on every branch and every tag',
      ).not.toBeTypeOf('string');
      expect(entry.events.push).toMatchObject({ branches: ['main'] });
      expect(entry.events.push.reason).toBeTypeOf('string');
    });

    it('reads the filter the shipped deploy-pages workflow actually declares', () => {
      const parsed = YAML.parse(readFileSync('.github/workflows/deploy-pages.yml', 'utf8'));

      expect(readTriggerFilter(parsed, 'push')).toMatchObject({ branches: ['main'] });
      expect(
        inspectAllowedEventRefs({
          ...base,
          allowed: APP_CI_TRIGGER_ALLOWLIST[0]!.events.push,
          declared: readTriggerFilter(parsed, 'push'),
        }),
      ).toEqual([]);
    });
  });

  /*
   * The concurrency check used to `return` when ANY ONE Pages surface was
   * missing, which disabled it exactly when the deploy topology changed and it
   * mattered most. Nothing present is still a genuine no-op.
   */
  it('reports a vanished Pages deploy surface instead of disabling itself', async () => {
    const root = await makeRoot({
      '.github/workflows/deploy-pages.yml': workflow(['  push:', '    branches:', '      - main']),
    });
    const findings: Array<{ message: string }> = [];

    inspectPagesDeployConcurrency({ appRoot: root, findings });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((finding) => finding.message).join(' ')).toMatch(
      /release-android\.yml is missing while another Pages deploy surface is present/u,
    );
  });

  it('stays a no-op when no Pages deploy surface exists at all', async () => {
    const root = await makeRoot({
      '.github/workflows/unrelated.yml': workflow(['  workflow_dispatch:']),
    });
    const findings: unknown[] = [];

    inspectPagesDeployConcurrency({ appRoot: root, findings });

    expect(findings).toEqual([]);
  });

  /*
   * The app's own lane runs this without `--brain-root`, so it inspects the app
   * alone. "11 workflow(s) keep pull requests off Actions" read as a two-repo
   * pass while the brain's workflows had not been opened.
   */
  it('names the repos it actually inspected in the pass line', () => {
    expect(
      formatCiTriggerResult({
        ok: true,
        findings: [],
        checkedWorkflows: [
          { repo: 'app', workflowPath: 'a.yml', events: ['workflow_dispatch'] },
          { repo: 'app', workflowPath: 'b.yml', events: ['workflow_dispatch'] },
        ],
      }),
    ).toContain('2 workflow(s) in app keep');

    expect(
      formatCiTriggerResult({
        ok: true,
        findings: [],
        checkedWorkflows: [
          { repo: 'app', workflowPath: 'a.yml', events: ['workflow_dispatch'] },
          { repo: 'brain', workflowPath: 'b.yml', events: ['workflow_dispatch'] },
        ],
      }),
    ).toContain('2 workflow(s) in app + brain keep');
  });

  it('accepts manual and scheduled workflows', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
      '.github/workflows/nightly.yml': workflow(['  schedule:', "    - cron: '0 3 * * *'"]),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checkedWorkflows).toHaveLength(2);
  });

  it('rejects a pull_request trigger that is not allowlisted', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/test.yml': workflow(['  pull_request:']),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      repo: 'app',
      workflowPath: '.github/workflows/test.yml',
      event: 'pull_request',
    });
  });

  it('rejects a push trigger that is not allowlisted', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/test.yml': workflow(['  push:', '    branches:', '      - main']),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.event)).toEqual(['push']);
  });

  it('rejects pull_request_target and other automatic events by default', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/target.yml': workflow([
        '  pull_request_target:',
        '    types:',
        '      - opened',
      ]),
      '.github/workflows/chained.yml': workflow([
        '  workflow_run:',
        '    workflows:',
        '      - Test',
        '    types:',
        '      - completed',
      ]),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.event).sort()).toEqual([
      'pull_request_target',
      'workflow_run',
    ]);
  });

  it('accepts an allowlisted event only for the allowlisted workflow', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/deploy-pages.yml': workflow(['  push:', '    branches:', '      - main']),
      '.github/workflows/test.yml': workflow(['  push:', '    branches:', '      - main']),
    });

    const result = inspectCiTriggers({
      appRoot,
      appAllowlist: [
        {
          workflowPath: '.github/workflows/deploy-pages.yml',
          events: { push: 'Production deploy.' },
        },
      ],
      // This fixture carries deploy-pages.yml to exercise the ALLOWLIST, not the
      // Pages deploy topology; scoping the surfaces keeps it from also being
      // told that release-android.yml went missing.
      pagesDeploySurfaces: [],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].workflowPath).toBe('.github/workflows/test.yml');
  });

  it('reports an allowlist entry whose workflow no longer exists', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
    });

    const result = inspectCiTriggers({
      appRoot,
      appAllowlist: [
        {
          workflowPath: '.github/workflows/deleted.yml',
          events: { push: 'Gone.' },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({
      repo: 'app',
      workflowPath: '.github/workflows/deleted.yml',
      message: expect.stringContaining('no longer exists'),
    });
  });

  it('reports a workflow with no triggers', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/broken.yml': [
        'name: Broken',
        'jobs:',
        '  build:',
        '    runs-on: ubuntu-latest',
        '',
      ].join('\n'),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain('declares no triggers');
  });

  it('reports a workflow that cannot be parsed', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/broken.yml': 'name: [unterminated\n',
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain('could not be parsed');
  });

  it('checks the brain repo when a brain root is given', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
    });
    const brainRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': workflow(['  pull_request:']),
    });

    const result = inspectCiTriggers({ appRoot, brainRoot, appAllowlist: [], brainAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      repo: 'brain',
      workflowPath: '.github/workflows/docs-integrity.yml',
      event: 'pull_request',
    });
    expect(result.checkedWorkflows.map((entry) => entry.repo)).toEqual(['app', 'brain']);
  });

  it('skips the brain repo when appOnly is set', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
    });
    const brainRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': workflow(['  pull_request:']),
    });

    const result = inspectCiTriggers({
      appRoot,
      brainRoot,
      appOnly: true,
      appAllowlist: [],
      brainAllowlist: [],
    });

    expect(result.ok).toBe(true);
    expect(result.checkedWorkflows.map((entry) => entry.repo)).toEqual(['app']);
  });

  it('reads triggers from string, array, and mapping forms', () => {
    expect(readTriggerEvents({ on: 'workflow_dispatch' })).toEqual(['workflow_dispatch']);
    expect(readTriggerEvents({ on: ['push', 'pull_request'] })).toEqual(['push', 'pull_request']);
    expect(readTriggerEvents({ on: { schedule: [{ cron: '0 3 * * *' }] } })).toEqual(['schedule']);
    expect(readTriggerEvents({ true: { workflow_dispatch: null } })).toEqual(['workflow_dispatch']);
    expect(readTriggerEvents({})).toEqual([]);
  });

  it('formats passing and failing results', () => {
    expect(formatCiTriggerResult({ ok: true, findings: [], checkedWorkflows: [{}] })).toContain(
      'Status: passed',
    );
    expect(
      formatCiTriggerResult({
        ok: false,
        findings: [
          {
            repo: 'app',
            workflowPath: '.github/workflows/test.yml',
            event: 'pull_request',
            message: 'nope',
          },
        ],
        checkedWorkflows: [],
      }),
    ).toContain('app:.github/workflows/test.yml:pull_request - nope');
  });

  it('keeps the shipped app allowlist limited to the production deploy workflow', () => {
    expect(APP_CI_TRIGGER_ALLOWLIST.map((entry) => entry.workflowPath)).toEqual([
      '.github/workflows/deploy-pages.yml',
    ]);
  });

  it('keeps the shipped brain allowlist empty', () => {
    expect(BRAIN_CI_TRIGGER_ALLOWLIST).toEqual([]);
  });

  it('allowlists no pull-request event in either repo', () => {
    const pullRequestEvents = [...APP_CI_TRIGGER_ALLOWLIST, ...BRAIN_CI_TRIGGER_ALLOWLIST]
      .flatMap((entry) => Object.keys(entry.events))
      .filter((event) => event.startsWith('pull_request'));

    expect(pullRequestEvents).toEqual([]);
  });

  /*
   * A release is always preceded by a What's New commit pushed to main, and that
   * push starts deploy-pages.yml from the PRE-release tree. On v0.2.5 the two
   * deploys were in different concurrency groups, the release's finished 32
   * seconds later and still lost, and production served the pre-release build
   * with every check green - the release job reports success whether or not its
   * deployment is the one that ends up live.
   */
  it('keeps every Pages deploy surface in one concurrency group', () => {
    const appRoot = path.resolve(import.meta.dirname, '..');

    for (const surface of PAGES_DEPLOY_SURFACES) {
      const workflow = YAML.parse(
        readFileSync(path.join(appRoot, '.github/workflows', surface.workflow), 'utf8'),
      );
      const scope = surface.job ? workflow.jobs[surface.job] : workflow;

      expect(scope.concurrency.group).toBe(PAGES_DEPLOY_CONCURRENCY_GROUP);
    }

    // Both surfaces, not one: a single-entry list would pass vacuously.
    expect(PAGES_DEPLOY_SURFACES).toHaveLength(2);
  });

  it('fails when a Pages deploy surface leaves the shared group', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pages-concurrency-'));

    try {
      const appRoot = path.resolve(import.meta.dirname, '..');
      mkdirSync(path.join(root, '.github/workflows'), { recursive: true });

      for (const name of ['deploy-pages.yml', 'release-android.yml']) {
        writeFileSync(
          path.join(root, '.github/workflows', name),
          readFileSync(path.join(appRoot, '.github/workflows', name), 'utf8'),
          'utf8',
        );
      }

      const drifted = path.join(root, '.github/workflows/release-android.yml');
      const before = readFileSync(drifted, 'utf8');
      const after = before.replace(
        'group: github-pages\n      cancel-in-progress: false',
        'group: release-android-pages\n      cancel-in-progress: false',
      );

      // The fixture must actually differ, or the test passes vacuously.
      expect(after).not.toBe(before);
      writeFileSync(drifted, after, 'utf8');

      const findings: Array<{ message: string }> = [];

      inspectPagesDeployConcurrency({ appRoot: root, findings });

      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain('release-android-pages');
      expect(findings[0].message).toContain('github-pages');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes for the real repository workflows', () => {
    const result = inspectCiTriggers({ appRoot: path.resolve(import.meta.dirname, '..') });

    expect(formatCiTriggerResult(result)).toContain('Status: passed');
    expect(result.ok).toBe(true);
  });
});
