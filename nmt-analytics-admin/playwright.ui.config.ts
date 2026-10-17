import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-ui',
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.UI_CHROMIUM_PATH ? {
      executablePath: process.env.UI_CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {},
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174/e2e-ui/fixtures/modal.html',
    reuseExistingServer: !process.env.CI,
  },
});
