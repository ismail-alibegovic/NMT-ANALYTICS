import { expect, test } from '@playwright/test';

const configured =
  process.env.E2E_RUN_BROWSER === '1' &&
  (Boolean(process.env.E2E_SUPABASE_SESSION_JSON) || (Boolean(process.env.E2E_MANAGER_EMAIL) && Boolean(process.env.E2E_MANAGER_PASSWORD)));

test.describe('Travline Intelligence — Live Preview AI & HCNSEC Verification', () => {
  test.beforeEach(async ({ context }) => {
    if (process.env.VERCEL_OIDC_TOKEN) {
      await context.setExtraHTTPHeaders({
        'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN,
      });
    }
    if (process.env.E2E_SUPABASE_SESSION_JSON && process.env.E2E_SUPABASE_STORAGE_KEY) {
      const storageKey = process.env.E2E_SUPABASE_STORAGE_KEY;
      const sessionJson = process.env.E2E_SUPABASE_SESSION_JSON;
      await context.addInitScript(
        ({ key, val }) => {
          localStorage.setItem(key, val);
          try {
            const parsed = JSON.parse(val);
            if (parsed?.access_token) {
              localStorage.setItem('nmt_auth_token', parsed.access_token);
            }
          } catch {
            // ignore
          }
          localStorage.setItem('travline_lang', 'en');
        },
        { key: storageKey, val: sessionJson },
      );
    } else {
      await context.addInitScript(() => {
        localStorage.setItem('travline_lang', 'en');
      });
    }
  });

  test('verifies HCNSEC provider test, model discovery, playground, grounded AI chat, package draft execution, and executive signals', async ({ page }) => {
    test.skip(!configured, 'BLOCKED: isolated staging session or credentials required');
    test.setTimeout(240_000);

    const serverErrors: Array<{ status: number; url: string; body?: string }> = [];
    page.on('response', async (resp) => {
      const status = resp.status();
      const url = resp.url();
      if (status >= 500 && url.includes('/api/')) {
        let body = '';
        try {
          body = await resp.text();
        } catch {
          body = '';
        }
        serverErrors.push({ status, url, body: body.slice(0, 300) });
      }
    });

    if (!process.env.E2E_SUPABASE_SESSION_JSON) {
      await page.goto('/auth/signin', { waitUntil: 'networkidle' });
      await page.locator('#signin-email').fill(process.env.E2E_MANAGER_EMAIL!);
      await page.locator('#signin-password').fill(process.env.E2E_MANAGER_PASSWORD!);
      await page.getByRole('button', { name: /sign in|prijavi/i }).click();
      await expect(page).not.toHaveURL(/\/auth\/signin/);
    }

    // 1. Open /settings/ai and verify HCNSEC provider
    await page.goto('/settings/ai', { waitUntil: 'networkidle' });
    await expect(page.getByText('HCNSEC AI Models').first()).toBeVisible({ timeout: 20_000 });

    // 2. Test Connection
    const testBtn = page.getByRole('button', { name: /Test Connection|Testiraj vezu/i }).first();
    await testBtn.click();
    await expect(page.getByText(/OK \(\d+ms\)/i).first()).toBeVisible({ timeout: 45_000 });

    // 3. Fetch Available Models -> Model Catalog
    const fetchBtn = page.getByRole('button', { name: /Fetch Available Models|Preuzmi modele/i }).first();
    await fetchBtn.click();
    await expect(page.getByPlaceholder('DeepSeek, Qwen, gpt-4o...')).toBeVisible({ timeout: 45_000 });

    // Verify searchable model catalog has models
    const catalogSearch = page.getByPlaceholder('DeepSeek, Qwen, gpt-4o...');
    await catalogSearch.fill('DeepSeek');
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15_000 });
    await catalogSearch.fill('');

    // 4. Developer Playground live prompt
    await page.getByRole('button', { name: /Developer Playground/i }).click();
    const pgInput = page.getByPlaceholder('Send a synthetic test prompt...');
    await expect(pgInput).toBeVisible();
    await pgInput.fill('Reply with the word: TRAVLINE_PLAYGROUND_OK');
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByText(/TRAVLINE_PLAYGROUND_OK/i).first()).toBeVisible({ timeout: 55_000 });

    // 5. Open Travline AI Assistant via Sidebar & verify no 404
    const sidebarAiLink = page.locator('a[href="/ai-assistant"]').first();
    await expect(sidebarAiLink).toBeVisible();
    await sidebarAiLink.click();
    await expect(page).toHaveURL(/\/ai-assistant$/);
    await expect(page.getByRole('heading', { name: /Travline AI/i })).toBeVisible();

    // 6. Ask a real grounded business question
    const chatInput = page.getByPlaceholder(/Ask Travline AI|Pitajte Travline AI/i);
    await chatInput.fill('What are our upcoming departures and available seat capacities?');
    await page.getByRole('button', { name: /^(Ask|Pošalji)$/i }).click();
    await expect(page.getByText(/tokens/i).first()).toBeVisible({ timeout: 60_000 });

    // Ensure no raw <think> tag leaked into the rendered answer
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('<think>');

    // 7. Generate & Confirm a real Package Draft
    await page.getByLabel(/Action type|Tip akcije/i).selectOption('create_package_draft');
    const draftPrompt = page.getByPlaceholder(/Describe the draft|Opišite zahtjev/i);
    const uniqueSuffix = Date.now().toString().slice(-4);
    await draftPrompt.fill(`Synthetic E2E Istanbul ${uniqueSuffix}, destination Istanbul, 5 days, base price 890 BAM, 50 travelers, bus transport`);
    await page.getByRole('button', { name: /Generate Draft|Generiši nacrt/i }).click();
    await expect(page.getByText(/Pending Approval|Nacrt na čekanju/i).first()).toBeVisible({ timeout: 60_000 });

    // Confirm & Execute the draft
    await page.getByRole('button', { name: /Confirm & Execute|Potvrdi i izvrši/i }).first().click();
    const openLink = page.getByRole('link', { name: /Open created record|Otvori kreirani zapis/i }).first();
    await expect(openLink).toBeVisible({ timeout: 30_000 });
    const href = await openLink.getAttribute('href');
    expect(href).toMatch(/^\/packages\/[0-9a-f-]+/i);

    await openLink.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')));
    await expect(page.getByText(new RegExp(`Istanbul`, 'i')).first()).toBeVisible({ timeout: 15_000 });

    // 8. Check /home Executive Signals
    await page.goto('/home', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Executive & Operational Signals/i)).toBeVisible({ timeout: 15_000 });

    expect(serverErrors, `Unexpected HTTP 5xx API responses: ${JSON.stringify(serverErrors)}`).toEqual([]);
  });
});
