import { expect, test } from '@playwright/test';
import { bs } from '../../src/lib/i18n/bs';
import { en } from '../../src/lib/i18n/en';

for (const lang of ['bs', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 768, 1440] as const) {
      test(`onboarding checklist and staff lifecycle ${lang} ${theme} ${width}`, async ({ page }, info) => {
        const t = lang === 'bs' ? bs : en;
        const otherT = lang === 'bs' ? en : bs;
        const tm = t.settings.teamManagement;
        const otherTm = otherT.settings.teamManagement;

        let onboardingFailsOnce = true;
        let onboardingSkipped = false;
        let teamFailsOnce = true;
        let createConflictOnce = true;

        let members: Array<{
          id: string;
          email: string;
          fullName: string;
          role: string;
          createdAt: string;
          revokedAt: string | null;
          status: 'active' | 'revoked';
        }> = [
          {
            id: 'isolated-fixture-user',
            email: 'director@agency.test',
            fullName: 'Emir Director',
            role: 'director',
            createdAt: '2026-11-01T00:00:00Z',
            revokedAt: null,
            status: 'active',
          },
        ];

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

          if (path === '/onboarding/status' && method === 'GET') {
            if (onboardingFailsOnce) {
              onboardingFailsOnce = false;
              return route.fulfill({ status: 503, json: { error: 'PRIVATE onboarding SQL error' } });
            }
            const hasTeam = members.filter((m) => m.status === 'active').length > 1;
            const steps = [
              { key: 'agency_name', required: true, completed: true },
              { key: 'currency', required: true, completed: true },
              { key: 'first_package', required: true, completed: false },
              { key: 'team_member', required: false, completed: hasTeam },
            ];
            const completed = steps.filter((s) => s.completed).length;
            return route.fulfill({
              json: {
                steps,
                completed,
                total: steps.length,
                percentage: Math.round((completed / steps.length) * 100),
                isComplete: false,
                skipped: onboardingSkipped,
              },
            });
          }

          if (path === '/onboarding/skip' && method === 'POST') {
            onboardingSkipped = true;
            return route.fulfill({ json: { skipped: true } });
          }

          if (path === '/settings/team' && method === 'GET') {
            if (teamFailsOnce) {
              teamFailsOnce = false;
              return route.fulfill({ status: 503, json: { error: 'PRIVATE team read error' } });
            }
            return route.fulfill({ json: { members, smtpRequired: false } });
          }

          if (path === '/settings/team' && method === 'POST') {
            const body = route.request().postDataJSON();
            if (createConflictOnce) {
              createConflictOnce = false;
              return route.fulfill({
                status: 409,
                json: { code: 'USER_EXISTS', message: 'An account with this email already exists.' },
              });
            }
            const created = {
              id: 'staff-1',
              email: body.email,
              fullName: body.fullName,
              role: body.role,
              createdAt: '2026-11-23T12:00:00Z',
              revokedAt: null,
              status: 'active' as const,
            };
            members = [...members, created];
            return route.fulfill({
              status: 201,
              json: { member: created, initialPassword: 'Synth#Pass9876Xy', smtpRequired: false },
            });
          }

          if (path === '/settings/team/staff-1/role' && method === 'PATCH') {
            const body = route.request().postDataJSON();
            members = members.map((m) => (m.id === 'staff-1' ? { ...m, role: body.role } : m));
            return route.fulfill({ json: { member: members.find((m) => m.id === 'staff-1') } });
          }

          if (path === '/settings/team/staff-1/revoke' && method === 'POST') {
            members = members.map((m) =>
              m.id === 'staff-1' ? { ...m, revokedAt: '2026-11-23T13:00:00Z', status: 'revoked' } : m,
            );
            return route.fulfill({ json: { member: members.find((m) => m.id === 'staff-1') } });
          }

          if (path === '/settings/team/staff-1/reactivate' && method === 'POST') {
            members = members.map((m) =>
              m.id === 'staff-1' ? { ...m, revokedAt: null, status: 'active' } : m,
            );
            return route.fulfill({ json: { member: members.find((m) => m.id === 'staff-1') } });
          }

          return route.fulfill({ json: {} });
        });

        await page.goto('/e2e/finance-forms/onboarding-staff.html');

        // 1) Both OnboardingChecklist and TeamManagementPanel fail closed on initial read
        await expect(page.getByText(t.onboarding.loadFailed)).toBeVisible();
        await expect(page.getByText(tm.loadFailed)).toBeVisible();
        await expect(page.getByText('PRIVATE onboarding SQL error')).toHaveCount(0);
        await expect(page.getByText('PRIVATE team read error')).toHaveCount(0);

        // Retry both reads -> valid state renders
        await page.getByRole('button', { name: t.onboarding.retry, exact: true }).click();
        await expect(page.getByText(/2 \/ 4/)).toBeVisible();
        await expect(page.getByRole('link', { name: t.onboarding.addFirstPackage })).toHaveAttribute('href', '/packages');

        await page.getByRole('button', { name: tm.retry, exact: true }).click();
        await expect(page.getByText('Emir Director', { exact: true })).toBeVisible();

        // 2) Create staff -> first attempt fails with USER_EXISTS; live BS <-> EN updates conflict + preserves draft
        await page.getByLabel(tm.fullName, { exact: true }).fill('Amina Agent');
        await page.getByLabel(tm.email, { exact: true }).fill('amina@agency.test');
        await page.getByRole('button', { name: tm.createAction, exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText(tm.errors.USER_EXISTS);
        await expect(page.getByLabel(tm.fullName, { exact: true })).toHaveValue('Amina Agent');

        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert')).toHaveText(otherTm.errors.USER_EXISTS);
        await expect(page.getByLabel(otherTm.fullName, { exact: true })).toHaveValue('Amina Agent');
        await expect(page.getByLabel(otherTm.email, { exact: true })).toHaveValue('amina@agency.test');
        await page.getByTestId('toggle-lang').click();
        await expect(page.getByRole('alert')).toHaveText(tm.errors.USER_EXISTS);

        // Retry create -> succeeds with one-time temporary password (no SMTP)
        await page.getByRole('button', { name: tm.createAction, exact: true }).click();
        await expect(page.getByTestId('initial-password-value')).toHaveText('Synth#Pass9876Xy');
        await expect(page.getByText('Amina Agent', { exact: true })).toBeVisible();

        // 3) Role change, revoke, reactivate, and persisted onboarding skip across reload
        await page.getByLabel(`${tm.roleLabel} Amina Agent`).selectOption('manager');
        await expect(page.getByRole('status')).toHaveText(tm.roleUpdated);

        const revokeButtons = page.getByRole('button', { name: tm.revokeAction, exact: true });
        await revokeButtons.nth(1).click();
        await expect(page.getByText(tm.statusRevoked, { exact: true })).toBeVisible();

        await page.getByRole('button', { name: tm.reactivateAction, exact: true }).click();
        await expect(page.getByRole('status')).toHaveText(tm.memberReactivated);

        await page.getByRole('button', { name: t.onboarding.dismiss, exact: true }).click();
        await expect(page.getByText(t.onboarding.title, { exact: true })).toHaveCount(0);

        // Reload confirms skipped checklist stays hidden and staff member + manager role persist (one-time password is gone)
        await page.reload();
        await expect(page.getByText(t.onboarding.title, { exact: true })).toHaveCount(0);
        await expect(page.getByText('Amina Agent', { exact: true })).toBeVisible();
        await expect(page.getByLabel(`${tm.roleLabel} Amina Agent`)).toHaveValue('manager');
        await expect(page.getByTestId('initial-password-value')).toHaveCount(0);

        if (theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        } else {
          await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
        await page.screenshot({ path: info.outputPath('onboarding-staff-reloaded.png') });
      });
    }
  }
}
