import { test, expect } from '@playwright/test';

for (const lang of ['bs', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 768, 1440] as const) {
      test(`shared DateRangeFilter and NotFound locale switches cleanly: ${lang} ${theme} ${width}`, async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(({ lang, theme }) => {
          if (!localStorage.getItem('travline_lang')) localStorage.setItem('travline_lang', lang);
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.classList.toggle('dark', theme === 'dark');
          });
        }, { lang, theme });

        await page.goto('/e2e/finance-forms/shared-public-locale.html');

        if (lang === 'bs') {
          await expect(page.getByLabel('Od')).toBeVisible();
          await expect(page.getByLabel('Prikaz po')).toBeVisible();
          await expect(page.getByRole('heading', { name: 'GREŠKA' })).toBeVisible();
          await expect(page.getByRole('link', { name: 'Nazad na početnu stranicu' })).toBeVisible();

          await page.getByRole('button', { name: 'Jezik', exact: true }).click();
          await expect(page.getByLabel('From')).toBeVisible();
          await expect(page.getByLabel('Granularity')).toBeVisible();
          await expect(page.getByRole('heading', { name: 'ERROR' })).toBeVisible();
          await expect(page.getByRole('link', { name: 'Back to Home Page' })).toBeVisible();
        } else {
          await expect(page.getByLabel('From')).toBeVisible();
          await expect(page.getByLabel('Granularity')).toBeVisible();
          await expect(page.getByRole('heading', { name: 'ERROR' })).toBeVisible();
          await expect(page.getByRole('link', { name: 'Back to Home Page' })).toBeVisible();

          await page.getByRole('button', { name: 'Language', exact: true }).click();
          await expect(page.getByLabel('Od')).toBeVisible();
          await expect(page.getByLabel('Prikaz po')).toBeVisible();
          await expect(page.getByRole('heading', { name: 'GREŠKA' })).toBeVisible();
          await expect(page.getByRole('link', { name: 'Nazad na početnu stranicu' })).toBeVisible();
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(pageErrors).toEqual([]);
      });
    }
  }

  test(`ErrorBoundary bootstrap fallback renders outside I18nProvider in ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((l) => {
      localStorage.setItem('travline_lang', l);
    }, lang);

    await page.goto('/e2e/finance-forms/shared-public-locale.html?surface=error-boundary');

    if (lang === 'bs') {
      await expect(page.getByRole('heading', { name: 'Došlo je do greške' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Osvježi stranicu' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh Page' })).toBeVisible();
    }
  });
}
