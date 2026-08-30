import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';

const packages = [
  { id: '11111111-1111-4111-8111-111111111111', org_id: 'org-1', name: 'Package A' },
  { id: '22222222-2222-4222-8222-222222222222', org_id: 'org-2', name: 'Package B' },
];

const hotels = [
  { id: '33333333-3333-4333-8333-333333333333', org_id: 'org-1', name: 'Hotel One', destination: 'Istanbul', stars: 4 },
  { id: '44444444-4444-4444-8444-444444444444', org_id: 'org-1', name: 'Hotel Two', destination: 'Medina', stars: 5 },
  { id: '55555555-5555-4555-8555-555555555555', org_id: 'org-2', name: 'Hotel Foreign', destination: 'Dubai', stars: 3 },
];

let packageHotels: any[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function withJoinedHotel(row: any) {
  const hotel = hotels.find((item) => item.id === row.hotel_id) || null;
  return {
    ...row,
    hotels: hotel ? {
      id: hotel.id,
      name: hotel.name,
      destination: hotel.destination,
      stars: hotel.stars,
    } : null,
  };
}

function matches(row: any, filters: Record<string, any>) {
  return Object.entries(filters).every(([key, value]) => row[key] === value);
}

function createBuilder(table: string) {
  const state: Record<string, any> = {
    filters: {},
    action: 'select',
    payload: undefined,
    orderBy: null,
    selectJoin: false,
  };

  const builder: any = {
    select: vi.fn((columns?: string) => {
      if (state.action === 'select') {
        state.action = 'select';
      }
      state.selectJoin = typeof columns === 'string' && columns.includes('hotels');
      return builder;
    }),
    eq: vi.fn((column: string, value: any) => {
      state.filters[column] = value;
      return builder;
    }),
    order: vi.fn((column: string) => {
      state.orderBy = column;
      return builder;
    }),
    maybeSingle: vi.fn(async () => {
      const result = await execute();
      if (result.error) return result;
      const rows = result.data || [];
      return { data: rows[0] ?? null, error: null };
    }),
    single: vi.fn(async () => {
      const result = await execute();
      if (result.error) return result;
      const rows = result.data || [];
      if (rows.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'not found' } };
      }
      return { data: rows[0], error: null };
    }),
    insert: vi.fn((payload: any) => {
      state.action = 'insert';
      state.payload = payload;
      return builder;
    }),
    update: vi.fn((payload: any) => {
      state.action = 'update';
      state.payload = payload;
      return builder;
    }),
    delete: vi.fn(() => {
      state.action = 'delete';
      return builder;
    }),
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  async function execute() {
    if (table === 'packages') {
      return { data: packages.filter((row) => matches(row, state.filters)), error: null };
    }

    if (table === 'hotels') {
      return { data: hotels.filter((row) => matches(row, state.filters)), error: null };
    }

    if (table !== 'package_hotels') {
      throw new Error(`Unhandled table: ${table}`);
    }

    if (state.action === 'select') {
      let rows = packageHotels.filter((row) => matches(row, state.filters));
      if (state.orderBy === 'sort_order') {
        rows = rows.slice().sort((a, b) => a.sort_order - b.sort_order);
      }
      return { data: state.selectJoin ? rows.map(withJoinedHotel) : clone(rows), error: null };
    }

    if (state.action === 'insert') {
      const row = {
        id: `link-${packageHotels.length + 1}`,
        package_id: state.payload.package_id,
        hotel_id: state.payload.hotel_id,
        org_id: state.payload.org_id,
        room_options: clone(state.payload.room_options || []),
        price_modifier: state.payload.price_modifier ?? 0,
        sort_order: state.payload.sort_order ?? 0,
        created_at: '2026-08-30T12:00:00.000Z',
        updated_at: '2026-08-30T12:00:00.000Z',
      };
      packageHotels.push(row);
      return { data: [state.selectJoin ? withJoinedHotel(row) : clone(row)], error: null };
    }

    if (state.action === 'update') {
      const rows = packageHotels.filter((row) => matches(row, state.filters));
      packageHotels = packageHotels.map((row) => (
        matches(row, state.filters)
          ? { ...row, ...clone(state.payload) }
          : row
      ));
      const updated = packageHotels.filter((row) => rows.some((candidate) => candidate.id === row.id));
      return { data: state.selectJoin ? updated.map(withJoinedHotel) : clone(updated), error: null };
    }

    if (state.action === 'delete') {
      packageHotels = packageHotels.filter((row) => !matches(row, state.filters));
      return { data: null, error: null };
    }

    return { data: [], error: null };
  }

  return builder;
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'manager' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
  },
  handleSupabaseError: (res: any, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/packageHotels');
  app.use('/api', mod.default);
});

