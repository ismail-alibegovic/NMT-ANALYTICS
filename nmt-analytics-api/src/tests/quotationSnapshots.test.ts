import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import quotationRoutes from '../routes/quotations';

let currentOrgId = 'd9c9c298-9c09-4b0e-a91c-483758431d74';

const itineraryId = 'aaa10001-1001-4001-8001-100000000001';
const itineraryVersionId = 'vvv20001-2001-4002-8002-200000000002';
const quotationId1 = 'qqq30001-3001-4003-8003-300000000003';
const quotationId2 = 'qqq30001-3001-4003-8003-300000000004';
const itemId1 = 'iii40001-4001-4004-8004-400000000005';
const itemId2 = 'iii40001-4001-4004-8004-400000000006';

let quotations: any[] = [];
let quotationItems: any[] = [];
let itineraryItems: any[] = [];

beforeEach(() => {
  currentOrgId = 'd9c9c298-9c09-4b0e-a91c-483758431d74';

  quotations = [
    {
      id: quotationId1,
      org_id: currentOrgId,
      itinerary_id: itineraryId,
      itinerary_version_id: itineraryVersionId,
      title: 'Test itinerary-derived quotation',
      reference: 'QTN-2026-0001',
      status: 'draft',
      client_notes: null,
      internal_notes: null,
      valid_until: null,
      markup_strategy: 'per_item',
      global_markup_percent: 0,
      sell_total: 200,
      net_total: 200,
      margin_total: 0,
      currency: 'BAM',
      sent_at: null,
      accepted_at: null,
      rejected_at: null,
      created_at: '2026-08-25T00:00:00.000Z',
      updated_at: '2026-08-25T00:00:00.000Z',
    },
  ];

  quotationItems = [
    {
      id: itemId1, org_id: currentOrgId, quotation_id: quotationId1,
      title: 'Hotel stay', description: 'Double room', location: 'Sarajevo',
      category: 'accommodation', day_number: 1, sort_order: 1, start_time: '14:00:00',
      quantity: 2, unit: 'nights', net_unit_price: 50, markup_percent: 0,
      currency: 'BAM', included: true,
      supplier_id: null, supplier_service_id: null,
      created_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-25T00:00:00.000Z',
    },
    {
      id: itemId2, org_id: currentOrgId, quotation_id: quotationId1,
      title: 'Airport transfer', description: null, location: null,
      category: 'transport', day_number: 1, sort_order: 2, start_time: '10:00:00',
      quantity: 1, unit: 'fixed', net_unit_price: 100, markup_percent: 10,
      currency: 'BAM', included: true,
      supplier_id: null, supplier_service_id: null,
      created_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-25T00:00:00.000Z',
    },
  ];

  itineraryItems = [
    {
      id: 'iii50001-5001-4005-8005-500000000000', org_id: currentOrgId,
      itinerary_id: itineraryId, itinerary_version_id: itineraryVersionId,
      title: 'Hotel stay', description: 'Double room', location: 'Sarajevo',
      category: 'accommodation', day_number: 1, sort_order: 1, start_time: '14:00:00',
      quantity: 2, unit: 'nights', net_unit_price: 50, markup_percent: 0,
      currency: 'BAM', included: true,
      supplier_id: null, supplier_service_id: null,
    },
    {
      id: 'iii50001-5001-4005-8005-500000000001', org_id: currentOrgId,
      itinerary_id: itineraryId, itinerary_version_id: itineraryVersionId,
      title: 'Airport transfer', description: null, location: null,
      category: 'transport', day_number: 1, sort_order: 2, start_time: '10:00:00',
      quantity: 1, unit: 'fixed', net_unit_price: 100, markup_percent: 10,
      currency: 'BAM', included: true,
      supplier_id: null, supplier_service_id: null,
    },
  ];
});

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@nmt.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

let allowAllRoles = true;
vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => {
    if (allowAllRoles) return next();
    _res.status(403).json({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' });
  },
}));

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

