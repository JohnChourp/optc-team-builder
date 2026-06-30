#!/usr/bin/env node
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function summarizePlaywrightFailures(options = {}) {
  const inputs = options.inputs?.length ? options.inputs : ['test-results'];
  const jsonFiles = [];

  for (const input of inputs) {
    jsonFiles.push(...(await collectJsonFiles(path.resolve(input))));
  }

  const groups = new Map();

  for (const jsonFile of jsonFiles) {
    let report;

    try {
      report = JSON.parse(await readFile(jsonFile, 'utf8'));
    } catch {
      continue;
    }

    for (const failure of collectFailures(report)) {
      const key = [
        failure.browser,
        failure.file,
        failure.title,
        String(failure.retryCount),
        failure.errorSignature,
      ].join('\0');
      const existing = groups.get(key) ?? { ...failure, occurrences: 0, reportFiles: new Set() };
      existing.occurrences += 1;
      existing.reportFiles.add(normalizePath(path.relative(process.cwd(), jsonFile)));
      groups.set(key, existing);
    }
  }

  const failures = [...groups.values()]
    .map((failure) => ({
      ...failure,
      reportFiles: [...failure.reportFiles].sort(),
    }))
    .sort((a, b) =>
      `${a.browser}\0${a.file}\0${a.title}\0${a.errorSignature}`.localeCompare(
        `${b.browser}\0${b.file}\0${b.title}\0${b.errorSignature}`,
      ),
    );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputFiles: jsonFiles.map((file) => normalizePath(path.relative(process.cwd(), file))).sort(),
    failureCount: failures.reduce((sum, failure) => sum + failure.occurrences, 0),
    groupCount: failures.length,
    failures,
  };
}

export function renderFailureSummaryMarkdown(summary) {
  const lines = ['# Playwright Failure Summary', ''];

  if (summary.groupCount === 0) {
    lines.push('No Playwright failures were found in JSON reports.');
    return `${lines.join('\n')}\n`;
  }

  lines.push(`Grouped ${summary.failureCount} failed attempt(s) into ${summary.groupCount} signature(s).`, '');
  lines.push('| Browser | File | Test | Retries | Occurrences | Signature |');
  lines.push('| --- | --- | --- | ---: | ---: | --- |');

  for (const failure of summary.failures) {
    lines.push(
      [
        failure.browser,
        failure.file,
        failure.title,
        String(failure.retryCount),
        String(failure.occurrences),
        failure.errorSignature,
      ]
        .map(escapeMarkdownCell)
        .join(' | ')
        .replace(/^/u, '| ')
        .replace(/$/u, ' |'),
    );
  }

  return `${lines.join('\n')}\n`;
}

export function collectFailures(report) {
  const failures = [];
  for (const error of report.errors ?? []) {
    failures.push({
      browser: 'unknown',
      file: 'global',
      title: 'Playwright report error',
      retryCount: 0,
      status: 'failed',
      errorSignature: normalizeErrorSignature(error.message ?? error.stack ?? JSON.stringify(error)),
    });
  }

  walkSuites(report.suites ?? [], [], failures);
  return failures;
}

async function collectJsonFiles(inputPath) {
  const files = [];

  let entries;
  try {
    entries = await readdir(inputPath, { withFileTypes: true });
  } catch {
    return /\.json$/u.test(inputPath) ? [inputPath] : files;
  }

  for (const entry of entries) {
    const entryPath = path.join(inputPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && /\.json$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function walkSuites(suites, titlePath, failures) {
  for (const suite of suites) {
    const nextTitlePath = suite.title ? [...titlePath, suite.title] : titlePath;

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const failingResults = (test.results ?? []).filter((result) => isFailingResult(result, test.expectedStatus));

        if (failingResults.length === 0) {
          continue;
        }

        const retryCount = Math.max(...(test.results ?? []).map((result) => Number(result.retry ?? 0)), 0);
        const browser = test.projectName ?? spec.projectName ?? 'unknown';
        const file = normalizePath(spec.file ?? suite.file ?? 'unknown');
        const title = [...nextTitlePath, spec.title].filter(Boolean).join(' > ');

        for (const result of failingResults) {
          failures.push({
            browser,
            file,
            title,
            retryCount,
            status: result.status ?? 'unknown',
            errorSignature: normalizeErrorSignature(failureMessage(result, test.expectedStatus)),
          });
        }
      }
    }

    walkSuites(suite.suites ?? [], nextTitlePath, failures);
  }
}

function isFailingResult(result, expectedStatus = 'passed') {
  const status = result.status ?? '';
  if (!status || status === 'skipped') {
    return false;
  }

  if (status === 'timedOut' || status === 'interrupted') {
    return true;
  }

  return status !== expectedStatus;
}

function failureMessage(result, expectedStatus = 'passed') {
  return (
    result.error?.message ??
    result.errors?.[0]?.message ??
    `Expected ${expectedStatus}, received ${result.status ?? 'unknown'}`
  );
}

export function normalizeErrorSignature(value) {
  const firstUsefulLine =
    String(value)
      .replace(/\u001b\[[0-9;]*m/gu, '')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('Call log:')) ?? 'unknown failure';

  return firstUsefulLine
    .replace(/[A-Z]:\\[^\s)]+/giu, '<path>')
    .replace(/\/home\/runner\/work\/[^\s)]+/giu, '<path>')
    .replace(/\d{2,}/gu, '<n>');
}

function escapeMarkdownCell(value) {
  return String(value).replace(/[\\|\r\n]/gu, (char) => {
    if (char === '\\') {
      return '\\\\';
    }

    if (char === '|') {
      return '\\|';
    }

    return ' ';
  });
}

function normalizePath(value) {
  return String(value).split(path.sep).join('/');
}

function parseArgs(args) {
  const options = {
    inputs: [],
    outputJson: path.join('test-results', 'playwright-failure-summary.json'),
    outputMd: path.join('test-results', 'playwright-failure-summary.md'),
    appendGithubStepSummary: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--input') {
      options.inputs.push(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--input=')) {
      options.inputs.push(arg.slice('--input='.length));
      continue;
    }

    if (arg === '--output-json') {
      options.outputJson = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--output-md') {
      options.outputMd = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--append-github-step-summary') {
      options.appendGithubStepSummary = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runCli(args = process.argv.slice(2), env = process.env, io = console) {
  const options = parseArgs(args);
  const summary = await summarizePlaywrightFailures(options);
  const markdown = renderFailureSummaryMarkdown(summary);

  await mkdir(path.dirname(path.resolve(options.outputJson)), { recursive: true });
  await mkdir(path.dirname(path.resolve(options.outputMd)), { recursive: true });
  await writeFile(options.outputJson, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(options.outputMd, markdown);

  if (options.appendGithubStepSummary && env.GITHUB_STEP_SUMMARY) {
    await appendFile(env.GITHUB_STEP_SUMMARY, `\n${markdown}`);
  }

  io.log(`[playwright-summary] ${summary.groupCount} failure signature(s) written to ${options.outputJson}.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[playwright-summary] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
