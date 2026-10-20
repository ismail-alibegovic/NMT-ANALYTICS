import {expect,test} from '@playwright/test';
const configured=process.env.E2E_RUN_BROWSER==='1'&&process.env.E2E_FINANCE_DIRECTOR_EMAIL&&process.env.E2E_FINANCE_DIRECTOR_PASSWORD;
const routes=['/payments','/reports','/integrations','/settings','/settings/public-forms','/settings/pdf-templates','/admin/audit-logs','/admin/documents'];
for(const theme of ['light','dark'])for(const width of [390,768,1440])test(`director initial-render audit ${theme} ${width}`,async({page},info)=>{
 test.skip(!configured,'BLOCKED: isolated director fixture required');test.setTimeout(180_000);await page.setViewportSize({width,height:900});await page.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('travline_lang','en');},theme);
 await page.goto('/auth/signin');await page.locator('#signin-email').fill(process.env.E2E_FINANCE_DIRECTOR_EMAIL!);await page.locator('#signin-password').fill(process.env.E2E_FINANCE_DIRECTOR_PASSWORD!);await page.getByRole('button',{name:/sign in/i}).click();await expect(page).not.toHaveURL(/auth\/signin/);
 const inventory:Record<string,unknown>[]=[];
 try{
  for(const route of routes){
   const errors:string[]=[];const failures:Record<string,unknown>[]=[];const onError=(e:Error)=>errors.push(e.message);const onResponse=(r:any)=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push({path:new URL(r.url()).pathname,status:r.status()});};page.on('pageerror',onError);page.on('response',onResponse);
   try{
    await page.goto(route,{waitUntil:'networkidle',timeout:20_000});const actual=new URL(page.url()).pathname;const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    inventory.push({route,actual,status:actual!==route?'BLOCKED_REDIRECT':errors.length||failures.length||overflow?'FINDING':'INITIAL_RENDER_ONLY',errors,failures,overflow,formWorkflow:'NOT_TESTED'});
    expect.soft(actual,`${route}: director must reach the requested screen`).toBe(route);expect.soft(errors,route).toEqual([]);expect.soft(overflow,`${route}: overflow`).toBe(false);expect.soft(failures.filter(x=>Number(x.status)>=500),`${route}: server failures`).toEqual([]);
    await expect(page.locator('html')).toHaveClass(theme==='dark'?/dark/:/^$/);await page.screenshot({path:info.outputPath(`${route.replace(/[^a-z0-9]/gi,'_')}.png`),fullPage:true});
   }catch(error){inventory.push({route,status:'BLOCKED_LOAD',error:String(error),formWorkflow:'NOT_TESTED'});expect.soft(false,`${route}: ${String(error)}`).toBe(true);}finally{page.off('pageerror',onError);page.off('response',onResponse);}
  }
 }finally{await info.attach('director-route-audit',{body:JSON.stringify(inventory,null,2),contentType:'application/json'});console.log('DIRECTOR_ROUTE_AUDIT',theme,width,JSON.stringify(inventory));}
});
