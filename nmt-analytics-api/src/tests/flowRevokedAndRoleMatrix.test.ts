import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const DEP_ID = '33333333-3333-4333-8333-333333333333';
const RES_ID = '44444444-4444-4444-8444-444444444444';

const probe = vi.hoisted(() => ({
  profileById: new Map<string, { org_id: string; role: string; revoked_at: string | null }>(),
  currentProfile: undefined as { org_id: string; role: string; revoked_at: string | null } | undefined,
  authContextLookups: 0,
  resourceQueries: 0,
  rpcCalls: 0,
}));

function makeTableBuilder(table: string) {
  let isSingleAuthLookup = false;
  let counted = false;

  const markResource = () => {
    if (!counted && !isSingleAuthLookup) {
      counted = true;
      probe.resourceQueries++;
    }
  };

  const b: any = {
    select: vi.fn((cols?: string) => {
      if (table === 'profiles' && typeof cols === 'string' && cols.includes('revoked_at') && !cols.includes('email')) {
        isSingleAuthLookup = true;
      } else {
        markResource();
      }
      return b;
    }),
    eq: vi.fn(() => b),
    neq: vi.fn(() => { markResource(); return b; }),
    in: vi.fn(() => { markResource(); return b; }),
    or: vi.fn(() => { markResource(); return b; }),
    order: vi.fn(() => { markResource(); return b; }),
    range: vi.fn(() => { markResource(); return b; }),
    insert: vi.fn(() => { markResource(); return b; }),
    update: vi.fn(() => { markResource(); return b; }),
    delete: vi.fn(() => { markResource(); return b; }),
    single: vi.fn(async () => {
      if (isSingleAuthLookup) {
        probe.authContextLookups++;
        return { data: probe.currentProfile ?? null, error: probe.currentProfile ? null : { message: 'Not found' } };
      }
      markResource();
      return { data: null, error: null };
    }),
    maybeSingle: vi.fn(async () => {
      markResource();
      return { data: null, error: null };
    }),
    then: (resolve: any, reject: any) => {
      markResource();
      return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
    },
  };
  return b;
}

const probeWithCurrent = probe as typeof probe & {
  currentProfile?: { org_id: string; role: string; revoked_at: string | null };
};

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeTableBuilder(table)),
    rpc: vi.fn(async () => {
      probe.rpcCalls++;
      return { data: [], error: null };
    }),
  },
  handleSupabaseError: (res: any, _err: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Missing token' });
    }
    const role = req.headers['x-test-role'];
    const revoked = req.headers['x-test-revoked'] === 'true';
    const roleForProfile = typeof role === 'string' && role !== '__missing__' ? role : '';
    probeWithCurrent.currentProfile = {
      org_id: ORG_ID,
      role: roleForProfile,
      revoked_at: revoked ? '2026-11-24T10:00:00Z' : null,
    };
    req.user = {
      id: 'user-matrix-1',
      email: 'matrix@test.invalid',
      role: roleForProfile || undefined,
    };
    // Intentionally omit req.orgId so real requireOrgContext inspects profile & revoked_at.
    next();
  },
}));

vi.mock('../middleware/auditLogger', () => ({
  logAuditEntry: vi.fn(),
  auditLog: () => (_req: any, _res: any, next: any) => next(),
  auditLogger: () => (_req: any, _res: any, next: any) => next(),
}));

let app: Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', (await import('../routes/excursions')).default);
  app.use('/api', (await import('../routes/rooming')).default);
  app.use('/api', (await import('../routes/seats')).default);
  app.use('/api', (await import('../routes/accommodation')).default);
  app.use('/api', (await import('../routes/departurePassengers')).default);
  app.use('/api', (await import('../routes/commissionRules')).default);
  app.use('/api', (await import('../routes/analytics')).default);
  app.use('/api/settings/team', (await import('../routes/staff')).default);
  app.use((_err: any, _req: any, res: any, _next: any) => res.status(500).json({ code: 'INTERNAL_ERROR' }));
});

beforeEach(() => {
  probe.authContextLookups = 0;
  probe.resourceQueries = 0;
  probe.rpcCalls = 0;
  probeWithCurrent.currentProfile = undefined;
});

const OPERATOR_AND_ADMIN_ENDPOINTS: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; path: string; body?: Record<string, unknown> }> = [
  { method: 'get', path: '/api/excursions' },
  { method: 'post', path: '/api/excursions', body: { fullName: 'Synthetic', phone: '123' } },
  { method: 'patch', path: `/api/excursions/${RES_ID}`, body: { notes: 'x' } },
  { method: 'get', path: `/api/excursions/${DEP_ID}/bus-list` },
  { method: 'get', path: `/api/excursions/${DEP_ID}/ruming-list` },
  { method: 'post', path: `/api/departures/${DEP_ID}/rooming/proposal` },
  { method: 'post', path: `/api/departures/${DEP_ID}/rooming/apply`, body: { stateFingerprint: 'fp', replaceableAssignmentIds: [], proposedAssignments: [] } },
  { method: 'patch', path: `/api/room-slot-assignments/${RES_ID}/lock`, body: { locked: true } },
  { method: 'post', path: '/api/seats/auto-assign' },
  { method: 'post', path: `/api/departures/${DEP_ID}/seating/proposal` },
  { method: 'post', path: `/api/departures/${DEP_ID}/seating/apply`, body: { stateFingerprint: 'fp', proposedAssignments: [] } },
  { method: 'patch', path: `/api/departure-passengers/${RES_ID}/seat`, body: { seatNumber: 1 } },
  { method: 'patch', path: `/api/departure-passengers/${RES_ID}/seat-lock`, body: { locked: true } },
  { method: 'get', path: '/api/commission-rules' },
  { method: 'get', path: '/api/settings/team' },
];

