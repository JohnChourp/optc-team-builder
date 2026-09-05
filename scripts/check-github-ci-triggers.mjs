#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

/**
 * CI trigger policy for optc-team-builder and optc-team-builder-brain.
 *
 * Validation runs locally (`npm run verify:local` in the app,
 * `scripts/verify-local.sh` in the brain), not on GitHub Actions minutes.
 * No workflow in either repo may start itself from a pull request or from a
 * push to main unless it is listed below with a concrete reason. Everything
 * else must be manual (`workflow_dispatch`) or scheduled (`schedule`).
 *
 * See docs/ci-trigger-policy.md before adding an entry.
 */

/** Events a workflow may always declare: they never fire on a PR or a main push. */
export const ALWAYS_ALLOWED_EVENTS = [
  'workflow_dispatch',
  'schedule',
  'workflow_call',
  'repository_dispatch',
];

export const APP_CI_TRIGGER_ALLOWLIST = [
  {
    workflowPath: '.github/workflows/deploy-pages.yml',
    events: {
      push: 'Publishing the production web app on main is the deploy itself, not a test lane.',
    },
  },
];

/** The brain repo publishes nothing, so it has no automatic trigger at all. */
export const BRAIN_CI_TRIGGER_ALLOWLIST = [];

function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/gu, '/')
    .replace(/^\.\/+/u, '')
    .trim();
}

function listWorkflowFiles(root) {
  const workflowRoot = path.join(root, '.github/workflows');
  if (!existsSync(workflowRoot)) {
    return [];
  }

  return readdirSync(workflowRoot)
    .filter((file) => /\.ya?ml$/u.test(file))
    .map((file) => `.github/workflows/${file}`)
    .sort();
}

function readWorkflow(root, workflowPath) {
  const absolutePath = path.join(root, workflowPath);

  try {
    return { workflow: YAML.parse(readFileSync(absolutePath, 'utf8')) };
  } catch (error) {
    return { error: `Workflow could not be parsed: ${workflowPath}: ${error.message}` };
  }
}

/**
 * `on` is parsed as the boolean key `true` by YAML 1.1 loaders when it is written
 * unquoted, so accept either shape.
 */
export function readTriggerEvents(workflow) {
  const on = workflow?.on ?? workflow?.true;

  if (typeof on === 'string') {
    return [on];
  }

  if (Array.isArray(on)) {
    return on.map((event) => String(event));
  }

  if (on && typeof on === 'object') {
    return Object.keys(on);
  }

  return [];
}

function inspectRepository({
  findings,
  checkedWorkflows,
  repo,
  root,
  allowlist,
  alwaysAllowed,
  localCommand,
}) {
  const allowlistByPath = new Map(
    allowlist.map((entry) => [normalizePath(entry.workflowPath), entry]),
  );
  const workflowFiles = listWorkflowFiles(root);
  const knownWorkflowPaths = new Set(workflowFiles);

  for (const workflowPath of allowlistByPath.keys()) {
    if (!knownWorkflowPaths.has(workflowPath)) {
      findings.push({
        repo,
        workflowPath,
        event: '-',
        message: 'Allowlisted workflow no longer exists; remove the stale CI trigger exception.',
      });
    }
  }

  for (const workflowPath of workflowFiles) {
    const { workflow, error } = readWorkflow(root, workflowPath);

    if (error) {
      findings.push({ repo, workflowPath, event: '-', message: error });
      continue;
    }

    const events = readTriggerEvents(workflow);

    if (events.length === 0) {
      findings.push({
        repo,
        workflowPath,
        event: '-',
        message: 'Workflow declares no triggers, so its intent cannot be checked.',
      });
      continue;
    }

    const allowedEvents = allowlistByPath.get(workflowPath)?.events ?? {};

    for (const event of events) {
      if (alwaysAllowed.has(event) || Object.hasOwn(allowedEvents, event)) {
        continue;
      }

      findings.push({
        repo,
        workflowPath,
        event,
        message:
          `Trigger "${event}" runs GitHub Actions automatically. Validation runs locally ` +
          `(${localCommand}), so use workflow_dispatch or schedule, or document an exception ` +
          `in the ${repo} allowlist and docs/ci-trigger-policy.md.`,
      });
    }

    checkedWorkflows.push({ repo, workflowPath, events });
  }
}

/**
 * Every job that publishes GitHub Pages has to sit in one concurrency group, or
 * two of them race and the loser's build is what the world sees.
 *
 * A release is always preceded by a What's New commit pushed to `main`, and that
 * push starts `deploy-pages.yml` from the PRE-release tree. On v0.2.5 the
 * release's own deploy finished 32 seconds later and STILL lost: production
 * served the pre-release build, with every fix present, the version label a
 * release behind, and every check green - the release job reports success
 * whether or not its deployment is the one that ends up live.
 */
export const PAGES_DEPLOY_CONCURRENCY_GROUP = 'github-pages';

