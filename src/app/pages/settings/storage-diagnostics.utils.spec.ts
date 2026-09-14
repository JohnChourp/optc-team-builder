import { describe, expect, it, vi } from 'vitest';

import {
  buildStorageDiagnosticsFilename,
  buildStorageDiagnosticsPayload,
  formatStorageBytes,
  readStorageQuotaEstimate,
} from './storage-diagnostics.utils';

const counts = {
  characterBoxesCount: 2,
  characterOverridesCount: 1,
  crewForgeProfilesCount: 1,
  savedRumbleOpponentsCount: 3,
  favoriteCharacterCount: 40,
  favoriteShipCount: 4,
  savedEnemiesCount: 5,
  savedRumbleTeamsCount: 6,
  savedTeamsCount: 7,
};

describe('storage quota estimate', () => {
  it('reports real numbers when the browser gives them', async () => {
    const estimate = await readStorageQuotaEstimate({
      estimate: vi.fn().mockResolvedValue({ usage: 2_500_000, quota: 10_000_000 }),
    } as unknown as StorageManager);

    expect(estimate.state).toBe('measured');
    expect(estimate.usageBytes).toBe(2_500_000);
    expect(estimate.usedPercent).toBe(25);
  });

  /*
   * 869f12x49. The three ways this fails are reported as themselves, never as a
   * zero. A "0%" a reader cannot tell apart from "we do not know" is worse than
   * no number at all, because it invites them to keep saving into a full store.
   */
  it('says unsupported when there is no Storage Manager', async () => {
    const estimate = await readStorageQuotaEstimate(undefined);

    expect(estimate.state).toBe('unsupported');
    expect(estimate.usedPercent).toBeNull();
    expect(estimate.usageBytes).toBeNull();
  });

  it('says unavailable when the estimate rejects', async () => {
    const estimate = await readStorageQuotaEstimate({
      estimate: vi.fn().mockRejectedValue(new Error('denied')),
    } as unknown as StorageManager);

    expect(estimate.state).toBe('unavailable');
    expect(estimate.usedPercent).toBeNull();
  });

  it('says unavailable when the browser answers with half an estimate', async () => {
    const estimate = await readStorageQuotaEstimate({
      estimate: vi.fn().mockResolvedValue({ usage: 1_000 }),
    } as unknown as StorageManager);

    expect(estimate.state).toBe('unavailable');
    expect(estimate.usageBytes).toBe(1_000);
    expect(estimate.quotaBytes).toBeNull();
    expect(estimate.usedPercent, 'a percentage needs both halves').toBeNull();
  });

  it('never divides by a zero quota', async () => {
    const estimate = await readStorageQuotaEstimate({
      estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 0 }),
    } as unknown as StorageManager);

    expect(estimate.state).toBe('unavailable');
    expect(estimate.usedPercent).toBeNull();
  });
});

describe('storage byte formatting', () => {
  it('reads the way a person would say it', () => {
    expect(formatStorageBytes(512)).toBe('512 B');
    expect(formatStorageBytes(2048)).toBe('2 KB');
    expect(formatStorageBytes(2_500_000)).toBe('2.4 MB');
    expect(formatStorageBytes(50_000_000)).toBe('48 MB');
  });

  it('says nothing rather than something wrong', () => {
    expect(formatStorageBytes(null)).toBe('');
    expect(formatStorageBytes(-1)).toBe('');
    expect(formatStorageBytes(Number.NaN)).toBe('');
  });
});

describe('diagnostics payload', () => {
  it('carries counts and nothing that identifies anybody', () => {
    const payload = buildStorageDiagnosticsPayload({
      appVersion: '0.4.27',
      dataset: { sourceVersion: '42', generatedOn: '2026-09-14', characterCount: 4618 },
      counts,
      storage: { state: 'measured', usageBytes: 1, quotaBytes: 2, usedPercent: 50 },
      generatedAt: '2026-09-14T12:00:00.000Z',
    });
    const serialized = JSON.stringify(payload);

    expect(payload.counts.savedTeamsCount).toBe(7);
    expect(payload.appVersion).toBe('0.4.27');

    /*
     * The promise this payload makes is that it is safe to paste into an issue,
     * and the way that gets broken is somebody later adding "just the names".
     * Asserting on the serialised shape is what would catch that.
     */
    for (const forbidden of ['name', 'characterIds', 'teams', 'email', 'profile', 'token']) {
      expect(serialized, `diagnostics must not carry ${forbidden}`).not.toContain(`"${forbidden}"`);
    }
  });

  it('keeps an unknown dataset unknown', () => {
    const payload = buildStorageDiagnosticsPayload({
      appVersion: '0.4.27',
      dataset: null,
      counts,
      storage: { state: 'unsupported', usageBytes: null, quotaBytes: null, usedPercent: null },
    });

    expect(payload.dataset).toBeNull();
    expect(payload.storage.state).toBe('unsupported');
  });

  it('copies its inputs, so a later edit cannot reach the payload', () => {
    const mutableCounts = { ...counts };
    const payload = buildStorageDiagnosticsPayload({
      appVersion: '0.4.27',
      dataset: null,
      counts: mutableCounts,
      storage: { state: 'unsupported', usageBytes: null, quotaBytes: null, usedPercent: null },
    });

    mutableCounts.savedTeamsCount = 999;

    expect(payload.counts.savedTeamsCount).toBe(7);
  });

  it('names the file by when it was taken', () => {
    expect(buildStorageDiagnosticsFilename('2026-09-14T12:34:56.000Z')).toBe(
      'optc-diagnostics-20260914-123456.json',
    );
    expect(buildStorageDiagnosticsFilename('not a date')).toBe('optc-diagnostics.json');
  });
});
