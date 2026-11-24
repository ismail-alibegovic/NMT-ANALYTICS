import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  authGetUser: vi.fn(),
  authCreateUser: vi.fn(),
  authUpdateUserById: vi.fn(),
  authDeleteUser: vi.fn(),
  logAuditEntry: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mocks.from(...args),
    rpc: (...args: any[]) => mocks.rpc(...args),
    auth: {
      getUser: (...args: any[]) => mocks.authGetUser(...args),
      admin: {
        createUser: (...args: any[]) => mocks.authCreateUser(...args),
        updateUserById: (...args: any[]) => mocks.authUpdateUserById(...args),
        deleteUser: (...args: any[]) => mocks.authDeleteUser(...args),
      },
    },
  },
}));

vi.mock('../middleware/auditLogger', () => ({
  logAuditEntry: (...args: any[]) => mocks.logAuditEntry(...args),
}));

import { authenticateToken } from '../middleware/authenticateToken';
import onboardingRouter from '../routes/onboarding';
import staffRouter from '../routes/staff';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const DIRECTOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createStaffApp() {
  const app = express();
  app.use(express.json());
  app.use('/settings/team', staffRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logAuditEntry.mockResolvedValue(undefined);
  mocks.authDeleteUser.mockResolvedValue({ data: null, error: null });
  mocks.authUpdateUserById.mockResolvedValue({ data: { user: { id: STAFF_A } }, error: null });
});

describe('ONBOARD-01: revoked account enforcement & fail-closed onboarding status', () => {
  it('immediately rejects an existing JWT with 403 ACCOUNT_REVOKED when profile.revoked_at is set', async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: STAFF_A, email: 'revoked@agency-a.test' } },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: STAFF_A,
                  org_id: ORG_A,
                  role: 'agent',
                  revoked_at: '2026-11-23T10:00:00Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const app = express();
    app.get('/protected', authenticateToken, (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-but-revoked-jwt');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_REVOKED');
  });

  it('fails closed on GET /onboarding/status when a dependent count query errors instead of reporting 0', async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: DIRECTOR_A, email: 'director@agency-a.test' } },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: (_sel: string, opts?: { count?: string; head?: boolean }) => ({
            eq: () =>
              opts?.head
                ? { is: async () => ({ count: 2, error: null }) }
                : {
                    single: async () => ({
                      data: { id: DIRECTOR_A, org_id: ORG_A, role: 'director', revoked_at: null },
                      error: null,
                    }),
                  },
          }),
        };
      }
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: ORG_A, name: 'Agency A', currency: 'BAM', onboarding_skipped: false },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'org_branding') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { logo_url: null, primary_color: null, pdf_template_config: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'packages') {
        return {
          select: () => ({
            eq: async () => ({ count: null, error: { code: '57014', message: 'statement timeout' } }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({ count: 0, error: null }),
        }),
      };
    });

    const app = express();
    app.use('/onboarding', onboardingRouter);

    const res = await request(app)
      .get('/onboarding/status')
      .set('Authorization', 'Bearer director-token');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('returns persisted skipped flag and canonical steps (including pdf_template) on GET /onboarding/status', async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: DIRECTOR_A, email: 'director@agency-a.test' } },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: (_sel: string, opts?: { count?: string; head?: boolean }) => ({
            eq: () =>
              opts?.head
                ? { is: async () => ({ count: 2, error: null }) }
                : {
                    single: async () => ({
                      data: { id: DIRECTOR_A, org_id: ORG_A, role: 'director', revoked_at: null },
                      error: null,
                    }),
                  },
          }),
        };
      }
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: ORG_A, name: 'Agency A', currency: 'BAM', onboarding_skipped: true },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'org_branding') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { logo_url: 'https://cdn.test/logo.png', primary_color: '#112233', pdf_template_config: { invoice: {} } },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({ count: 1, error: null }),
        }),
      };
    });

    const app = express();
    app.use('/onboarding', onboardingRouter);

    const res = await request(app)
      .get('/onboarding/status')
      .set('Authorization', 'Bearer director-token');

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    const stepMap = Object.fromEntries((res.body.steps || []).map((s: any) => [s.key, s.completed]));
    expect(stepMap.agency_name).toBe(true);
    expect(stepMap.logo).toBe(true);
    expect(stepMap.first_package).toBe(true);
    expect(stepMap.pdf_template).toBe(true);
    expect(stepMap.team_member).toBe(true);
  });
});