describe('FLOW-01 fail-closed revoked user and role boundary matrix', () => {
  it.each(OPERATOR_AND_ADMIN_ENDPOINTS)('rejects unauthenticated $method $path with 401 and zero DB queries', async ({ method, path, body }) => {
    const req = request(app)[method](path);
    if (body) req.send(body);
    const res = await req;
    expect(res.status).toBe(401);
    expect(probe.authContextLookups).toBe(0);
    expect(probe.resourceQueries).toBe(0);
    expect(probe.rpcCalls).toBe(0);
  });

  it.each(OPERATOR_AND_ADMIN_ENDPOINTS)('blocks revoked account via real requireOrgContext on $method $path with 403 ACCOUNT_REVOKED and zero downstream queries', async ({ method, path, body }) => {
    const req = request(app)[method](path)
      .set('Authorization', 'Bearer synthetic-token')
      .set('x-test-role', 'director')
      .set('x-test-revoked', 'true');
    if (body) req.send(body);
    const res = await req;
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_REVOKED');
    expect(probe.authContextLookups).toBe(1);
    expect(probe.resourceQueries).toBe(0);
    expect(probe.rpcCalls).toBe(0);
  });

  it.each(OPERATOR_AND_ADMIN_ENDPOINTS)('blocks viewer on $method $path with 403 and zero downstream resource queries', async ({ method, path, body }) => {
    const req = request(app)[method](path)
      .set('Authorization', 'Bearer synthetic-token')
      .set('x-test-role', 'viewer');
    if (body) req.send(body);
    const res = await req;
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(probe.resourceQueries).toBe(0);
    expect(probe.rpcCalls).toBe(0);
  });

  it.each(['__missing__', 'contractor', 'sub_agent'])('rejects invalid/missing role %s on GET /api/excursions', async (badRole) => {
    const res = await request(app)
      .get('/api/excursions')
      .set('Authorization', 'Bearer synthetic-token')
      .set('x-test-role', badRole);
    expect([401, 403]).toContain(res.status);
    expect(probe.resourceQueries).toBe(0);
  });

  it('allows agent to read GET /api/excursions while denying manager-only and director-only routes', async () => {
    const allowed = await request(app)
      .get('/api/excursions')
      .set('Authorization', 'Bearer synthetic-token')
      .set('x-test-role', 'agent');
    expect(allowed.status).toBe(200);
    expect(probe.resourceQueries).toBeGreaterThan(0);

    probe.resourceQueries = 0;
    const managerAndDirectorOnly: Array<{ method: 'get' | 'post' | 'patch'; path: string; body?: Record<string, unknown> }> = [
      { method: 'post', path: '/api/excursions', body: { fullName: 'Synthetic', phone: '123' } },
      { method: 'get', path: `/api/excursions/${DEP_ID}/bus-list` },
      { method: 'get', path: `/api/excursions/${DEP_ID}/ruming-list` },
      { method: 'post', path: `/api/departures/${DEP_ID}/rooming/proposal` },
      { method: 'post', path: `/api/departures/${DEP_ID}/rooming/apply`, body: { stateFingerprint: 'fp', replaceableAssignmentIds: [], proposedAssignments: [] } },
      { method: 'patch', path: `/api/room-slot-assignments/${RES_ID}/lock`, body: { locked: true } },
      { method: 'post', path: `/api/departures/${DEP_ID}/seating/proposal` },
      { method: 'post', path: `/api/departures/${DEP_ID}/seating/apply`, body: { stateFingerprint: 'fp', proposedAssignments: [] } },
      { method: 'patch', path: `/api/departure-passengers/${RES_ID}/seat`, body: { seatNumber: 1 } },
      { method: 'patch', path: `/api/departure-passengers/${RES_ID}/seat-lock`, body: { locked: true } },
      { method: 'get', path: '/api/analytics/overview-v2' },
      { method: 'get', path: '/api/commission-rules' },
      { method: 'get', path: '/api/settings/team' },
    ];

    for (const ep of managerAndDirectorOnly) {
      const req = request(app)[ep.method](ep.path)
        .set('Authorization', 'Bearer synthetic-token')
        .set('x-test-role', 'agent');
      if (ep.body) req.send(ep.body);
      const res = await req;
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(probe.resourceQueries).toBe(0);
      expect(probe.rpcCalls).toBe(0);
    }
  });

  it('denies manager on director-only routes with zero downstream resource queries', async () => {
    for (const ep of [
      { method: 'get' as const, path: '/api/commission-rules' },
      { method: 'get' as const, path: '/api/settings/team' },
      { method: 'post' as const, path: `/api/settings/team/${RES_ID}/revoke` },
    ]) {
      const res = await request(app)[ep.method](ep.path)
        .set('Authorization', 'Bearer synthetic-token')
        .set('x-test-role', 'manager');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(probe.resourceQueries).toBe(0);
    }
  });
});
