import { fileURLToPath } from 'node:url';
const evidence = (name: string) => fileURLToPath(new URL('../../../docs/operations/forms-finance-audit/' + name, import.meta.url));
import { test,expect } from '@playwright/test';
for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`reports ${theme} ${width}: failed refresh hides stale money and retry recovers`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(theme=>{localStorage.setItem('travline_lang','en');document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.toggle('dark',theme==='dark'));},theme);
 let fail=false;await page.route('**/__form-test-api/analytics/**',async route=>{
  if(fail){await route.fulfill({status:503,json:{error:'Synthetic report failure'}});return;}
  const path=new URL(route.request().url()).pathname;
  await route.fulfill({json:path.endsWith('overview-v2')?{total_amount_sum:180,total_paid_sum:60,total_balance_sum:120,reservations_count:1,payments_count:1,currency:'BAM',availableCurrencies:['BAM']}:path.endsWith('by-package')?[]:[]});
 });
 await page.goto('/e2e/finance-forms/index.html?surface=reports');
 if(theme==='dark')expect(await page.locator('input[type=date]').evaluateAll(nodes=>nodes.every(e=>Number(getComputedStyle(e).color.match(/\d+/)?.[0])>=150))).toBe(true);await expect(page.getByText(/180[,.]00/).first()).toBeVisible();fail=true;
 await page.locator('input[type=date]').first().fill('2041-04-23');
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText(/180[,.]00/)).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Export Overview CSV',exact:true})).toBeDisabled();
 await page.screenshot({path:evidence(`after-reports-${theme}-${width}.png`)});
 fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByText(/180[,.]00/).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
