import { describe, expect, it } from 'vitest';

import {
  BRANCH_CLEANUP_REPORT_SCHEMA_VERSION,
  buildBranchCleanupReport,
  formatBranchCleanupMarkdown,
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
    });

    expect(report.branches[0].status).toBe('manual-delete-candidate');
    expect(JSON.stringify(report)).not.toContain('delete-branch');
    expect(JSON.stringify(report)).not.toContain('git push');
  });
});
