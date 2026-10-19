import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/forms',
  timeout: 60000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/forms-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5174', timezoneId: 'Europe/Sarajevo', launchOptions: { executablePath: process.env.FORMS_CHROMIUM_PATH, args: ['--no-sandbox'] } },
  webServer: { command: 'npx vite --config vite.forms.config.ts', url: 'http://127.0.0.1:5174/e2e/forms/index.html', reuseExistingServer: !process.env.CI },
});
