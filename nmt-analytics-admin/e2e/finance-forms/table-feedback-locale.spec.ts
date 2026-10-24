import { test, expect } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';
for (const lang of ['bs', 'en'] as const) for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`table empty/error translation and explicit retry: ${lang} ${theme} ${width}`, async ({ page }) => {
    const copy = (lang === 'bs' ? bs : en).tableFeedback;
    const other = (lang === 'bs' ? en : bs).tableFeedback;
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ lang, theme }) => { localStorage.setItem('travline_lang', lang); document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark')); }, { lang, theme });
    await page.goto('/e2e/finance-forms/table-feedback-locale.html');
    await expect(page.getByRole('heading', { name: copy.emptyTitle, exact: true })).toBeVisible();
    await expect(page.getByText(copy.emptyDescription, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show synthetic row' }).click();
    await expect(page.getByRole('cell', { name: 'Synthetic recovered row', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Break synthetic cell' }).click();
    await expect(page.getByText(copy.error, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: lang === 'bs' ? 'Prebaci na engleski' : 'Switch to Bosnian', exact: true }).click();
    await expect(page.getByText(other.error, { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Synthetic recovered row', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Fix synthetic cell' }).click();
    await expect(page.getByText(other.error, { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Synthetic recovered row', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: other.retry, exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Synthetic recovered row', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
