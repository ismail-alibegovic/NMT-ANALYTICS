import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = '00000000-0000-4000-8000-000000000001';
const PACKAGE = '10000000-0000-4000-8000-000000000001';
const OTHER_PACKAGE = '10000000-0000-4000-8000-0000000000ff';
const SUPPLIER = '20000000-0000-4000-8000-000000000001';
const OTHER_SUPPLIER = '20000000-0000-4000-8000-0000000000ff';
const SERVICE = '30000000-0000-4000-8000-000000000001';
const COST_ITEM = '40000000-0000-4000-8000-000000000001';
const EUR_SERVICE = '30000000-0000-4000-8000-0000000000ee';
const OTHER_SERVICE = '30000000-0000-4000-8000-0000000000ff';

let rows: Record<string, any[]> = {};
let app: express.Express;
let selectClauses: string[] = [];

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
    deleteMode: false,
  };

  const api: any = {
    select: vi.fn((clause?: string) => {
      if (clause) selectClauses.push(clause);
      return api;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    order: vi.fn(() => api),
    insert: vi.fn((row: any) => {
      state.insertRow = { id: `created-${rows[table].length + 1}`, created_at: '2026-09-10T00:00:00.000Z', updated_at: '2026-09-10T00:00:00.000Z', ...row };
      rows[table].push(state.insertRow);
      return api;
    }),
    update: vi.fn((data: any) => {
      state.updateData = data;
      return api;
    }),
    delete: vi.fn(() => {
      state.deleteMode = true;
      return api;
    }),
    single: vi.fn(async () => {
      let result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      if (state.updateData) {
        result.forEach((row) => Object.assign(row, state.updateData, { updated_at: '2026-09-10T00:01:00.000Z' }));
      }
      if (state.deleteMode) {
        rows[table] = rows[table].filter((row) => !state.filters.every((filter) => filter(row)));
        return { data: null, error: null };
      }
      const row = state.insertRow || result[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    then(resolve: any) {
      let result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      if (state.deleteMode) {
        rows[table] = rows[table].filter((row) => !state.filters.every((filter) => filter(row)));
        result = [];
      }
      return Promise.resolve({ data: result, error: null, count: result.length }).then(resolve);
    },
  };

  return api;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', (await import('../routes/packageCosting')).default);
});

beforeEach(() => {
  selectClauses = [];
  rows = {
    packages: [
      { id: PACKAGE, org_id: ORG, currency: 'BAM' },
      { id: OTHER_PACKAGE, org_id: 'other-org', currency: 'BAM' },
    ],
    package_cost_items: [
      { id: COST_ITEM, org_id: ORG, package_id: PACKAGE, category: 'transport', label: 'Bus', supplier_id: SUPPLIER, supplier_service_id: SERVICE, unit: 'per_group', quantity: 2, unit_cost: 100, currency: 'BAM', notes: null, created_at: '2026-09-10T00:00:00.000Z', updated_at: '2026-09-10T00:00:00.000Z', suppliers: { id: SUPPLIER, name: 'Bus Co' }, supplier_services: { id: SERVICE, name: 'Coach', suppliers: { id: SUPPLIER, name: 'Bus Co' } } },
    ],
    suppliers: [
      { id: SUPPLIER, org_id: ORG, name: 'Bus Co' },
      { id: OTHER_SUPPLIER, org_id: 'other-org', name: 'Other' },
    ],
    supplier_services: [
      { id: SERVICE, org_id: ORG, supplier_id: SUPPLIER, name: 'Coach', category: 'transport', unit: 'per_group', net_price: 100, currency: 'BAM', active: true, suppliers: { id: SUPPLIER, name: 'Bus Co' } },
      { id: EUR_SERVICE, org_id: ORG, supplier_id: SUPPLIER, name: 'EUR Coach', category: 'transport', unit: 'per_group', net_price: 120, currency: 'EUR', active: true, suppliers: { id: SUPPLIER, name: 'Bus Co' } },
      { id: OTHER_SERVICE, org_id: 'other-org', supplier_id: OTHER_SUPPLIER, name: 'Other', category: 'transport', unit: 'fixed', net_price: 1, currency: 'BAM', active: true },
    ],
  };
});

describe('package costing route', () => {
  it('returns package cost totals from package_cost_items only', async () => {
    const res = await request(app).get(`/api/packages/${PACKAGE}/costing`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      packageId: PACKAGE,
      currency: 'BAM',
      totalCost: 200,
      categoryBreakdown: [{ category: 'transport', amount: 200 }],
    });
    expect(selectClauses).toContain(
      'id, package_id, category, label, supplier_id, supplier_service_id, unit, quantity, unit_cost, currency, notes, created_at, updated_at, suppliers!package_cost_items_supplier_org_fk(id, name), supplier_services!package_cost_items_supplier_service_org_fk(id, name, suppliers!supplier_services_supplier_org_fk(id, name))',
    );
  });

  it('rejects cross-org package, supplier, supplier service, invalid quantity, and negative unit cost', async () => {
    expect((await request(app).get(`/api/packages/${OTHER_PACKAGE}/costing`)).status).toBe(404);

    const crossSupplier = await request(app)
      .post(`/api/packages/${PACKAGE}/cost-items`)
      .send({ category: 'transport', label: 'Bad', supplierId: OTHER_SUPPLIER, unit: 'fixed', quantity: 1, unitCost: 10, currency: 'BAM' });
    expect(crossSupplier.status).toBe(404);

    const crossService = await request(app)
      .post(`/api/packages/${PACKAGE}/cost-items`)
      .send({ category: 'transport', label: 'Bad', supplierServiceId: OTHER_SERVICE, unit: 'fixed', quantity: 1, unitCost: 10, currency: 'BAM' });
    expect(crossService.status).toBe(404);

    const crossPackageDelete = await request(app).delete(`/api/packages/${OTHER_PACKAGE}/cost-items/${COST_ITEM}`);
    expect(crossPackageDelete.status).toBe(404);
    expect(rows.package_cost_items).toHaveLength(1);

    expect((await request(app).post(`/api/packages/${PACKAGE}/cost-items`).send({ category: 'transport', label: 'Bad', unit: 'fixed', quantity: 0, unitCost: 10, currency: 'BAM' })).status).toBe(400);
    expect((await request(app).post(`/api/packages/${PACKAGE}/cost-items`).send({ category: 'transport', label: 'Bad', unit: 'fixed', quantity: 1, unitCost: -1, currency: 'BAM' })).status).toBe(400);
  });

  it('rejects package and supplier-service currency mismatches', async () => {
    const packageMismatch = await request(app)
      .post(`/api/packages/${PACKAGE}/cost-items`)
      .send({ category: 'transport', label: 'EUR cost', unit: 'fixed', quantity: 1, unitCost: 10, currency: 'EUR' });
    expect(packageMismatch.status).toBe(400);
    expect(packageMismatch.body.code).toBe('CURRENCY_MISMATCH');

    const serviceMismatch = await request(app)
      .post(`/api/packages/${PACKAGE}/cost-items`)
      .send({ category: 'transport', label: 'EUR service', supplierServiceId: EUR_SERVICE, unit: 'fixed', quantity: 1, unitCost: 10, currency: 'BAM' });
    expect(serviceMismatch.status).toBe(400);
    expect(serviceMismatch.body.code).toBe('CURRENCY_MISMATCH');
  });

  it('snapshots supplier service catalogue values into the package cost item', async () => {
    const created = await request(app)
      .post(`/api/packages/${PACKAGE}/cost-items`)
      .send({ category: 'transport', label: 'Coach', supplierServiceId: SERVICE, unit: 'per_group', quantity: 1, unitCost: 100, currency: 'BAM' });

    expect(created.status).toBe(201);
    expect(created.body.costItem).toMatchObject({
      supplierId: SUPPLIER,
      supplierServiceId: SERVICE,
      unitCost: 100,
      totalCost: 100,
    });

    rows.supplier_services[0].net_price = 120;
    expect(rows.package_cost_items.find((item) => item.id === created.body.costItem.id).unit_cost).toBe(100);
  });
});
