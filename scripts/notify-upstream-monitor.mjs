#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatUpstreamMonitorSummary } from './check-optc-upstream-monitor.mjs';

const githubApiVersion = '2022-11-28';
const artifactName = 'upstream-monitor-report';

export const upstreamMonitorNotificationPolicy = Object.freeze({
  title: 'OPTC DB upstream freshness and drift monitor notifications',
  marker: '<!-- optc-upstream-monitor-notifications -->',
});

function readOptionValue(arg, optionName) {
  return arg.slice(`${optionName}=`.length);
}

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    reportPath: 'upstream-monitor-report.json',
  };

  for (const arg of args) {
    if (arg.startsWith('--report=')) {
      options.reportPath = readOptionValue(arg, '--report');
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function buildArtifactPointer(report) {
  if (report.workflow?.runUrl) {
    return `${report.workflow.runUrl} artifact \`${artifactName}\``;
  }

  return `Actions artifact \`${artifactName}\``;
}

export function buildUpstreamMonitorNotification(report, policy = upstreamMonitorNotificationPolicy) {
  const status = String(report?.status ?? '');

  if (!['warning', 'failed'].includes(status)) {
    return {
      shouldNotify: false,
      status,
      title: policy.title,
      marker: policy.marker,
      body: '',
    };
  }

  const severity = status === 'failed' ? 'error' : 'warning';
  const lines = [
    `### Upstream monitor ${severity}: ${status}`,
    '',
    `- Severity: ${severity}`,
    `- Status: ${status}`,
    `- Warning count: ${Array.isArray(report.warnings) ? report.warnings.length : 0}`,
    `- Detailed evidence: ${buildArtifactPointer(report)}`,
  ];

  if (report.workflow?.runUrl) {
    lines.push(`- Run: ${report.workflow.runUrl}`);
  }

  if (report.workflow?.sha) {
    lines.push(`- Commit: ${report.workflow.sha}`);
  }

  lines.push('', formatUpstreamMonitorSummary(report).trim(), '');

  return {
    shouldNotify: true,
    status,
    severity,
    title: policy.title,
    marker: policy.marker,
    body: lines.join('\n'),
  };
}

function buildIssueBody(notification) {
  return [
    notification.marker,
    '',
    'This issue collects maintainer-facing OPTC DB upstream freshness and release-detector drift monitor alerts.',
    'Routine no-change runs stay quiet.',
    '',
    notification.body,
  ].join('\n');
}

function buildGitHubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': githubApiVersion,
    'Content-Type': 'application/json',
    'User-Agent': 'optc-team-builder-upstream-monitor-notifier',
  };
}

async function readGitHubResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function githubRequest({ method = 'GET', url, token, body, fetchImpl }) {
  const response = await fetchImpl(url, {
    method,
    headers: buildGitHubHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${url} failed: ${response.status} ${text}`);
  }

  return readGitHubResponse(response);
}

function resolveRepository(report, env) {
  return env.GITHUB_REPOSITORY || report.workflow?.repository || '';
}

function resolveToken(env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || '';
}

function issueMatchesNotificationThread(issue, notification) {
  return (
    !issue.pull_request &&
    issue.title === notification.title &&
    typeof issue.body === 'string' &&
    issue.body.includes(notification.marker)
  );
}

async function findNotificationIssue({ repository, token, notification, fetchImpl }) {
  let page = 1;

  while (true) {
    const url = `https://api.github.com/repos/${repository}/issues?state=open&per_page=100&page=${page}`;
    const issues = await githubRequest({ url, token, fetchImpl });
    const matchingIssue = issues.find((issue) => issueMatchesNotificationThread(issue, notification));

    if (matchingIssue || issues.length < 100) {
      return matchingIssue ?? null;
    }

    page += 1;
  }
}

async function createNotificationIssue({ repository, token, notification, fetchImpl }) {
  const url = `https://api.github.com/repos/${repository}/issues`;
  return githubRequest({
    method: 'POST',
    url,
    token,
    fetchImpl,
    body: {
      title: notification.title,
      body: buildIssueBody(notification),
    },
  });
}

async function commentOnNotificationIssue({ repository, token, issueNumber, notification, fetchImpl }) {
  const url = `https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`;
  return githubRequest({
    method: 'POST',
    url,
    token,
    fetchImpl,
    body: {
      body: notification.body,
    },
  });
}

export async function sendUpstreamMonitorNotification({
  report,
  env = process.env,
  fetchImpl = fetch,
  logger = console,
  policy = upstreamMonitorNotificationPolicy,
} = {}) {
  const notification = buildUpstreamMonitorNotification(report, policy);

  if (!notification.shouldNotify) {
    logger.info(`Upstream monitor notification skipped for status: ${notification.status || 'unknown'}`);
    return {
      sent: false,
      status: notification.status,
      severity: null,
      action: 'skipped',
    };
  }

  const repository = resolveRepository(report, env);
  const token = resolveToken(env);

  if (!repository) {
    throw new Error('Cannot send upstream monitor notification: GITHUB_REPOSITORY is missing.');
  }

  if (!token) {
    throw new Error('Cannot send upstream monitor notification: GITHUB_TOKEN or GH_TOKEN is missing.');
  }

  const existingIssue = await findNotificationIssue({
    repository,
    token,
    notification,
    fetchImpl,
  });

  if (existingIssue) {
    const comment = await commentOnNotificationIssue({
      repository,
      token,
      issueNumber: existingIssue.number,
      notification,
      fetchImpl,
    });

    logger.info(`Upstream monitor notification added to issue #${existingIssue.number}.`);
    return {
      sent: true,
      status: notification.status,
      severity: notification.severity,
      action: 'commented',
      issueNumber: existingIssue.number,
      issueUrl: existingIssue.html_url,
      commentUrl: comment?.html_url ?? null,
    };
  }

  const issue = await createNotificationIssue({
    repository,
    token,
    notification,
    fetchImpl,
  });

  logger.info(`Upstream monitor notification issue #${issue.number} created.`);
  return {
    sent: true,
    status: notification.status,
    severity: notification.severity,
    action: 'created',
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    commentUrl: null,
  };
}

async function main() {
  const options = parseArgs();
  const report = JSON.parse(await readFile(options.reportPath, 'utf8'));
  const result = await sendUpstreamMonitorNotification({ report });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
