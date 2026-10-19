import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/finance-forms/**',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI
    ? [
        ['line'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE || 'test-results/results.xml' }],
      ]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
