import { fileURLToPath } from 'node:url';
const evidence = (name: string) => fileURLToPath(new URL('../../../docs/operations/forms-finance-audit/' + name, import.meta.url));
import { test,expect } from '@playwright/test';
for(const theme of ['light','dark']) for(const width of [390,768,1440]) test(`baseline ${theme} ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:844});
 await page.addInitScript(theme=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.toggle('dark',theme==='dark'));localStorage.setItem('travline_lang','en');},theme);
 await page.goto('/e2e/finance-forms/index.html');await page.getByRole('button',{name:'Open form'}).click();
 await page.screenshot({path:evidence(`before-add-${theme}-${width}.png`)});
 await testInfo.attach('baseline',{body:JSON.stringify({statusLabelBound:await page.getByLabel('Status',{exact:true}).count(),dialogTop:await page.locator('.modal > div').last().evaluate(e=>e.getBoundingClientRect().top) }),contentType:'application/json'});
 await page.locator('#paymentMethod').selectOption('cash');await page.getByRole('button',{name:'Odustani',exact:true}).click();
 await page.getByRole('button',{name:'Open form'}).click();
 expect(await page.locator('#paymentMethod').inputValue(),'Cancelled payment method leaks into next payment').toBe('');
});
