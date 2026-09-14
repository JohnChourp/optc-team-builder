#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

// Manual-only workflows have no PR or main-push trigger to keep fresh, so each
// run is isolated by run id and is never cancelled. See docs/ci-trigger-policy.md.
const MANUAL_RUN_GROUP = '${{ github.workflow }}-${{ github.run_id }}';

/**
 * 869f1ujj9. The obsolete Android SDK package, and why a budget guard cares.
 *
 * `android-actions/setup-android` defaults to `packages: 'tools platform-tools'`. `tools` is the
 * superseded SDK Tools package, and its dependency graph pulls in the Android **Emulator** -
 * roughly 300MB - into a release job that never starts one. Measured on the v0.4.35 release run:
 * 11.4s of a 23s SDK step went on downloading and unzipping `emulator/`.
 *
 * The seconds are not the point. The run immediately before that one FAILED there, on a corrupt
 * download ("Error reading Zip content from a SeekableByteChannel"), taking the whole release with
 * it. An unused 300MB download is a way for a release to fail that buys nothing, which is a cost
 * this file exists to refuse.
 *
 * Note `platform-tools` ends in `tools` - the comparison below is over whole tokens for exactly
 * that reason, because a substring test would reject the package we mean to keep.
 */
const ANDROID_SDK_ACTION = 'android-actions/setup-android';
const OBSOLETE_ANDROID_SDK_PACKAGES = ['tools'];

export const APP_WORKFLOW_BUDGET_EXEMPTIONS = [
  '.github/workflows/codeql.yml',
  '.github/workflows/dataset-change-digest.yml',
  '.github/workflows/pr-traceability.yml',
];

export const BRAIN_WORKFLOW_BUDGET_EXEMPTIONS = ['.github/workflows/pr-traceability.yml'];

export const APP_WORKFLOW_BUDGET_CONTRACT = [
  {
    workflowPath: '.github/workflows/refresh-visual-baselines.yml',
    concurrency: {
      group: MANUAL_RUN_GROUP,
      cancelInProgress: false,
    },
    jobs: {
      refresh: { timeoutMinutes: 30 },
    },
  },
  {
    workflowPath: '.github/workflows/test.yml',
    concurrency: {
      group: MANUAL_RUN_GROUP,
      cancelInProgress: false,
    },
    jobs: {
      changes: { timeoutMinutes: 10 },
      test: { timeoutMinutes: 20 },
      'script-suites': { timeoutMinutes: 25 },
      'dataset-performance': { timeoutMinutes: 20 },
      e2e: { timeoutMinutes: 35 },
      'e2e-quarantine': { timeoutMinutes: 35 },
    },
  },
  {
    workflowPath: '.github/workflows/guide-discoverability.yml',
    concurrency: {
      group: MANUAL_RUN_GROUP,
      cancelInProgress: false,
    },
    jobs: {
      verify: { timeoutMinutes: 25 },
    },
  },
  {
    workflowPath: '.github/workflows/docs-integrity.yml',
    concurrency: {
      group: MANUAL_RUN_GROUP,
      cancelInProgress: false,
    },
    jobs: {
      'docs-integrity': { timeoutMinutes: 25 },
    },
  },
  {
    workflowPath: '.github/workflows/deploy-pages.yml',
    concurrency: {
      group: 'github-pages',
      cancelInProgress: true,
    },
    jobs: {
      build: { timeoutMinutes: 25 },
      deploy: { timeoutMinutes: 15 },
      /*
       * 869f17h5v. Submits the deployed sitemap's priority URLs to IndexNow.
       * Cheap by construction - it downloads the sitemap the build job already
       * produced and runs a script that needs no `npm ci`, so 10 minutes is
       * generous for one HTTP POST.
       */
      indexnow: { timeoutMinutes: 10 },
      'cache-freshness': { timeoutMinutes: 25 },
    },
  },
  {
    workflowPath: '.github/workflows/performance-budgets.yml',
    concurrency: {
      group: 'performance-budgets',
      cancelInProgress: false,
    },
    jobs: {
      'performance-budgets': { timeoutMinutes: 30 },
    },
  },
  {
    workflowPath: '.github/workflows/public-entry-synthetics.yml',
    concurrency: {
      group: 'public-entry-synthetics',
      cancelInProgress: false,
    },
    jobs: {
      'public-entry-synthetics': { timeoutMinutes: 15 },
    },
  },
  {
    workflowPath: '.github/workflows/check-optc-db-release.yml',
    concurrency: {
      group: 'optc-db-release-check',
      cancelInProgress: false,
    },
    jobs: {
      check: { timeoutMinutes: 40 },
      notify: { timeoutMinutes: 10 },
    },
  },
  {
    workflowPath: '.github/workflows/release-android.yml',
    concurrency: {
      group: 'android-release',
      cancelInProgress: false,
    },
    jobs: {
      release: { timeoutMinutes: 60 },
      'release-provenance': { timeoutMinutes: 20 },
      'deploy-pages': {
        timeoutMinutes: 25,
        /*
         * Same group as deploy-pages.yml, deliberately. It used to be
         * `release-android-pages`, which meant the release's own Pages deploy
         * and the one triggered by the What's New push that always precedes a
         * release sat in different groups and raced. On v0.2.5 this job finished
         * 32 seconds later and still lost, so production served the pre-release
         * build with every check green.
         */
        concurrency: {
          group: 'github-pages',
          cancelInProgress: false,
        },
      },
      'post-dispatch-production-smoke': { timeoutMinutes: 20 },
    },
  },
];

