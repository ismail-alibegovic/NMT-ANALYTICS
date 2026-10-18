import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-forms',
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5176',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.UI_CHROMIUM_PATH ? {
      executablePath: process.env.UI_CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {},
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176/e2e-forms/fixtures/form.html',
    reuseExistingServer: !process.env.CI,
  },
});