beforeEach(() => {
  currentOrgId = 'org-1';
  packageHotels = [
    {
      id: 'link-1',
      package_id: packages[0].id,
      hotel_id: hotels[0].id,
      org_id: 'org-1',
      room_options: [
        { type: 'double', label: 'Double', net_price: 80, sell_price: 100, available: 10 },
      ],
      price_modifier: 50,
      sort_order: 1,
      created_at: '2026-08-30T10:00:00.000Z',
      updated_at: '2026-08-30T10:00:00.000Z',
    },
  ];
});

describe('package hotels routes', () => {
  it('lists package hotels for the authenticated organization', async () => {
    const res = await request(app).get(`/api/packages/${packages[0].id}/hotels`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'link-1',
      packageId: packages[0].id,
      hotelId: hotels[0].id,
      priceModifier: 50,
      sortOrder: 1,
      hotel: {
        id: hotels[0].id,
        name: 'Hotel One',
      },
    });
  });

  it('rejects listing hotels for a package in another organization', async () => {
    const res = await request(app).get(`/api/packages/${packages[1].id}/hotels`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('rejects linking a hotel from another organization', async () => {
    const res = await request(app)
      .post(`/api/packages/${packages[0].id}/hotels`)
      .send({ hotelId: hotels[2].id });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('rejects a duplicate hotel link', async () => {
    const res = await request(app)
      .post(`/api/packages/${packages[0].id}/hotels`)
      .send({ hotelId: hotels[0].id });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('creates a link with multiple room options', async () => {
    const res = await request(app)
      .post(`/api/packages/${packages[0].id}/hotels`)
      .send({
        hotelId: hotels[1].id,
        priceModifier: 25,
        sortOrder: 2,
        roomOptions: [
          { type: 'single', label: 'Single', netPrice: 90, sellPrice: 110, available: 4 },
          { type: 'suite', label: 'Family suite', netPrice: 160, sellPrice: 210, available: 2 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      hotelId: hotels[1].id,
      priceModifier: 25,
      sortOrder: 2,
    });
    expect(res.body.roomOptions).toEqual([
      { type: 'single', label: 'Single', net_price: 90, sell_price: 110, available: 4 },
      { type: 'suite', label: 'Family suite', net_price: 160, sell_price: 210, available: 2 },
    ]);
  });

  it('patches room options, price modifier and sort order', async () => {
    const res = await request(app)
      .patch('/api/package-hotels/link-1')
      .send({
        priceModifier: 99,
        sortOrder: 7,
        roomOptions: [
          { type: 'triple', label: 'Triple room', netPrice: 120, sellPrice: 150, available: 5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'link-1',
      priceModifier: 99,
      sortOrder: 7,
    });
    expect(res.body.roomOptions[0]).toMatchObject({
      type: 'triple',
      label: 'Triple room',
      net_price: 120,
      sell_price: 150,
      available: 5,
    });
  });

  it('returns not found for an unknown or cross-organization link', async () => {
    let res = await request(app).patch('/api/package-hotels/link-404').send({ sortOrder: 3 });
    expect(res.status).toBe(404);

    currentOrgId = 'org-2';
    res = await request(app).delete('/api/package-hotels/link-1');
    expect(res.status).toBe(404);
  });

  it('deletes an existing link', async () => {
    const res = await request(app).delete('/api/package-hotels/link-1');

    expect(res.status).toBe(204);

    const listRes = await request(app).get(`/api/packages/${packages[0].id}/hotels`);
    expect(listRes.body.data).toHaveLength(0);
  });
});
