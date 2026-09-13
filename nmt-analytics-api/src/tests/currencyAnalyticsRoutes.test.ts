import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ORG = 'org-1';

let rows: Record<string, any[]> = {};

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = ORG;
    next();
  },
}));

vi.mock('../middleware/requireModule', () => ({
  requireModule: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => query(table)),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

function compareValue(rowValue: unknown, filterValue: unknown, op: 'gte' | 'lte') {
  const left = String(rowValue || '');
  const right = String(filterValue || '');
  return op === 'gte' ? left >= right : left <= right;
}

function query(table: string) {
  const state = {
    filters: [] as Array<(row: any) => boolean>,
    countMode: false,
  };

  const api: any = {
    select: vi.fn((_columns?: string, options?: { count?: string; head?: boolean }) => {
      state.countMode = Boolean(options?.count);
      return api;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      state.filters.push((row) => values.includes(row[column]));
      return api;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => compareValue(row[column], value, 'gte'));
      return api;
    }),
    lte: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => compareValue(row[column], value, 'lte'));
      return api;
    }),
    order: vi.fn(() => api),
    then(resolve: any) {
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      return Promise.resolve({
        data: state.countMode ? null : result,
        error: null,
        count: result.length,
      }).then(resolve);
    },
  };

  return api;
}

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const analytics = await import('../routes/analytics');
  const metrics = await import('../routes/metrics');
  const reports = await import('../routes/reports');
  app.use('/api', analytics.default);
  app.use('/api', metrics.default);
  app.use('/api', reports.default);
});

beforeEach(() => {
  rows = {
    payments: [
      {
        id: 'pay-bam',
        org_id: ORG,
        reservation_id: 'res-bam',
        amount: 100,
        currency: 'BAM',
        status: 'succeeded',
        payment_date: '2026-01-15T10:00:00.000Z',
        created_at: '2026-01-15T10:00:00.000Z',
      },
      {
        id: 'pay-eur',
        org_id: ORG,
        reservation_id: 'res-eur',
        amount: 200,
        currency: 'EUR',
        status: 'succeeded',
        payment_date: '2026-01-15T11:00:00.000Z',
        created_at: '2026-01-15T11:00:00.000Z',
      },
      {
        id: 'pay-pending',
        org_id: ORG,
        reservation_id: 'res-bam',
        amount: 900,
        currency: 'BAM',
        status: 'pending',
        payment_date: '2026-01-15T12:00:00.000Z',
        created_at: '2026-01-15T12:00:00.000Z',
      },
      {
        id: 'pay-failed',
        org_id: ORG,
        reservation_id: 'res-eur',
        amount: 800,
        currency: 'EUR',
        status: 'failed',
        payment_date: '2026-01-15T13:00:00.000Z',
        created_at: '2026-01-15T13:00:00.000Z',
      },
    ],
    reservations: [
      {
        id: 'res-bam',
        org_id: ORG,
        total_amount: 100,
        paid_amount: 100,
        balance_due: 0,
        currency: 'BAM',
        status: 'confirmed',
        payment_status: 'paid',
        reservation_at: '2026-01-15T08:00:00.000Z',
        created_at: '2026-01-15T08:00:00.000Z',
        departure_id: 'dep-bam',
        departures: {
          id: 'dep-bam',
          package_id: 'pkg-bam',
          packages: { id: 'pkg-bam', name: 'BAM Package', destination: 'Sarajevo', currency: 'BAM' },
        },
      },
      {
        id: 'res-eur',
        org_id: ORG,
        total_amount: 200,
        paid_amount: 200,
        balance_due: 0,
        currency: 'EUR',
        status: 'confirmed',
        payment_status: 'paid',
        reservation_at: '2026-01-15T09:00:00.000Z',
        created_at: '2026-01-15T09:00:00.000Z',
        departure_id: 'dep-eur',
        departures: {
          id: 'dep-eur',
          package_id: 'pkg-eur',
          packages: { id: 'pkg-eur', name: 'EUR Package', destination: 'Istanbul', currency: 'EUR' },
        },
      },
    ],
    customers: [
      { id: 'customer-1', org_id: ORG },
      { id: 'customer-2', org_id: ORG },
    ],
  };
});

