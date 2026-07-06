#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ALL_ZERO_SHA_PATTERN = /^0+$/u;

export const SCRIPT_SUITES = {
  'ci-routing': {
    label: 'CI routing tests',
    command: 'npm run test:ci-routing',
  },
  'actions-pins': {
    label: 'GitHub Actions pin tests',
    command: 'npm run test:actions-pins && npm run actions:pins',
  },
  'workflow-budgets': {
    label: 'GitHub workflow budget tests',
    command: 'npm run test:workflow-budgets && npm run actions:workflow-budgets',
  },
  'maintainer-doctor': {
    label: 'Maintainer environment doctor tests',
    command: 'npm run test:maintainer-doctor',
  },
  'branch-cleanup': {
    label: 'Branch cleanup report tests',
    command: 'npm run test:branch-cleanup',
  },
  'dataset-digest': {
    label: 'Dataset change digest tests',
    command: 'npm run test:dataset-digest',
  },
  'saved-team-codecs': {
    label: 'Saved-team codec fuzz tests',
    command: 'npm run test:saved-team-codecs',
  },
  'captain-contracts': {
    label: 'Captain contract script tests',
    command: 'npm run test:captain-contracts',
  },
  'release-check': {
    label: 'Release detector replay tests',
    command: 'npm run test:release-check',
  },
  'release-runbook-drift': {
    label: 'Release runbook drift tests',
    command: 'npm run test:release-runbook-drift',
  },
  'release-readiness': {
    label: 'Release readiness report tests',
    command: 'npm run test:release-readiness',
  },
  'docs-integrity': {
    label: 'Docs integrity script tests',
    command: 'npm run test:docs-integrity',
  },
  'docs-commands': {
    label: 'Docs command script tests',
    command: 'npm run test:docs-commands',
  },
  'docs-drift': {
    label: 'Docs drift script tests',
    command: 'npm run test:docs-drift',
  },
  discoverability: {
    label: 'Guide discoverability tests',
    command: 'npm run test:discoverability',
  },
  'public-entry-synthetics': {
    label: 'Public entry synthetic monitor tests',
    command: 'npm run test:public-entry-synthetics',
  },
  'drive-sync-server': {
    label: 'Drive sync backend tests',
    command: 'npm run test:drive-sync-server',
  },
  'source-data': {
    label: 'Source data validation tests',
    command:
      'npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/lib/manual-character-prune.spec.ts scripts/lib/party-conflict-keys.spec.ts scripts/upsert-manual-character.spec.ts',
  },
  'perf-budget': {
    label: 'Performance budget script tests',
    command: 'npm run test:perf-budget',
  },
  'e2e-triage': {
    label: 'Playwright routing and quarantine tests',
    command: 'npm run test:e2e-triage',
  },
  'pwa-shell': {
    label: 'PWA shell safety tests',
    command: 'npm run test:pwa-shell',
  },
};

export const SCRIPT_SUITE_ORDER = Object.keys(SCRIPT_SUITES);

const DOCS_SCRIPT_SUITES = ['docs-integrity', 'docs-commands', 'docs-drift'];

function normalizePath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\.\/+/u, '').trim();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sanitizeOutputValue(value) {
  return String(value ?? '').replace(/\0/gu, '').replace(/\r?\n/gu, ' ').trim();
}

function addScriptSuite(suites, suite) {
  if (!SCRIPT_SUITES[suite]) {
    throw new Error(`Unknown script suite: ${suite}`);
  }
  suites.add(suite);
}

function isDocsPath(filePath) {
  return (
    filePath === 'README.md' ||
    filePath === '.github/pull_request_template.md' ||
    filePath === '.github/pull_request_template' ||
    filePath.startsWith('docs/') ||
    filePath === 'e2e/README.md' ||
    /\.mdx?$/u.test(filePath)
  );
}

