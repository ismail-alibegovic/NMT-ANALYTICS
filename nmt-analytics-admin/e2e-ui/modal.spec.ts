import { test, expect } from '@playwright/test';
for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
  test(`${theme} ${width}: modal contains keyboard focus and remains reachable`, async ({page}, testInfo) => {
    await page.setViewportSize({width, height: 844});
    await page.addInitScript(({theme}) => {localStorage.setItem('theme', theme); localStorage.setItem('travline_lang', 'en');}, {theme});
    await page.goto('/e2e-ui/fixtures/modal.html');
    await page.getByRole('button', {name: 'Open form', exact:true}).click();
    const dialog = page.getByRole('dialog', {name: 'Audit form', exact:true});
    await expect(dialog).toBeVisible();
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/);
    await testInfo.attach('modal', {body: await page.screenshot({path: testInfo.outputPath('modal.png')}), contentType:'image/png'});
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole('button', {name:'Save',exact:true}).focus();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('button', {name:'Close',exact:true}).focus();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', {name:'Open form',exact:true})).toBeFocused();
    await expect(page.getByLabel('Submissions')).toHaveText('0');
  });
}
test('only the top modal closes; closed siblings do not release the scroll lock', async ({page}) => {
  await page.goto('/e2e-ui/fixtures/modal.html');
  await page.getByRole('button', {name:'Open form',exact:true}).click();
  await page.getByRole('button', {name:'Open nested',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Nested form',exact:true})).toBeHidden();
  await expect(page.getByRole('dialog',{name:'Audit form',exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await expect(page.getByRole('button',{name:'Open nested',exact:true})).toBeFocused();
});
test('close is localized and never submits an enclosing form', async ({page}) => {
  await page.goto('/e2e-ui/fixtures/modal.html');
  await page.getByRole('button',{name:'Language',exact:true}).click();
  await page.getByRole('button',{name:'Open form',exact:true}).click();
  await page.getByRole('button',{name:'Zatvori',exact:true}).click();
  await expect(page.getByLabel('Submissions')).toHaveText('0');
});
