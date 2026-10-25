import { expect, test } from '@playwright/test';
import { en } from '../../src/lib/i18n/en';
import { bs } from '../../src/lib/i18n/bs';
const org={name:'Synthetic Agency',slug:'synthetic-agency',currency:'BAM',timezone:'Europe/Sarajevo',email:'',phone:'',address:'',tax_id:'',bank_account:'',invoice_footer:'',email_sender_name:'',email_sender_address:'',sms_sender_name:'',sms_sender_number:''};
const plan={plan:'trial',planLabel:'Trial',entitledModules:['dashboard'],tiers:[{key:'trial',label:'Trial',modules:['dashboard']},{key:'enterprise',label:'Enterprise',modules:['dashboard','documents']}]};
for(const lang of ['bs','en'] as const) for(const theme of ['light','dark']) for(const width of [390,768,1440]) {
 test(`organization configuration recovery and agency plan safety ${lang} ${theme} ${width}`,async({page},info)=>{
  const t=lang==='bs'?bs:en;let readFails=true;let saveFails=true;let saves=0;let externalActions=0;
  await page.setViewportSize({width,height:900});
  await page.addInitScript(({lang,theme})=>{localStorage.setItem('travline_lang',lang);localStorage.setItem('theme',theme);},{lang,theme});
  await page.route('**/__form-test-api/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace('/__form-test-api','');const method=route.request().method();
   if(method==='PATCH'&&path==='/settings'){
    saves++;await new Promise(resolve=>setTimeout(resolve,150));
    return route.fulfill({status:saveFails?503:200,json:saveFails?{error:t.settings.saveError}:{...org,...route.request().postDataJSON()}});
   }
   if(method!=='GET'){externalActions++;return route.fulfill({status:403,json:{error:'Unexpected action blocked'}});}
   if(path==='/settings')return route.fulfill({status:readFails?503:200,json:readFails?{error:'Synthetic read failed'}:org});
   if(path==='/settings/plan')return route.fulfill({json:plan});
   if(path==='/settings/agency-profile')return route.fulfill({json:{profiles:['retail_agency'],capabilities:['customer_sales'],configured:true}});
   if(path.startsWith('/settings/message-templates'))return route.fulfill({json:{data:[]}});
   return route.fulfill({json:{}});
  });
  await page.goto('/e2e/finance-forms/organization-settings.html');
  await expect(page.getByRole('alert')).toHaveText(t.settings.organizationLoadError);
  if(theme==='dark')await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await expect(page.getByRole('button',{name:t.settings.saveOrganizationSettings})).toHaveCount(0);
  expect(saves).toBe(0);
  await page.screenshot({path:info.outputPath('settings-read-failure.png')});
  readFails=false;
  await page.getByRole('button',{name:t.settings.retryOrganizationLoad}).click();
  const name=page.getByLabel(t.settings.orgnizationName);await expect(name).toBeVisible();
  await expect(page.getByText(t.settings.planManagedByPlatform)).toBeVisible();
  await page.getByText(t.settings.planManagedByPlatform).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('settings-plan-readonly.png')});
  await expect(page.getByRole('button',{name:t.settings.planUpgrade})).toHaveCount(0);
  await name.fill('Synthetic edited agency');
  await page.getByRole('button',{name:t.settings.saveOrganizationSettings}).dblclick();
  await expect(page.getByRole('alert')).toHaveText(t.settings.saveError);expect(saves).toBe(1);
  await expect(name).toHaveValue('Synthetic edited agency');saveFails=false;
  await page.getByRole('button',{name:t.settings.saveOrganizationSettings}).click();
  await expect(page.getByRole('status')).toHaveText(t.settings.saved);expect(saves).toBe(2);
  expect(externalActions).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 });
}
for(const lang of ['bs','en'] as const) {
 test(`organization entitlement remains available to platform administrator ${lang}`,async({page})=>{
  const t=lang==='bs'?bs:en;let assignments=0;
  await page.addInitScript(lang=>localStorage.setItem('travline_lang',lang),lang);
  await page.route('**/__form-test-api/**',route=>{
   const path=new URL(route.request().url()).pathname.replace('/__form-test-api','');
   if(route.request().method()==='PATCH'&&path==='/settings/plan'){assignments++;return route.fulfill({json:{...plan,plan:'enterprise',planLabel:'Enterprise'}});}
   if(route.request().method()!=='GET')return route.fulfill({status:403,json:{error:'Unexpected action blocked'}});
   return route.fulfill({json:path==='/settings'?org:path==='/settings/plan'?plan:path.startsWith('/settings/message-templates')?{data:[]}:{}});
  });
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('/e2e/finance-forms/organization-settings.html?role=super_admin');
  await page.getByRole('button',{name:t.settings.planUpgrade}).click();
  await expect.poll(()=>assignments).toBe(1);
  await expect(page.getByText(t.settings.planManagedByPlatform)).toHaveCount(0);
 });
}