function isWorkflowOrDependencyPath(filePath) {
  return (
    filePath === 'package.json' ||
    filePath === 'package-lock.json' ||
    filePath === '.nvmrc' ||
    filePath === 'angular.json' ||
    filePath === 'playwright.config.ts' ||
    filePath === 'tsconfig.json' ||
    filePath === 'tsconfig.app.json' ||
    filePath === 'tsconfig.spec.json' ||
    filePath.startsWith('.github/workflows/') ||
    filePath === 'scripts/ci-check-routing.mjs' ||
    filePath === 'scripts/ci-check-routing.spec.ts'
  );
}

function isReleaseCheckPath(filePath) {
  return (
    filePath === 'scripts/backtest-optc-release-detector.mjs' ||
    filePath === 'scripts/backtest-optc-release-detector.spec.ts' ||
    filePath === 'scripts/check-optc-release-needed.mjs' ||
    filePath === 'scripts/check-optc-release-needed.spec.ts' ||
    filePath === 'scripts/check-optc-upstream-monitor.mjs' ||
    filePath === 'scripts/check-optc-upstream-monitor.spec.ts' ||
    filePath.startsWith('scripts/fixtures/release-check/') ||
    filePath.startsWith('scripts/fixtures/release-provenance/') ||
    filePath === 'scripts/post-dispatch-production-smoke.mjs' ||
    filePath === 'scripts/post-dispatch-production-smoke.spec.ts' ||
    filePath === 'scripts/release-provenance-report.mjs' ||
    filePath === 'scripts/release-provenance-report.spec.ts' ||
    filePath.startsWith('scripts/lib/release-trigger-')
  );
}

function isReleaseReadinessPath(filePath) {
  return (
    filePath === 'scripts/release-readiness-report.mjs' ||
    filePath === 'scripts/release-readiness-report.spec.ts' ||
    filePath.startsWith('scripts/fixtures/release-readiness/')
  );
}

function isReleaseRunbookDriftPath(filePath) {
  return (
    filePath === 'scripts/check-release-runbook-drift.mjs' ||
    filePath === 'scripts/check-release-runbook-drift.spec.ts'
  );
}

function isDocsScriptPath(filePath) {
  return (
    filePath === 'scripts/check-docs-integrity.mjs' ||
    filePath === 'scripts/check-docs-integrity.spec.ts' ||
    filePath === 'scripts/check-docs-commands.mjs' ||
    filePath === 'scripts/check-docs-commands.spec.ts' ||
    filePath === 'scripts/check-docs-drift.mjs' ||
    filePath === 'scripts/check-docs-drift.spec.ts' ||
    filePath === 'docs/docs-drift-map.json'
  );
}

function isGitHubActionsPinPath(filePath) {
  return (
    filePath === 'scripts/check-github-actions-pins.mjs' ||
    filePath === 'scripts/check-github-actions-pins.spec.ts'
  );
}

function isWorkflowBudgetPath(filePath) {
  return (
    filePath === 'scripts/check-github-workflow-budgets.mjs' ||
    filePath === 'scripts/check-github-workflow-budgets.spec.ts'
  );
}

function isDiscoverabilityPath(filePath) {
  return (
    filePath === 'scripts/verify-guide-discoverability.mjs' ||
    filePath === 'scripts/verify-guide-discoverability.spec.ts'
  );
}

function isPublicEntrySyntheticsPath(filePath) {
  return (
    filePath === 'scripts/public-entry-synthetics.mjs' ||
    filePath === 'scripts/public-entry-synthetics.spec.ts'
  );
}

function isMaintainerDoctorPath(filePath) {
  return (
    filePath === 'scripts/maintainer-environment-doctor.mjs' ||
    filePath === 'scripts/maintainer-environment-doctor.spec.ts'
  );
}

function isBranchCleanupPath(filePath) {
  return (
    filePath === 'scripts/branch-cleanup-report.mjs' ||
    filePath === 'scripts/branch-cleanup-report.spec.ts' ||
    filePath === 'docs/branch-lifecycle-policy.md'
  );
}

