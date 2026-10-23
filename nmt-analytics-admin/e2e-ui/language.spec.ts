import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
  test(`shared language switch keyboard and persistence: ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => {
      if (!localStorage.getItem('travline_lang')) localStorage.setItem('travline_lang', 'en');
      document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.toggle('dark', theme === 'dark'));
    }, theme);
    await page.goto('/e2e-ui/fixtures/language.html');
    const switchToBosnian = page.getByRole('button', { name: 'Switch to Bosnian' });
    await expect(switchToBosnian).toHaveAttribute('title', 'Switch to Bosnian');
    await expect(page.getByLabel('Save translation')).toHaveText('Save');
    await page.keyboard.press('Tab'); await expect(switchToBosnian).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Prebaci na engleski' })).toHaveAttribute('title', 'Prebaci na engleski');
    await expect(page.getByLabel('Save translation')).toHaveText('Sačuvaj');
    await expect(page.locator('html')).toHaveAttribute('lang', 'bs');
    await expect(page.getByLabel('Submissions')).toHaveText('0');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'bs');
    const switchToEnglish = page.getByRole('button', { name: 'Prebaci na engleski' });
    await switchToEnglish.focus(); await page.keyboard.press('Space');
    await expect(page.getByLabel('Save translation')).toHaveText('Save');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel('Submissions')).toHaveText('0');
    expect(await page.evaluate(() => localStorage.getItem('travline_lang'))).toBe('en');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
