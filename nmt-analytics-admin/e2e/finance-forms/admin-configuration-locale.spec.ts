import { expect, test } from '@playwright/test';
import { bs } from '../../src/lib/i18n/bs';
import { en } from '../../src/lib/i18n/en';

for (const lang of ['bs', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 768, 1440] as const) {
      test(`admin configuration BS/EN, fail-closed recovery & responsive layout ${lang} ${theme} ${width}`, async ({ page }, info) => {
        const t = lang === 'bs' ? bs : en;
        const otherT = lang === 'bs' ? en : bs;

        let profileReadFails = true;
        let profileSaveFails = true;
        let auditReadFails = true;

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

          if (path === '/me/profile' && method === 'GET') {
            if (profileReadFails) {
              return route.fulfill({ status: 503, json: { error: 'PRIVATE_PROFILE_READ_ERR' } });
            }
            return route.fulfill({
              json: {
                profile: { id: 'user-1', role: 'director', full_name: 'Amina Director' },
                organization: { id: 'org-fixture', name: 'Synthetic Agency', slug: 'synthetic-agency' },
              },
            });
          }

          if (path === '/me/profile' && method === 'PATCH') {
            if (profileSaveFails) {
              return route.fulfill({ status: 500, json: { error: 'PRIVATE_PROFILE_PATCH_ERR' } });
            }
            return route.fulfill({ json: { ok: true } });
          }

          if (path === '/admin/audit-logs' && method === 'GET') {
            if (auditReadFails) {
              return route.fulfill({ status: 503, json: { error: 'PRIVATE_AUDIT_ERR' } });
            }
            return route.fulfill({
              json: {
                data: [
                  {
                    id: 'log-1',
                    org_id: 'org-fixture',
                    user_id: 'user-1',
                    action: 'create',
                    entity: 'reservations',
                    entity_id: '12345678-90ab-cdef',
                    details: {},
                    created_at: '2026-10-15T12:00:00Z',
                    profiles: { full_name: 'Amina Director', email: 'amina@agency.test' },
                  },
                ],
                total: 1,
                page: 1,
                limit: 15,
                totalPages: 1,
              },
            });
          }

          if (path === '/settings/branding' && method === 'GET') {
            return route.fulfill({
              json: {
                display_name: 'Synthetic Agency',
                logo_url: '',
                primary_color: '#1D4ED8',
                accent_color: '#0EA5E9',
              },
            });
          }

          if (path === '/integrations/eturista/history' && method === 'GET') {
            return route.fulfill({
              json: {
                data: [
                  { id: 'et-1', submittedAt: '2026-10-12T10:00:00Z', guestCount: 4, responseStatus: 'success' },
                ],
              },
            });
          }

          return route.fulfill({ json: {} });
        });

        // 1) Profile: fail-closed read -> retry -> failed save keeps draft + live BS<->EN toggle
        await page.goto('/e2e/finance-forms/admin-configuration-locale.html?page=profile');
        await expect(page.getByRole('alert')).toHaveText(t.profile.loadError);
        await expect(page.getByText('PRIVATE_PROFILE_READ_ERR')).toHaveCount(0);

        profileReadFails = false;
        await page.getByRole('button', { name: t.profile.retry, exact: true }).click();
        const nameInput = page.getByLabel(t.profile.fullName, { exact: true });
        await expect(nameInput).toHaveValue('Amina Director');
        await nameInput.fill('Amina Draft Saved');

        await page.getByRole('button', { name: t.profile.saveChanges, exact: true }).click();
        await expect(page.getByRole('alert').first()).toHaveText(t.profile.updateError);
        await expect(nameInput).toHaveValue('Amina Draft Saved');

        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert').first()).toHaveText(otherT.profile.updateError);
        await expect(page.getByLabel(otherT.profile.fullName, { exact: true })).toHaveValue('Amina Draft Saved');
        await page.getByTestId('toggle-lang').click();
        profileSaveFails = false;
        await page.getByRole('button', { name: t.profile.saveChanges, exact: true }).click();
        await expect(page.getByRole('status').first()).toHaveText(t.profile.updateSuccess);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        // 2) AuditLogs: fail-closed read -> retry -> localized rows + no overflow
        await page.goto('/e2e/finance-forms/admin-configuration-locale.html?page=audit');
        await expect(page.getByRole('alert').first()).toHaveText(t.auditLogs.loadError);
        auditReadFails = false;
        await page.getByRole('button', { name: t.auditLogs.retry, exact: true }).click();
        await expect(page.getByRole('table').getByText(t.auditLogs.entities.reservations, { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: t.auditLogs.viewDetails, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        // 3) PortalSettings: invalid URL alert + live BS<->EN re-localization
        await page.goto('/e2e/finance-forms/admin-configuration-locale.html?page=portal');
        await page.getByLabel(t.portal.settings.logoUrl, { exact: true }).fill('invalid-url');
        await page.getByRole('button', { name: t.portal.settings.save, exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText(t.portal.settings.invalidLogoUrl);
        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert')).toHaveText(otherT.portal.settings.invalidLogoUrl);
        await page.getByTestId('toggle-lang').click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        // 4) Integrations: localized cards, Copilot, eTurista & modal
        await page.goto('/e2e/finance-forms/admin-configuration-locale.html?page=integrations');
        await expect(page.getByRole('heading', { name: t.integrations.pageTitle })).toBeVisible();
        await expect(page.getByRole('heading', { level: 3, name: t.integrations.cards.eTuristaTitle })).toBeVisible();
        await expect(page.getByText(t.integrations.eTurista.statusSuccess, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);

        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        } else {
          await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
        }
        await page.screenshot({ path: info.outputPath('admin-config-reloaded.png') });
      });
    }
  }
}