function isDatasetDigestPath(filePath) {
  return (
    filePath === 'scripts/dataset-change-digest.mjs' ||
    filePath === 'scripts/dataset-change-digest.spec.ts'
  );
}

function isSavedTeamCodecPath(filePath) {
  return (
    filePath === 'docs/saved-team-schema-lifecycle.md' ||
    filePath === 'scripts/fixtures/data/README.md' ||
    filePath === 'scripts/fixtures/data/saved-teams-v1.json' ||
    filePath === 'scripts/fixtures/data/saved-teams-v1-legacy-partial.json' ||
    filePath === 'scripts/fixtures/data/saved-team-share-v1-legacy-partial.json' ||
    filePath === 'scripts/fixtures/data/saved-team-codec-fuzz-corpus.json' ||
    filePath === 'src/app/pages/saved-teams/saved-teams-transfer.utils.ts' ||
    filePath === 'src/app/pages/saved-teams/saved-teams-transfer.utils.spec.ts' ||
    filePath === 'src/app/pages/saved-teams/saved-teams-codec-fuzz.spec.ts'
  );
}

function isSavedTeamCodecRuntimePath(filePath) {
  return filePath === 'src/app/pages/saved-teams/saved-teams-transfer.utils.ts';
}

function isPerfPath(filePath) {
  return (
    filePath === 'scripts/perf-budget-report.mjs' ||
    filePath === 'scripts/perf-budget-report.spec.ts' ||
    filePath === 'scripts/perf-budget-history.mjs' ||
    filePath === 'scripts/perf-budget-history.spec.ts' ||
    filePath === 'scripts/perf-ability-filters.mjs' ||
    filePath === 'scripts/perf-explanation-compare.mjs' ||
    filePath === 'scripts/perf-saved-team-codecs.mjs' ||
    filePath === 'scripts/perf-route-load.mjs'
  );
}

function isE2ePath(filePath) {
  return (
    filePath.startsWith('e2e/') ||
    filePath === 'scripts/run-playwright-e2e.mjs' ||
    filePath === 'scripts/validate-playwright-quarantine.mjs' ||
    filePath === 'scripts/summarize-playwright-failures.mjs' ||
    filePath === 'scripts/summarize-playwright-failures.spec.ts' ||
    filePath.startsWith('scripts/lib/playwright-')
  );
}

function isPwaShellPath(filePath) {
  return (
    filePath === 'ngsw-config.json' ||
    filePath === 'src/app/app.config.ts' ||
    filePath === 'src/main.ts' ||
    filePath === 'src/index.html' ||
    filePath === 'public/manifest.webmanifest' ||
    filePath.startsWith('public/brand/pwa-icon-') ||
    filePath === 'scripts/pwa-shell-check.mjs'
  );
}

function isCaptainContractPath(filePath) {
  return (
    filePath === 'src/app/core/services/fixtures/captain-contract-cases.json' ||
    (filePath.startsWith('scripts/') &&
      (filePath === 'scripts/import-optc-data.mjs' ||
        filePath === 'scripts/import-optc-data.spec.ts' ||
        filePath === 'scripts/auto-team-builder-ability-parser.mjs' ||
        filePath === 'scripts/lib/captain-ability-coverage.mjs' ||
        filePath === 'scripts/lib/captain-ability-coverage.spec.ts' ||
        filePath.includes('captain') ||
        filePath.includes('ability-correction') ||
        filePath.includes('ability-definitions')))
  );
}

function isDatasetPath(filePath) {
  return (
    filePath === 'scripts/benchmark-dataset.mjs' ||
    filePath.startsWith('src/assets/data/')
  );
}

function isSourceDataPath(filePath) {
  return filePath.startsWith('scripts/data/');
}

function isRuntimePath(filePath) {
  return (
    filePath.startsWith('src/') ||
    filePath.startsWith('public/i18n/') ||
    filePath === 'ngsw-config.json' ||
    filePath === 'capacitor.config.ts' ||
    filePath === 'ionic.config.json'
  );
}

