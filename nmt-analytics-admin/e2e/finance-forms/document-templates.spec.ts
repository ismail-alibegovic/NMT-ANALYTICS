import { expect, test } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';
for(const lang of ['bs','en'] as const)for(const theme of ['light','dark'])for(const width of [390,768,1440]){
 test(`document draft read and save recovery ${lang} ${theme} ${width}`,async({page},info)=>{
  const t=lang==='bs'?bs:en;let readFails=true,saveFails=true,saves=0;let stored:any={};
  await page.setViewportSize({width,height:900});
  await page.addInitScript(({lang,theme})=>{localStorage.setItem('travline_lang',lang);localStorage.setItem('theme',theme);},{lang,theme});
  await page.route('**/__form-test-api/**',async route=>{
   if(route.request().method()==='GET')return route.fulfill({status:readFails?503:200,json:readFails?{error:'Private read detail'}:{pdf_template_config:stored}});
   if(route.request().method()==='PUT'){
    saves++;await new Promise(resolve=>setTimeout(resolve,200));
    if(saveFails)return route.fulfill({status:503,json:{error:'Private save detail'}});
    stored=route.request().postDataJSON().pdf_template_config;
    return route.fulfill({json:{pdf_template_config:stored,saved:true}});
   }
   return route.fulfill({status:403,json:{error:'Unexpected action'}});
  });
  await page.goto('/e2e/finance-forms/document-templates.html');
  await expect(page.getByRole('alert')).toHaveText(t.settings.templateLoadError);
  await expect(page.getByRole('button',{name:t.settings.saveTemplate,exact:true})).toHaveCount(0);
  expect(saves).toBe(0);readFails=false;
  await page.getByRole('button',{name:t.settings.templateLoadRetry}).click();
  const draft=page.locator('textarea').first();await expect(draft).toBeVisible();await draft.fill('Synthetic document terms');
  await page.getByRole('button',{name:t.settings.saveTemplate,exact:true}).dblclick();
  await expect(page.getByText(t.settings.templateError,{exact:true})).toBeVisible();expect(saves).toBe(1);
  await expect(draft).toHaveValue('Synthetic document terms');await expect(page.getByText('Private save detail')).toHaveCount(0);
  saveFails=false;await page.getByRole('button',{name:t.settings.saveTemplate,exact:true}).click();
  await draft.fill('Newer unsaved document terms');
  await expect(page.getByText(t.settings.templateSaved,{exact:true})).toBeVisible();expect(saves).toBe(2);
  await expect(draft).toHaveValue('Newer unsaved document terms');
  await expect(page.getByText(t.settings.unsavedChanges,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:t.settings.saveTemplate,exact:true}).click();
  await expect(page.getByText(t.settings.unsavedChanges,{exact:true})).toHaveCount(0);expect(saves).toBe(3);
  await page.reload();await expect(page.locator('textarea').first()).toHaveValue('Newer unsaved document terms');
  if(theme==='dark')await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await page.screenshot({path:info.outputPath('document-draft-reloaded.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 });
}
