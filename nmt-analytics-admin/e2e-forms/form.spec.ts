import {test,expect} from '@playwright/test';
for(const theme of ['light','dark'])for(const width of [390,768,1440]){
 test(`${theme} ${width}: rejected save preserves edits and permits retry`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('travline_lang','en');},theme);
  let attempts=0;
  await page.route('**/synthetic-save',route=>{attempts++;return route.fulfill({status:attempts===1?409:200,contentType:'application/json',body:'{}'});});
  await page.goto('/e2e-forms/fixtures/form.html');
  await page.getByRole('button',{name:'Edit record'}).click();
  await expect(page.getByLabel('Name',{exact:false})).toHaveValue('Original');
  await page.getByLabel('Name',{exact:false}).fill('Updated synthetic name');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Synthetic save rejected',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Name',{exact:false})).toHaveValue('Updated synthetic name');
  await expect(page.getByLabel('Saved')).toHaveText('');
  await page.screenshot({path:info.outputPath('failed-save.png')});
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByLabel('Saved')).toHaveText('Updated synthetic name');
  await expect(page.getByRole('heading',{name:'Edit synthetic record'})).toBeHidden();
  expect(attempts).toBe(2);
 });
}
test('select is associated with its visible label',async({page})=>{
 await page.goto('/e2e-forms/fixtures/form.html');
 await page.getByRole('button',{name:'Edit record'}).click();
 await expect(page.getByLabel('Status',{exact:false})).toHaveValue('active');
 await page.getByLabel('Status',{exact:false}).selectOption('lead');
 await expect(page.getByLabel('Status',{exact:false})).toHaveValue('lead');
});
test('whitespace-only required fields cannot submit',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('travline_lang','en'));
 let attempts=0;await page.route('**/synthetic-save',route=>{attempts++;return route.fulfill({status:200,body:'{}'});});
 await page.goto('/e2e-forms/fixtures/form.html');
 await page.getByRole('button',{name:'Edit record'}).click();
 await page.getByLabel('Name',{exact:false}).fill('   ');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.getByText('Name is required',{exact:true})).toBeVisible();
 expect(attempts).toBe(0);
});
for(const theme of ['light','dark'])test(`${theme}: pending submit rejects duplicates and cancellation; reopen resets draft`,async({page})=>{
 await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('travline_lang','en');},theme);
 let attempts=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/synthetic-save',async route=>{attempts++;await gate;await route.fulfill({status:409,body:'{}'});});
 await page.goto('/e2e-forms/fixtures/form.html');
 await page.getByRole('button',{name:'Edit record'}).click();
 await page.getByLabel('Name',{exact:false}).fill('Pending draft');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 try{
  await expect(page.getByRole('button',{name:'Saving...'})).toBeDisabled();
  await page.locator('form').evaluate(form=>{(form as HTMLFormElement).requestSubmit();(form as HTMLFormElement).requestSubmit();});
  await page.keyboard.press('Escape');
  await page.locator('.modal button').first().click();
  await expect(page.getByRole('heading',{name:'Edit synthetic record'})).toBeVisible();
  expect(attempts).toBe(1);
 }finally{release();}
 await expect(page.getByText('Synthetic save rejected',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Edit record'}).click();
 await expect(page.getByLabel('Name',{exact:false})).toHaveValue('Original');
});