function isDriveSyncPath(filePath) {
  return filePath.startsWith('server/');
}

function buildScriptMatrix(scriptSuites) {
  return {
    include: scriptSuites.map((suite) => ({
      suite,
      label: SCRIPT_SUITES[suite].label,
      command: SCRIPT_SUITES[suite].command,
    })),
  };
}

function buildFullPlan(changedFiles, reasons, categories) {
  const scriptSuites = SCRIPT_SUITE_ORDER;
  return {
    changedFiles,
    categories: uniqueSorted(categories),
    fullPlan: true,
    reasons: uniqueSorted(reasons),
    runAngular: true,
    runDatasetPerf: true,
    runE2e: true,
    runQuarantine: true,
    scriptSuites,
    scriptMatrix: buildScriptMatrix(scriptSuites),
  };
}

export function buildCheckPlan(rawChangedFiles, options = {}) {
  const changedFiles = uniqueSorted(rawChangedFiles.map(normalizePath).filter(Boolean));
  const categories = new Set();
  const reasons = new Set();
  const scriptSuites = new Set();
  let runAngular = false;
  let runDatasetPerf = false;
  let runE2e = false;
  let runQuarantine = false;

  if (options.diffUnavailable) {
    return buildFullPlan(changedFiles, ['changed-file diff was unavailable'], categories);
  }

  if (changedFiles.length === 0) {
    return buildFullPlan(changedFiles, ['no changed files were detected'], categories);
  }

  for (const filePath of changedFiles) {
    if (isWorkflowOrDependencyPath(filePath)) {
      categories.add('full-risk');
      reasons.add(`${filePath} can affect dependency, workflow, or CI routing behavior`);
      continue;
    }

    if (isReleaseCheckPath(filePath)) {
      categories.add('release-check');
      addScriptSuite(scriptSuites, 'release-check');
      continue;
    }

    if (isReleaseReadinessPath(filePath)) {
      categories.add('release-readiness');
      addScriptSuite(scriptSuites, 'release-readiness');
      continue;
    }

    if (isReleaseRunbookDriftPath(filePath)) {
      categories.add('release-runbook-drift');
      addScriptSuite(scriptSuites, 'release-runbook-drift');
      for (const suite of DOCS_SCRIPT_SUITES) {
        addScriptSuite(scriptSuites, suite);
      }
      continue;
    }

    if (isDocsScriptPath(filePath)) {
      categories.add('docs-tooling');
      for (const suite of DOCS_SCRIPT_SUITES) {
        addScriptSuite(scriptSuites, suite);
      }
      continue;
    }

    if (isGitHubActionsPinPath(filePath)) {
      categories.add('github-actions-pins');
      addScriptSuite(scriptSuites, 'actions-pins');
      continue;
    }

    if (isWorkflowBudgetPath(filePath)) {
      categories.add('workflow-budgets');
      addScriptSuite(scriptSuites, 'workflow-budgets');
      continue;
    }

    if (isDiscoverabilityPath(filePath)) {
      categories.add('guide-discoverability');
      addScriptSuite(scriptSuites, 'discoverability');
      continue;
    }

    if (isPublicEntrySyntheticsPath(filePath)) {
      categories.add('public-entry-synthetics');
      addScriptSuite(scriptSuites, 'public-entry-synthetics');
      continue;
    }

    if (isMaintainerDoctorPath(filePath)) {
      categories.add('maintainer-doctor');
      addScriptSuite(scriptSuites, 'maintainer-doctor');
      continue;
    }

    if (isBranchCleanupPath(filePath)) {
      categories.add('branch-cleanup');
      addScriptSuite(scriptSuites, 'branch-cleanup');
      if (isDocsPath(filePath)) {
        for (const suite of DOCS_SCRIPT_SUITES) {
          addScriptSuite(scriptSuites, suite);
        }
      }
      continue;
    }

    if (isDatasetDigestPath(filePath)) {
      categories.add('dataset-digest');
      addScriptSuite(scriptSuites, 'dataset-digest');
      continue;
    }

    if (isSavedTeamCodecPath(filePath)) {
      categories.add('saved-team-codecs');
      addScriptSuite(scriptSuites, 'saved-team-codecs');
      if (isSavedTeamCodecRuntimePath(filePath)) {
        categories.add('runtime');
        runAngular = true;
        runE2e = true;
      }
      if (isDocsPath(filePath)) {
        for (const suite of DOCS_SCRIPT_SUITES) {
          addScriptSuite(scriptSuites, suite);
        }
      }
      continue;
    }

    if (isPerfPath(filePath)) {
      categories.add('performance-tooling');
      addScriptSuite(scriptSuites, 'perf-budget');
      continue;
    }

    if (isDocsPath(filePath)) {
      categories.add('docs');
      for (const suite of DOCS_SCRIPT_SUITES) {
        addScriptSuite(scriptSuites, suite);
      }
      continue;
    }

    if (isE2ePath(filePath)) {
      categories.add('browser-e2e');
      runE2e = true;
      runQuarantine = true;
      addScriptSuite(scriptSuites, 'e2e-triage');
      continue;
    }

    if (isPwaShellPath(filePath)) {
      categories.add('pwa-shell');
      addScriptSuite(scriptSuites, 'pwa-shell');
      if (isRuntimePath(filePath)) {
        runAngular = true;
        runE2e = true;
      }
      continue;
    }

    if (isCaptainContractPath(filePath)) {
      categories.add('captain-contracts');
      runAngular = true;
      if (isSourceDataPath(filePath)) {
        categories.add('source-data');
        addScriptSuite(scriptSuites, 'source-data');
      }
      addScriptSuite(scriptSuites, 'captain-contracts');
      continue;
    }

    if (isSourceDataPath(filePath)) {
      categories.add('source-data');
      addScriptSuite(scriptSuites, 'source-data');
      continue;
    }

    if (isDatasetPath(filePath)) {
      categories.add('dataset');
      runDatasetPerf = true;
      continue;
    }

    if (isRuntimePath(filePath)) {
      categories.add('runtime');
      runAngular = true;
      runE2e = true;
      continue;
    }

    if (isDriveSyncPath(filePath)) {
      categories.add('drive-sync-server');
      addScriptSuite(scriptSuites, 'drive-sync-server');
      continue;
    }

    categories.add('full-risk');
    reasons.add(`${filePath} is not covered by a targeted routing rule`);
  }

  if (categories.has('full-risk')) {
    return buildFullPlan(changedFiles, reasons, categories);
  }

  const orderedSuites = SCRIPT_SUITE_ORDER.filter((suite) => scriptSuites.has(suite));
  return {
    changedFiles,
    categories: uniqueSorted(categories),
    fullPlan: false,
    reasons: orderedSuites.length > 0 || runAngular || runDatasetPerf || runE2e || runQuarantine ? [] : ['no suites selected'],
    runAngular,
    runDatasetPerf,
    runE2e,
    runQuarantine,
    scriptSuites: orderedSuites,
    scriptMatrix: buildScriptMatrix(orderedSuites),
  };
}

