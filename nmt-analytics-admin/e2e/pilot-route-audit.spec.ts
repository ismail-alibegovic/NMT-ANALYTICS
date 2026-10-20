import { expect, test } from '@playwright/test';

const configured = process.env.E2E_RUN_BROWSER === '1' && process.env.E2E_MANAGER_EMAIL && process.env.E2E_MANAGER_PASSWORD;
const routes = [
  '/home', '/sales', '/operations', '/finance', '/dashboard', '/customers', '/packages',
  '/reservations', '/inquiries', '/suppliers', '/itineraries', '/quotations', '/departures',
  '/payments', '/reports', '/integrations', '/settings', '/settings/public-forms',
  '/settings/pdf-templates', '/admin/audit-logs', '/admin/documents', '/operations/calendar',
  '/operations/contracts', '/operations/receipts', '/operations/subagents',
  '/operations/commission-rules', '/operations/excursions', '/operations/flights',
  '/operations/hotels', '/operations/availability', '/communication', '/profile',
];
// This is an initial-render inventory, not a CRUD or accessibility certificate.
// Explicitly retain gaps instead of counting missing fixtures as passing screens.
const missingFixtures = ['/packages/:id', '/itineraries/:id', '/quotations/:id', '/operations/hotels/:id',
  '/waiver/:token', '/portal/subagent/:token', '/public/forms/:slug',
  '/portal', '/portal/packages', '/portal/departures', '/portal/reservations', '/portal/customers', '/portal/settings'];
for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
  test(`initial route inventory ${theme} ${width}px`, async ({page}, info) => {
    test.skip(!configured, 'BLOCKED: isolated acceptance environment required');
    test.setTimeout(300_000);
    await page.setViewportSize({width, height:900});
    await page.addInitScript(theme => {localStorage.setItem('theme',theme); localStorage.setItem('travline_lang','en');},theme);
    await page.goto('/auth/signin');
    await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);
    await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
    await page.getByRole('button',{name:/sign in/i}).click();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
    const inventory: Record<string, unknown>[] = missingFixtures.map(route=>({route,status:'NOT_TESTED_REQUIRES_FIXTURE_OR_PORTAL_ROLE'}));
    const targets=[...routes];
    if(process.env.E2E_DEPARTURE_ID) targets.push(`/departures/${process.env.E2E_DEPARTURE_ID}`);
    if(process.env.E2E_CUSTOMER_ID) targets.push(`/customers/${process.env.E2E_CUSTOMER_ID}`);
    if(process.env.E2E_RECOVERY_RESERVATION_ID) targets.push(`/reservations/${process.env.E2E_RECOVERY_RESERVATION_ID}`);
    try {
      for(const route of targets) {
        const errors:string[]=[];
        const listener=(error:Error)=>errors.push(error.message);
        page.on('pageerror',listener);
        try {
          await page.goto(route,{waitUntil:'networkidle',timeout:20_000});
          const actual=new URL(page.url()).pathname;
          const metrics=await page.evaluate(()=>({
            overflow:document.documentElement.scrollWidth>innerWidth+1,
            headingCount:document.querySelectorAll('h1,h2,h3').length,
            formCount:document.querySelectorAll('form').length,
            controlCount:document.querySelectorAll('input,select,textarea,button').length,
            theme:document.documentElement.classList.contains('dark')?'dark':'light',
          }));
          const text=await page.locator('body').innerText();
          const blocked=actual!==route || /page not found|access denied|not authorized/i.test(text);
          const status=blocked?'BLOCKED_ROUTE_OR_ENTITLEMENT':errors.length||metrics.overflow?'DEFECT_OBSERVED':'INITIAL_RENDER_ONLY';
          inventory.push({route,actual,status,...metrics,errors,formWorkflow:'NOT_TESTED'});
          await page.screenshot({path:info.outputPath(`${route.replace(/[^a-z0-9]/gi,'_')}.png`),fullPage:true});
          if(!blocked) {
            expect.soft(errors,`${route}: browser exceptions`).toEqual([]);
            expect.soft(metrics.overflow,`${route}: horizontal page overflow`).toBe(false);
            expect.soft(metrics.theme,`${route}: theme`).toBe(theme);
          }
        } catch(error) {
          inventory.push({route,status:'BLOCKED_LOAD',error:String(error),formWorkflow:'NOT_TESTED'});
          expect.soft(false,`${route}: failed to load: ${String(error)}`).toBe(true);
        } finally {page.off('pageerror',listener);}
      }
    } finally {
      await info.attach('route-audit-inventory',{body:JSON.stringify(inventory,null,2),contentType:'application/json'});
      console.log('ROUTE_AUDIT',theme,width,JSON.stringify(inventory));
    }
  });
}
