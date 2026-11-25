import { expect, test } from '@playwright/test';
import { bs } from '../../src/lib/i18n/bs';
import { en } from '../../src/lib/i18n/en';

for (const lang of ['bs', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 768, 1440] as const) {
      test(`finance and documents BS/EN, fail-closed recovery & responsive layout ${lang} ${theme} ${width}`, async ({ page }, info) => {
        const t = lang === 'bs' ? bs : en;
        const otherT = lang === 'bs' ? en : bs;
        const u = t.payments.unified;
        const rt = t.operations.receipts;
        const ct = t.operations.contracts;

        let dashFails = true;
        let receiptsFails = true;
        let contractsFails = true;

        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(
          ({ lang, theme }) => {
            localStorage.setItem('travline_lang', lang);
            localStorage.setItem('theme', theme);
          },
          { lang, theme },
        );

        await page.route('**/__form-test-api/**', async (route) => {
          const url = new URL(route.request().url());
          const path = url.pathname.replace('/__form-test-api', '');
          const method = route.request().method();

          if (path === '/payments/dashboard' && method === 'GET') {
            if (dashFails) return route.fulfill({ status: 503, json: { error: 'PRIVATE_DASH_ERR' } });
            return route.fulfill({
              json: {
                metrics: { totalPaidToday: 120, totalPaidThisMonth: 500, overdueAmount: 80, overdueCount: 1, totalPendingAmount: 0, pendingCount: 0 },
                overdueReservations: [{ customerName: 'Synthetic Guest', customerPhone: '+38761000011', packageName: 'Mostar', departureDate: '2026-10-15T00:00:00Z', balanceDue: 80, paymentStatus: 'unpaid', currency: 'BAM' }],
                pendingPayments: [],
                recentPayments: [],
              },
            });
          }

          if (path === '/analytics/payment-statuses' && method === 'GET') {
            return route.fulfill({ json: { breakdown: { succeeded: { total: 500, count: 2 } } } });
          }

          if (path === '/receipts' && method === 'GET') {
            if (receiptsFails) return route.fulfill({ status: 503, json: { error: 'PRIVATE_RECEIPTS_ERR' } });
            return route.fulfill({
              json: {
                data: [{ id: 'rec-1', receiptNumber: 'FR-2026-0001', travelerName: 'Synthetic Guest', receiptType: 'final', amount: 250, paymentMethod: 'bank', issuedAt: '2026-10-15T10:00:00Z' }],
                total: 1,
              },
            });
          }

          if (path === '/contracts' && method === 'GET') {
            if (contractsFails) return route.fulfill({ status: 503, json: { error: 'PRIVATE_CONTRACTS_ERR' } });
            return route.fulfill({
              json: {
                data: [{ id: 'con-1', contractNumber: 'UG-2026-0001', travelerName: 'Synthetic Guest', packageDescription: 'Mostar', totalAmount: 900, contractDate: '2026-10-15T10:00:00Z', status: 'draft' }],
                total: 1,
              },
            });
          }

          if (path === '/reservations' && method === 'GET') {
            return route.fulfill({ json: { data: [] } });
          }

          if (path === '/documents' && method === 'GET') {
            return route.fulfill({
              json: {
                data: [{ id: 'doc-1', name: 'voucher.pdf', type: 'application/pdf', size: 2048, created_at: '2026-10-15T10:00:00Z', profiles: null }],
                total: 1,
              },
            });
          }

          if (path === '/onboarding/templates' && method === 'GET') {
            return route.fulfill({ json: { pdf_template_config: {} } });
          }

          return route.fulfill({ json: { data: [], total: 0 } });
        });

        // 1) UnifiedPayments: fail-closed -> retry -> localized dashboard & tabs -> live BS <-> EN switch
        await page.goto('/e2e/finance-forms/finance-documents-locale.html?page=payments');
        await expect(page.getByRole('alert')).toHaveText(u.dashboardLoadError);
        await expect(page.getByText('PRIVATE_DASH_ERR')).toHaveCount(0);
        dashFails = false;
        await page.getByRole('button', { name: u.retry, exact: true }).click();
        await expect(page.getByText('Synthetic Guest', { exact: true })).toBeVisible();
        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('button', { name: otherT.payments.unified.tabs.payments, exact: true })).toBeVisible();
        await page.getByTestId('toggle-lang').click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        // 2) Receipts: fail-closed -> retry -> modal inline validation re-localization
        await page.goto('/e2e/finance-forms/finance-documents-locale.html?page=receipts');
        await expect(page.getByRole('alert')).toHaveText(rt.loadError);
        receiptsFails = false;
        await page.getByRole('button', { name: rt.retry, exact: true }).click();
        await expect(page.getByText('FR-2026-0001', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: rt.add, exact: true }).click();
        await page.getByRole('button', { name: rt.issueAction, exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText(rt.selectReservation);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        // 3) Contracts: fail-closed -> retry -> localized row + action label
        await page.goto('/e2e/finance-forms/finance-documents-locale.html?page=contracts');
        await expect(page.getByRole('alert')).toHaveText(ct.loadError);
        contractsFails = false;
        await page.getByRole('button', { name: ct.retry, exact: true }).click();
        await expect(page.getByText('UG-2026-0001', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: `${ct.signLabel} UG-2026-0001`, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        // 4) Documents + PdfTemplateEditor
        await page.goto('/e2e/finance-forms/finance-documents-locale.html?page=documents');
        await expect(page.getByText(t.documents.templatesBannerTitle, { exact: true })).toBeVisible();
        await expect(page.getByText(t.documents.systemActor, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        await page.goto('/e2e/finance-forms/finance-documents-locale.html?page=templates');
        await expect(page.getByRole('heading', { name: t.settings.pdfTemplates, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: t.settings.moveUp, exact: true }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        } else {
          await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
        }
        await page.screenshot({ path: info.outputPath('finance-documents-reloaded.png') });
      });
    }
  }
}
