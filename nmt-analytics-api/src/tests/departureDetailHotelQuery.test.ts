import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';

const DEPARTURE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PACKAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOTEL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const hotel = {
  id: HOTEL_ID,
  org_id: 'org-1',
  name: 'Hotel Sultan',
  country: 'Turkey',
  destination: 'Istanbul',
  stars: 5,
};

const packageHotel = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  package_id: PACKAGE_ID,
  hotel_id: HOTEL_ID,
  org_id: 'org-1',
  hotels: { id: hotel.id, name: hotel.name, country: hotel.country, destination: hotel.destination, stars: hotel.stars },
};

const capturedSelects: { table: string; columns: string }[] = [];

function createBuilder(table: string) {
  const state: Record<string, any> = { filters: {} };

  const builder: any = {
    select: vi.fn((columns?: string) => {
      if (typeof columns === 'string') {
        capturedSelects.push({ table, columns });
      }
      return builder;
    }),
    eq: vi.fn((column: string, value: any) => {
      state.filters[column] = value;
      return builder;
    }),
    order: vi.fn(() => builder),
    single: vi.fn(async () => {
      const result = await execute();
      if (result.error) return result;
      const rows = result.data || [];
      if (rows.length === 0) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
      return { data: rows[0], error: null };
    }),
    maybeSingle: vi.fn(async () => {
      const result = await execute();
      if (result.error) return result;
      const rows = result.data || [];
      return { data: rows[0] ?? null, error: null };
    }),
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  async function execute(): Promise<{ data: any; error: any }> {
    if (table === 'departures') {
      return {
        data: [{
          id: DEPARTURE_ID,
          org_id: currentOrgId,
          package_id: PACKAGE_ID,
          capacity: 40,
          booked: 5,
          transport_type: 'none',
          flight_id: null,
          packages: {
            id: PACKAGE_ID,
            name: 'Istanbul Package',
            destination: 'Istanbul',
            base_price: 800,
            currency: 'EUR',
            transport_type: 'none',
            trip_type: 'cultural',
          },
        }],
        error: null,
      };
    }
    if (table === 'package_hotels') {
      return { data: [packageHotel], error: null };
    }
    return { data: [], error: null };
  }

  return builder;
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
  },
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/departures');
  app.use('/api', mod.default);
});

beforeEach(() => {
  currentOrgId = 'org-1';
  capturedSelects.length = 0;
});

describe('GET /api/departures/:id — package hotel query', () => {
  it('selects destination (not city) from the package hotels relation', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE_ID}`);

    expect(res.status).toBe(200);

    const packageHotelSelect = capturedSelects.find((entry) => entry.table === 'package_hotels');
    expect(packageHotelSelect).toBeDefined();
    expect(packageHotelSelect!.columns).toContain('destination');
    expect(packageHotelSelect!.columns).not.toContain('city');
  });

  it('returns package hotel data with destination populated', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.packageHotels).toBeDefined();
    expect(res.body.packageHotels).toHaveLength(1);

    const joined = res.body.packageHotels[0].hotels;
    expect(joined).toBeDefined();
    expect(joined.destination).toBe('Istanbul');
    expect(joined).not.toHaveProperty('city');
  });
});