export const BRAIN_WORKFLOW_BUDGET_CONTRACT = [
  {
    workflowPath: '.github/workflows/docs-integrity.yml',
    concurrency: {
      group: MANUAL_RUN_GROUP,
      cancelInProgress: false,
    },
    jobs: {
      'docs-integrity': { timeoutMinutes: 25 },
    },
  },
];

function normalizePath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\.\/+/u, '').trim();
}

function normalizeExpression(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function readWorkflow(root, workflowPath) {
  const absolutePath = path.join(root, workflowPath);
  if (!existsSync(absolutePath)) {
    return { error: `Workflow is missing: ${workflowPath}` };
  }

  try {
    return {
      workflow: YAML.parse(readFileSync(absolutePath, 'utf8')),
    };
  } catch (error) {
    return { error: `Workflow could not be parsed: ${workflowPath}: ${error.message}` };
  }
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

function valueMatches(actual, expected) {
  if (typeof expected === 'boolean') {
    return actual === expected;
  }

  return normalizeExpression(actual) === normalizeExpression(expected);
}

function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function inspectConcurrency({ findings, repo, workflowPath, scope, actual, expected }) {
  if (!actual || typeof actual !== 'object') {
    findings.push({
      repo,
      workflowPath,
      scope,
      message: 'Missing concurrency policy.',
    });
    return;
  }

  if (!valueMatches(actual.group, expected.group)) {
    findings.push({
      repo,
      workflowPath,
      scope,
      message: `Concurrency group is ${formatValue(actual.group)}; expected ${formatValue(expected.group)}.`,
    });
  }

  if (!valueMatches(actual['cancel-in-progress'], expected.cancelInProgress)) {
    findings.push({
      repo,
      workflowPath,
      scope,
      message: `cancel-in-progress is ${formatValue(actual['cancel-in-progress'])}; expected ${formatValue(
        expected.cancelInProgress,
      )}.`,
    });
  }
}

function hasBudgetSummaryStep(job, timeoutMinutes) {
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  return steps.some((step) => {
    const name = normalizeExpression(step?.name);
    const run = String(step?.run ?? '');
    return (
      name === 'Summarize workflow budget' &&
      run.includes(`Timeout budget: ${timeoutMinutes} minute`) &&
      run.includes('Concurrency policy:')
    );
  });
}

function inspectWorkflowFileCoverage({ findings, repo, root, contracts, exemptions }) {
  const contractedWorkflowPaths = new Set(contracts.map((contract) => normalizePath(contract.workflowPath)));
  const exemptWorkflowPaths = new Set(exemptions.map((workflowPath) => normalizePath(workflowPath)));

  for (const workflowPath of listWorkflowFiles(root)) {
    if (!contractedWorkflowPaths.has(workflowPath) && !exemptWorkflowPaths.has(workflowPath)) {
      findings.push({
        repo,
        workflowPath,
        scope: 'workflow',
        message:
          'Workflow is not covered by the budget contract or an explicit exemption, so it can bypass concurrency and timeout policy checks.',
      });
    }
  }
}

/**
 * Every `setup-android` step in the repo states its packages, and none asks for an obsolete one.
 *
 * This walks every workflow file rather than only the contracted ones: a workflow exempt from the
 * concurrency and timeout contract can still download 300MB it does not use, and the exemption was
 * never a decision about that.
 */
function inspectAndroidSdkPackages({ findings, repo, root }) {
  for (const workflowPath of listWorkflowFiles(root)) {
    const { workflow, error } = readWorkflow(root, workflowPath);

    if (error || !workflow?.jobs || typeof workflow.jobs !== 'object') {
      continue;
    }

    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      const steps = Array.isArray(job?.steps) ? job.steps : [];

      for (const [index, step] of steps.entries()) {
        if (!String(step?.uses ?? '').startsWith(`${ANDROID_SDK_ACTION}@`)) {
          continue;
        }

        const scope = `jobs.${jobId}.steps[${index}]`;
        const packages = step?.with?.packages;

        if (packages === undefined) {
          findings.push({
            repo,
            workflowPath,
            scope,
            message:
              `${ANDROID_SDK_ACTION} does not state its packages, so it takes the action default ` +
              "'tools platform-tools' - and `tools` drags in the ~300MB Android Emulator. State " +
              'packages explicitly.',
          });
          continue;
        }

        const requested = String(packages).split(/\s+/u).filter((token) => token.length > 0);
        const obsolete = requested.filter((token) => OBSOLETE_ANDROID_SDK_PACKAGES.includes(token));

        if (obsolete.length > 0) {
          findings.push({
            repo,
            workflowPath,
            scope,
            message:
              `${ANDROID_SDK_ACTION} asks for the obsolete package(s) ${obsolete.join(', ')}, which ` +
              'pull in the ~300MB Android Emulator that no job here starts. Remove them.',
          });
        }
      }
    }
  }
}

function inspectBudgetedJobCoverage({ findings, repo, workflowPath, workflow, contract }) {
  const actualJobs = workflow?.jobs && typeof workflow.jobs === 'object' ? Object.keys(workflow.jobs) : [];
  const contractedJobs = new Set(Object.keys(contract.jobs));

  for (const jobId of actualJobs) {
    if (!contractedJobs.has(jobId)) {
      findings.push({
        repo,
        workflowPath,
        scope: `jobs.${jobId}`,
        message: 'Job is not covered by the workflow-budget contract.',
      });
    }
  }
}

export function inspectWorkflowBudgets({
  appRoot = process.cwd(),
  brainRoot,
  appOnly = false,
  appContracts = APP_WORKFLOW_BUDGET_CONTRACT,
  brainContracts = BRAIN_WORKFLOW_BUDGET_CONTRACT,
  appWorkflowExemptions = APP_WORKFLOW_BUDGET_EXEMPTIONS,
  brainWorkflowExemptions = BRAIN_WORKFLOW_BUDGET_EXEMPTIONS,
} = {}) {
  const targets = [
    {
      repo: 'app',
      root: appRoot,
      contracts: appContracts,
      exemptions: appWorkflowExemptions,
    },
  ];

  if (!appOnly && brainRoot) {
    targets.push({
      repo: 'brain',
      root: brainRoot,
      contracts: brainContracts,
      exemptions: brainWorkflowExemptions,
    });
  }

  const findings = [];
  const checkedJobs = [];
  const checkedWorkflows = [];

  for (const target of targets) {
    inspectWorkflowFileCoverage({
      findings,
      repo: target.repo,
      root: target.root,
      contracts: target.contracts,
      exemptions: target.exemptions,
    });

    inspectAndroidSdkPackages({ findings, repo: target.repo, root: target.root });

    for (const contract of target.contracts) {
      const workflowPath = normalizePath(contract.workflowPath);
      const { workflow, error } = readWorkflow(target.root, workflowPath);
      checkedWorkflows.push({ repo: target.repo, workflowPath });

      if (error) {
        findings.push({ repo: target.repo, workflowPath, scope: 'workflow', message: error });
        continue;
      }

      inspectBudgetedJobCoverage({
        findings,
        repo: target.repo,
        workflowPath,
        workflow,
        contract,
      });

      inspectConcurrency({
        findings,
        repo: target.repo,
        workflowPath,
        scope: 'workflow',
        actual: workflow?.concurrency,
        expected: contract.concurrency,
      });

      for (const [jobId, expectedJob] of Object.entries(contract.jobs)) {
        const job = workflow?.jobs?.[jobId];
        checkedJobs.push({
          repo: target.repo,
          workflowPath,
          jobId,
          timeoutMinutes: expectedJob.timeoutMinutes,
        });

        if (!job) {
          findings.push({
            repo: target.repo,
            workflowPath,
            scope: `jobs.${jobId}`,
            message: 'Budgeted job is missing.',
          });
          continue;
        }

        if (job['timeout-minutes'] !== expectedJob.timeoutMinutes) {
          findings.push({
            repo: target.repo,
            workflowPath,
            scope: `jobs.${jobId}`,
            message: `timeout-minutes is ${formatValue(job['timeout-minutes'])}; expected ${expectedJob.timeoutMinutes}.`,
          });
        }

        if (expectedJob.concurrency) {
          inspectConcurrency({
            findings,
            repo: target.repo,
            workflowPath,
            scope: `jobs.${jobId}`,
            actual: job.concurrency,
            expected: expectedJob.concurrency,
          });
        }

        if (!hasBudgetSummaryStep(job, expectedJob.timeoutMinutes)) {
          findings.push({
            repo: target.repo,
            workflowPath,
            scope: `jobs.${jobId}`,
            message:
              'Missing workflow-budget summary step with timeout and concurrency policy context for logs and step summary.',
          });
        }
      }
    }
  }

  return {
    ok: findings.length === 0,
    appRoot,
    brainRoot,
    appOnly,
    checkedWorkflows,
    checkedJobs,
    findings,
  };
}

export function formatWorkflowBudgetResult(result) {
  const lines = ['# GitHub workflow budget check', ''];

  if (result.ok) {
    lines.push(
      `Status: passed - ${result.checkedJobs.length} budgeted job(s) across ${result.checkedWorkflows.length} workflow(s) match the concurrency and timeout policy.`,
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push('Status: failed', '');
  for (const finding of result.findings) {
    lines.push(`- ${finding.repo}:${finding.workflowPath}:${finding.scope} - ${finding.message}`);
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
    if (arg === '--app-only') {
      args.appOnly = true;
    } else if (arg === '--json') {
      args.json = true;
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
    const result = inspectWorkflowBudgets(args);

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stdout.write(formatWorkflowBudgetResult(result));
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[workflow-budgets] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
