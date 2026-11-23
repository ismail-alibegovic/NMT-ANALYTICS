import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const auth = process.env.E2E_SUPABASE_URL || '';
const api = process.env.E2E_API_URL || '';
const configured =
  /^http:\/\/(127\.0\.0\.1|localhost):/.test(auth) &&
  /^http:\/\/(127\.0\.0\.1|localhost):/.test(api) &&
  Boolean(process.env.E2E_SUPABASE_ANON_KEY && process.env.E2E_MANAGER_PASSWORD);

// Never store tokens or one-time passwords in Playwright traces/videos/screenshots.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('two-agency onboarding checklist and staff provisioning, role change, cross-tenant denial and immediate revocation without SMTP', async ({
  request,
}) => {
  test.skip(!configured, 'Requires disposable localhost Auth/API and local Mailpit capture');
  test.setTimeout(90_000);

  const headers = { apikey: process.env.E2E_SUPABASE_ANON_KEY! };
  const agencyNames = [`Agency Alpha ${randomUUID()}`, `Agency Beta ${randomUUID()}`];
  const directors = agencyNames.map((orgName, idx) => ({
    orgName,
    email: `onboard-dir-${idx}-${randomUUID()}@pilot-auth.test`,
    password: process.env.E2E_MANAGER_PASSWORD!,
  }));

  const directorTokens: string[] = [];
  const directorContexts: Array<{ user: { id: string }; org: { id: string }; role: string }> = [];

  for (const dir of directors) {
    const signup = await request.post(`${api}/api/auth/signup`, {
      data: { email: dir.email, password: dir.password, org_name: dir.orgName, full_name: `Director ${dir.orgName}` },
    });
    expect(signup.status()).toBe(201);

    let verificationLink = '';
    await expect(async () => {
      const messages = await (await request.get('http://127.0.0.1:54324/api/v1/messages')).json();
      const message = (messages.messages || []).find((item: { ID: string; To: { Address: string }[] }) =>
        item.To?.some((to) => to.Address === dir.email),
      );
      expect(Boolean(message)).toBe(true);
      const detail = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
      verificationLink =
        ((detail.HTML || detail.Text || '').match(/https?:[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/) || [])[0]?.replace(
          /&amp;/g,
          '&',
        ) || '';
      expect(Boolean(verificationLink)).toBe(true);
    }).toPass({ timeout: 15_000 });

    expect([302, 303]).toContain((await request.get(verificationLink, { maxRedirects: 0 })).status());
    const login = await request.post(`${auth}/auth/v1/token?grant_type=password`, {
      headers,
      data: { email: dir.email, password: dir.password },
    });
    expect(login.status()).toBe(200);
    const token = (await login.json()).access_token as string;
    directorTokens.push(token);

    const ctxRes = await request.get(`${api}/api/me/context`, { headers: { Authorization: `Bearer ${token}` } });
    expect(ctxRes.status()).toBe(200);
    directorContexts.push(await ctxRes.json());
  }

  expect(directorContexts[0].org.id).not.toBe(directorContexts[1].org.id);

  // 1) Onboarding status starts with team_member=false, skipped=false
  const initialOnboard = await request.get(`${api}/api/onboarding/status`, {
    headers: { Authorization: `Bearer ${directorTokens[0]}` },
  });
  expect(initialOnboard.status()).toBe(200);
  const initialBody = await initialOnboard.json();
  expect(initialBody.skipped).toBe(false);
  expect(initialBody.steps.find((s: { key: string }) => s.key === 'team_member')?.completed).toBe(false);

  // 2) Provision staff member in Agency Alpha WITHOUT SMTP (no email link needed)
  const staffEmail = `staff-alpha-${randomUUID()}@pilot-auth.test`;
  const createStaff = await request.post(`${api}/api/settings/team`, {
    headers: { Authorization: `Bearer ${directorTokens[0]}` },
    data: { email: staffEmail, fullName: 'Synthetic Agent Alpha', role: 'agent' },
  });
  expect(createStaff.status()).toBe(201);
  const createdBody = await createStaff.json();
  expect(createdBody.smtpRequired).toBe(false);
  expect(createdBody.member.role).toBe('agent');
  expect(typeof createdBody.initialPassword).toBe('string');
  const staffId = createdBody.member.id as string;

  // 3) Staff signs in immediately with one-time password (zero SMTP dependency)
  const staffLogin = await request.post(`${auth}/auth/v1/token?grant_type=password`, {
    headers,
    data: { email: staffEmail, password: createdBody.initialPassword },
  });
  expect(staffLogin.status()).toBe(200);
  const staffToken = (await staffLogin.json()).access_token as string;

  const staffCtx = await request.get(`${api}/api/me/context`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  expect(staffCtx.status()).toBe(200);
  const staffCtxBody = await staffCtx.json();
  expect(staffCtxBody.org.id).toBe(directorContexts[0].org.id);
  expect(staffCtxBody.role).toBe('agent');

  // Agent cannot access director-only team or onboarding routes
  expect(
    (await request.get(`${api}/api/settings/team`, { headers: { Authorization: `Bearer ${staffToken}` } })).status(),
  ).toBe(403);
  expect(
    (await request.get(`${api}/api/onboarding/status`, { headers: { Authorization: `Bearer ${staffToken}` } })).status(),
  ).toBe(403);

  // Onboarding status now reflects team_member=true
  const afterTeamOnboard = await (
    await request.get(`${api}/api/onboarding/status`, {
      headers: { Authorization: `Bearer ${directorTokens[0]}` },
    })
  ).json();
  expect(afterTeamOnboard.steps.find((s: { key: string }) => s.key === 'team_member')?.completed).toBe(true);

  // 4) Director changes staff role agent -> manager
  const promoteRes = await request.patch(`${api}/api/settings/team/${staffId}/role`, {
    headers: { Authorization: `Bearer ${directorTokens[0]}` },
    data: { role: 'manager' },
  });
  expect(promoteRes.status()).toBe(200);
  const promotedCtx = await (
    await request.get(`${api}/api/me/context`, { headers: { Authorization: `Bearer ${staffToken}` } })
  ).json();
  expect(promotedCtx.role).toBe('manager');

  // 5) Cross-tenant isolation: Agency Beta director cannot see or touch Agency Alpha's staff
  const betaTeam = await (
    await request.get(`${api}/api/settings/team`, { headers: { Authorization: `Bearer ${directorTokens[1]}` } })
  ).json();
  expect((betaTeam.members || []).some((m: { id: string }) => m.id === staffId)).toBe(false);
  expect(
    (
      await request.patch(`${api}/api/settings/team/${staffId}/role`, {
        headers: { Authorization: `Bearer ${directorTokens[1]}` },
        data: { role: 'viewer' },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`${api}/api/settings/team/${staffId}/revoke`, {
        headers: { Authorization: `Bearer ${directorTokens[1]}` },
      })
    ).status(),
  ).toBe(404);

  // 6) Safeguards: no super_admin escalation, no self-revoke, no last-director demotion
  expect(
    (
      await request.post(`${api}/api/settings/team`, {
        headers: { Authorization: `Bearer ${directorTokens[0]}` },
        data: { email: `esc-${randomUUID()}@pilot-auth.test`, fullName: 'Escalation', role: 'super_admin' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`${api}/api/settings/team/${directorContexts[0].user.id}/revoke`, {
        headers: { Authorization: `Bearer ${directorTokens[0]}` },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.patch(`${api}/api/settings/team/${directorContexts[0].user.id}/role`, {
        headers: { Authorization: `Bearer ${directorTokens[0]}` },
        data: { role: 'manager' },
      })
    ).status(),
  ).toBe(409);

  // 7) Immediate revocation: existing unexpired JWT fails with 403 ACCOUNT_REVOKED and new login fails
  const revokeRes = await request.post(`${api}/api/settings/team/${staffId}/revoke`, {
    headers: { Authorization: `Bearer ${directorTokens[0]}` },
  });
  expect(revokeRes.status()).toBe(200);

  const revokedApiCall = await request.get(`${api}/api/me/context`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  expect(revokedApiCall.status()).toBe(403);
  expect((await revokedApiCall.json()).code).toBe('ACCOUNT_REVOKED');

  const revokedLogin = await request.post(`${auth}/auth/v1/token?grant_type=password`, {
    headers,
    data: { email: staffEmail, password: createdBody.initialPassword },
  });
  expect(revokedLogin.status()).toBeGreaterThanOrEqual(400);

  // 8) Reactivation restores sign-in and API access
  const reactivateRes = await request.post(`${api}/api/settings/team/${staffId}/reactivate`, {
    headers: { Authorization: `Bearer ${directorTokens[0]}` },
  });
  expect(reactivateRes.status()).toBe(200);

  const restoredLogin = await request.post(`${auth}/auth/v1/token?grant_type=password`, {
    headers,
    data: { email: staffEmail, password: createdBody.initialPassword },
  });
  expect(restoredLogin.status()).toBe(200);
  const restoredToken = (await restoredLogin.json()).access_token as string;
  expect(
    (await request.get(`${api}/api/me/context`, { headers: { Authorization: `Bearer ${restoredToken}` } })).status(),
  ).toBe(200);

  // 9) Onboarding skip persists in DB
  expect(
    (await request.post(`${api}/api/onboarding/skip`, { headers: { Authorization: `Bearer ${directorTokens[0]}` } })).status(),
  ).toBe(200);
  const skippedStatus = await (
    await request.get(`${api}/api/onboarding/status`, { headers: { Authorization: `Bearer ${directorTokens[0]}` } })
  ).json();
  expect(skippedStatus.skipped).toBe(true);
});
