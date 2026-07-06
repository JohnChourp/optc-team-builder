#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse as parseYaml } from 'yaml';

import { buildReleasePolicyGitHubOutputs } from './lib/release-trigger-policy.mjs';

const CONTRACT_START = '<!-- release-runbook-drift: contract-start -->';
const CONTRACT_END = '<!-- release-runbook-drift: contract-end -->';
const DEFAULT_BRAIN_ROOT = '../optc-team-builder-brain';
const DEFAULT_RUNBOOK_PATH = 'OPTC_DB_AUTO_RELEASE_RUNBOOK.md';
const DEFAULT_WORKFLOW_PATH = '.github/workflows/check-optc-db-release.yml';
const DEFAULT_PACKAGE_PATH = 'package.json';

function normalizePath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\.\/+/u, '').trim();
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  }

  return value;
}

function formatValue(value) {
  return JSON.stringify(stableValue(value));
}

function valuesEqual(left, right) {
  return formatValue(left) === formatValue(right);
}

function addMismatch(failures, { field, source, runbook, actual }) {
  failures.push(
    [
      `${field} does not match ${source}.`,
      `runbook=${formatValue(runbook)}`,
      `actual=${formatValue(actual)}`,
    ].join(' '),
  );
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractRunbookContract(markdown) {
  const startIndex = markdown.indexOf(CONTRACT_START);
  const endIndex = markdown.indexOf(CONTRACT_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Missing release runbook drift contract markers ${CONTRACT_START} / ${CONTRACT_END}.`);
  }

  const markedBlock = markdown.slice(startIndex + CONTRACT_START.length, endIndex);
  const jsonMatch = markedBlock.match(/```json\s*([\s\S]*?)\s*```/u);

  if (!jsonMatch?.[1]) {
    throw new Error('Release runbook drift contract must contain one ```json fenced block.');
  }

  try {
    return JSON.parse(jsonMatch[1]);
  } catch (error) {
    throw new Error(`Release runbook drift contract JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readWorkflowInput(workflow, inputName) {
  const workflowOn = workflow?.on ?? workflow?.['on'];
  return workflowOn?.workflow_dispatch?.inputs?.[inputName] ?? null;
}

function readWorkflowScheduleCron(workflow) {
  const workflowOn = workflow?.on ?? workflow?.['on'];
  const schedules = Array.isArray(workflowOn?.schedule) ? workflowOn.schedule : [];
  return schedules.map((entry) => entry?.cron).filter(Boolean);
}

function readCheckJobOutputs(workflow) {
  return uniqueSorted(Object.keys(workflow?.jobs?.check?.outputs ?? {}));
}

function readCheckJobUploadArtifacts(workflow) {
  const steps = Array.isArray(workflow?.jobs?.check?.steps) ? workflow.jobs.check.steps : [];
  return uniqueSorted(
    steps
      .filter((step) => String(step?.uses ?? '').includes('actions/upload-artifact'))
      .map((step) => step?.with?.name),
  );
}

export function buildPolicyContractFromOutputs(outputs = buildReleasePolicyGitHubOutputs()) {
  return {
    activeStatuses: JSON.parse(outputs.active_statuses_json),
    dispatch: {
      bump: outputs.release_bump,
      ref: outputs.release_ref,
      workflow: outputs.release_workflow,
    },
    idempotency: {
      blockingConclusions: JSON.parse(outputs.release_dispatch_blocking_conclusions_json),
      blockingStatuses: JSON.parse(outputs.release_dispatch_blocking_statuses_json),
      recentRunLimit: Number(outputs.release_dispatch_recent_run_limit),
      runNamePrefix: outputs.release_dispatch_run_name_prefix,
      strategy: outputs.release_dispatch_idempotency_strategy,
    },
    modes: {
      dispatchIfNeeded: outputs.release_dispatch_mode_dispatch_if_needed,
      manualDefault: outputs.release_manual_dispatch_default,
      scheduled: outputs.release_scheduled_dispatch_mode,
      verifyOnly: outputs.release_dispatch_mode_verify_only,
    },
  };
}

function validateContractShape(contract) {
  const errors = [];

  if (!isObject(contract)) {
    return ['runbook contract must be an object'];
  }

  if (!isObject(contract.workflow)) {
    errors.push('runbook contract workflow must be an object');
  }

  if (!isObject(contract.packageScripts)) {
    errors.push('runbook contract packageScripts must be an object');
  }

  if (!isObject(contract.releasePolicy)) {
    errors.push('runbook contract releasePolicy must be an object');
  }

  if (!isObject(contract.sourceFiles)) {
    errors.push('runbook contract sourceFiles must be an object');
  }

  return errors;
}

async function validateSourceFiles({ contract, appRoot, brainRoot, failures }) {
  const appFiles = Array.isArray(contract.sourceFiles?.app) ? contract.sourceFiles.app : [];
  const brainFiles = Array.isArray(contract.sourceFiles?.brain) ? contract.sourceFiles.brain : [];

  for (const filePath of appFiles) {
    const normalized = normalizePath(filePath);
    if (!(await pathExists(path.join(appRoot, normalized)))) {
      failures.push(`sourceFiles.app references missing app file: ${normalized}`);
    }
  }

  for (const filePath of brainFiles) {
    const normalized = normalizePath(filePath);
    if (!(await pathExists(path.join(brainRoot, normalized)))) {
      failures.push(`sourceFiles.brain references missing brain file: ${normalized}`);
    }
  }
}

export async function checkReleaseRunbookDrift(options = {}) {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const brainRoot = path.resolve(options.brainRoot ?? path.join(appRoot, DEFAULT_BRAIN_ROOT));
  const runbookPath = path.join(brainRoot, DEFAULT_RUNBOOK_PATH);
  const workflowPath = path.join(appRoot, DEFAULT_WORKFLOW_PATH);
  const packagePath = path.join(appRoot, DEFAULT_PACKAGE_PATH);
  const failures = [];

  const [runbookText, workflowText, packageText] = await Promise.all([
    readFile(runbookPath, 'utf8'),
    readFile(workflowPath, 'utf8'),
    readFile(packagePath, 'utf8'),
  ]);

  const contract = extractRunbookContract(runbookText);
  failures.push(...validateContractShape(contract));

  const workflow = parseYaml(workflowText);
  const packageJson = JSON.parse(packageText);
  const inputName = contract.workflow?.manualInput?.name ?? 'release_dispatch_mode';

  const actualWorkflow = {
    artifacts: readCheckJobUploadArtifacts(workflow),
    checkJobOutputs: readCheckJobOutputs(workflow),
    manualInput: {
      name: inputName,
      ...(readWorkflowInput(workflow, inputName) ?? {}),
    },
    scheduleCron: readWorkflowScheduleCron(workflow),
  };

  const expectedWorkflow = {
    artifacts: uniqueSorted(contract.workflow?.artifacts ?? []),
    checkJobOutputs: uniqueSorted(contract.workflow?.checkJobOutputs ?? []),
    manualInput: contract.workflow?.manualInput ?? null,
    scheduleCron: uniqueSorted(contract.workflow?.scheduleCron ?? []),
  };

  for (const field of ['manualInput', 'scheduleCron', 'checkJobOutputs', 'artifacts']) {
    if (!valuesEqual(expectedWorkflow[field], actualWorkflow[field])) {
      addMismatch(failures, {
        field: `workflow.${field}`,
        source: DEFAULT_WORKFLOW_PATH,
        runbook: expectedWorkflow[field],
        actual: actualWorkflow[field],
      });
    }
  }

  for (const [scriptName, expectedCommand] of Object.entries(contract.packageScripts ?? {})) {
    const actualCommand = packageJson.scripts?.[scriptName] ?? null;
    if (actualCommand !== expectedCommand) {
      addMismatch(failures, {
        field: `packageScripts.${scriptName}`,
        source: DEFAULT_PACKAGE_PATH,
        runbook: expectedCommand,
        actual: actualCommand,
      });
    }
  }

  const actualPolicy = buildPolicyContractFromOutputs();
  if (!valuesEqual(contract.releasePolicy, actualPolicy)) {
    addMismatch(failures, {
      field: 'releasePolicy',
      source: 'scripts/lib/release-trigger-policy.mjs',
      runbook: contract.releasePolicy,
      actual: actualPolicy,
    });
  }

  await validateSourceFiles({ contract, appRoot, brainRoot, failures });

  return {
    appRoot,
    brainRoot,
    contract,
    failures,
    checked: {
      workflow: DEFAULT_WORKFLOW_PATH,
      packageJson: DEFAULT_PACKAGE_PATH,
      runbook: DEFAULT_RUNBOOK_PATH,
    },
  };
}

export function formatReleaseRunbookDriftResult(result) {
  if (result.failures.length > 0) {
    return [
      `[release-runbook-drift] found ${result.failures.length} issue(s):`,
      ...result.failures.map((failure) => `- ${failure}`),
    ].join('\n');
  }

  return [
    '[release-runbook-drift] runbook contract matches live workflow, package scripts, release policy, artifacts, outputs, and source files.',
    `[release-runbook-drift] appRoot=${result.appRoot}`,
    `[release-runbook-drift] brainRoot=${result.brainRoot}`,
  ].join('\n');
}

export function parseArgs(args = process.argv.slice(2)) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--app-root') {
      options.appRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--app-root=')) {
      options.appRoot = arg.slice('--app-root='.length);
      continue;
    }

    if (arg === '--brain-root') {
      options.brainRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--brain-root=')) {
      options.brainRoot = arg.slice('--brain-root='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runCli(args = process.argv.slice(2), io = console) {
  const result = await checkReleaseRunbookDrift(parseArgs(args));
  const output = formatReleaseRunbookDriftResult(result);

  if (result.failures.length > 0) {
    io.error(output);
    return 1;
  }

  io.log(output);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[release-runbook-drift] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
