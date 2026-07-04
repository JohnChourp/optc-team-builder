#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const BRANCH_CLEANUP_REPORT_SCHEMA_VERSION = 1;

const DEFAULT_REMOTE = 'origin';
const DEFAULT_PR_LIMIT = 200;
const ROUTINE_BRANCH_PATTERN = /^codex\//u;
const INTENTIONAL_KEEP_BRANCH_PATTERN = /^(?:main|master|develop|release[/-]|hotfix[/-]|dependabot[/-])/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return String(value);
}

function normalizeBranchName(value, remote = DEFAULT_REMOTE) {
  const raw = String(value ?? '').trim();
  const remotePrefix = `${remote}/`;

  if (raw.startsWith(remotePrefix)) {
    return raw.slice(remotePrefix.length);
  }

  return raw.replace(/^refs\/heads\//u, '').replace(/^refs\/remotes\/[^/]+\//u, '');
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function compareIsoStrings(left, right) {
  return String(right ?? '').localeCompare(String(left ?? ''));
}

function latestPullRequestForBranch(pullRequests) {
  const sorted = [...pullRequests].sort((left, right) =>
    compareIsoStrings(left.mergedAt ?? left.updatedAt ?? '', right.mergedAt ?? right.updatedAt ?? ''),
  );
  return sorted[0] ?? null;
}

function indexPullRequestsByHead(pullRequests = []) {
  const result = new Map();

  for (const pr of pullRequests) {
    const branchName = optionalString(pr?.headRefName);
    if (!branchName) {
      continue;
    }

    if (!result.has(branchName)) {
      result.set(branchName, []);
    }
    result.get(branchName).push({
      number: pr.number,
      title: optionalString(pr.title),
      url: optionalString(pr.url),
      headRefName: branchName,
      mergedAt: optionalString(pr.mergedAt),
      updatedAt: optionalString(pr.updatedAt),
      isDraft: Boolean(pr.isDraft),
    });
  }

  return result;
}

function isRoutineFeatureBranch(branchName) {
  return ROUTINE_BRANCH_PATTERN.test(branchName) && !INTENTIONAL_KEEP_BRANCH_PATTERN.test(branchName);
}

function isIntentionalKeepBranch(branchName, defaultBranch) {
  return branchName === defaultBranch || INTENTIONAL_KEEP_BRANCH_PATTERN.test(branchName);
}

function normalizeRule(rule) {
  if (!isObject(rule)) {
    return null;
  }

  return {
    type: optionalString(rule.type),
    parameters: isObject(rule.parameters) ? rule.parameters : null,
  };
}

function normalizeRuleset(ruleset) {
  if (!isObject(ruleset)) {
    return null;
  }

  return {
    id: ruleset.id ?? null,
    name: optionalString(ruleset.name) ?? 'unnamed ruleset',
    target: optionalString(ruleset.target),
    enforcement: optionalString(ruleset.enforcement),
    conditions: isObject(ruleset.conditions) ? ruleset.conditions : null,
    rules: Array.isArray(ruleset.rules) ? ruleset.rules.map(normalizeRule).filter(Boolean) : [],
  };
}

function rulesetHasRule(ruleset, ruleType) {
  return Array.isArray(ruleset.rules) && ruleset.rules.some((rule) => rule.type === ruleType);
}

function listConditionValues(ruleset, field) {
  const values = ruleset.conditions?.ref_name?.[field];
  return Array.isArray(values) ? values.map(String) : [];
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

function globPatternToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];

    if (char === '*' && next === '*' && afterNext === '/') {
      source += '(?:.*/)?';
      index += 2;
    } else if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`, 'u');
}

function rulePatternMatchesBranch(pattern, branchName, defaultBranch) {
  if (pattern === '~ALL') {
    return true;
  }
  if (pattern === '~DEFAULT_BRANCH') {
    return branchName === defaultBranch;
  }
  return [branchName, `refs/heads/${branchName}`].some((candidate) => globPatternToRegExp(pattern).test(candidate));
}

function rulesetAppliesToBranch(ruleset, branchName, defaultBranch) {
  const includes = listConditionValues(ruleset, 'include');
  const excludes = listConditionValues(ruleset, 'exclude');

  if (excludes.some((pattern) => rulePatternMatchesBranch(pattern, branchName, defaultBranch))) {
    return false;
  }
  if (includes.length === 0) {
    return true;
  }

  return includes.some((pattern) => rulePatternMatchesBranch(pattern, branchName, defaultBranch));
}

function getDeletionRulesForBranch({ rulesets = [], branchName, defaultBranch }) {
  return rulesets
    .map(normalizeRuleset)
    .filter(Boolean)
    .filter((ruleset) => ruleset.target === 'branch')
    .filter((ruleset) => ruleset.enforcement === 'active')
    .filter((ruleset) => rulesetHasRule(ruleset, 'deletion'))
    .filter((ruleset) => rulesetAppliesToBranch(ruleset, branchName, defaultBranch))
    .map((ruleset) => ({
      id: ruleset.id,
      name: ruleset.name,
      enforcement: ruleset.enforcement,
      include: listConditionValues(ruleset, 'include'),
      exclude: listConditionValues(ruleset, 'exclude'),
    }));
}

function classifyBranch({
  branch,
  defaultBranch,
  openPullRequests,
  mergedPullRequests,
  deletionRules,
  deletionRulesUnknown,
}) {
  if (branch.name === defaultBranch) {
    return {
      status: 'keep-open',
      reason: 'default branch',
    };
  }

  const openPr = latestPullRequestForBranch(openPullRequests);
  if (openPr) {
    return {
      status: 'keep-open',
      reason: `open PR #${openPr.number}`,
      openPr,
    };
  }

  if (isIntentionalKeepBranch(branch.name, defaultBranch)) {
    return {
      status: 'keep-open',
      reason: 'intentional long-lived branch name',
    };
  }

  const mergedPr = latestPullRequestForBranch(mergedPullRequests);
  const hasMergedEvidence = Boolean(mergedPr || branch.gitMerged);
  const isRoutine = isRoutineFeatureBranch(branch.name);

  if (hasMergedEvidence && isRoutine) {
    if (deletionRules.length > 0) {
      return {
        status: 'blocked',
        reason: `merged routine branch, but ${deletionRules.length} active deletion rule(s) apply`,
        mergedPr,
      };
    }

    if (deletionRulesUnknown) {
      return {
        status: 'investigate',
        reason: 'merged routine branch, but deletion-rule state is unavailable',
        mergedPr,
      };
    }

    return {
      status: 'manual-delete-candidate',
      reason: 'merged routine branch and no active deletion rule applies',
      mergedPr,
    };
  }

  if (hasMergedEvidence) {
    return {
      status: 'investigate',
      reason: 'merged branch is not a routine feature branch',
      mergedPr,
    };
  }

  return {
    status: 'investigate',
    reason: 'no open or merged PR evidence found',
  };
}