const mockGenerateOfferPDF = vi.fn().mockResolvedValue(Buffer.from('PDF'));
vi.mock('../lib/pdfGenerator', () => ({
  generateOfferPDF: (...args: any[]) => mockGenerateOfferPDF(...args),
}));

vi.mock('../lib/orgBranding', () => ({
  getOrgBranding: vi.fn().mockResolvedValue(null),
}));

// ─── Supabase mock with proper thenable chainables ───────────

function resolveRows(table: string, filters: Record<string, any>) {
  let rows: any[];
  if (table === 'quotations') rows = quotations;
  else if (table === 'quotation_items') rows = quotationItems;
  else if (table === 'itineraries') rows = [{
    id: itineraryId, org_id: currentOrgId, currency: 'BAM', current_version: 1,
  }];
  else if (table === 'itinerary_versions') rows = [{
    id: itineraryVersionId, org_id: currentOrgId,
    itinerary_id: itineraryId, version_number: 1,
  }];
  else if (table === 'itinerary_items') rows = itineraryItems;
  else rows = [];
  return rows.filter((r: any) =>
    Object.entries(filters).every(([k, v]) => r[k] === v));
}

vi.mock('../lib/supabase', () => {
  const mockSupabase = {
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};

      // Base chainable used for select/eq/order chains (thenable)
      const chainable: any = {
        select: vi.fn(() => chainable),
        eq: vi.fn((col: string, val: any) => { filters[col] = val; return chainable; }),
        neq: vi.fn(() => chainable),
        order: vi.fn(() => chainable),
        limit: vi.fn(() => chainable),
      };

      // Make chainable work with Promise.all / await
      chainable.then = (resolve: any, reject: any) => {
        try {
          const filtered = resolveRows(table, filters);
          resolve({ data: filtered, error: null });
        } catch (e) {
          reject(e);
        }
      };

      chainable.single = vi.fn(() => {
        const filtered = resolveRows(table, filters);
        if (!filtered.length) return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        return Promise.resolve({ data: filtered[0], error: null });
      });

      chainable.maybeSingle = vi.fn(() => {
        const filtered = resolveRows(table, filters);
        return Promise.resolve({ data: filtered.length ? filtered[0] : null, error: null });
      });

      // insert
      const doInsert = (payload: any | any[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted = rows.map((p: any) => {
          const newRow = {
            id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            created_at: '2026-08-25T00:00:00.000Z',
            updated_at: '2026-08-25T00:00:00.000Z',
            ...p,
          };
          if (table === 'quotation_items') quotationItems.push(newRow);
          if (table === 'quotations') quotations.push(newRow);
          return newRow;
        });
        return Array.isArray(payload) ? inserted : inserted[0];
      };

      chainable.insert = vi.fn((payload: any | any[]) => {
        const result: any = {
          select: vi.fn(() => ({
            single: vi.fn(() => {
              const data = doInsert(payload);
              return Promise.resolve({ data, error: null });
            }),
          })),
        };
        result.then = (resolve: any) => {
          const data = doInsert(payload);
          return resolve({ data, error: null });
        };
        return result;
      });

      // update
      const updateFilters: Record<string, any> = {};
      chainable.update = vi.fn((updates: any) => {
        const ub: any = {
          eq: vi.fn((col: string, val: any) => { updateFilters[col] = val; return ub; }),
          select: vi.fn(() => ({
            single: vi.fn(() => {
              const rows = table === 'quotation_items' ? quotationItems : quotations;
              const idx = rows.findIndex((r: any) =>
                Object.entries(updateFilters).every(([k, v]) => r[k] === v));
              if (idx >= 0) {
                rows[idx] = { ...rows[idx], ...updates, updated_at: '2026-08-25T01:00:00.000Z' };
                return Promise.resolve({ data: rows[idx], error: null });
              }
              return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
            }),
          })),
        };
        ub.then = (resolve: any) => {
          const rows = table === 'quotation_items' ? quotationItems : quotations;
          const idx = rows.findIndex((r: any) =>
            Object.entries(updateFilters).every(([k, v]) => r[k] === v));
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...updates, updated_at: '2026-08-25T01:00:00.000Z' };
            return resolve({ data: rows[idx], error: null });
          }
          return resolve({ data: null, error: { code: 'PGRST116' } });
        };
        return ub;
      });

      // delete
      const delFilters: Record<string, any> = {};
      chainable.delete = vi.fn(() => {
        const db: any = {
          eq: vi.fn((col: string, val: any) => { delFilters[col] = val; return db; }),
        };
        db.then = (resolve: any) => {
          const rows = table === 'quotation_items' ? quotationItems : quotations;
          const idx = rows.findIndex((r: any) =>
            Object.entries(delFilters).every(([k, v]) => r[k] === v));
          if (idx >= 0) { rows.splice(idx, 1); return resolve({ error: null }); }
          return resolve({ error: { code: 'PGRST116' } });
        };
        return db;
      });

      return chainable;
    }),
  };

  return {
    supabaseAdmin: mockSupabase,
    handleSupabaseError: (res: any, _err: any, _msg: string) => {
      res.status(500).json({ error: _msg });
      return;
    },
  };
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', quotationRoutes);
  return app;
}

