import { fileURLToPath } from 'node:url';
const evidence = (name: string) => fileURLToPath(new URL('../../../docs/operations/forms-finance-audit/' + name, import.meta.url));
import { test, expect } from '@playwright/test';
for (const surface of ['add','edit','list']) for (const theme of ['light','dark']) for (const width of [390,768,1440]) {
 test(`${surface} ${theme} ${width}: validation cancel failure recovery and duplicate protection`, async ({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height:844});
  await page.addInitScript(theme=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.toggle('dark',theme==='dark'));localStorage.setItem('travline_lang','en');},theme);
  const bodies:Record<string,unknown>[]=[];let calls=0;
  await page.route('**/__form-test-api/payments**',async route=>{
   if(route.request().method()==='GET'){await route.fulfill({json:{data:[],pagination:{total:0}}});return;}
   bodies.push(route.request().postDataJSON());calls++;
   if(calls===1){await new Promise(resolve=>setTimeout(resolve,250));await route.fulfill({status:503,json:{error:'Synthetic failure'}});return;}
   await route.fulfill({json:{payment:{id:'saved'},reservation:{paidAmount:45,totalAmount:180}}});
  });
  await page.goto(`/e2e/finance-forms/index.html?surface=${surface}`);
  const open=async()=>{await page.getByRole('button',{name:'Open form'}).click();if(surface==='list')await page.getByRole('button',{name:'+ Add Payment',exact:true}).click();};
  await open();const form=page.getByRole('form',{name:surface==='edit'?'Edit Payment':'Add Payment',exact:true});
  await expect(form.getByLabel('Status',{exact:true})).toHaveValue('succeeded');
  await form.getByLabel('Method',{exact:true}).selectOption('bank_transfer');await form.getByRole('button',{name:'Cancel',exact:true}).click();
  if(surface==='list')await page.getByRole('button',{name:'+ Add Payment',exact:true}).click();else await open();
  await expect(form.getByLabel('Method',{exact:true})).toHaveValue(surface==='edit'?'cash':'');
  const amount=form.getByLabel('Amount *',{exact:true});await amount.fill('0.001');await form.getByRole('button',{name:surface==='edit'?'Save':'Add Payment',exact:true}).click();
  expect(calls).toBe(0);expect(await amount.evaluate((e:HTMLInputElement)=>e.validity.valid)).toBe(false);
  await amount.fill('45');await form.getByLabel('Method',{exact:true}).selectOption('card');await form.getByLabel(surface==='edit'?'Date':'Date *',{exact:true}).fill('2026-10-19');
  await form.evaluate(e=>{e.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));e.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await expect(form.getByLabel('Status',{exact:true})).toBeDisabled();await expect(form.getByLabel('Method',{exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(form).toBeVisible();await expect(form.getByRole('alert')).toBeVisible();expect(calls).toBe(1);
  await expect(amount).toHaveValue('45');await expect(form.getByLabel('Method',{exact:true})).toHaveValue('card');
  await page.screenshot({path:evidence(`after-${surface}-${theme}-${width}.png`)});
  const bounds=await form.locator('input,select').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,height:r.height};}));
  expect(bounds.every(r=>r.x>=0&&r.right<=width&&r.height>=44)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await form.getByRole('button',{name:surface==='edit'?'Save':'Add Payment',exact:true}).click();await expect(form).toBeHidden();expect(calls).toBe(2);
  if(surface!=='edit'){expect(bodies[0].idempotency_key).toBeTruthy();expect(bodies[1].idempotency_key).toBe(bodies[0].idempotency_key);}
  expect(bodies[1]).toMatchObject({amount:45,payment_method:'card',payment_date:'2026-10-19'});expect(errors).toEqual([]);
  await testInfo.attach('requests',{body:JSON.stringify(bodies,null,2),contentType:'application/json'});
 });
}
test('Bosnian payment labels and cancel reset',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('travline_lang','bs'));await page.goto('/e2e/finance-forms/index.html');await page.getByRole('button',{name:'Open form'}).click();
 const form=page.getByRole('form',{name:'Dodaj uplatu',exact:true});await expect(form.getByLabel('Iznos *',{exact:true})).toBeVisible();await expect(form.getByLabel('Način',{exact:false})).toBeVisible();await form.getByRole('button',{name:'Odustani',exact:true}).click();await expect(form).toBeHidden();
});