export function buildBranchCleanupReport({
  repository,
  generatedAt = new Date().toISOString(),
  repoMetadata = {},
  remoteBranches = [],
  openPullRequests = [],
  mergedPullRequests = [],
  rulesets = null,
  warnings = [],
} = {}) {
  const defaultBranch = optionalString(repoMetadata.default_branch ?? repoMetadata.defaultBranch) ?? 'main';
  const openByHead = indexPullRequestsByHead(openPullRequests);
  const mergedByHead = indexPullRequestsByHead(mergedPullRequests);
  const rulesetsKnown = Array.isArray(rulesets);
  const normalizedRulesets = rulesetsKnown ? rulesets.map(normalizeRuleset).filter(Boolean) : [];

  const branches = remoteBranches
    .map((branch) => ({
      name: normalizeBranchName(branch.name),
      sha: optionalString(branch.sha),
      lastCommitDate: optionalString(branch.lastCommitDate),
      gitMerged: Boolean(branch.gitMerged),
    }))
    .filter((branch) => branch.name && branch.name !== 'HEAD')
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((branch) => {
      const deletionRules = getDeletionRulesForBranch({
        rulesets: normalizedRulesets,
        branchName: branch.name,
        defaultBranch,
      });
      const classification = classifyBranch({
        branch,
        defaultBranch,
        openPullRequests: openByHead.get(branch.name) ?? [],
        mergedPullRequests: mergedByHead.get(branch.name) ?? [],
        deletionRules,
        deletionRulesUnknown: !rulesetsKnown,
      });

      return {
        ...branch,
        status: classification.status,
        reason: classification.reason,
        openPr: classification.openPr ?? null,
        mergedPr: classification.mergedPr ?? null,
        deletionRules,
      };
    });

  const statuses = branches.reduce((summary, branch) => {
    summary[branch.status] = (summary[branch.status] ?? 0) + 1;
    return summary;
  }, {});

  return {
    schemaVersion: BRANCH_CLEANUP_REPORT_SCHEMA_VERSION,
    generatedAt,
    repository: optionalString(repository) ?? optionalString(repoMetadata.full_name) ?? null,
    defaultBranch,
    deleteBranchOnMerge: repoMetadata.delete_branch_on_merge ?? repoMetadata.deleteBranchOnMerge ?? null,
    rules: {
      rulesetsKnown,
      deletionRules: normalizedRulesets
        .filter((ruleset) => ruleset.target === 'branch')
        .filter((ruleset) => ruleset.enforcement === 'active')
        .filter((ruleset) => rulesetHasRule(ruleset, 'deletion'))
        .map((ruleset) => ({
          id: ruleset.id,
          name: ruleset.name,
          include: listConditionValues(ruleset, 'include'),
          exclude: listConditionValues(ruleset, 'exclude'),
        })),
      nonFastForwardRules: normalizedRulesets
        .filter((ruleset) => ruleset.target === 'branch')
        .filter((ruleset) => ruleset.enforcement === 'active')
        .filter((ruleset) => rulesetHasRule(ruleset, 'non_fast_forward'))
        .map((ruleset) => ({
          id: ruleset.id,
          name: ruleset.name,
          include: listConditionValues(ruleset, 'include'),
          exclude: listConditionValues(ruleset, 'exclude'),
        })),
    },
    summary: {
      branchCount: branches.length,
      blocked: statuses.blocked ?? 0,
      manualDeleteCandidates: statuses['manual-delete-candidate'] ?? 0,
      keepOpen: statuses['keep-open'] ?? 0,
      investigate: statuses.investigate ?? 0,
      openPrCount: openPullRequests.length,
      mergedPrCount: mergedPullRequests.length,
    },
    branches,
    warnings,
  };
}

