import {test, expect} from '@playwright/test';
for (const theme of ['light','dark']) for (const width of [390,768,1440]) {
 test(`${theme} ${width}: native controls match the theme and remain editable`,async({page},info)=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/e2e-native/fixtures/controls.html');
  if(theme==='dark') await page.getByRole('button',{name:'Theme',exact:true}).click();
  await expect(page.locator('#date')).toHaveCSS('color-scheme',theme);
  await expect(page.locator('#time')).toHaveCSS('color-scheme',theme);
  await expect(page.locator('#date')).toHaveValue('2027-07-15');
  await page.locator('#date').fill('2027-08-20');
  await page.locator('#time').fill('09:45');
  await page.locator('#count').fill('3');
  await page.getByLabel('Transport').selectOption('flight');
  await expect(page.locator('#date')).toHaveValue('2027-08-20');
  await expect(page.locator('#time')).toHaveValue('09:45');
  await expect(page.locator('#count')).toHaveValue('3');
  await expect(page.getByLabel('Transport')).toHaveValue('flight');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('controls.png')});
  await page.getByRole('button',{name:'Reset values'}).click();
  await expect(page.locator('#date')).toHaveValue('2027-07-15');
  await expect(page.getByLabel('Transport')).toHaveValue('bus');
  await page.reload();
  await expect(page.locator('#date')).toHaveCSS('color-scheme',theme);
 });
}
test('native date/time picker indicators are not globally suppressed',async({page})=>{
 await page.goto('/e2e-native/fixtures/controls.html');
 // Inspect the actual loaded CSS: Chromium does not expose a reliable computed
 // display value for the internal calendar-picker-indicator pseudo-element.
 const hidden=await page.evaluate(()=>Array.from(document.styleSheets).flatMap(sheet=>{
  try{return Array.from(sheet.cssRules).map(rule=>rule.cssText);}catch{return [];}
 }).some(rule=>/calendar-picker-indicator/.test(rule)&&/display:\s*none/.test(rule)));
 expect(hidden).toBe(false);
});
