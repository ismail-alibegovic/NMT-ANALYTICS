import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ORG = 'org-1';

const h = vi.hoisted(() => ({
  org: {
    id: 'org-1',
    name: 'Travline Test Agency',
    slug: 'travline-test',
    currency: 'BAM',
    plan: 'trial',
    agency_profiles: ['group_tours'],
    enabled_capabilities: [],
  } as Record<string, any> | null,
  orgModules: [] as Array<{ org_id: string; module_key: string; enabled: boolean }>,
  reservations: [] as any[],
  payments: [] as any[],
  errorTable: undefined as string | undefined,
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@test.local', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = ORG;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let gtFilter: ((row: any) => boolean) | null = null;
      let neqFilter: ((row: any) => boolean) | null = null;
      let limitVal: number | null = null;

      const getSource = () => {
        if (table === 'organizations') return h.org ? [h.org] : [];
        if (table === 'org_modules') return h.orgModules;
        if (table === 'reservations') return h.reservations;
        if (table === 'payments') return h.payments;
        return [];
      };

      const execute = () => {
        if (h.errorTable === table) {
          return { data: null, error: { message: `Synthetic failure on ${table}` }, count: 0 };
        }
        let result = getSource().filter(
          (row) =>
            filters.every((fn) => fn(row)) &&
            (!gtFilter || gtFilter(row)) &&
            (!neqFilter || neqFilter(row)),
        );
        if (limitVal != null) result = result.slice(0, limitVal);
        return { data: result, error: null, count: result.length };
      };

      const api: any = {
        select: vi.fn(() => api),
        eq: vi.fn((col: string, val: unknown) => {
          filters.push((row) => row[col] === val);
          return api;
        }),
        neq: vi.fn((col: string, val: unknown) => {
          neqFilter = (row) => row[col] !== val;
          return api;
        }),
        gt: vi.fn((col: string, val: number) => {
          gtFilter = (row) => Number(row[col] || 0) > val;
          return api;
        }),
        in: vi.fn((col: string, vals: unknown[]) => {
          filters.push((row) => vals.includes(row[col]));
          return api;
        }),
        gte: vi.fn((col: string, val: string) => {
          filters.push((row) => String(row[col] || '') >= val);
          return api;
        }),
        lte: vi.fn((col: string, val: string) => {
          filters.push((row) => String(row[col] || '') <= val);
          return api;
        }),
        order: vi.fn(() => api),
        limit: vi.fn((n: number) => {
          limitVal = n;
          return api;
        }),
        single: vi.fn(async () => {
          const res = execute();
          if (res.error) return res;
          const row = res.data && res.data.length > 0 ? res.data[0] : null;
          return { data: row, error: row ? null : { message: 'Not found' } };
        }),
        maybeSingle: vi.fn(async () => {
          const res = execute();
          if (res.error) return res;
          return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: null };
        }),
        then(resolve: any) {
          return Promise.resolve(execute()).then(resolve);
        },
      };

      return api;
    }),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const meRouter = (await import('../routes/me')).default;
  const paymentsRouter = (await import('../routes/payments')).default;
  const analyticsRouter = (await import('../routes/analytics')).default;
  const { requireModule } = await import('../middleware/requireModule');

  app.use('/api', meRouter);
  app.use('/api', paymentsRouter);
  app.use('/api', analyticsRouter);
  app.get('/api/test-proposals', (req: any, _res: any, next: any) => { req.orgId = ORG; next(); }, requireModule('proposals'), (_req, res) => {
    res.json({ ok: true });
  });
});

beforeEach(() => {
  h.errorTable = undefined;
  h.org = {
    id: ORG,
    name: 'Travline Test Agency',
    slug: 'travline-test',
    currency: 'BAM',
    plan: 'trial',
    agency_profiles: ['group_tours'],
    enabled_capabilities: [],
  };
  h.orgModules = [];
  h.reservations = [];
  h.payments = [];
});

