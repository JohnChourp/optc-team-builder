import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PUBLIC_ENTRY_SHARE_LINK,
  PUBLIC_ENTRY_SYNTHETIC_TEAM,
  buildSyntheticShareCode,
  buildSyntheticSharePayload,
  buildSyntheticShareUrl,
  classifyHttpFailureCategory,
  isIgnorableDiagnostic,
  normalizePublicEntryBaseUrl,
  preparePublicEntryArtifactDirs,
  resolvePublicEntrySyntheticsCliOptions,
  sanitizeTextForReport,
  sanitizeUrlForReport,
} from './public-entry-synthetics.mjs';
import { SCRIPT_SUITE_ORDER } from './ci-check-routing.mjs';

describe('public-entry-synthetics', () => {
  it('builds a deterministic share-link payload without user data', () => {
    const payload = buildSyntheticSharePayload();
    const shareCode = buildSyntheticShareCode();
    const shareUrl = buildSyntheticShareUrl('https://example.test/');

    expect(payload).toMatchObject({
      schemaVersion: 1,
      source: 'saved-team-share',
      team: {
        id: PUBLIC_ENTRY_SYNTHETIC_TEAM.id,
        name: PUBLIC_ENTRY_SYNTHETIC_TEAM.name,
      },
    });
    expect(shareCode).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(shareUrl).toContain('/tabs/manual-team-builder?teamShare=');
  });

  it('redacts synthetic share codes and unrelated query strings in reports', () => {
    const shareUrl = buildSyntheticShareUrl('https://example.test/');
    const sanitizedShareUrl = sanitizeUrlForReport(shareUrl);
    const diagnosticText = `page.goto: net::ERR_TIMED_OUT at ${shareUrl}`;

    expect(sanitizedShareUrl).toBe(
      `https://example.test${PUBLIC_ENTRY_SHARE_LINK.path}?${PUBLIC_ENTRY_SHARE_LINK.redactedQuery}`,
    );
    expect(sanitizedShareUrl).not.toContain(buildSyntheticShareCode());
    expect(sanitizeTextForReport(diagnosticText)).not.toContain(buildSyntheticShareCode());
    expect(sanitizeTextForReport(diagnosticText)).toContain(PUBLIC_ENTRY_SHARE_LINK.redactedQuery);
    expect(sanitizeUrlForReport('https://example.test/assets/main.js?v=123')).toBe(
      'https://example.test/assets/main.js?<redacted-query>',
    );
  });

  it('classifies document failures as routing and subresource failures as asset loading', () => {
    expect(classifyHttpFailureCategory({ isNavigationRequest: true })).toBe('routing');
    expect(classifyHttpFailureCategory({ isNavigationRequest: () => true })).toBe('routing');
    expect(classifyHttpFailureCategory({ isNavigationRequest: false })).toBe('asset-loading');
    expect(classifyHttpFailureCategory()).toBe('asset-loading');
  });

  it('resolves CLI defaults and environment overrides', () => {
    expect(normalizePublicEntryBaseUrl('https://example.test///')).toBe('https://example.test');

    const options = resolvePublicEntrySyntheticsCliOptions({
      PUBLIC_ENTRY_BASE_URL: 'https://example.test///',
      PUBLIC_ENTRY_SYNTHETIC_ARTIFACT_DIR: '/tmp/public-entry',
    });

    expect(options.baseUrl).toBe('https://example.test');
    expect(options.artifactDir).toBe(path.resolve('/tmp/public-entry'));
    expect(options.reportPath).toBe(
      path.resolve('/tmp/public-entry/public-entry-synthetics-report.json'),
    );
  });

  it('prepares artifact and custom report directories', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'public-entry-synthetics-'));
    try {
      const artifactDir = path.join(tempRoot, 'artifacts');
      const reportPath = path.join(tempRoot, 'nested', 'reports', 'synthetic-report.json');

      await preparePublicEntryArtifactDirs({ artifactDir, reportPath });

      expect(existsSync(artifactDir)).toBe(true);
      expect(existsSync(path.dirname(reportPath))).toBe(true);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('ignores optional analytics diagnostics without masking first-party assets', () => {
    expect(isIgnorableDiagnostic('https://www.googletagmanager.com/gtag/js?id=G-TEST')).toBe(true);
    expect(isIgnorableDiagnostic('https://www.google-analytics.com/g/collect')).toBe(true);
    expect(isIgnorableDiagnostic('https://example.test/assets/main.js')).toBe(false);
  });

  it('keeps the Test workflow full-plan fallback aligned with script suites', () => {
    const testWorkflow = readFileSync(path.resolve('.github/workflows/test.yml'), 'utf8');
    expect(testWorkflow).toContain(`full_script_suites="${SCRIPT_SUITE_ORDER.join(',')}"`);

    for (const suite of SCRIPT_SUITE_ORDER) {
      expect(testWorkflow).toContain(`"suite":"${suite}"`);
    }
  });
});
