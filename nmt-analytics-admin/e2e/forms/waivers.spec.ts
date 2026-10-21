import { expect, test } from '@playwright/test';

for (const lang of ['en', 'bs']) for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
  test(`populated consent selectors and failed issue preserve selection ${lang} ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(({ lang, theme }) => {
      localStorage.setItem('travline_lang', lang);
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }, { lang, theme });
    await page.route('**/__form-test-api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') return route.fulfill({ status: 503, json: { message: 'Synthetic issue failure' } });
      const data = path.endsWith('/waiver-templates')
        ? [{ id: 'template', title: 'Synthetic terms', body_text: 'Terms', is_active: true }]
        : path.endsWith('/waivers/departures')
          ? [{ id: 'departure', depart_at: '2044-01-01T08:00:00Z', package_name: 'Synthetic trip', passengers: [{ passengerId: 'passenger', fullName: 'Synthetic traveler' }] }]
          : [];
      return route.fulfill({ json: data });
    });
    await page.goto('/e2e/forms/index.html?surface=waivers');
    const departure = page.getByLabel(lang === 'en' ? 'Departure' : 'Polazak', { exact: true });
    const passenger = page.getByLabel(lang === 'en' ? 'Passenger' : 'Putnik', { exact: true });
    await expect(departure).toHaveAccessibleName(lang === 'en' ? 'Departure' : 'Polazak');
    await departure.selectOption('departure');
    await passenger.selectOption('passenger');
    await page.getByRole('button', { name: lang === 'en' ? 'Issue consent link' : 'Izdaj link za pristanak', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(departure).toHaveValue('departure');
    await expect(passenger).toHaveValue('passenger');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
