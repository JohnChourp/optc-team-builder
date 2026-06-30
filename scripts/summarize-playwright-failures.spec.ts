import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { normalizeErrorSignature, renderFailureSummaryMarkdown, summarizePlaywrightFailures } from './summarize-playwright-failures.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('summarize Playwright failures', () => {
  it('groups failures by browser, file, title, retry count, and signature', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'optc-playwright-summary-'));
    tempDirs.push(tempDir);
    await mkdir(path.join(tempDir, 'test-results'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'test-results', 'results.json'),
      JSON.stringify({
        suites: [
          {
            title: 'high-value regression flows',
            specs: [
              {
                title: 'guided auto build locks only the next empty slot @guided-auto-build',
                file: 'e2e/regression-flows.spec.ts',
                tests: [
                  {
                    projectName: 'chromium',
                    expectedStatus: 'passed',
                    results: [
                      {
                        status: 'failed',
                        retry: 0,
                        error: { message: 'Error: expect(received).toBe(expected)\nExpected: true' },
                      },
                      {
                        status: 'failed',
                        retry: 1,
                        error: { message: 'Error: expect(received).toBe(expected)\nExpected: true' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const previousCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const summary = await summarizePlaywrightFailures({ inputs: [path.join(tempDir, 'test-results')] });
      expect(summary.groupCount).toBe(1);
      expect(summary.failureCount).toBe(2);
      expect(summary.failures[0]).toMatchObject({
        browser: 'chromium',
        file: 'e2e/regression-flows.spec.ts',
        retryCount: 1,
        occurrences: 2,
      });
      expect(renderFailureSummaryMarkdown(summary)).toContain('guided auto build');
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('normalizes noisy paths and large numbers in error signatures', () => {
    expect(normalizeErrorSignature('Error at /home/runner/work/optc-team-builder/file.ts:188 timed out 90000ms')).toBe(
      'Error at <path> timed out <n>ms',
    );
  });
});
