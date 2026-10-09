import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = '00000000-0000-4000-8000-000000000001';
const DEPARTURE = '10000000-0000-4000-8000-000000000001';
const OTHER_DEPARTURE = '10000000-0000-4000-8000-0000000000ff';
const ITEM = '30000000-0000-4000-8000-000000000001';
const OTHER_ORG_ITEM = '30000000-0000-4000-8000-0000000000ff';

let rows: Record<string, any[]> = {};
let app: express.Express;
let insertCalls: any[] = [];

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
    limitValue: null as number | null,
  };

  const api: any = {
    select: vi.fn(() => api),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    order: vi.fn(() => api),
    limit: vi.fn((value: number) => {
      state.limitValue = value;
      return api;
    }),
    insert: vi.fn((row: any) => {
      state.insertRow = {
        id: '40000000-0000-4000-8000-000000000001',
        created_at: '2026-10-08T00:00:00.000Z',
        ...row,
      };
      insertCalls.push({ table, row });
      rows[table].push(state.insertRow);
      return api;
    }),
    update: vi.fn((data: any) => {
      state.updateData = data;
      return api;
    }),
    single: vi.fn(async () => {
      let result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      if (state.updateData) result = result.map((row) => ({ ...row, ...state.updateData }));
      const row = state.insertRow || result[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    then(resolve: any) {
      const filtered = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      const result = state.limitValue != null ? filtered.slice(0, state.limitValue) : filtered;
      return Promise.resolve({ data: result, error: null, count: result.length }).then(resolve);
    },
  };

  return api;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', (await import('../routes/supplierConfirmations')).default);
});

beforeEach(() => {
  insertCalls = [];
  rows = {
    departures: [
      { id: DEPARTURE, org_id: ORG, package_id: 'pkg-1', packages: { id: 'pkg-1', name: 'Antalya', currency: 'BAM' } },
      { id: OTHER_DEPARTURE, org_id: 'other-org', package_id: 'pkg-2', packages: { id: 'pkg-2', name: 'Other', currency: 'BAM' } },
    ],
    departure_cost_items: [
      {
        id: ITEM,
        org_id: ORG,
        departure_id: DEPARTURE,
        category: 'hotel',
        label: 'Hotel Sunce',
        supplier_id: '20000000-0000-4000-8000-000000000001',
        quantity: 2,
        unit_cost: 100,
        currency: 'BAM',
        notes: null,
        confirmation_status: 'unconfirmed',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
        suppliers: { id: '20000000-0000-4000-8000-000000000001', name: 'Hotel Supplier' },
      },
      {
        id: '30000000-0000-4000-8000-000000000002',
        org_id: ORG,
        departure_id: DEPARTURE,
        category: 'transport',
        label: 'Bus transfer',
        supplier_id: null,
        quantity: 1,
        unit_cost: 300,
        currency: 'BAM',
        notes: null,
        confirmation_status: 'requested',
        created_at: '2026-10-02T00:00:00.000Z',
        updated_at: '2026-10-02T00:00:00.000Z',
        suppliers: null,
      },
      {
        id: OTHER_ORG_ITEM,
        org_id: 'other-org',
        departure_id: OTHER_DEPARTURE,
        category: 'hotel',
        label: 'Other org item',
        supplier_id: null,
        quantity: 1,
        unit_cost: 50,
        currency: 'BAM',
        notes: null,
        confirmation_status: 'unconfirmed',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
        suppliers: null,
      },
    ],
    supplier_confirmation_events: [
      {
        id: '40000000-0000-4000-8000-000000000002',
        org_id: ORG,
        departure_id: DEPARTURE,
        cost_item_id: ITEM,
        status: 'requested',
        note: 'Emailed supplier',
        actor_id: 'manager-1',
        actor_email: 'manager@travline.test',
        created_at: '2026-10-02T00:00:00.000Z',
        departure_cost_items: { label: 'Hotel Sunce' },
      },
      {
        id: '40000000-0000-4000-8000-000000000004',
        org_id: ORG,
        departure_id: DEPARTURE,
        cost_item_id: ITEM,
        status: 'unconfirmed',
        note: null,
        actor_id: 'manager-1',
        actor_email: 'manager@travline.test',
        created_at: '2026-10-01T00:00:00.000Z',
        departure_cost_items: { label: 'Hotel Sunce' },
      },
      {
        id: '40000000-0000-4000-8000-000000000003',
        org_id: 'other-org',
        departure_id: OTHER_DEPARTURE,
        cost_item_id: OTHER_ORG_ITEM,
        status: 'confirmed',
        note: null,
        actor_id: null,
        actor_email: null,
        created_at: '2026-10-03T00:00:00.000Z',
        departure_cost_items: { label: 'Other org item' },
      },
    ],
  };
});

describe('supplier confirmation board', () => {
  it('returns org-scoped items with a status summary', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE}/supplier-confirmations`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((item: any) => item.id)).toEqual([ITEM, '30000000-0000-4000-8000-000000000002']);
    expect(res.body.items[0].confirmationStatus).toBe('unconfirmed');
    expect(res.body.items[0].supplierName).toBe('Hotel Supplier');
    expect(res.body.items[1].confirmationStatus).toBe('requested');
    expect(res.body.summary).toEqual({
      total: 2,
      byStatus: { unconfirmed: 1, requested: 1, confirmed: 0, cancelled: 0 },
      outstanding: 2,
      ready: false,
    });
  });

  it('rejects cross-org departures', async () => {
    const res = await request(app).get(`/api/departures/${OTHER_DEPARTURE}/supplier-confirmations`);
    expect(res.status).toBe(404);
  });
});

describe('confirmation status update', () => {
  it('updates the cost item status and appends a history event', async () => {
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE}/cost-items/${ITEM}/confirmation`)
      .send({ status: 'confirmed', note: 'Voucher 123 received' });

    expect(res.status).toBe(200);
    expect(res.body.costItem.confirmationStatus).toBe('confirmed');
    expect(res.body.costItem.id).toBe(ITEM);
    expect(res.body.event).toMatchObject({
      costItemId: ITEM,
      costItemLabel: 'Hotel Sunce',
      status: 'confirmed',
      note: 'Voucher 123 received',
      actorEmail: 'manager@travline.test',
    });

    const eventInsert = insertCalls.find((call) => call.table === 'supplier_confirmation_events');
    expect(eventInsert.row).toMatchObject({
      org_id: ORG,
      departure_id: DEPARTURE,
      cost_item_id: ITEM,
      status: 'confirmed',
      note: 'Voucher 123 received',
    });
  });

  it('allows setting a status without a note', async () => {
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE}/cost-items/${ITEM}/confirmation`)
      .send({ status: 'requested' });

    expect(res.status).toBe(200);
    const eventInsert = insertCalls.find((call) => call.table === 'supplier_confirmation_events');
    expect(eventInsert.row.note).toBeNull();
  });

  it('rejects invalid status values', async () => {
    const res = await request(app)
      .post(`/api/departures/${DEPARTURE}/cost-items/${ITEM}/confirmation`)
      .send({ status: 'maybe' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(insertCalls).toHaveLength(0);
  });

  it('rejects cross-org departures and items', async () => {
    const crossOrgDeparture = await request(app)
      .post(`/api/departures/${OTHER_DEPARTURE}/cost-items/${ITEM}/confirmation`)
      .send({ status: 'confirmed' });
    expect(crossOrgDeparture.status).toBe(404);

    const crossOrgItem = await request(app)
      .post(`/api/departures/${DEPARTURE}/cost-items/${OTHER_ORG_ITEM}/confirmation`)
      .send({ status: 'confirmed' });
    expect(crossOrgItem.status).toBe(404);
    expect(insertCalls).toHaveLength(0);
  });


});

describe('supplier confirmation events history', () => {
  it('returns org-scoped events in creation order with limit applied', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE}/supplier-confirmation-events?limit=1`);

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      id: '40000000-0000-4000-8000-000000000002',
      costItemId: ITEM,
      costItemLabel: 'Hotel Sunce',
      status: 'requested',
      note: 'Emailed supplier',
    });
  });

  it('defaults the limit to 100 and rejects out-of-range limits', async () => {
    const ok = await request(app).get(`/api/departures/${DEPARTURE}/supplier-confirmation-events`);
    expect(ok.status).toBe(200);
    expect(ok.body.events).toHaveLength(2);

    const tooMany = await request(app).get(`/api/departures/${DEPARTURE}/supplier-confirmation-events?limit=500`);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects cross-org departures', async () => {
    const res = await request(app).get(`/api/departures/${OTHER_DEPARTURE}/supplier-confirmation-events`);
    expect(res.status).toBe(404);
  });
});