describe('ONBOARD-01: /settings/team staff provisioning, role changes, revocation and tenant boundaries', () => {
  function mockDirectorAuth(role: string = 'director') {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: DIRECTOR_A, email: 'director@agency-a.test' } },
      error: null,
    });
    return { id: DIRECTOR_A, org_id: ORG_A, role, revoked_at: null };
  }

  it('denies non-director roles (manager) from listing or creating staff', async () => {
    const authProfile = mockDirectorAuth('manager');
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: authProfile, error: null }) }),
      }),
    }));

    const app = createStaffApp();
    const res = await request(app)
      .get('/settings/team')
      .set('Authorization', 'Bearer manager-token');

    expect(res.status).toBe(403);
  });

  it('provisions staff without SMTP using service-role app_metadata, returns one-time password, and audits without password leakage', async () => {
    const authProfile = mockDirectorAuth('director');
    let profileCalls = 0;
    mocks.authCreateUser.mockResolvedValue({
      data: { user: { id: STAFF_A, email: 'agent@agency-a.test' } },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        profileCalls++;
        if (profileCalls === 1) {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: authProfile, error: null }) }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: STAFF_A,
                  org_id: ORG_A,
                  email: 'agent@agency-a.test',
                  full_name: 'Amina Agent',
                  role: 'agent',
                  created_at: '2026-11-23T12:00:00Z',
                  revoked_at: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const app = createStaffApp();
    const res = await request(app)
      .post('/settings/team')
      .set('Authorization', 'Bearer director-token')
      .send({ email: 'Agent@Agency-A.test', fullName: 'Amina Agent', role: 'agent' });

    expect(res.status).toBe(201);
    expect(res.body.smtpRequired).toBe(false);
    expect(res.body.member).toMatchObject({
      id: STAFF_A,
      email: 'agent@agency-a.test',
      fullName: 'Amina Agent',
      role: 'agent',
      status: 'active',
    });
    expect(typeof res.body.initialPassword).toBe('string');
    expect(res.body.initialPassword.length).toBe(16);

    expect(mocks.authCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'agent@agency-a.test',
        email_confirm: true,
        app_metadata: {
          travline_staff_org_id: ORG_A,
          travline_staff_role: 'agent',
        },
      }),
    );

    expect(mocks.logAuditEntry).toHaveBeenCalledTimes(1);
    const auditArg = JSON.stringify(mocks.logAuditEntry.mock.calls[0][0]);
    expect(auditArg).not.toContain(res.body.initialPassword);
    expect(auditArg).not.toContain('agent@agency-a.test');
  });

  it('rejects assigning super_admin role with 400 and never invokes auth.admin.createUser', async () => {
    const authProfile = mockDirectorAuth('director');
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: authProfile, error: null }) }),
      }),
    }));

    const app = createStaffApp();
    const res = await request(app)
      .post('/settings/team')
      .set('Authorization', 'Bearer director-token')
      .send({ email: 'escalate@agency-a.test', fullName: 'Bad Actor', role: 'super_admin' });

    expect(res.status).toBe(400);
    expect(mocks.authCreateUser).not.toHaveBeenCalled();
  });

  it('attaches staff profile atomically via RPC when GoTrue inserts auth.users before app_metadata', async () => {
    const authProfile = mockDirectorAuth('director');
    let profileCalls = 0;
    mocks.authCreateUser.mockResolvedValue({
      data: { user: { id: STAFF_A, email: 'agent@agency-a.test' } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: {
        id: STAFF_A,
        org_id: ORG_A,
        email: 'agent@agency-a.test',
        full_name: 'Amina Agent',
        role: 'agent',
        created_at: '2026-11-23T12:00:00Z',
        revoked_at: null,
      },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        profileCalls++;
        if (profileCalls === 1) {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: authProfile, error: null }) }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STAFF_A, org_id: ORG_B, role: 'director', revoked_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const app = createStaffApp();
    const res = await request(app)
      .post('/settings/team')
      .set('Authorization', 'Bearer director-token')
      .send({ email: 'agent@agency-a.test', fullName: 'Amina Agent', role: 'agent' });

    expect(res.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('assign_staff_profile_atomic', {
      p_user_id: STAFF_A,
      p_org_id: ORG_A,
      p_role: 'agent',
      p_email: 'agent@agency-a.test',
      p_full_name: 'Amina Agent',
    });
    expect(res.body.member.role).toBe('agent');
    expect(mocks.authDeleteUser).not.toHaveBeenCalled();
  });

  it('rolls back created Auth user and orphan org with 503 MIGRATION_PENDING if assign_staff_profile_atomic is missing', async () => {
    const authProfile = mockDirectorAuth('director');
    let profileCalls = 0;
    const deletedOrgs: string[] = [];
    mocks.authCreateUser.mockResolvedValue({
      data: { user: { id: STAFF_A, email: 'agent@agency-a.test' } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.assign_staff_profile_atomic' },
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        profileCalls++;
        if (profileCalls === 1) {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: authProfile, error: null }) }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STAFF_A, org_id: ORG_B, role: 'director', revoked_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organizations') {
        return {
          delete: () => ({
            eq: async (_col: string, val: string) => {
              deletedOrgs.push(val);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const app = createStaffApp();
    const res = await request(app)
      .post('/settings/team')
      .set('Authorization', 'Bearer director-token')
      .send({ email: 'agent@agency-a.test', fullName: 'Amina Agent', role: 'agent' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('MIGRATION_PENDING');
    expect(mocks.authDeleteUser).toHaveBeenCalledWith(STAFF_A);
    expect(deletedOrgs).toEqual([ORG_B]);
  });

  it('blocks self-revocation, blocks demoting last active director, and denies cross-org member with 404', async () => {
    const authProfile = mockDirectorAuth('director');

    // 1) Self-revocation -> 409 CANNOT_REVOKE_SELF
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: authProfile, error: null }) }),
      }),
    }));
    const app = createStaffApp();
    const selfRes = await request(app)
      .post(`/settings/team/${DIRECTOR_A}/revoke`)
      .set('Authorization', 'Bearer director-token');
    expect(selfRes.status).toBe(409);
    expect(selfRes.body.code).toBe('CANNOT_REVOKE_SELF');

    // 2) Cross-org member -> 404 MEMBER_NOT_FOUND
    let calls = 0;
    mocks.from.mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: authProfile, error: null }) }) }) };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
      };
    });
    const crossOrgRes = await request(app)
      .patch(`/settings/team/${STAFF_B}/role`)
      .set('Authorization', 'Bearer director-token')
      .send({ role: 'viewer' });
    expect(crossOrgRes.status).toBe(404);
    expect(crossOrgRes.body.code).toBe('MEMBER_NOT_FOUND');

    // 3) Demoting last active director -> 409 LAST_DIRECTOR_PROTECTED
    let demoteCalls = 0;
    mocks.from.mockImplementation(() => {
      demoteCalls++;
      if (demoteCalls === 1) {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: authProfile, error: null }) }) }) };
      }
      if (demoteCalls === 2) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: DIRECTOR_A, org_id: ORG_A, role: 'director', revoked_at: null },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: async () => ({ count: 1, error: null }),
            }),
          }),
        }),
      };
    });
    const lastDirRes = await request(app)
      .patch(`/settings/team/${DIRECTOR_A}/role`)
      .set('Authorization', 'Bearer director-token')
      .send({ role: 'manager' });
    expect(lastDirRes.status).toBe(409);
    expect(lastDirRes.body.code).toBe('LAST_DIRECTOR_PROTECTED');
  });

  it('revokes and reactivates a staff member with Auth ban/unban and audit entries', async () => {
    const authProfile = mockDirectorAuth('director');
    let step = 0;
    mocks.from.mockImplementation(() => {
      step++;
      if (step === 1 || step === 4) {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: authProfile, error: null }) }) }) };
      }
      if (step === 2) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: STAFF_A, org_id: ORG_A, email: 'agent@agency-a.test', full_name: 'Amina', role: 'agent', created_at: '2026-11-23T00:00:00Z', revoked_at: null },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (step === 3) {
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: STAFF_A, org_id: ORG_A, email: 'agent@agency-a.test', full_name: 'Amina', role: 'agent', created_at: '2026-11-23T00:00:00Z', revoked_at: '2026-11-23T12:00:00Z' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (step === 5) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: STAFF_A, org_id: ORG_A, email: 'agent@agency-a.test', full_name: 'Amina', role: 'agent', created_at: '2026-11-23T00:00:00Z', revoked_at: '2026-11-23T12:00:00Z' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: STAFF_A, org_id: ORG_A, email: 'agent@agency-a.test', full_name: 'Amina', role: 'agent', created_at: '2026-11-23T00:00:00Z', revoked_at: null },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    });

    const app = createStaffApp();
    const revokeRes = await request(app)
      .post(`/settings/team/${STAFF_A}/revoke`)
      .set('Authorization', 'Bearer director-token');
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.member.status).toBe('revoked');
    expect(mocks.authUpdateUserById).toHaveBeenCalledWith(STAFF_A, { ban_duration: '876000h' });

    const reactivateRes = await request(app)
      .post(`/settings/team/${STAFF_A}/reactivate`)
      .set('Authorization', 'Bearer director-token');
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.member.status).toBe('active');
    expect(mocks.authUpdateUserById).toHaveBeenCalledWith(STAFF_A, { ban_duration: 'none' });
    expect(mocks.logAuditEntry).toHaveBeenCalledTimes(2);
  });
});
