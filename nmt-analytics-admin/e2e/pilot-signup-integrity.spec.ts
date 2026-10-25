import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const auth = process.env.E2E_SUPABASE_URL || '';
const api = process.env.E2E_API_URL || '';
const configured = /^http:\/\/(127\.0\.0\.1|localhost):/.test(auth)
  && /^http:\/\/(127\.0\.0\.1|localhost):/.test(api)
  && Boolean(process.env.E2E_SUPABASE_ANON_KEY && process.env.E2E_MANAGER_PASSWORD);
// Local capture links and sessions are credentials; never put them in artifacts.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test('commercial signup creates isolated same-name agencies and metadata cannot rename or move them', async ({ request }) => {
  test.skip(!configured, 'Requires disposable localhost Auth/API and local Mailpit capture');
  test.setTimeout(60_000);
  const orgName = `Synthetic commercial ${randomUUID()}`;
  const accounts = [0, 1].map(() => ({ email: `signup-${randomUUID()}@pilot-auth.test`, password: process.env.E2E_MANAGER_PASSWORD! }));
  const headers = { apikey: process.env.E2E_SUPABASE_ANON_KEY! };
  const signups = await Promise.all(accounts.map(account => request.post(`${api}/api/auth/signup`, { data: {
    ...account, org_name: orgName, full_name: 'Synthetic director', role: 'super_admin', org_id: randomUUID(),
  } })));
  for (const signup of signups) {
    expect(signup.status()).toBe(201);
    const body = await signup.json();
    expect(body.confirmationRequired).toBe(true);
    expect(body.session).toBeUndefined();
    expect(body.access_token).toBeUndefined();
  }
  const contexts: { user: { id: string }; org: { id: string; name: string; slug: string }; role: string }[] = [];
  const tokens: string[] = [];
  for (const account of accounts) {
    let verificationLink = '';
    await expect(async () => {
      const messages = await (await request.get('http://127.0.0.1:54324/api/v1/messages')).json();
      const message = (messages.messages || []).find((item: { ID: string; To: { Address: string }[] }) => item.To?.some(to => to.Address === account.email));
      expect(Boolean(message)).toBe(true);
      const detail = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
      verificationLink = ((detail.HTML || detail.Text || '').match(/https?:[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/) || [])[0]?.replace(/&amp;/g, '&') || '';
      expect(Boolean(verificationLink)).toBe(true);
    }).toPass({ timeout: 15_000 });
    expect(new URL(verificationLink).origin).toBe(new URL(auth).origin);
    expect([302, 303]).toContain((await request.get(verificationLink, { maxRedirects: 0 })).status());
    const login = await request.post(`${auth}/auth/v1/token?grant_type=password`, { headers, data: account });
    expect(login.status()).toBe(200);
    const token = (await login.json()).access_token;
    expect(Boolean(token)).toBe(true); tokens.push(token);
    const response = await request.get(`${api}/api/me/context`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(200); const context = await response.json();
    expect(context.org.name).toBe(orgName); expect(context.role).toBe('director'); contexts.push(context);
  }
  expect(contexts[0].org.id).not.toBe(contexts[1].org.id);
  expect(contexts[0].org.slug).not.toBe(contexts[1].org.slug);
  expect(contexts[0].user.id).not.toBe(contexts[1].user.id);
  // A real agency director cannot self-award platform entitlements, including
  // forged role headers. Invalid tenant/settings fields must not change data.
  const deniedPlan = await request.patch(`${api}/api/settings/plan`, {
    headers: { Authorization: `Bearer ${tokens[0]}`, 'x-role': 'super_admin' }, data: { plan: 'enterprise' },
  });
  expect(deniedPlan.status()).toBe(403);
  const rejectedSettings = await request.patch(`${api}/api/settings`, {
    headers: { Authorization: `Bearer ${tokens[0]}` }, data: { name: 'Rejected rename', currency: 'INVALID', org_id: contexts[1].org.id },
  });
  expect(rejectedSettings.status()).toBe(400);
  const savedSettings = await request.patch(`${api}/api/settings`, {
    headers: { Authorization: `Bearer ${tokens[0]}` }, data: {
      name: ` ${orgName} `, slug: contexts[0].org.slug, currency: 'bam', timezone: 'Europe/Sarajevo',
      email: '', tax_id: '', bank_account: null, invoice_footer: 'Synthetic agency footer',
    },
  });
  expect(savedSettings.status()).toBe(200);
  const saved = await savedSettings.json();
  expect(saved.id).toBe(contexts[0].org.id); expect(saved.name).toBe(orgName); expect(saved.currency).toBe('BAM');
  expect(saved.email).toBeNull(); expect(saved.bank_account).toBeNull();
  const reloadedSettings = await request.get(`${api}/api/settings`, { headers: { Authorization: `Bearer ${tokens[0]}` } });
  expect(reloadedSettings.status()).toBe(200); expect((await reloadedSettings.json()).invoice_footer).toBe('Synthetic agency footer');
  // These are fresh isolated synthetic agencies, never customer templates.
  const templateHeaders = { Authorization: `Bearer ${tokens[0]}` };
  const templateBase = `${api}/api/onboarding/templates`;
  const marker = randomUUID();
  const bulk = await request.put(templateBase, { headers: templateHeaders, data: {
    pdf_template_config: { contract: { footerText: marker } },
  } });
  expect(bulk.status()).toBe(200);
  const changed = await Promise.all(['invoice', 'voucher'].map(docType => request.put(`${templateBase}/${docType}`, {
    headers: templateHeaders, data: { footerText: `${marker}-${docType}` },
  })));
  const reload = await request.get(templateBase, { headers: templateHeaders });
  expect(reload.status()).toBe(200); const templates = (await reload.json()).pdf_template_config;
  expect(templates.contract.footerText).toBe(marker);
  for (const [index, response] of changed.entries()) {
    expect([200, 409]).toContain(response.status());
    const docType = ['invoice', 'voucher'][index];
    if (response.status() === 200) expect(templates[docType].footerText).toBe(`${marker}-${docType}`);
    else expect((await request.put(`${templateBase}/${docType}`, { headers: templateHeaders,
      data: { footerText: `${marker}-${docType}` } })).status()).toBe(200);
  }
  const foreignTemplates = await request.get(templateBase, { headers: { Authorization: `Bearer ${tokens[1]}` } });
  expect(foreignTemplates.status()).toBe(200);
  expect(JSON.stringify(await foreignTemplates.json())).not.toContain(marker);
  const update = await request.put(`${auth}/auth/v1/user`, { headers: { ...headers, Authorization: `Bearer ${tokens[0]}` },
    data: { data: { org_name: 'Unauthorized rename', org_id: contexts[1].org.id, role: 'super_admin' } } });
  expect(update.status()).toBe(200);
  for (const [index, token] of tokens.entries()) {
    const context = await (await request.get(`${api}/api/me/context`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(context.org).toEqual(contexts[index].org); expect(context.role).toBe('director');
    const profile = await request.get(`${api}/api/me/profile`, { headers: { Authorization: `Bearer ${token}` } });
    expect(profile.status()).toBe(200); const body = await profile.json();
    expect(body.profile.full_name).toBe('Synthetic director'); expect(body.profile.org_id).toBe(contexts[index].org.id);
  }
});
