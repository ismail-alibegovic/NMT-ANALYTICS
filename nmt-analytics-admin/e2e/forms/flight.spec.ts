import { expect, test, type Page } from '@playwright/test';

// Real page + shared controls; only Auth and API transport are replaced.
// The in-memory contract fixture is NOT evidence of PostgreSQL persistence.
async function fixture(page: Page) {
  let rows: Record<string, unknown>[] = [];
  let failNext = false;
  let mutations = 0;
  await page.route('**/__form-test-api/**', async route => {
    const req = route.request();
    const id = new URL(req.url()).pathname.split('/flights/')[1];
    if (req.method() === 'GET') return route.fulfill({json: id ? rows.find(r=>r.id===id) : {data:rows}});
    mutations++;
    if (failNext) {failNext=false; return route.fulfill({status:503,json:{error:'Isolated API unavailable'}});}
    await new Promise(resolve=>setTimeout(resolve,150));
    const data=req.postDataJSON();
    if (id) rows=rows.map(row=>row.id===id?{...row,...data}:row);
    else rows.push({...data,id:'isolated-flight',orgId:'isolated-org'});
    return route.fulfill({status:id?200:201,json:rows[0]});
  });
  return { fail: ()=>{failNext=true}, mutations:()=>mutations };
}
async function fill(page: Page) {
  await page.getByLabel(/^Airline/).fill('Isolated Test Air');
  await page.getByLabel(/^Flight number/).fill('TA12');
  await page.getByLabel(/^Departure airport/).fill('sjj');
  await page.getByLabel(/^Arrival airport/).fill('ist');
  await page.getByLabel(/^Departure time/).fill('2027-07-15T10:00');
  await page.getByLabel(/^Arrival time/).fill('2027-07-15T12:00');
  await page.getByLabel('Base price').fill('0');
  await page.getByLabel('Notes', {exact:true}).fill('Isolated draft');
}

for(const theme of ['light','dark']) for(const width of [390,768,1440]) {
  test(`Flight create/edit/cancel/error/refresh — ${theme} ${width}`, async ({page})=>{
    const errors: string[]=[];
    page.on('pageerror', e=>errors.push(e.message));
    const state=await fixture(page);
    await page.setViewportSize({width,height:900});
    await page.addInitScript(theme=>{localStorage.setItem('travline_lang','en');document.addEventListener('DOMContentLoaded',()=>document.documentElement.classList.toggle('dark',theme==='dark'),{once:true})},theme);
    await page.goto('/e2e/forms/index.html');
    await page.getByRole('button',{name:'New flight',exact:true}).first().click();
    const dialog=page.getByRole('dialog',{name:'New flight',exact:true});
    await expect(dialog).toBeVisible();
    await fill(page);
    await dialog.evaluate(el=>{el.scrollTop=0});
    await page.screenshot({path:`../docs/ux-audit/flight-forms/after-${theme}-${width}.png`});
    const layout=await dialog.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {left:r.left,right:r.right,height:r.height,client:el.clientWidth,scroll:el.scrollWidth,
        fields:[...el.querySelectorAll('input:not([type=checkbox]), select, textarea')].map(field=>{const r=field.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,label:(field as HTMLElement).id}})};
    });
    expect(layout.left).toBeGreaterThanOrEqual(8);expect(layout.right).toBeLessThanOrEqual(width-8);
    expect(layout.scroll).toBeLessThanOrEqual(layout.client+1);
    expect(layout.height).toBeLessThanOrEqual(900-30);
    for(const field of layout.fields) {expect(field.left).toBeGreaterThan(layout.left);expect(field.right).toBeLessThan(layout.right);expect(field.height).toBeGreaterThanOrEqual(44);}
    await page.getByLabel(/^Capacity/).fill('1.5');
    await page.getByRole('button',{name:'Create',exact:true}).click();
    await expect(page.getByText('Enter a positive whole-number capacity.')).toBeVisible();
    expect(state.mutations()).toBe(0);
    await page.getByLabel(/^Capacity/).fill('180');
    state.fail();
    await page.getByRole('button',{name:'Create',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Isolated API unavailable');
    await expect(page.getByLabel(/^Airline/)).toHaveValue('Isolated Test Air');
    await page.getByRole('button',{name:'Create',exact:true}).click();
    await expect(dialog).toBeHidden();
    expect(state.mutations()).toBe(2);
    await page.reload();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    const edit=page.getByRole('dialog',{name:'Edit flight',exact:true});
    await expect(page.getByLabel(/^Departure time/)).toHaveValue('2027-07-15T10:00');
    await expect(page.getByLabel('Base price')).toHaveValue('0');
    await page.getByLabel('Notes',{exact:true}).fill('Saved change');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(edit).toBeHidden();
    await page.reload();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByLabel('Notes',{exact:true})).toHaveValue('Saved change');
    await page.getByLabel('Notes',{exact:true}).fill('Cancelled change');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByLabel('Notes',{exact:true})).toHaveValue('Saved change');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'New flight',exact:true}).first().click();
    await expect(page.getByLabel(/^Airline/)).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('Bosnian labels, localized validation, keyboard focus and pending-submit protection', async ({page})=>{
  const state=await fixture(page);
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('travline_lang','bs'));
  await page.goto('/e2e/forms/index.html');
  await page.getByRole('button',{name:'Novi let',exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('Polja označena sa * su obavezna.');
  await page.getByRole('button',{name:'Kreiraj',exact:true}).click();
  await expect(page.getByLabel(/^Aviokompanija/)).toBeFocused();
  await expect(page.getByLabel(/^Aviokompanija/)).toHaveAttribute('aria-invalid','true');
  await page.getByLabel(/^Aviokompanija/).fill('Izolovani test');
  await page.getByLabel(/^Broj leta/).fill('TS1');
  await page.getByLabel(/^Polazni aerodrom/).fill('SJJ');
  await page.getByLabel(/^Dolazni aerodrom/).fill('IST');
  await page.getByLabel(/^Vrijeme polaska/).fill('2027-01-15T10:00');
  await page.getByLabel(/^Vrijeme dolaska/).fill('2027-01-15T12:00');
  const submit=page.getByRole('button',{name:'Kreiraj',exact:true});
  await submit.focus();await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Zatvori',exact:true})).toBeFocused();
  // Synthetic duplicate submit events exercise the synchronous lock directly.
  await dialog.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(state.mutations()).toBe(1);
  await page.getByRole('button',{name:'Uredi',exact:true}).click();
  await expect(page.getByLabel(/^Vrijeme polaska/)).toHaveValue('2027-01-15T10:00');
});

test('Flight status filter uses the API contract through the real toolbar',async({page})=>{
 const seen:string[]=[];
 await page.route('**/__form-test-api/**',route=>{seen.push(new URL(route.request().url()).search);return route.fulfill({json:{data:[]}})});
 await page.goto('/e2e/forms/index.html');
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('active');
 await expect.poll(()=>seen.some(q=>new URLSearchParams(q).get('active')==='true')).toBe(true);
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('inactive');
 await expect.poll(()=>seen.some(q=>new URLSearchParams(q).get('active')==='false')).toBe(true);
});