export const PAGES_DEPLOY_SURFACES = [
  { workflow: 'deploy-pages.yml', job: null },
  { workflow: 'release-android.yml', job: 'deploy-pages' },
];

function readConcurrencyGroup(workflow, jobName) {
  const scope = jobName ? workflow?.jobs?.[jobName] : workflow;

  if (!scope) {
    return { missing: true };
  }

  const concurrency = scope.concurrency;
  const group = typeof concurrency === 'string' ? concurrency : concurrency?.group;

  return { group: typeof group === 'string' ? group : null };
}

export function inspectPagesDeployConcurrency({ appRoot = process.cwd(), findings }) {
  // Two Pages deploys are what race. A tree carrying fewer than all of these
  // surfaces has nothing to serialise - which covers every fixture root the
  // other tests build, and a repository that has not adopted both workflows.
  const present = PAGES_DEPLOY_SURFACES.every((surface) =>
    existsSync(path.join(appRoot, '.github/workflows', surface.workflow)),
  );

  if (!present) {
    return;
  }

  for (const surface of PAGES_DEPLOY_SURFACES) {
    const workflowPath = path.join('.github/workflows', surface.workflow);
    const { workflow, error } = readWorkflow(appRoot, workflowPath);

    if (error) {
      findings.push({
        repo: 'app',
        workflowPath: path.join('.github/workflows', surface.workflow),
        event: 'concurrency',
        message: error,
      });
      continue;
    }

    const where = surface.job ? `${surface.workflow} job ${surface.job}` : surface.workflow;
    const { missing, group } = readConcurrencyGroup(workflow, surface.job);

    if (missing) {
      findings.push({
        repo: 'app',
        workflowPath: path.join('.github/workflows', surface.workflow),
        event: 'concurrency',
        message: `${where} no longer exists; the Pages deploy surfaces changed and this check needs updating.`,
      });
      continue;
    }

    if (group !== PAGES_DEPLOY_CONCURRENCY_GROUP) {
      findings.push({
        repo: 'app',
        workflowPath: path.join('.github/workflows', surface.workflow),
        event: 'concurrency',
        message:
          `${where} publishes GitHub Pages with concurrency group ${group ?? '(none)'}, not ` +
          `${PAGES_DEPLOY_CONCURRENCY_GROUP}. Two Pages deploys in different groups race, and the ` +
          'release has already lost that race once - production served the pre-release build while every check stayed green.',
      });
    }
  }
}

export function inspectCiTriggers({
  appRoot = process.cwd(),
  brainRoot,
  appOnly = false,
  appAllowlist = APP_CI_TRIGGER_ALLOWLIST,
  brainAllowlist = BRAIN_CI_TRIGGER_ALLOWLIST,
  alwaysAllowedEvents = ALWAYS_ALLOWED_EVENTS,
} = {}) {
  const targets = [
    {
      repo: 'app',
      root: appRoot,
      allowlist: appAllowlist,
      localCommand: 'npm run verify:local',
    },
  ];

  if (!appOnly && brainRoot) {
    targets.push({
      repo: 'brain',
      root: brainRoot,
      allowlist: brainAllowlist,
      localCommand: 'scripts/verify-local.sh',
    });
  }

  const findings = [];
  const checkedWorkflows = [];
  const alwaysAllowed = new Set(alwaysAllowedEvents);

  for (const target of targets) {
    inspectRepository({
      findings,
      checkedWorkflows,
      repo: target.repo,
      root: target.root,
      allowlist: target.allowlist,
      alwaysAllowed,
      localCommand: target.localCommand,
    });
  }

  inspectPagesDeployConcurrency({ appRoot, findings });

  return {
    ok: findings.length === 0,
    findings,
    checkedWorkflows,
  };
}

export function formatCiTriggerResult(result) {
  const lines = ['# GitHub CI trigger policy check', ''];

  if (result.ok) {
    lines.push(
      `Status: passed - ${result.checkedWorkflows.length} workflow(s) keep pull requests and main pushes off GitHub Actions.`,
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push('Status: failed', '');
  for (const finding of result.findings) {
    lines.push(`- ${finding.repo}:${finding.workflowPath}:${finding.event} - ${finding.message}`);
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const args = {
    appRoot: process.cwd(),
    brainRoot: undefined,
    appOnly: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--app-only') {
      args.appOnly = true;
    } else if (arg === '--app-root') {
      index += 1;
      if (!argv[index]) {
        throw new Error('--app-root requires a value');
      }
      args.appRoot = path.resolve(argv[index]);
    } else if (arg === '--brain-root') {
      index += 1;
      if (!argv[index]) {
        throw new Error('--brain-root requires a value');
      }
      args.brainRoot = path.resolve(argv[index]);
    } else if (arg.startsWith('--app-root=')) {
      args.appRoot = path.resolve(arg.slice('--app-root='.length));
    } else if (arg.startsWith('--brain-root=')) {
      args.brainRoot = path.resolve(arg.slice('--brain-root='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = inspectCiTriggers(args);

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stdout.write(formatCiTriggerResult(result));
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[ci-triggers] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
