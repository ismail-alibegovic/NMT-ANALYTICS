import {test,expect} from '@playwright/test';
for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`${theme} ${width}: departure times display locally and preserve their instant`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
 await page.goto('/e2e-dates/fixtures/departure.html');
 await expect(page.locator('html')).toHaveClass(theme==='dark'?/dark/:/^$/);
 const dates=page.locator('input[type="datetime-local"]');
 if(width===390){const first=await dates.nth(0).boundingBox();const second=await dates.nth(1).boundingBox();expect(first!.width).toBeGreaterThanOrEqual(300);expect(second!.y).toBeGreaterThan(first!.y);}
 await expect(dates.nth(0)).toHaveValue('2027-07-15T09:00');await expect(dates.nth(1)).toHaveValue('2027-07-15T22:00');
 await page.getByRole('button',{name:'Sačuvaj',exact:true}).click();await expect(page.getByLabel('Saved departure')).toHaveText('2027-07-15T07:00:00.000Z');
 await dates.nth(0).fill('2027-07-15T10:15');await page.getByRole('button',{name:'Sačuvaj',exact:true}).click();await expect(page.getByLabel('Saved departure')).toHaveText('2027-07-15T08:15:00.000Z');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('departure-time.png')});
});
test('winter offset preserves the same instant',async({page})=>{
 await page.goto('/e2e-dates/fixtures/departure.html?winter=1');
 await expect(page.locator('input[type="datetime-local"]').first()).toHaveValue('2027-01-15T08:00');
 await page.getByRole('button',{name:'Sačuvaj',exact:true}).click();
 await expect(page.getByLabel('Saved departure')).toHaveText('2027-01-15T07:00:00.000Z');
});
