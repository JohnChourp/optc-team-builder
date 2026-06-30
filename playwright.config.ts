import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 4200);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;
const htmlReportFolder = process.env.PLAYWRIGHT_HTML_REPORT ?? 'playwright-report';
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results';
const jsonOutputName = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
const reporters: NonNullable<Parameters<typeof defineConfig>[0]['reporter']> = isCI
  ? [['list'], ['html', { open: 'never', outputFolder: htmlReportFolder }]]
  : [['list']];

if (jsonOutputName) {
  reporters.push(['json', { outputFile: path.join(outputDir, jsonOutputName) }]);
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: reporters,
  outputDir,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: isCI ? 1 : undefined,

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm start',
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
