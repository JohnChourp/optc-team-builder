import { releaseTriggerPolicy } from './release-trigger-policy.mjs';

const githubApiVersion = '2022-11-28';
const artifactName = 'release-trigger-outcome';

function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

function formatNewCharacterIds(report) {
  const ids = report.comparison?.newCharacterIds ?? [];
  return ids.length > 0 ? ids.join(', ') : 'none';
}

function buildArtifactPointer(report) {
  if (report.workflow?.runUrl) {
    return `${report.workflow.runUrl} artifact \`${artifactName}\``;
  }

  return `Actions artifact \`${artifactName}\``;
}

function resolveNotificationSeverity(reason, policy) {
  return policy.notification.severities[reason] ?? null;
}

export function buildReleaseTriggerNotification(report, policy = releaseTriggerPolicy) {
  const reason = String(report?.reason ?? '');

  if (!reason || policy.notification.quietReasons.includes(reason)) {
    return {
      shouldNotify: false,
      reason,
      severity: null,
      title: policy.notification.issueTitle,
      marker: policy.notification.issueMarker,
      body: '',
    };
  }

  if (!policy.notification.notifyReasons.includes(reason)) {
    return {
      shouldNotify: false,
      reason,
      severity: null,
      title: policy.notification.issueTitle,
      marker: policy.notification.issueMarker,
      body: '',
    };
  }

  const severity = resolveNotificationSeverity(reason, policy);
  const lines = [
    `### Release trigger ${severity}: ${reason}`,
    '',
    `- Severity: ${severity}`,
    `- Status: ${report.status}`,
    `- Reason: ${reason}`,
    `- Release needed: ${formatYesNo(report.dispatch?.releaseNeeded)}`,
    `- Release dispatched: ${formatYesNo(report.dispatch?.releaseDispatched)}`,
    `- Active Release Android runs: ${report.dispatch?.activeReleaseCount ?? 'unknown'}`,
    `- New character IDs: ${formatNewCharacterIds(report)}`,
    `- Detailed evidence: ${buildArtifactPointer(report)}`,
  ];

  if (report.workflow?.runUrl) {
    lines.push(`- Run: ${report.workflow.runUrl}`);
  }

  if (report.workflow?.sha) {
    lines.push(`- Commit: ${report.workflow.sha}`);
  }

  lines.push('');

  return {
    shouldNotify: true,
    reason,
    severity,
    title: policy.notification.issueTitle,
    marker: policy.notification.issueMarker,
    body: lines.join('\n'),
  };
}

function buildIssueBody(notification) {
  return [
    notification.marker,
    '',
    'This issue collects maintainer-facing OPTC DB release-trigger outcomes that need attention.',
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
    'User-Agent': 'optc-team-builder-release-trigger-notifier',
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

export async function sendReleaseTriggerNotification({
  report,
  env = process.env,
  fetchImpl = fetch,
  logger = console,
  policy = releaseTriggerPolicy,
} = {}) {
  const notification = buildReleaseTriggerNotification(report, policy);

  if (!notification.shouldNotify) {
    logger.info(`Release trigger notification skipped for reason: ${notification.reason || 'unknown'}`);
    return {
      sent: false,
      reason: notification.reason,
      severity: null,
      action: 'skipped',
    };
  }

  const repository = resolveRepository(report, env);
  const token = resolveToken(env);

  if (!repository) {
    throw new Error('Cannot send release trigger notification: GITHUB_REPOSITORY is missing.');
  }

  if (!token) {
    throw new Error('Cannot send release trigger notification: GITHUB_TOKEN or GH_TOKEN is missing.');
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

    logger.info(`Release trigger notification added to issue #${existingIssue.number}.`);
    return {
      sent: true,
      reason: notification.reason,
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

  logger.info(`Release trigger notification issue #${issue.number} created.`);
  return {
    sent: true,
    reason: notification.reason,
    severity: notification.severity,
    action: 'created',
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    commentUrl: null,
  };
}