export function getChangedFiles({ base, head, cwd = process.cwd(), execFile = execFileSync } = {}) {
  if (!base || !head || ALL_ZERO_SHA_PATTERN.test(base) || ALL_ZERO_SHA_PATTERN.test(head)) {
    return { changedFiles: [], diffUnavailable: true, reason: 'missing or zero base/head SHA' };
  }

  try {
    const output = execFile('git', ['diff', '--name-status', '--diff-filter=ACMRTD', `${base}...${head}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { changedFiles: parseNameStatusOutput(output), diffUnavailable: false, reason: '' };
  } catch (error) {
    return {
      changedFiles: [],
      diffUnavailable: true,
      reason: error instanceof Error ? error.message : 'git diff failed',
    };
  }
}

export function parseNameStatusOutput(output) {
  const changedFiles = [];

  for (const rawLine of String(output ?? '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const [status, ...paths] = line.split('\t');
    if (/^[CR]/u.test(status) && paths.length >= 2) {
      changedFiles.push(paths[0], paths[1]);
      continue;
    }

    if (paths.length >= 1) {
      changedFiles.push(paths[0]);
    }
  }

  return changedFiles;
}

export function renderMarkdown(plan) {
  const lines = [
    '# CI check routing',
    '',
    `Full plan: ${plan.fullPlan ? 'yes' : 'no'}`,
    `Categories: ${plan.categories.length > 0 ? plan.categories.join(', ') : 'none'}`,
    `Reasons: ${plan.reasons.length > 0 ? plan.reasons.join('; ') : 'targeted routing matched all files'}`,
    '',
    '| Check group | Runs |',
    '| --- | --- |',
    `| Angular unit tests | ${plan.runAngular ? 'yes' : 'no'} |`,
    `| Script suites | ${plan.scriptSuites.length > 0 ? plan.scriptSuites.join(', ') : 'none'} |`,
    `| Dataset performance guard | ${plan.runDatasetPerf ? 'yes' : 'no'} |`,
    `| Blocking browser e2e | ${plan.runE2e ? 'yes' : 'no'} |`,
    `| Quarantine browser e2e | ${plan.runQuarantine ? 'yes' : 'no'} |`,
    '',
    '## Changed files',
    '',
  ];

  if (plan.changedFiles.length === 0) {
    lines.push('- none detected');
  } else {
    for (const filePath of plan.changedFiles) {
      lines.push(`- \`${filePath}\``);
    }
  }

  return `${lines.join('\n')}\n`;
}

