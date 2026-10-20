import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/finance-forms',
  timeout: 60000,
  outputDir: fileURLToPath(new URL('./finance-form-results/artifacts', import.meta.url)),
  workers: 1,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('./finance-form-results/results.json', import.meta.url)) }]],
  use: { baseURL: 'http://127.0.0.1:5174', timezoneId: 'Europe/Sarajevo', launchOptions: { executablePath: process.env.FORMS_CHROMIUM_PATH, args: ['--no-sandbox'] } },
  webServer: { command: 'npx vite --config vite.finance-forms.config.ts', url: 'http://127.0.0.1:5174/e2e/finance-forms/index.html', reuseExistingServer: !process.env.CI },
});