describe('currency-aware analytics routes', () => {
  it('/analytics/overview does not expose a cross-currency total and supports filters', async () => {
    const mixed = await request(app).get('/api/analytics/overview?from=2026-01-01&to=2026-01-31');

    expect(mixed.status).toBe(200);
    expect(mixed.body.totalRevenue).toBeNull();
    expect(mixed.body.totalRevenue).not.toBe(300);
    expect(mixed.body.multiCurrency).toBe(true);
    expect(mixed.body.availableCurrencies).toEqual(['BAM', 'EUR']);
    expect(mixed.body.currencyBreakdown).toEqual([
      { currency: 'BAM', totalRevenue: 100 },
      { currency: 'EUR', totalRevenue: 200 },
    ]);

    const bam = await request(app).get('/api/analytics/overview?from=2026-01-01&to=2026-01-31&currency=BAM');
    expect(bam.body.totalRevenue).toBe(100);

    const eur = await request(app).get('/api/analytics/overview?from=2026-01-01&to=2026-01-31&currency=EUR');
    expect(eur.body.totalRevenue).toBe(200);
  });

  it('/analytics/trends returns currency-labelled revenue series instead of one mixed line', async () => {
    const mixed = await request(app).get('/api/analytics/trends?from=2026-01-15&to=2026-01-15&granularity=day');

    expect(mixed.status).toBe(200);
    expect(mixed.body.data.multiCurrency).toBe(true);
    expect(mixed.body.data.revenue).toEqual([
      { date: '2026-01-15', currency: 'BAM', value: 100 },
      { date: '2026-01-15', currency: 'EUR', value: 200 },
    ]);
    expect(mixed.body.data.revenue).not.toContainEqual({ date: '2026-01-15', value: 300 });

    const bam = await request(app).get('/api/analytics/trends?from=2026-01-15&to=2026-01-15&granularity=day&currency=BAM');
    expect(bam.body.data.revenue).toEqual([{ date: '2026-01-15', currency: 'BAM', value: 100 }]);

    const eur = await request(app).get('/api/analytics/trends?from=2026-01-15&to=2026-01-15&granularity=day&currency=EUR');
    expect(eur.body.data.revenue).toEqual([{ date: '2026-01-15', currency: 'EUR', value: 200 }]);
  });

  it('/metrics/revenue-series uses currency-labelled succeeded-only points and filters', async () => {
    const mixed = await request(app).get('/api/metrics/revenue-series?from=2026-01-15&to=2026-01-15&granularity=day');

    expect(mixed.status).toBe(200);
    expect(mixed.body.multiCurrency).toBe(true);
    expect(mixed.body.data).toEqual([
      { date: '2026-01-15', currency: 'BAM', value: 100 },
      { date: '2026-01-15', currency: 'EUR', value: 200 },
    ]);
    expect(mixed.body.data).not.toContainEqual({ date: '2026-01-15', value: 300 });

    const bam = await request(app).get('/api/metrics/revenue-series?from=2026-01-15&to=2026-01-15&granularity=day&currency=BAM');
    expect(bam.body.data).toEqual([{ date: '2026-01-15', currency: 'BAM', value: 100 }]);

    const eur = await request(app).get('/api/metrics/revenue-series?from=2026-01-15&to=2026-01-15&granularity=day&currency=EUR');
    expect(eur.body.data).toEqual([{ date: '2026-01-15', currency: 'EUR', value: 200 }]);
  });

  it('/analytics/dashboard, overview-v2, by-package, revenue-series, and reports summary keep currencies separate', async () => {
    const dashboard = await request(app).get('/api/analytics/dashboard?from=2026-01-01&to=2026-01-31');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.revenue).toBeNull();
    expect(dashboard.body.currencyBreakdown).toEqual([
      { currency: 'BAM', revenue: 100, bookings: 1 },
      { currency: 'EUR', revenue: 200, bookings: 1 },
    ]);

    const overviewV2 = await request(app).get('/api/analytics/overview-v2?from=2026-01-01&to=2026-01-31');
    expect(overviewV2.status).toBe(200);
    expect(overviewV2.body.total_amount_sum).toBeNull();
    expect(overviewV2.body.currencyBreakdown).toEqual([
      { currency: 'BAM', total_amount_sum: 100, total_paid_sum: 100, total_balance_sum: 0 },
      { currency: 'EUR', total_amount_sum: 200, total_paid_sum: 200, total_balance_sum: 0 },
    ]);

    const byPackage = await request(app).get('/api/analytics/by-package?from=2026-01-01&to=2026-01-31');
    expect(byPackage.status).toBe(200);
    expect(byPackage.body.multiCurrency).toBe(true);
    expect(byPackage.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ package_name: 'BAM Package', total_amount_sum: 100, currency: 'BAM' }),
      expect.objectContaining({ package_name: 'EUR Package', total_amount_sum: 200, currency: 'EUR' }),
    ]));

    const revenueSeries = await request(app).get('/api/analytics/revenue-series?from=2026-01-15&to=2026-01-15&bucket=daily');
    expect(revenueSeries.status).toBe(200);
    expect(revenueSeries.body.multiCurrency).toBe(true);
    expect(revenueSeries.body.data).toEqual(expect.arrayContaining([
      { date: '2026-01-15', currency: 'BAM', total_amount_sum: 100, total_paid_sum: 100 },
      { date: '2026-01-15', currency: 'EUR', total_amount_sum: 200, total_paid_sum: 200 },
    ]));

    const reports = await request(app).get('/api/reports/summary?from=2026-01-01&to=2026-01-31');
    expect(reports.status).toBe(200);
    expect(reports.body.bookedRevenue).toBeNull();
    expect(reports.body.bookedRevenue).not.toBe(300);
    expect(reports.body.topDestinations).toEqual([]);
    expect(reports.body.currencyBreakdown).toEqual([
      { currency: 'BAM', bookedRevenue: 100, paidRevenue: 100, unpaidRevenue: 0 },
      { currency: 'EUR', bookedRevenue: 200, paidRevenue: 200, unpaidRevenue: 0 },
    ]);

    const filteredReports = await request(app).get('/api/reports/summary?from=2026-01-01&to=2026-01-31&currency=EUR');
    expect(filteredReports.body.bookedRevenue).toBe(200);
    expect(filteredReports.body.topDestinations).toEqual([{ destination: 'Istanbul', revenue: 200, reservations: 1 }]);
  });
});