function githubOutputLines(plan) {
  return [
    ['full_plan', String(plan.fullPlan)],
    ['categories', plan.categories.join(',')],
    ['reasons', plan.reasons.join('; ')],
    ['run_angular', String(plan.runAngular)],
    ['run_script_suites', String(plan.scriptSuites.length > 0)],
    ['run_dataset_perf', String(plan.runDatasetPerf)],
    ['run_e2e', String(plan.runE2e)],
    ['run_quarantine', String(plan.runQuarantine)],
    ['script_suites', plan.scriptSuites.join(',')],
    ['script_matrix', JSON.stringify(plan.scriptMatrix)],
    ['changed_files_json', JSON.stringify(plan.changedFiles)],
  ];
}

export function formatGitHubOutput(plan) {
  return `${githubOutputLines(plan)
    .map(([key, value]) => `${key}=${sanitizeOutputValue(value)}`)
    .join('\n')}\n`;
}

function parseArgs(argv) {
  const options = { base: '', head: '', format: 'json' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--base' || arg === '--head' || arg === '--format') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['github-output', 'json', 'markdown'].includes(options.format)) {
    throw new Error(`Unsupported --format value: ${options.format}`);
  }

  return options;
}

function usage() {
  return `Usage: node scripts/ci-check-routing.mjs --base <sha> --head <sha> --format github-output|json|markdown`;
}

function writeOutput(value, outputPath) {
  if (outputPath) {
    appendFileSync(outputPath, value);
  } else {
    writeFileSync(process.stdout.fd, value);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    writeFileSync(process.stdout.fd, `${usage()}\n`);
    return;
  }

  const diff = getChangedFiles({ base: options.base, head: options.head });
  const plan = buildCheckPlan(diff.changedFiles, { diffUnavailable: diff.diffUnavailable });

  if (diff.reason && diff.diffUnavailable && !plan.reasons.includes(diff.reason)) {
    plan.reasons.push(sanitizeOutputValue(diff.reason));
  }

  if (options.format === 'github-output') {
    writeOutput(formatGitHubOutput(plan), process.env.GITHUB_OUTPUT);
    return;
  }

  if (options.format === 'markdown') {
    writeFileSync(process.stdout.fd, renderMarkdown(plan));
    return;
  }

  writeFileSync(process.stdout.fd, `${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
