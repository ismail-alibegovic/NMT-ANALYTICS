import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-dates',
  fullyParallel: false,
  use: {
    timezoneId: 'Europe/Sarajevo',
    baseURL: 'http://127.0.0.1:5177',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.UI_CHROMIUM_PATH ? {
      executablePath: process.env.UI_CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {},
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5177 --strictPort',
    url: 'http://127.0.0.1:5177/e2e-dates/fixtures/departure.html',
    reuseExistingServer: !process.env.CI,
  },
});
