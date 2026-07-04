import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PUBLIC_ENTRY_SHARE_LINK,
  PUBLIC_ENTRY_SYNTHETIC_TEAM,
  buildSyntheticShareCode,
  buildSyntheticSharePayload,
  buildSyntheticShareUrl,
  classifyHttpFailureCategory,
  normalizePublicEntryBaseUrl,
  resolvePublicEntrySyntheticsCliOptions,
  sanitizeUrlForReport,
} from './public-entry-synthetics.mjs';

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

    expect(sanitizedShareUrl).toBe(
      `https://example.test${PUBLIC_ENTRY_SHARE_LINK.path}?${PUBLIC_ENTRY_SHARE_LINK.redactedQuery}`,
    );
    expect(sanitizedShareUrl).not.toContain(buildSyntheticShareCode());
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
});