describe('Plan tier normalization, /api/me/context & module entitlements', () => {
  it('grants all 13 core V1 modules on trial plan (including analytics, payments, customers, packages, departures, reservations) even when org_modules is sparse', async () => {
    const res = await request(app).get('/api/me/context');
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('trial');
    expect(res.body.org.currency).toBe('BAM');
    expect(res.body.modules).toEqual(
      expect.arrayContaining([
        'dashboard', 'travel_core', 'analytics', 'documents', 'integrations',
        'customers', 'packages', 'departures', 'reservations', 'payments',
        'transactions', 'reports', 'settings',
      ]),
    );
    expect(res.body.modules).not.toContain('proposals');
  });

  it('normalizes legacy DB plan core -> starter and excludes org_modules enabled=false overrides while refusing plan-external local enables', async () => {
    h.org!.plan = 'core';
    h.orgModules = [
      { org_id: ORG, module_key: 'analytics', enabled: false },
      { org_id: ORG, module_key: 'proposals', enabled: true },
    ];

    const meRes = await request(app).get('/api/me/context');
    expect(meRes.status).toBe(200);
    expect(meRes.body.plan).toBe('starter');
    expect(meRes.body.modules).not.toContain('analytics');
    expect(meRes.body.modules).not.toContain('proposals');
    expect(meRes.body.modules).toContain('customers');

    const disabledRes = await request(app).get('/api/analytics/overview?from=2026-01-01&to=2026-12-31');
    expect(disabledRes.status).toBe(403);
    expect(disabledRes.body.code).toBe('MODULE_DISABLED');

    const unentitledRes = await request(app).get('/api/test-proposals');
    expect(unentitledRes.status).toBe(402);
    expect(unentitledRes.body.code).toBe('MODULE_NOT_ENTITLED');
  });

  it('allows analytics routes on trial plan without HTTP 402 and returns HTTP 500 QUERY_ERROR when DB fails (never fake zeros)', async () => {
    const okRes = await request(app).get('/api/analytics/overview?from=2026-01-01&to=2026-12-31');
    expect(okRes.status).toBe(200);

    h.errorTable = 'reservations';
    const errRes = await request(app).get('/api/analytics/dashboard?from=2026-01-01&to=2026-12-31');
    expect(errRes.status).toBe(500);
    expect(errRes.body.code).toBe('QUERY_ERROR');
  });
});

