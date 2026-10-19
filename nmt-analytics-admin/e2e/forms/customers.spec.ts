import { expect, test } from '@playwright/test';
for(const theme of ['light','dark']) for(const width of [390,768,1440]) {
 test(`Customer FormModal contract workflow — ${theme} ${width}`,async({page})=>{
  let rows: Record<string,unknown>[]=[]; let fail=true; let writes=0;
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__form-test-api/**',async route=>{
   const req=route.request();const path=new URL(req.url()).pathname;const id=path.split('/customers/')[1];
   if(req.method()==='GET') return route.fulfill({json:{data:path.endsWith('/packages')?[]:rows,total:rows.length}});
   writes++;
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Customer fixture unavailable'}});}
   await new Promise(r=>setTimeout(r,150));
   const data=req.postDataJSON();
   if(id) rows=rows.map(r=>r.id===id?{...r,...data}:r);else rows.push({...data,id:'isolated-customer',created_at:'2027-01-01'});
   return route.fulfill({status:id?200:201,json:rows[0]});
  });
  await page.setViewportSize({width,height:900});
  await page.addInitScript(theme=>{localStorage.setItem('travline_lang','en');document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.toggle('dark',theme==='dark'),{once:true})},theme);
  await page.goto('/e2e/forms/index.html?surface=customers');
  await page.getByRole('button',{name:'Add Client',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Add Client',exact:true});
  await expect(dialog).toBeVisible();
  await page.getByLabel(/Full Name/).fill('Isolated Customer');
  await page.getByLabel(/^Phone/).fill('+38761000001');
  await page.getByLabel('Email', {exact:true}).fill('customer@example.test');
  await dialog.getByLabel(/^Status/).selectOption('lead');
  await page.getByLabel('Notes', {exact:true}).fill('Preserve this draft');
  await page.screenshot({path:`../docs/ux-audit/flight-forms/customer-${theme}-${width}.png`});
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(dialog.getByText('Customer fixture unavailable',{exact:true})).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel(/Full Name/)).toHaveValue('Isolated Customer');
  await expect(dialog.getByLabel(/^Status/)).toHaveValue('lead');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(dialog).toBeHidden();expect(writes).toBe(2);
  await page.reload();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByLabel(/Full Name/)).toHaveValue('Isolated Customer');
  await page.getByLabel('Notes',{exact:true}).fill('Edited customer');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByLabel('Notes',{exact:true})).toHaveValue('Edited customer');
  await page.getByLabel('Notes',{exact:true}).fill('Cancelled');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByLabel('Notes',{exact:true})).toHaveValue('Edited customer');
  const dimensions=await page.getByRole('dialog').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,scroll:el.scrollWidth,client:el.clientWidth}));
  expect(dimensions.left).toBeGreaterThanOrEqual(8);expect(dimensions.right).toBeLessThanOrEqual(width-8);expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client+1);
  expect(errors).toEqual([]);
 });
}
