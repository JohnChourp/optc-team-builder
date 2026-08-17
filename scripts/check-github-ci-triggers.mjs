#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

/**
 * CI trigger policy for optc-team-builder.
 *
 * Validation runs locally (`npm run verify:local`), not on GitHub Actions minutes.
 * No workflow may start itself from a pull request or from a push to main unless
 * it is listed below with a concrete reason. Everything else must be manual
 * (`workflow_dispatch`) or scheduled (`schedule`).
 *
 * See docs/ci-trigger-policy.md before adding an entry.
 */

/** Events a workflow may always declare: they never fire on a PR or a main push. */
export const ALWAYS_ALLOWED_EVENTS = ['workflow_dispatch', 'schedule', 'workflow_call', 'repository_dispatch'];

export const APP_CI_TRIGGER_ALLOWLIST = [
  {
    workflowPath: '.github/workflows/deploy-pages.yml',
    events: {
      push: 'Publishing the production web app on main is the deploy itself, not a test lane.',
    },
  },
];

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

export function inspectCiTriggers({
  appRoot = process.cwd(),
  allowlist = APP_CI_TRIGGER_ALLOWLIST,
  alwaysAllowedEvents = ALWAYS_ALLOWED_EVENTS,
} = {}) {
  const findings = [];
  const checkedWorkflows = [];

  const alwaysAllowed = new Set(alwaysAllowedEvents);
  const allowlistByPath = new Map(allowlist.map((entry) => [normalizePath(entry.workflowPath), entry]));
  const workflowFiles = listWorkflowFiles(appRoot);
  const knownWorkflowPaths = new Set(workflowFiles);

  for (const workflowPath of allowlistByPath.keys()) {
    if (!knownWorkflowPaths.has(workflowPath)) {
      findings.push({
        workflowPath,
        event: '-',
        message: 'Allowlisted workflow no longer exists; remove the stale CI trigger exception.',
      });
    }
  }

  for (const workflowPath of workflowFiles) {
    const { workflow, error } = readWorkflow(appRoot, workflowPath);

    if (error) {
      findings.push({ workflowPath, event: '-', message: error });
      continue;
    }

    const events = readTriggerEvents(workflow);

    if (events.length === 0) {
      findings.push({
        workflowPath,
        event: '-',
        message: 'Workflow declares no triggers, so its intent cannot be checked.',
      });
      continue;
    }

    const allowedEvents = allowlistByPath.get(workflowPath)?.events ?? {};

    for (const event of events) {
      if (alwaysAllowed.has(event)) {
        continue;
      }

      if (Object.hasOwn(allowedEvents, event)) {
        continue;
      }

      findings.push({
        workflowPath,
        event,
        message:
          `Trigger "${event}" runs GitHub Actions automatically. Validation runs locally ` +
          `(npm run verify:local), so use workflow_dispatch or schedule, or document an ` +
          `exception in APP_CI_TRIGGER_ALLOWLIST and docs/ci-trigger-policy.md.`,
      });
    }

    checkedWorkflows.push({ workflowPath, events });
  }

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
    lines.push(`- ${finding.workflowPath}:${finding.event} - ${finding.message}`);
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const args = {
    appRoot: process.cwd(),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--app-root') {
      index += 1;
      if (!argv[index]) {
        throw new Error('--app-root requires a value');
      }
      args.appRoot = path.resolve(argv[index]);
    } else if (arg.startsWith('--app-root=')) {
      args.appRoot = path.resolve(arg.slice('--app-root='.length));
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