describe('Financial dashboard reconciliation (/api/payments/dashboard & /api/analytics/overview-v2)', () => {
  it('reconciles non-zero future open balances, partial payments, and refunds accurately and excludes cancelled reservations', async () => {
    const futureDepart = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const pastDepart = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const today = new Date().toISOString().split('T')[0];

    h.reservations = [
      // Partial payment: 1000 total, 400 paid => 600 open balance (future departure)
      {
        id: 'res-partial',
        org_id: ORG,
        customer_id: 'c1',
        customer_name: 'Amina Hadžić',
        customer_phone: '+38761000001',
        total_amount: 1000,
        paid_amount: 400,
        balance_due: 600,
        payment_status: 'partially_paid',
        currency: 'BAM',
        status: 'confirmed',
        reservation_at: `${today}T10:00:00.000Z`,
        departures: { depart_at: futureDepart, packages: { name: 'Istanbul Tour' } },
      },
      // After partial refund: 1520 total, originally paid 1000, refunded 1000 -> paid 0 -> open 1520 (overdue)
      {
        id: 'res-refunded',
        org_id: ORG,
        customer_id: 'c2',
        customer_name: 'Emir Kovač',
        customer_phone: '+38761000002',
        total_amount: 1520,
        paid_amount: 0,
        balance_due: 1520,
        payment_status: 'unpaid',
        currency: 'BAM',
        status: 'confirmed',
        reservation_at: `${today}T11:00:00.000Z`,
        departures: { depart_at: pastDepart, packages: { name: 'Mostar Weekend' } },
      },
      // Cancelled reservation must be excluded from both open balances and overview-v2
      {
        id: 'res-cancelled',
        org_id: ORG,
        customer_id: 'c3',
        customer_name: 'Cancelled Guest',
        customer_phone: '+38761000003',
        total_amount: 999,
        paid_amount: 0,
        balance_due: 999,
        payment_status: 'unpaid',
        currency: 'BAM',
        status: 'cancelled',
        reservation_at: `${today}T12:00:00.000Z`,
        departures: { depart_at: futureDepart, packages: { name: 'Cancelled' } },
      },
    ];

    h.payments = [
      { id: 'p1', org_id: ORG, reservation_id: 'res-partial', amount: 400, currency: 'BAM', status: 'succeeded', payment_date: today, payment_method: 'cash', created_at: `${today}T10:00:00.000Z`, reservations: { customer_name: 'Amina Hadžić', customer_phone: '' } },
      { id: 'p2', org_id: ORG, reservation_id: 'res-refunded', amount: 1000, currency: 'BAM', status: 'refunded', payment_date: today, payment_method: 'card', created_at: `${today}T11:00:00.000Z`, reservations: { customer_name: 'Emir Kovač', customer_phone: '' } },
    ];

    const payRes = await request(app).get('/api/payments/dashboard');
    expect(payRes.status).toBe(200);
    expect(payRes.body.currency).toBe('BAM');
    expect(payRes.body.multiCurrency).toBe(false);
    expect(payRes.body.metrics.openBalanceAmount).toBe(2120);
    expect(payRes.body.metrics.openBalanceCount).toBe(2);
    expect(payRes.body.metrics.overdueAmount).toBe(1520);
    expect(payRes.body.metrics.overdueCount).toBe(1);
    expect(payRes.body.metrics.totalPaidToday).toBe(400);
    expect(payRes.body.openBalanceReservations).toHaveLength(2);

    const ovRes = await request(app).get(`/api/analytics/overview-v2?from=${today}&to=${today}`);
    expect(ovRes.status).toBe(200);
    expect(ovRes.body.reservations_count).toBe(2);
    expect(ovRes.body.total_balance_sum).toBe(2120);
    expect(ovRes.body.total_paid_sum).toBe(400);
  });

  it('keeps BAM, EUR, and USD currencies separate on /api/payments/dashboard and fails closed on DB error', async () => {
    const futureDepart = new Date(Date.now() + 10 * 86_400_000).toISOString();
    h.reservations = [
      { id: 'r-bam', org_id: ORG, customer_name: 'BAM Client', total_amount: 500, paid_amount: 0, balance_due: 500, currency: 'BAM', status: 'confirmed', departures: { depart_at: futureDepart, packages: { name: 'Pkg BAM' } } },
      { id: 'r-eur', org_id: ORG, customer_name: 'EUR Client', total_amount: 200, paid_amount: 50, balance_due: 150, currency: 'EUR', status: 'confirmed', departures: { depart_at: futureDepart, packages: { name: 'Pkg EUR' } } },
      { id: 'r-usd', org_id: ORG, customer_name: 'USD Client', total_amount: 300, paid_amount: 100, balance_due: 200, currency: 'USD', status: 'confirmed', departures: { depart_at: futureDepart, packages: { name: 'Pkg USD' } } },
    ];

    const mixedRes = await request(app).get('/api/payments/dashboard');
    expect(mixedRes.status).toBe(200);
    expect(mixedRes.body.multiCurrency).toBe(true);
    expect(mixedRes.body.availableCurrencies).toEqual(['BAM', 'EUR', 'USD']);
    expect(mixedRes.body.metrics.openBalanceAmount).toBeNull();

    const eurRes = await request(app).get('/api/payments/dashboard?currency=EUR');
    expect(eurRes.status).toBe(200);
    expect(eurRes.body.multiCurrency).toBe(false);
    expect(eurRes.body.currency).toBe('EUR');
    expect(eurRes.body.metrics.openBalanceAmount).toBe(150);
    expect(eurRes.body.metrics.openBalanceCount).toBe(1);

    h.errorTable = 'reservations';
    const errRes = await request(app).get('/api/payments/dashboard');
    expect(errRes.status).toBe(500);
    expect(errRes.body.code).toBe('QUERY_ERROR');
  });
});