function formatPrLink(pr) {
  if (!pr) {
    return 'none';
  }
  const label = `#${pr.number}`;
  return pr.url ? `[${label}](${pr.url})` : label;
}

function formatRuleNames(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return 'none';
  }
  return rules.map((rule) => rule.name).join(', ');
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\r?\n/gu, ' ')
    .replace(/\\/gu, '\\\\')
    .replace(/\|/gu, '\\|');
}

export function formatBranchCleanupMarkdown(report) {
  const lines = [
    '# Branch Cleanup Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Repository: ${report.repository ?? 'unknown'}`,
    `Default branch: ${report.defaultBranch}`,
    `Delete branch on merge: ${report.deleteBranchOnMerge === null ? 'unknown' : report.deleteBranchOnMerge ? 'yes' : 'no'}`,
    '',
    '## Rule Snapshot',
    '',
    `Active deletion rules: ${formatRuleNames(report.rules.deletionRules)}`,
    `Active non-fast-forward rules: ${formatRuleNames(report.rules.nonFastForwardRules)}`,
    '',
    '## Summary',
    '',
    `- Branches scanned: ${report.summary.branchCount}`,
    `- Blocked by deletion rules: ${report.summary.blocked}`,
    `- Manual delete candidates: ${report.summary.manualDeleteCandidates}`,
    `- Keep open: ${report.summary.keepOpen}`,
    `- Investigate: ${report.summary.investigate}`,
    '',
    '## Branches',
    '',
    '| Branch | Status | Reason | Merged PR | Open PR | Rules |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const branch of report.branches) {
    lines.push(
      `| \`${escapeMarkdown(branch.name)}\` | ${branch.status} | ${escapeMarkdown(branch.reason)} | ${formatPrLink(
        branch.mergedPr,
      )} | ${formatPrLink(branch.openPr)} | ${escapeMarkdown(formatRuleNames(branch.deletionRules))} |`,
    );
  }

  if (report.warnings.length > 0) {
    lines.push('', '## Warnings', '');
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function parseRemoteBranches(output, { remote = DEFAULT_REMOTE, gitMergedBranches = new Set() } = {}) {
  return String(output ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawName, sha, lastCommitDate] = line.split('\t');
      const name = normalizeBranchName(rawName, remote);
      return {
        name,
        sha,
        lastCommitDate,
        gitMerged: gitMergedBranches.has(name),
      };
    })
    .filter((branch) => branch.name && branch.name !== 'HEAD');
}

export function parseMergedBranches(output, { remote = DEFAULT_REMOTE } = {}) {
  return new Set(
    String(output ?? '')
      .split(/\r?\n/u)
      .map((line) => normalizeBranchName(line.trim(), remote))
      .filter((branch) => branch && branch !== 'HEAD'),
  );
}

async function run(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

async function tryJson(command, args, warnings, label) {
  try {
    const stdout = await run(command, args);
    return JSON.parse(stdout || 'null');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`${label} unavailable: ${message}`);
    return null;
  }
}

async function loadRepoMetadata(repo, warnings) {
  const metadata = await tryJson('gh', ['api', `repos/${repo}`], warnings, 'repository metadata');
  return isObject(metadata) ? metadata : {};
}

