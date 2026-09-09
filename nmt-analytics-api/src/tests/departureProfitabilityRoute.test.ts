import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = '00000000-0000-4000-8000-000000000001';
const DEPARTURE = '10000000-0000-4000-8000-000000000001';
const OTHER_DEPARTURE = '10000000-0000-4000-8000-0000000000ff';
const SUPPLIER = '20000000-0000-4000-8000-000000000001';
const OTHER_SUPPLIER = '20000000-0000-4000-8000-0000000000ff';

let rows: Record<string, any[]> = {};
let app: express.Express;

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'manager-1', email: 'manager@travline.test', role: 'manager' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = ORG;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => query(table)),
  },
  handleSupabaseError: (res: Response, error: any, message: string) =>
    res.status(500).json({ code: error?.code || 'DATABASE_ERROR', message }),
}));

function query(table: string) {
  const state = {
    filters: [] as Array<(row: any) => boolean>,
    insertRow: null as any,
    updateData: null as any,
  };

  const api: any = {
    select: vi.fn(() => api),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      state.filters.push((row) => values.includes(row[column]));
      return api;
    }),
    order: vi.fn(() => api),
    insert: vi.fn((row: any) => {
      state.insertRow = { id: '30000000-0000-4000-8000-000000000001', created_at: '2026-09-09T00:00:00.000Z', updated_at: '2026-09-09T00:00:00.000Z', ...row };
      rows[table].push(state.insertRow);
      return api;
    }),
    update: vi.fn((data: any) => {
      state.updateData = data;
      return api;
    }),
    delete: vi.fn(() => {
      rows[table] = rows[table].filter((row) => !state.filters.every((filter) => filter(row)));
      return api;
    }),
    single: vi.fn(async () => {
      let result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      if (state.updateData) result = result.map((row) => Object.assign(row, state.updateData));
      const row = state.insertRow || result[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    then(resolve: any) {
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      return Promise.resolve({ data: result, error: null, count: result.length }).then(resolve);
    },
  };

  return api;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', (await import('../routes/departureProfitability')).default);
});

beforeEach(() => {
  rows = {
    departures: [
      { id: DEPARTURE, org_id: ORG, package_id: 'pkg-1', packages: { id: 'pkg-1', name: 'Antalya', destination: 'Antalya', currency: 'BAM' } },
      { id: OTHER_DEPARTURE, org_id: 'other-org', package_id: 'pkg-2', packages: { id: 'pkg-2', name: 'Other', destination: 'Other', currency: 'BAM' } },
    ],
    reservations: [
      { id: 'r1', org_id: ORG, departure_id: DEPARTURE, total_amount: 1000, balance_due: 1000, currency: 'BAM', status: 'confirmed' },
      { id: 'r2', org_id: ORG, departure_id: DEPARTURE, total_amount: 500, balance_due: 0, currency: 'BAM', status: 'confirmed' },
      { id: 'r3', org_id: ORG, departure_id: DEPARTURE, total_amount: 900, balance_due: 0, currency: 'BAM', status: 'cancelled' },
    ],
    payments: [
      { id: 'p1', org_id: ORG, reservation_id: 'r1', amount: 300, currency: 'BAM', status: 'succeeded' },
      { id: 'p2', org_id: ORG, reservation_id: 'r1', amount: 200, currency: 'BAM', status: 'pending' },
      { id: 'p3', org_id: ORG, reservation_id: 'r1', amount: 100, currency: 'BAM', status: 'failed' },
      { id: 'p4', org_id: ORG, reservation_id: 'r2', amount: 600, currency: 'BAM', status: 'succeeded' },
      { id: 'p5', org_id: ORG, reservation_id: 'r3', amount: 900, currency: 'BAM', status: 'succeeded' },
    ],
    departure_cost_items: [
      { id: 'c1', org_id: ORG, departure_id: DEPARTURE, category: 'hotel', label: 'Hotel', supplier_id: SUPPLIER, quantity: 2, unit_cost: 100, currency: 'BAM', notes: null, created_at: '2026-09-09T00:00:00.000Z', updated_at: '2026-09-09T00:00:00.000Z', suppliers: { id: SUPPLIER, name: 'Hotel Supplier' } },
    ],
    suppliers: [
      { id: SUPPLIER, org_id: ORG, name: 'Hotel Supplier' },
      { id: OTHER_SUPPLIER, org_id: 'other-org', name: 'Other Supplier' },
    ],
  };
});

describe('departure profitability route', () => {
  it('returns canonical profitability using succeeded-only collected and derived outstanding', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE}/profitability`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      departureId: DEPARTURE,
      currency: 'BAM',
      revenue: 1500,
      collected: 900,
      outstanding: 700,
      supplierCosts: 200,
      estimatedGrossProfit: 1300,
      marginPct: 86.67,
      reservationCount: 2,
      warnings: [],
    });
  });

  it('rejects cross-org departures and cross-org suppliers', async () => {
    const crossOrgDeparture = await request(app).get(`/api/departures/${OTHER_DEPARTURE}/profitability`);
    expect(crossOrgDeparture.status).toBe(404);

    const crossOrgSupplier = await request(app)
      .post(`/api/departures/${DEPARTURE}/cost-items`)
      .send({ category: 'hotel', label: 'Bad supplier', supplierId: OTHER_SUPPLIER, quantity: 1, unitCost: 10, currency: 'BAM' });

    expect(crossOrgSupplier.status).toBe(404);
    expect(crossOrgSupplier.body.code).toBe('SUPPLIER_NOT_FOUND');
  });

  it('rejects invalid amount and cost currency mismatch', async () => {
    const invalidAmount = await request(app)
      .post(`/api/departures/${DEPARTURE}/cost-items`)
      .send({ category: 'hotel', label: 'Bad amount', quantity: 0, unitCost: 10, currency: 'BAM' });
    expect(invalidAmount.status).toBe(400);

    const mismatch = await request(app)
      .post(`/api/departures/${DEPARTURE}/cost-items`)
      .send({ category: 'hotel', label: 'EUR cost', quantity: 1, unitCost: 10, currency: 'EUR' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe('CURRENCY_MISMATCH');
  });
});
