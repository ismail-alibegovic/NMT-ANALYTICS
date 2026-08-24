import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';

const packageRow = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: 'org-1',
  name: 'Istanbul Express',
  destination: 'Istanbul',
  base_price: 899,
  currency: 'BAM',
  is_active: true,
  description: 'Core package',
  created_at: '2026-08-24T10:00:00.000Z',
};

const packageServices = [
  {
    id: 'service-1',
    package_id: packageRow.id,
    org_id: 'org-1',
    service_type: 'extra',
    provider_name: 'Test Provider',
    quantity: 2,
    unit_price: 45,
    currency: 'BAM',
  },
];

const packageHotels = [
  {
    id: 'pkg-hotel-1',
    package_id: packageRow.id,
    org_id: 'org-1',
    hotel_id: 'hotel-1',
    room_type: 'double',
    hotels: {
      id: 'hotel-1',
      name: 'Test Hotel',
    },
  },
];

const departures = [
  {
    id: 'dep-1',
    depart_at: '2026-09-01T06:00:00.000Z',
    return_at: '2026-09-05T18:00:00.000Z',
    status: 'active',
    capacity: 40,
    booked: 12,
    transport_type: 'bus',
    package_id: packageRow.id,
    org_id: 'org-1',
  },
];

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../middleware/auditLogger', () => ({
  auditPackageCreate: (_req: any, _res: any, next: any) => next(),
  auditPackageUpdate: (_req: any, _res: any, next: any) => next(),
  auditPackageDelete: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};
      if (table === 'packages') {
        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          single: vi.fn(async () => {
            const matchesId = filters.id === packageRow.id;
            const matchesOrg = filters.org_id === packageRow.org_id;
            if (matchesId && matchesOrg) {
              return { data: packageRow, error: null };
            }
            return { data: null, error: { code: 'PGRST116', message: 'not found' } };
          }),
        };
        return builder;
      }

      if (table === 'package_services') {
        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: any) => {
            filters[column] = value;
            if (filters.package_id !== undefined && filters.org_id !== undefined) {
              const matches = filters.package_id === packageRow.id && filters.org_id === packageRow.org_id;
              return Promise.resolve({ data: matches ? packageServices : [], error: null });
            }
            return builder;
          }),
        };
        return builder;
      }

      if (table === 'package_hotels') {
        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: any) => {
            filters[column] = value;
            if (filters.package_id !== undefined && filters.org_id !== undefined) {
              const matches = filters.package_id === packageRow.id && filters.org_id === packageRow.org_id;
              return Promise.resolve({ data: matches ? packageHotels : [], error: null });
            }
            return builder;
          }),
        };
        return builder;
      }

      if (table === 'departures') {
        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: any) => {
            filters[column] = value;
            return builder;
          }),
          limit: vi.fn(async () => {
            const matches = filters.package_id === packageRow.id && filters.org_id === packageRow.org_id;
            return { data: matches ? departures : [], error: null };
          }),
        };
        return builder;
      }

      throw new Error(`Unhandled table: ${table}`);
    }),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/packages');
  app.use('/api', mod.default);
});

beforeEach(() => {
  currentOrgId = 'org-1';
});

describe('GET /api/packages/:id', () => {
  it('returns 200 with linked data for the same org', async () => {
    const res = await request(app).get(`/api/packages/${packageRow.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(packageRow.id);
    expect(res.body.data.package_services).toHaveLength(1);
    expect(res.body.data.hotels[0].hotel_name).toBe('Test Hotel');
    expect(res.body.data.departures[0].id).toBe('dep-1');
  });

  it('returns 404 for another org', async () => {
    currentOrgId = 'org-2';

    const res = await request(app).get(`/api/packages/${packageRow.id}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 404 when the package does not exist', async () => {
    const res = await request(app).get('/api/packages/99999999-9999-4999-8999-999999999999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
