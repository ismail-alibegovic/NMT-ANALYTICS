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

for(const mode of ['precise','fold'])test(`unchanged ${mode} departure preserves seconds and its original instant`,async({page})=>{
 await page.goto('/e2e-dates/fixtures/departure.html?'+mode+'=1');
 await expect(page.locator('input[type="datetime-local"]').first()).toHaveValue(mode==='fold'?'2027-10-31T02:30':'2027-07-15T09:00');
 await page.getByRole('button',{name:'Sačuvaj',exact:true}).click();
 await expect(page.getByLabel('Saved departure')).toHaveText(mode==='fold'?'2027-10-31T01:30:37.123Z':'2027-07-15T07:00:37.123Z');
 await expect(page.getByLabel('Saved return')).toHaveText(mode==='fold'?'2027-10-31T20:00:42.456Z':'2027-07-15T20:00:42.456Z');
});
for(const lang of ['en','bs'])test(`departure pending save blocks duplicate submit and Escape, preserves failed draft and retries ${lang}`,async({page})=>{
 await page.addInitScript(lang=>localStorage.setItem('travline_lang',lang),lang);
 let requests=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/synthetic-departure-save',async route=>{
  requests++;if(requests===1){await gate;return route.fulfill({status:503,contentType:'application/json',body:'{}'});}
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await page.goto('/e2e-dates/fixtures/departure.html?transport=1');
 const dialog=page.getByRole('dialog',{name:'Edit synthetic departure',exact:true});
 await dialog.getByLabel('Polazak',{exact:false}).fill('2027-07-15T10:15');
 await dialog.locator('form').evaluate(form=>{
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 });
 try{
  await expect.poll(()=>requests).toBe(1);
  await expect(dialog.getByRole('button',{name:'Sačuvaj',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button',{name:lang==='bs'?'Zatvori':'Close',exact:true}).click();
  await expect(page.getByLabel('Close requests')).toHaveText('0');
 }finally{release();}
 await expect(dialog.getByRole('alert')).toBeVisible();
 await expect(dialog.getByLabel('Polazak',{exact:false})).toHaveValue('2027-07-15T10:15');
 await expect(page.getByLabel('Saved departure')).toHaveText('');
 await dialog.getByRole('button',{name:'Sačuvaj',exact:true}).click();
 await expect(page.getByLabel('Saved departure')).toHaveText('2027-07-15T08:15:00.000Z');
 expect(requests).toBe(2);
});
test('departure required fields have accessible labels and reject invalid values before HTTP',async({page})=>{
 let requests=0;await page.route('**/synthetic-departure-save',route=>{requests++;return route.fulfill({status:200,body:'{}'});});
 await page.goto('/e2e-dates/fixtures/departure.html?transport=1');
 const capacity=page.getByLabel('Kapacitet',{exact:false});
 await expect(capacity).toHaveAttribute('required','');
 await capacity.fill('');
 await page.getByRole('button',{name:'Sačuvaj',exact:true}).click();
 expect(await capacity.evaluate(input=>(input as HTMLInputElement).checkValidity())).toBe(false);
 expect(requests).toBe(0);
 await capacity.fill('8');
 const departure=page.getByLabel('Polazak',{exact:false});await departure.fill('');
 await page.getByRole('button',{name:'Sačuvaj',exact:true}).click();
 expect(await departure.evaluate(input=>(input as HTMLInputElement).checkValidity())).toBe(false);
 expect(requests).toBe(0);
});
