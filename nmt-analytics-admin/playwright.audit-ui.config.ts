import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['e2e-ui/**/*.spec.ts', 'e2e-native/**/*.spec.ts', 'e2e-forms/**/*.spec.ts', 'e2e-dates/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'audit-ui-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5178',
    timezoneId: 'Europe/Sarajevo',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort',
    url: 'http://127.0.0.1:5178/e2e-ui/fixtures/modal.html',
    reuseExistingServer: !process.env.CI,
  },
});