async function loadRulesets(repo, warnings) {
  const rulesets = await tryJson('gh', ['api', `repos/${repo}/rulesets`], warnings, 'repository rulesets');
  if (!Array.isArray(rulesets)) {
    return null;
  }

  const detailedRulesets = [];
  for (const ruleset of rulesets) {
    if (!ruleset?.id) {
      detailedRulesets.push(ruleset);
      continue;
    }

    const details = await tryJson(
      'gh',
      ['api', `repos/${repo}/rulesets/${ruleset.id}`],
      warnings,
      `repository ruleset ${ruleset.id}`,
    );
    if (!isObject(details)) {
      return null;
    }
    detailedRulesets.push(details);
  }

  return detailedRulesets;
}

async function loadPullRequests(repo, state, limit, warnings) {
  const prs = await tryJson(
    'gh',
    ['pr', 'list', '--repo', repo, '--state', state, '--limit', String(limit), '--json', 'number,headRefName,title,url,mergedAt,updatedAt,isDraft'],
    warnings,
    `${state} pull requests`,
  );
  return Array.isArray(prs) ? prs : [];
}

async function inferRepoFromRemote(remote, warnings) {
  try {
    const remoteUrl = (await run('git', ['remote', 'get-url', remote])).trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/u);
    if (match) {
      return match[1];
    }
    warnings.push(`Unable to infer GitHub repo from remote URL: ${remoteUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Unable to read git remote ${remote}: ${message}`);
  }
  return null;
}

async function loadRemoteBranches({ remote, defaultBranch, warnings }) {
  let gitMergedBranches = new Set();
  try {
    const mergedOutput = await run('git', ['branch', '-r', '--merged', `${remote}/${defaultBranch}`, '--format=%(refname:short)']);
    gitMergedBranches = parseMergedBranches(mergedOutput, { remote });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Unable to read git-merged remote branches: ${message}`);
  }

  const output = await run('git', [
    'for-each-ref',
    `refs/remotes/${remote}`,
    '--format=%(refname:short)\t%(objectname)\t%(committerdate:iso8601)',
  ]);
  return parseRemoteBranches(output, { remote, gitMergedBranches });
}

function parseArgs(argv) {
  const options = {
    repo: null,
    remote: DEFAULT_REMOTE,
    format: 'markdown',
    output: null,
    limit: DEFAULT_PR_LIMIT,
    generatedAt: new Date().toISOString(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--repo') {
      options.repo = next;
      index += 1;
    } else if (arg === '--remote') {
      options.remote = next;
      index += 1;
    } else if (arg === '--format') {
      options.format = next;
      index += 1;
    } else if (arg === '--output') {
      options.output = next;
      index += 1;
    } else if (arg === '--limit') {
      options.limit = Number(next);
      index += 1;
    } else if (arg === '--generated-at') {
      options.generatedAt = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['json', 'markdown'].includes(options.format)) {
    throw new Error('--format must be json or markdown');
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error('--limit must be a positive integer');
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/branch-cleanup-report.mjs [--repo owner/name] [--format markdown|json] [--output path]',
    '',
    'This command is report-only. It never deletes branches and never changes GitHub rulesets.',
  ].join('\n');
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(usage());
    return;
  }

  const warnings = [];
  const repo = options.repo ?? (await inferRepoFromRemote(options.remote, warnings));
  if (!repo) {
    throw new Error('Unable to resolve repository. Pass --repo owner/name.');
  }

  const repoMetadata = await loadRepoMetadata(repo, warnings);
  const defaultBranch = optionalString(repoMetadata.default_branch) ?? 'main';
  const [rulesets, openPullRequests, mergedPullRequests, remoteBranches] = await Promise.all([
    loadRulesets(repo, warnings),
    loadPullRequests(repo, 'open', options.limit, warnings),
    loadPullRequests(repo, 'merged', options.limit, warnings),
    loadRemoteBranches({ remote: options.remote, defaultBranch, warnings }),
  ]);

  const report = buildBranchCleanupReport({
    repository: repo,
    generatedAt: options.generatedAt,
    repoMetadata,
    remoteBranches,
    openPullRequests,
    mergedPullRequests,
    rulesets,
    warnings,
  });
  const output =
    options.format === 'json'
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatBranchCleanupMarkdown(report);

  if (options.output) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
    await writeFile(options.output, output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}

export function isCliEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url } = {}) {
  if (!argv1) {
    return false;
  }
  return pathToFileURL(path.resolve(argv1)).href === moduleUrl;
}

if (isCliEntrypoint()) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