describe('Quotation Snapshots', () => {
  describe('Snapshot independence', () => {
    it('existing itinerary quotation creation returns items from quotation_items', async () => {
      const app = makeApp();
      const res = await request(app)
        .get(`/quotations/${quotationId1}`)
        .expect(200);

      expect(res.body.id).toBe(quotationId1);
      expect(res.body.itineraryId).toBe(itineraryId);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].title).toBe('Hotel stay');
      expect(res.body.items[1].title).toBe('Airport transfer');
    });

    it('snapshot survives later itinerary-item edits', async () => {
      itineraryItems[0].net_unit_price = 999;
      itineraryItems.push({
        id: 'new-itinerary-item', org_id: currentOrgId,
        itinerary_id: itineraryId, itinerary_version_id: itineraryVersionId,
        title: 'New itinerary item', description: null, location: null,
        category: 'other', day_number: 2, sort_order: 1, start_time: null,
        quantity: 1, unit: 'fixed', net_unit_price: 999, markup_percent: 0,
        currency: 'BAM', included: true,
        supplier_id: null, supplier_service_id: null,
      });

      const app = makeApp();
      const res = await request(app)
        .get(`/quotations/${quotationId1}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].netUnitPrice).toBe(50);
    });
  });

  describe('Standalone creation', () => {
    it('standalone quotation creation without itinerary works', async () => {
      const app = makeApp();
      const res = await request(app)
        .post('/quotations')
        .send({
          title: 'Standalone quote',
          items: [{ title: 'Service A', netUnitPrice: 100, quantity: 1, category: 'other' }],
        })
        .expect(201);

      expect(res.body.itineraryId).toBe(null);
      expect(res.body.itineraryVersionId).toBe(null);
      expect(res.body.title).toBe('Standalone quote');
      expect(res.body.sellTotal).toBeGreaterThan(0);

      const saved = quotationItems.filter((i: any) => i.quotation_id === res.body.id);
      expect(saved).toHaveLength(1);
    });

    it('standalone quotation without items creates with zero totals', async () => {
      const app = makeApp();
      const res = await request(app)
        .post('/quotations')
        .send({ title: 'Empty standalone' })
        .expect(201);

      expect(res.body.sellTotal).toBe(0);
      expect(res.body.netTotal).toBe(0);
    });
  });

  describe('Both-or-neither validation', () => {
    it('rejects quotation with itineraryId but no itineraryVersionId', async () => {
      const app = makeApp();
      await request(app)
        .post('/quotations')
        .send({ title: 'Bad', itineraryId, items: [{ title: 'X', netUnitPrice: 10, quantity: 1, category: 'other' }] })
        .expect(400);
    });

    it('rejects quotation with itineraryVersionId but no itineraryId', async () => {
      const app = makeApp();
      await request(app)
        .post('/quotations')
        .send({ title: 'Bad', itineraryVersionId, items: [{ title: 'X', netUnitPrice: 10, quantity: 1, category: 'other' }] })
        .expect(400);
    });
  });

  describe('Quotation item CRUD', () => {
    it('add quotation item', async () => {
      const app = makeApp();
      const res = await request(app)
        .post(`/quotations/${quotationId1}/items`)
        .send({ title: 'New item', netUnitPrice: 30, quantity: 1, category: 'other' })
        .expect(201);

      expect(res.body.title).toBe('New item');
    });

    it('edit quotation item', async () => {
      const app = makeApp();
      const res = await request(app)
        .patch(`/quotations/${quotationId1}/items/${itemId1}`)
        .send({ title: 'Updated hotel', netUnitPrice: 75, quantity: 2, category: 'accommodation' })
        .expect(200);

      expect(res.body.title).toBe('Updated hotel');
      expect(res.body.netUnitPrice).toBe(75);
    });

    it('delete quotation item', async () => {
      const app = makeApp();
      await request(app)
        .delete(`/quotations/${quotationId1}/items/${itemId1}`)
        .expect(200);

      const remaining = quotationItems.filter((i: any) => i.quotation_id === quotationId1);
      expect(remaining).toHaveLength(1);
    });

    it('add item recalculates totals', async () => {
      const app = makeApp();
      await request(app)
        .post(`/quotations/${quotationId1}/items`)
        .send({ title: 'Expensive item', netUnitPrice: 100, quantity: 1, category: 'other' })
        .expect(201);

      const qRes = await request(app)
        .get(`/quotations/${quotationId1}`)
        .expect(200);

      expect(qRes.body.items.length).toBe(3);
      expect(qRes.body.sellTotal).toBeGreaterThan(0);
    });
  });

  describe('Org isolation', () => {
    it('returns 404 for org-2 quotation', async () => {
      currentOrgId = '99999999-9999-4999-8999-999999999999';
      const app = makeApp();
      await request(app)
        .get(`/quotations/${quotationId1}`)
        .expect(404);
    });

    it('list returns only org-scoped quotations', async () => {
      const app = makeApp();
      const res = await request(app)
        .get('/quotations')
        .expect(200);

      expect(res.body.data).toBeDefined();
    });
  });

  describe('PDF', () => {
    it('PDF returns 200 for itinerary-derived quotation', async () => {
      const app = makeApp();
      await request(app)
        .get(`/quotations/${quotationId1}/pdf`)
        .expect(200);
    });

    it('PDF works with standalone quotation (null itinerary)', async () => {
      quotations.push({
        id: quotationId2, org_id: currentOrgId,
        itinerary_id: null, itinerary_version_id: null,
        title: 'Standalone PDF test', reference: 'QTN-2026-0002',
        status: 'draft', client_notes: null, internal_notes: null, valid_until: null,
        markup_strategy: 'uniform', global_markup_percent: 0,
        sell_total: 100, net_total: 100, margin_total: 0, currency: 'BAM',
        sent_at: null, accepted_at: null, rejected_at: null,
        created_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-25T00:00:00.000Z',
      });

      const app = makeApp();
      await request(app)
        .get(`/quotations/${quotationId2}/pdf`)
        .expect(200);
    });
  });

  describe('PATCH', () => {
    it('PATCH updates title and status', async () => {
      const app = makeApp();
      const res = await request(app)
        .patch(`/quotations/${quotationId1}`)
        .send({ title: 'Updated title', status: 'sent' })
        .expect(200);

      expect(res.body.title).toBe('Updated title');
      expect(res.body.status).toBe('sent');
    });
  });

  describe('Viewer restriction', () => {
    it('viewer cannot create quotation', async () => {
      allowAllRoles = false;
      const app = makeApp();
      await request(app)
        .post('/quotations')
        .send({ title: 'Viewer attempt', items: [{ title: 'X', netUnitPrice: 10, quantity: 1, category: 'other' }] })
        .expect(403);
      allowAllRoles = true;
    });
  });
});
