import { describe, expect, it } from 'vitest';

import {
  BRANCH_CLEANUP_REPORT_SCHEMA_VERSION,
  buildBranchCleanupReport,
  flattenPaginatedJsonArray,
  formatBranchCleanupMarkdown,
  isCliEntrypoint,
  parseMergedBranches,
  parseRemoteBranches,
} from './branch-cleanup-report.mjs';

function fixtureRulesets() {
  return [
    {
      id: 13901725,
      name: 'Project Base Branch',
      target: 'branch',
      enforcement: 'active',
      conditions: {
        ref_name: {
          include: ['~DEFAULT_BRANCH', '~ALL'],
          exclude: [],
        },
      },
      rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
    },
  ];
}

describe('branch cleanup report', () => {
  it('classifies merged routine branches as blocked when deletion rules apply', () => {
    const report = buildBranchCleanupReport({
      repository: 'JohnChourp/optc-team-builder',
      generatedAt: '2026-07-04T00:00:00.000Z',
      repoMetadata: {
        default_branch: 'main',
        delete_branch_on_merge: false,
      },
      rulesets: fixtureRulesets(),
      remoteBranches: [
        { name: 'main', sha: '1111111' },
        { name: 'codex/issue-11-guided-auto-team-builder', sha: '2222222' },
      ],
      mergedPullRequests: [
        {
          number: 70,
          headRefName: 'codex/issue-11-guided-auto-team-builder',
          title: '[codex] Add guided auto team builder mode',
          url: 'https://github.com/JohnChourp/optc-team-builder/pull/70',
          mergedAt: '2026-06-24T11:44:20Z',
        },
      ],
    });

    expect(report.schemaVersion).toBe(BRANCH_CLEANUP_REPORT_SCHEMA_VERSION);
    expect(report.deleteBranchOnMerge).toBe(false);
    expect(report.summary).toMatchObject({
      branchCount: 2,
      blocked: 1,
      manualDeleteCandidates: 0,
      keepOpen: 1,
      investigate: 0,
    });
    expect(report.branches.find((branch) => branch.name === 'codex/issue-11-guided-auto-team-builder')).toMatchObject({
      status: 'blocked',
      reason: 'merged routine branch, but 1 active deletion rule(s) apply',
      mergedPr: { number: 70 },
      deletionRules: [{ name: 'Project Base Branch' }],
    });
  });

  it('classifies merged routine branches as manual candidates when no deletion rule applies', () => {
    const report = buildBranchCleanupReport({
      repoMetadata: {
        default_branch: 'main',
        delete_branch_on_merge: true,
      },
      remoteBranches: [{ name: 'codex/merged-feature', sha: '2222222', gitMerged: true }],
      mergedPullRequests: [{ number: 12, headRefName: 'codex/merged-feature', mergedAt: '2026-07-01T00:00:00Z' }],
      rulesets: [],
    });

    expect(report.branches[0]).toMatchObject({
      name: 'codex/merged-feature',
      status: 'manual-delete-candidate',
      reason: 'merged routine branch and no active deletion rule applies',
    });
  });

  it('treats unavailable rulesets as unsafe for merged routine branches', () => {
    const report = buildBranchCleanupReport({
      repoMetadata: {
        default_branch: 'main',
        delete_branch_on_merge: true,
      },
      remoteBranches: [{ name: 'codex/merged-feature', sha: '2222222', gitMerged: true }],
      mergedPullRequests: [{ number: 12, headRefName: 'codex/merged-feature', mergedAt: '2026-07-01T00:00:00Z' }],
      rulesets: null,
    });

    expect(report.rules.rulesetsKnown).toBe(false);
    expect(report.branches[0]).toMatchObject({
      name: 'codex/merged-feature',
      status: 'investigate',
      reason: 'merged routine branch, but deletion-rule state is unavailable',
    });
    expect(report.summary.manualDeleteCandidates).toBe(0);
  });

  it('matches branch ruleset glob patterns before classifying deletion candidates', () => {
    const report = buildBranchCleanupReport({
      repoMetadata: { default_branch: 'main' },
      remoteBranches: [
        { name: 'codex/report-cleanup', sha: '1111111', gitMerged: true },
        { name: 'codex/nested/report', sha: '2222222', gitMerged: true },
      ],
      mergedPullRequests: [
        { number: 12, headRefName: 'codex/report-cleanup', mergedAt: '2026-07-01T00:00:00Z' },
        { number: 13, headRefName: 'codex/nested/report', mergedAt: '2026-07-02T00:00:00Z' },
      ],
      rulesets: [
        {
          id: 1,
          name: 'Cleanup suffix branches',
          target: 'branch',
          enforcement: 'active',
          conditions: { ref_name: { include: ['refs/heads/codex/*-cleanup'], exclude: [] } },
          rules: [{ type: 'deletion' }],
        },
        {
          id: 2,
          name: 'Nested codex branches',
          target: 'branch',
          enforcement: 'active',
          conditions: { ref_name: { include: ['codex/**/*'], exclude: [] } },
          rules: [{ type: 'deletion' }],
        },
      ],
    });

    const cleanupBranch = report.branches.find((branch) => branch.name === 'codex/report-cleanup');
    expect(cleanupBranch).toMatchObject({ status: 'blocked' });
    expect(cleanupBranch?.deletionRules).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Cleanup suffix branches' })]),
    );
    const nestedBranch = report.branches.find((branch) => branch.name === 'codex/nested/report');
    expect(nestedBranch).toMatchObject({
      status: 'blocked',
    });
    expect(nestedBranch?.deletionRules).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Nested codex branches' })]),
    );
  });

  it('ignores fork PR heads when matching repository branches', () => {
    const report = buildBranchCleanupReport({
      repository: 'JohnChourp/optc-team-builder',
      repoMetadata: { default_branch: 'main' },
      remoteBranches: [{ name: 'codex/current-work', sha: '1111111' }],
      openPullRequests: [
        {
          number: 77,
          headRefName: 'codex/current-work',
          headRepositoryOwner: { login: 'external-contributor' },
          isCrossRepository: true,
          updatedAt: '2026-07-04T00:00:00Z',
        },
      ],
      rulesets: [],
    });

    expect(report.branches[0]).toMatchObject({
      status: 'investigate',
      openPr: null,
      reason: 'no open or merged PR evidence found',
    });
  });

  it('investigates stale merged PR evidence when the branch SHA changed', () => {
    const report = buildBranchCleanupReport({
      repository: 'JohnChourp/optc-team-builder',
      repoMetadata: { default_branch: 'main' },
      remoteBranches: [{ name: 'codex/reused-branch', sha: 'new-sha' }],
      mergedPullRequests: [
        {
          number: 78,
          headRefName: 'codex/reused-branch',
          headRefOid: 'old-sha',
          headRepositoryOwner: { login: 'JohnChourp' },
          isCrossRepository: false,
          mergedAt: '2026-07-01T00:00:00Z',
        },
      ],
      rulesets: [],
    });

    expect(report.branches[0]).toMatchObject({
      status: 'investigate',
      reason: 'merged PR head SHA no longer matches remote branch',
      mergedPr: { number: 78, headRefOid: 'old-sha' },
    });
    expect(report.summary.manualDeleteCandidates).toBe(0);
  });

  it('keeps open PR branches and long-lived branch names out of deletion candidates', () => {
    const report = buildBranchCleanupReport({
      repoMetadata: { default_branch: 'main' },
      remoteBranches: [
        { name: 'release/2026-07', sha: '3333333' },
        { name: 'codex/current-work', sha: '4444444' },
      ],
      openPullRequests: [{ number: 50, headRefName: 'codex/current-work', updatedAt: '2026-07-04T00:00:00Z' }],
      rulesets: fixtureRulesets(),
    });

    expect(report.branches.find((branch) => branch.name === 'release/2026-07')).toMatchObject({
      status: 'keep-open',
      reason: 'intentional long-lived branch name',
    });
    expect(report.branches.find((branch) => branch.name === 'codex/current-work')).toMatchObject({
      status: 'keep-open',
      reason: 'open PR #50',
    });
  });

  it('marks branches without open or merged evidence for investigation', () => {
    const report = buildBranchCleanupReport({
      repoMetadata: { default_branch: 'main' },
      remoteBranches: [{ name: 'codex/unknown-branch', sha: '5555555' }],
    });

    expect(report.branches[0]).toMatchObject({
      status: 'investigate',
      reason: 'no open or merged PR evidence found',
    });
  });

  it('parses remote branch and git-merged output', () => {
    const gitMerged = parseMergedBranches(['origin/main', 'origin/codex/merged-feature', 'origin/HEAD -> origin/main'].join('\n'));
    const branches = parseRemoteBranches(
      ['origin/main\t1111111\t2026-07-01 00:00:00 +0000', 'origin/codex/merged-feature\t2222222\t2026-07-02 00:00:00 +0000'].join('\n'),
      { gitMergedBranches: gitMerged },
    );

    expect(branches).toEqual([
      { name: 'main', sha: '1111111', lastCommitDate: '2026-07-01 00:00:00 +0000', gitMerged: true },
      {
        name: 'codex/merged-feature',
        sha: '2222222',
        lastCommitDate: '2026-07-02 00:00:00 +0000',
        gitMerged: true,
      },
    ]);
  });

  it('formats a scan-friendly Markdown report', () => {
    const report = buildBranchCleanupReport({
      repository: 'JohnChourp/optc-team-builder',
      generatedAt: '2026-07-04T00:00:00.000Z',
      repoMetadata: { default_branch: 'main', delete_branch_on_merge: false },
      remoteBranches: [{ name: 'codex/unknown\\with|pipe', sha: '5555555' }],
      warnings: ['rulesets unavailable'],
    });
    const markdown = formatBranchCleanupMarkdown(report);

    expect(markdown).toContain('# Branch Cleanup Report');
    expect(markdown).toContain('Delete branch on merge: no');
    expect(markdown).toContain(
      '| `codex/unknown\\\\with\\|pipe` | investigate | no open or merged PR evidence found | none | none | none |',
    );
    expect(markdown).toContain('- rulesets unavailable');
  });

  it('keeps report generation independent from destructive branch actions', () => {
    const report = buildBranchCleanupReport({
      repoMetadata: { default_branch: 'main', delete_branch_on_merge: false },
      remoteBranches: [{ name: 'codex/merged-feature', sha: '2222222' }],
      mergedPullRequests: [{ number: 12, headRefName: 'codex/merged-feature', mergedAt: '2026-07-01T00:00:00Z' }],
      rulesets: [],
    });

    expect(report.branches[0].status).toBe('manual-delete-candidate');
    expect(JSON.stringify(report)).not.toContain('delete-branch');
    expect(JSON.stringify(report)).not.toContain('git push');
  });

  it('flattens paginated ruleset API responses before trusting rule state', () => {
    expect(flattenPaginatedJsonArray([[{ id: 1 }], [{ id: 2 }]])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(flattenPaginatedJsonArray([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(flattenPaginatedJsonArray(null)).toBeNull();
  });

  it('only runs the CLI for the actual entrypoint', () => {
    const moduleUrl = 'file:///tmp/branch-cleanup-report.mjs';

    expect(isCliEntrypoint({ argv1: '/tmp/branch-cleanup-report.mjs', moduleUrl })).toBe(true);
    expect(isCliEntrypoint({ argv1: '/tmp/vitest.mjs', moduleUrl })).toBe(false);
    expect(isCliEntrypoint({ argv1: null, moduleUrl })).toBe(false);
  });
});
