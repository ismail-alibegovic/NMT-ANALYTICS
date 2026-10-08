import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const validPackageId = '11111111-1111-4111-8111-111111111111';
let currentRows: any[] = [];
let packages: any[] = [{ id: validPackageId, org_id: 'org-1', currency: 'BAM' }];
let currentCount = 0;

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = 'org-1';
    next();
  },
}));

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const sourceRows = table === 'package_services' ? currentRows : table === 'packages' ? packages : null;
      if (!sourceRows) throw new Error(`Unhandled table: ${table}`);
      const filters: Record<string, any> = {};
      const execute = async () => {
        const rows = sourceRows.filter((row) => {
          return Object.entries(filters).every(([column, value]) => row[column] === value);
        });
        return { data: rows, error: null, count: currentCount };
      };
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        order: vi.fn(() => builder),
        range: vi.fn(() => builder),
        single: vi.fn(async () => {
          const rows = sourceRows.filter((row) => Object.entries(filters).every(([column, value]) => row[column] === value));
          return { data: rows[0] || null, error: rows[0] ? null : { code: 'PGRST116' } };
        }),
        insert: vi.fn((row: any) => {
          const inserted = { id: 'service-new', created_at: '2027-01-01T00:00:00.000Z', ...row };
          currentRows.push(inserted);
          return builder;
        }),
        update: vi.fn((updates: any) => {
          currentRows = currentRows.map((row) => Object.entries(filters).every(([column, value]) => row[column] === value) ? { ...row, ...updates } : row);
          return builder;
        }),
        then: (resolve: any, reject: any) => execute().then(resolve, reject),
      };
      return builder;
    }),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/packageServices');
  app.use('/api', mod.default);
});

beforeEach(() => {
  currentRows = [];
  packages = [{ id: validPackageId, org_id: 'org-1', currency: 'BAM' }];
  currentCount = 0;
});

describe('GET /api/package-services', () => {
  it('returns 200 with an empty paginated list for a valid package with zero services', async () => {
    const res = await request(app).get(`/api/package-services?packageId=${validPackageId}&limit=200`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 200,
    });
  });

  it('preserves optional package services when they exist', async () => {
    currentRows = [
      {
        id: 'service-1',
        org_id: 'org-1',
        package_id: validPackageId,
        service_type: 'insurance',
        provider_name: 'Travel insurance',
        provider_contact: null,
        unit_price: 50,
        currency: 'BAM',
        quantity: 1,
        description: 'Coverage',
        is_optional: true,
        created_at: '2027-01-01T00:00:00.000Z',
      },
    ];
    currentCount = 1;

    const res = await request(app).get(`/api/package-services?packageId=${validPackageId}&limit=200`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data).toEqual([
      {
        id: 'service-1',
        packageId: validPackageId,
        serviceType: 'insurance',
        providerName: 'Travel insurance',
        providerContact: null,
        unitPrice: 50,
        currency: 'BAM',
        quantity: 1,
        totalPrice: 50,
        description: 'Coverage',
        isOptional: true,
        createdAt: '2027-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('inherits package currency when creating package services without currency', async () => {
    packages = [{ id: validPackageId, org_id: 'org-1', currency: 'EUR' }];

    const res = await request(app).post('/api/package-services').send({
      packageId: validPackageId,
      serviceType: 'tour',
      unitPrice: 25,
      quantity: 2,
      isOptional: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.currency).toBe('EUR');
    expect(currentRows[0]).toMatchObject({ currency: 'EUR' });
  });

  it('rejects package service currency that differs from package currency', async () => {
    packages = [{ id: validPackageId, org_id: 'org-1', currency: 'EUR' }];

    const res = await request(app).post('/api/package-services').send({
      packageId: validPackageId,
      serviceType: 'tour',
      unitPrice: 25,
      currency: 'BAM',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CURRENCY_MISMATCH');
  });
});
