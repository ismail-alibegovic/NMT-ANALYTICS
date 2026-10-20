import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = process.env.E2E_API_URL || 'http://127.0.0.1:3001';
const auth = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
type Headers = Record<string, string>;
const terms = 'Synthetic consent terms. No real passenger or financial data.';
let headers: Headers, foreign: Headers, agent: Headers, templateId: string;
test.describe.configure({ mode: 'serial' });
async function login(request: APIRequestContext, email: string) {
  const result = await request.post(auth + '/auth/v1/token?grant_type=password', {
    headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY! },
    data: { email, password: process.env.E2E_FINANCE_DIRECTOR_PASSWORD },
  });
  expect(result.status(), await result.text()).toBe(200);
  return { Authorization: 'Bearer ' + (await result.json()).access_token };
}
async function create(request: APIRequestContext, path: string, data: unknown, actor = headers) {
  const result = await request.post(api + '/api' + path, { headers: actor, data });
  expect(result.status(), path + ': ' + await result.text()).toBe(201); return result.json();
}
async function passenger(request: APIRequestContext, marker: string, actor = headers) {
  const pkg = await create(request, '/packages', { name: marker, destination: 'Synthetic', price: 50, currency: 'BAM', active: true, transportType: 'none', maxParticipants: 8 }, actor);
  const departure = await create(request, '/departures', { packageId: pkg.id, departAt: '2044-01-01T08:00:00Z', returnAt: '2044-01-02T08:00:00Z', capacity: 8, status: 'active', transportType: 'none' }, actor);
  const reservation = await create(request, '/reservations', { departureId: departure.id, customerName: marker, customerPhone: '000', partySize: 1, reservationAt: '2044-01-01T08:00:00Z', totalAmount: 50, currency: 'BAM', status: 'confirmed' }, { ...actor, 'Idempotency-Key': randomUUID() });
  const row = await create(request, '/excursions', { reservationId: reservation.id, fullName: marker, seatNumber: 1, paidAmount: 0 }, actor);
  return { passenger: row, departure, reservation };
}
test.beforeAll(async ({ request }) => {
  test.skip(process.env.E2E_RUN_BROWSER !== '1', 'Isolated acceptance only');
  expect(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(api)).toBe(true);
  expect(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(auth)).toBe(true);
  headers = await login(request, process.env.E2E_FINANCE_DIRECTOR_EMAIL!);
  foreign = await login(request, process.env.E2E_OTHER_TENANT_EMAIL!);
  agent = await login(request, 'agent@security-audit.test');
  const template = await create(request, '/waiver-templates', {
    title: 'Synthetic consent', body_text: terms,
    declarations: [{ id: 'health', label: 'Synthetic required declaration', required: true }],
  });
  templateId = template.id;
  await create(request, '/waiver-templates', { title: 'Foreign synthetic consent', body_text: 'Foreign terms' }, foreign);
});
test('waiver API preserves snapshots, single-use state, tenant isolation and concurrent issue/sign/revoke', async ({ request }, info) => {
  test.setTimeout(120_000);
  const slot = await passenger(request, 'Waiver audit API ' + randomUUID());
  const foreignSlot = await passenger(request, 'Waiver audit foreign ' + randomUUID(), foreign);
  expect((await request.post(api + '/api/waivers/issue', { headers, data: { passenger_id: foreignSlot.passenger.id } })).status()).toBe(404);
  const issued = await Promise.all([1, 2].map(() => request.post(api + '/api/waivers/issue', { headers, data: { passenger_id: slot.passenger.id } })));
  expect(issued.map(r => r.status()).sort()).toEqual([201, 409]);
  const waiver = await issued.find(r => r.status() === 201)!.json();
  const token = waiver.sign_url.split('/').pop(); expect(token).toMatch(/^[a-f0-9]{48}$/);
  const managerIssued = await create(request, '/waivers/issue', { passenger_id: foreignSlot.passenger.id }, foreign);
  expect(managerIssued.waiver_id).toBeTruthy();
  expect((await request.get(api + '/api/waiver-templates', { headers: agent })).status()).toBe(403);
  const publicUrl = api + '/api/public/waiver/' + token;
  const payload = await request.get(publicUrl); expect(payload.status()).toBe(200);
  expect(payload.headers()['cache-control']).toBe('no-store');
  expect((await payload.json()).template_body).toBe(terms);
  const changed = await request.patch(api + '/api/waiver-templates/' + templateId, { headers, data: { body_text: 'Changed after issue', is_active: false } });
  expect(changed.status()).toBe(200);
  expect((await (await request.get(publicUrl)).json()).template_body).toBe(terms);
  expect((await request.patch(api + '/api/waiver-templates/' + templateId, { headers, data: { body_text: terms, is_active: true } })).status()).toBe(200);
  expect((await request.get(api + '/api/public/waiver/' + token.slice(0, 32))).status()).toBe(404);
  expect((await request.post(publicUrl + '/sign', { data: { signer_name: '   ', agreed: true } })).status()).toBe(400);
  expect((await request.post(publicUrl + '/sign', { data: { signer_name: 'Synthetic', agreed: true, declarations: {} } })).status()).toBe(400);
  expect((await request.post(api + '/api/waivers/issue', { headers: foreign, data: { passenger_id: slot.passenger.id } })).status()).toBe(404);
  expect((await request.patch(api + '/api/waiver-templates/' + templateId, { headers: foreign, data: { body_text: 'Unauthorized synthetic change' } })).status()).toBe(404);
  expect((await request.delete(api + '/api/waiver-templates/' + templateId, { headers: foreign })).status()).toBe(404);
  const foreignDeparture = await request.get(api + '/api/waivers/by-departure/' + slot.departure.id, { headers: foreign });
  expect(foreignDeparture.status()).toBe(200); expect(await foreignDeparture.json()).toEqual([]);

  expect((await request.post(api + '/api/waivers/' + waiver.waiver_id + '/revoke', { headers: foreign })).status()).toBe(404);
  expect((await request.get(api + '/api/waivers/' + waiver.waiver_id + '/pdf', { headers: foreign })).status()).toBe(404);
  const foreignList = await request.get(api + '/api/waivers', { headers: foreign }); expect(foreignList.status()).toBe(200);
  expect(JSON.stringify(await foreignList.json())).not.toContain(slot.passenger.id);
  const signed = await Promise.all(['First synthetic signer', 'Second synthetic signer'].map(signer_name => request.post(publicUrl + '/sign', { data: { signer_name, agreed: true, declarations: { health: true } } })));
  expect(signed.map(r => r.status()).sort()).toEqual([200, 409]);
  expect((await request.get(publicUrl)).status()).toBe(409);
  const consent = await request.get(api + '/api/excursions?reservationId=' + slot.reservation.id, { headers });
  expect(consent.status()).toBe(200);
  const consentRow = (await consent.json()).data.find((row: any) => row.id === slot.passenger.id);
  expect(consentRow.waiver_signed).toBe(true);
  expect(consentRow.waiver_data.signer_name).toBe(signed[0].status() === 200 ? 'First synthetic signer' : 'Second synthetic signer');
  const forbiddenPassengers = await request.get(api + '/api/excursions?reservationId=' + slot.reservation.id, { headers: foreign });
  expect(forbiddenPassengers.status()).toBe(200); expect((await forbiddenPassengers.json()).data).toEqual([]);

  expect((await request.post(api + '/api/waivers/' + waiver.waiver_id + '/revoke', { headers })).status()).toBe(409);
  const pdf = await request.get(api + '/api/waivers/' + waiver.waiver_id + '/pdf', { headers });
  expect(pdf.status(), await pdf.text()).toBe(200); expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  expect((await request.get(api + '/api/waivers/' + waiver.waiver_id + '/pdf', { headers: agent })).status()).toBe(200);
  const agentIssued = await create(request, '/waivers/issue', { passenger_id: slot.passenger.id }, agent);
  expect((await request.post(api + '/api/waivers/' + agentIssued.waiver_id + '/revoke', { headers: agent })).status()).toBe(204);
  const [batchTarget, unrelated] = await Promise.all([
    passenger(request, 'Waiver audit batch target ' + randomUUID()),
    passenger(request, 'Waiver audit unrelated departure ' + randomUUID()),
  ]);
  const batch = await request.post(api + '/api/waivers/issue-batch', { headers, data: { departure_id: batchTarget.departure.id } });
  expect(batch.status()).toBe(200);
  const batchResult = await batch.json(); expect(batchResult.issued).toBe(1); expect(batchResult.failed).toBe(0);
  expect(batchResult.results.map((row: any) => row.passenger_id)).toEqual([batchTarget.passenger.id]);
  const repeatedBatch = await request.post(api + '/api/waivers/issue-batch', { headers, data: { departure_id: batchTarget.departure.id } });
  expect(repeatedBatch.status()).toBe(200); expect((await repeatedBatch.json()).issued).toBe(0);
  const unrelatedStatus = await request.get(api + '/api/waivers/by-departure/' + unrelated.departure.id, { headers });
  expect(unrelatedStatus.status()).toBe(200); expect(await unrelatedStatus.json()).toEqual([]);
  const foreignBatch = await request.post(api + '/api/waivers/issue-batch', { headers, data: { departure_id: foreignSlot.departure.id } });
  expect(foreignBatch.status()).toBe(200); expect((await foreignBatch.json()).issued).toBe(0);
  const other = await passenger(request, 'Waiver audit race ' + randomUUID());
  const race = await create(request, '/waivers/issue', { passenger_id: other.passenger.id });
  const raceUrl = api + '/api/public/waiver/' + race.sign_url.split('/').pop();
  const [revocation, signature] = await Promise.all([
    request.post(api + '/api/waivers/' + race.waiver_id + '/revoke', { headers }),
    request.post(raceUrl + '/sign', { data: { signer_name: 'Race synthetic signer', agreed: true, declarations: { health: true } } }),
  ]);
  if (signature.status() === 200) expect(revocation.status()).toBe(409);
  else { expect(revocation.status()).toBe(204); expect([404, 409]).toContain(signature.status()); expect((await request.get(raceUrl)).status()).toBe(404); }
  const own = await request.get(api + '/api/waivers', { headers }); expect(own.status()).toBe(200);
  const rows = await own.json(); expect(rows.find((row: any) => row.id === waiver.waiver_id).status).toBe('signed');
  expect(JSON.stringify(rows)).not.toMatch(/token_hash|signature_png_base64|sign_url/);
  await info.attach('waiver-api-evidence', { body: JSON.stringify({ issue: issued.map(r => r.status()), sign: signed.map(r => r.status()), revokeRace: revocation.status(), signRace: signature.status(), foreignIssue: 404, foreignPdf: 404, snapshotPreserved: true }), contentType: 'application/json' });
});
const text = {
  en: { copy: 'Copy link', edit: 'Edit template', title: 'Title', body: 'Terms', save: 'Save', departure: 'Departure', passenger: 'Passenger', issue: 'Issue consent link', name: 'Full name', agree: 'I have read the terms and confirm my consent.', submit: 'Confirm consent', done: 'Consent recorded' },
  bs: { copy: 'Kopiraj link', edit: 'Uredi predložak', title: 'Naslov', body: 'Uslovi', save: 'Sačuvaj', departure: 'Polazak', passenger: 'Putnik', issue: 'Izdaj link za pristanak', name: 'Puno ime', agree: 'Pročitao/la sam uslove i potvrđujem svoj pristanak.', submit: 'Potvrdi pristanak', done: 'Pristanak evidentiran' },
};
for (const lang of ['en', 'bs'] as const) for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) test(`waiver editing, issue, failed-sign recovery and reload ${lang} ${theme} ${width}`, async ({ page, request, context }, info) => {
  test.setTimeout(120_000); const c = text[lang];
  const marker = 'Waiver audit browser ' + randomUUID();
  const slot = await passenger(request, marker);
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(({ lang, theme }) => { localStorage.setItem('travline_lang', lang); localStorage.setItem('theme', theme); }, { lang, theme });
  await page.goto('/auth/signin'); await page.locator('#signin-email').fill(process.env.E2E_FINANCE_DIRECTOR_EMAIL!); await page.locator('#signin-password').fill(process.env.E2E_FINANCE_DIRECTOR_PASSWORD!);
  await page.locator('button[type="submit"]').click(); await expect(page).not.toHaveURL(/auth\/signin/);
  await page.goto('/admin/waivers'); await page.getByRole('button', { name: c.edit, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: c.edit, exact: true });
  const updatedTitle = 'Synthetic consent ' + lang + theme + width;
  await dialog.getByLabel(c.title, { exact: true }).fill(updatedTitle);
  let saves = 0;
  await page.route('**/api/waiver-templates/*', route => {
    if (route.request().method() === 'PATCH' && ++saves === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic save failure"}' });
    return route.continue();
  });
  await dialog.getByRole('button', { name: c.save, exact: true }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel(c.title, { exact: true })).toHaveValue(updatedTitle);
  await dialog.getByRole('button', { name: c.save, exact: true }).click(); await expect(dialog).toBeHidden(); expect(saves).toBe(2);
  await page.reload(); await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
  await page.getByLabel(c.departure, { exact: true }).selectOption(slot.departure.id);
  await page.getByLabel(c.passenger, { exact: true }).selectOption(slot.passenger.id);
  let issueRequests = 0; let releaseIssue!: () => void;
  const issueGate = new Promise<void>(resolve => { releaseIssue = resolve; });
  await page.route('**/api/waivers/issue', async route => {
    if (route.request().method() === 'POST') { issueRequests++; await issueGate; }
    return route.continue();
  });
  const issued = page.waitForResponse(r => r.url().endsWith('/api/waivers/issue') && r.request().method() === 'POST');
  await page.getByRole('button', { name: c.issue, exact: true }).click();
  try {
    await expect.poll(() => issueRequests).toBe(1);
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await page.getByLabel(c.passenger, { exact: true }).evaluate(select => select.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(issueRequests).toBe(1);
  } finally { releaseIssue(); }
  const issuedResponse = await issued; expect(issuedResponse.status()).toBe(201);
  const waiver = await issuedResponse.json(); const token = waiver.sign_url.split('/').pop();
  await expect(page.getByRole('textbox', { name: c.issue, exact: true })).toHaveValue(new URL(waiver.sign_url, page.url()).href);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: c.copy, exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(waiver.sign_url, page.url()).href);

  await page.reload(); expect(await page.content()).not.toContain(token);
  await page.goto(waiver.sign_url);
  await expect(page.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^$/);
  await page.getByLabel(c.name, { exact: true }).fill('   '); await expect(page.getByRole('button', { name: c.submit, exact: true })).toBeDisabled();
  await page.getByLabel(c.name, { exact: true }).fill(marker);
  await page.getByLabel('Synthetic required declaration', { exact: false }).check();
  await page.getByLabel(c.agree, { exact: true }).check();
  const canvas = page.locator('canvas'); await canvas.scrollIntoViewIfNeeded(); const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 70, box.y + 45, { steps: 5 }); await page.mouse.up();
  const drawing = await canvas.evaluate(pad => (pad as HTMLCanvasElement).toDataURL());
  let signs = 0; let release!: () => void;
  const pendingSign = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/public/waiver/*/sign', async route => {
    if (++signs === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic signing failure"}' });
    await pendingSign;
    return route.continue();
  });
  await page.getByRole('button', { name: c.submit, exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel(c.name, { exact: true })).toHaveValue(marker); await expect(page.getByLabel(c.agree, { exact: true })).toBeChecked();
  expect(await canvas.evaluate(pad => (pad as HTMLCanvasElement).toDataURL())).toBe(drawing);
  await page.getByRole('button', { name: c.submit, exact: true }).click();
  try {
    await expect.poll(() => signs).toBe(2);
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(signs).toBe(2);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: c.done, exact: true })).toBeVisible(); expect(signs).toBe(2);
  await page.reload(); await expect(page.getByRole('heading', { name: c.done, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('waiver-signed.png'), fullPage: true });
});

test('public consent can be completed with keyboard and a typed name without a drawing', async ({ page, request }) => {
  test.setTimeout(90_000);
  const marker = 'Waiver audit keyboard ' + randomUUID();
  const slot = await passenger(request, marker);
  const waiver = await create(request, '/waivers/issue', { passenger_id: slot.passenger.id });
  await page.addInitScript(() => localStorage.setItem('travline_lang', 'en'));
  await page.goto(waiver.sign_url);
  await page.getByLabel('Full name', { exact: true }).fill(marker);
  await page.getByLabel('Synthetic required declaration', { exact: false }).focus(); await page.keyboard.press('Space');
  await page.getByLabel('I have read the terms and confirm my consent.', { exact: true }).focus(); await page.keyboard.press('Space');
  const signed = page.waitForResponse(r => r.url().endsWith('/sign') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirm consent', exact: true }).focus(); await page.keyboard.press('Enter');
  const response = await signed; expect(response.status()).toBe(200);
  const payload = response.request().postDataJSON(); expect(payload.signer_name).toBe(marker); expect(payload.signature_png).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Consent recorded', exact: true })).toBeVisible();
});
