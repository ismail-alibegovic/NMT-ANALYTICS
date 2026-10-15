import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockState = vi.hoisted(() => ({
  departures: [] as any[],
  passengers: [] as any[],
  buildings: [] as any[],
  packageHotels: [] as any[],
  hotelAllocations: [] as any[],
  flightSegments: [] as any[],
  role: 'agent',
  calls: [] as Array<{ table: string; method: string; args: any[] }>,
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'test@example.com', role: mockState.role };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = 'org-1';
    next();
  },
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
  },
  handleSupabaseError: vi.fn((res: any, _err: any, message: string) => {
    res.status(500).json({ error: 'DB_ERROR', message });
  }),
}));

function createBuilder(table: string) {
  const builder: any = {
    select: vi.fn((...args: any[]) => {
      mockState.calls.push({ table, method: 'select', args });
      return builder;
    }),
    eq: vi.fn((...args: any[]) => {
      mockState.calls.push({ table, method: 'eq', args });
      return builder;
    }),
    gte: vi.fn((...args: any[]) => {
      mockState.calls.push({ table, method: 'gte', args });
      return builder;
    }),
    in: vi.fn((...args: any[]) => {
      mockState.calls.push({ table, method: 'in', args });
      return builder;
    }),
    not: vi.fn((...args: any[]) => {
      mockState.calls.push({ table, method: 'not', args });
      return builder;
    }),
    order: vi.fn((...args: any[]) => {
      mockState.calls.push({ table, method: 'order', args });
      return builder;
    }),
    limit: vi.fn((...args: any[]) => {
      mockState.calls.push({ table, method: 'limit', args });
      return builder;
    }),
    then: (resolve: any, reject: any) => execute(table).then(resolve, reject),
  };
  return builder;
}

async function execute(table: string) {
  if (table === 'departures') return { data: mockState.departures, error: null };
  if (table === 'departure_passengers') return { data: mockState.passengers, error: null };
  if (table === 'accommodation_buildings') return { data: mockState.buildings, error: null };
  if (table === 'package_hotels') return { data: mockState.packageHotels, error: null };
  if (table === 'hotel_allocations') return { data: mockState.hotelAllocations, error: null };
  if (table === 'departure_flights') return { data: mockState.flightSegments, error: null };
  return { data: [], error: null };
}

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/departures');
  app.use('/api', mod.default);
});

beforeEach(() => {
  mockState.departures = [];
  mockState.passengers = [];
  mockState.buildings = [];
  mockState.packageHotels = [];
  mockState.hotelAllocations = [];
  mockState.flightSegments = [];
  mockState.calls = [];
  mockState.role = 'agent';
});

describe('GET /api/departures/readiness-summary — operational signals', () => {
  it('correctly calculates bus unassigned seats and capacity metrics', async () => {
    mockState.departures = [
      {
        id: 'dep-bus',
        org_id: 'org-1',
        depart_at: '2027-04-01T08:00:00.000Z',
        return_at: '2027-04-05T18:00:00.000Z',
        transport_type: 'bus',
        capacity: 50,
        booked: 50,
        package_id: 'pkg-bus',
        packages: {
          id: 'pkg-bus',
          name: 'Istanbul Bus Tour',
          destination: 'Istanbul',
          transport_type: 'bus',
        },
      },
    ];

    mockState.passengers = [
      { id: 'pax-1', departure_id: 'dep-bus', seat_number: 1 },
      { id: 'pax-2', departure_id: 'dep-bus', seat_number: null },
      { id: 'pax-3', departure_id: 'dep-bus', seat_number: 0 },
    ];

    const res = await request(app).get('/api/departures/readiness-summary?dateFrom=2027-01-01');
    expect(res.status).toBe(200);
    expect(res.body.departures).toHaveLength(1);

    const dep = res.body.departures[0];
    expect(dep.hasBusTransport).toBe(true);
    expect(dep.unassignedSeats).toBe(2); // pax-2 and pax-3 have no valid seat
    expect(dep.capacity).toBe(50);
    expect(dep.booked).toBe(50);
    expect(dep.isCapacityFull).toBe(true);
    expect(dep.availableCapacity).toBe(0);
  });

  it('correctly detects unconfigured accommodation when package has hotels but no buildings', async () => {
    mockState.departures = [
      {
        id: 'dep-hotel',
        org_id: 'org-1',
        depart_at: '2027-05-01T08:00:00.000Z',
        return_at: '2027-05-08T18:00:00.000Z',
        transport_type: 'none',
        capacity: 30,
        booked: 15,
        package_id: 'pkg-hotel',
        packages: {
          id: 'pkg-hotel',
          name: 'Rome Holiday',
          destination: 'Rome',
          transport_type: 'none',
        },
      },
    ];

    mockState.packageHotels = [{ package_id: 'pkg-hotel' }];
    mockState.buildings = []; // No buildings configured yet

    const res = await request(app).get('/api/departures/readiness-summary?dateFrom=2027-01-01');
    expect(res.status).toBe(200);

    const dep = res.body.departures[0];
    expect(dep.hasAccommodation).toBe(true);
    expect(dep.accommodationConfigured).toBe(false);
    expect(dep.isCapacityFull).toBe(false);
    expect(dep.availableCapacity).toBe(15);
  });

  it('is accessible to agent role without supplier details leaked', async () => {
    mockState.role = 'agent';
    mockState.departures = [
      {
        id: 'dep-agent',
        org_id: 'org-1',
        depart_at: '2027-06-01T08:00:00.000Z',
        return_at: '2027-06-05T18:00:00.000Z',
        transport_type: 'bus',
        package_id: 'pkg-1',
        packages: { id: 'pkg-1', name: 'Tour' },
      },
    ];

    const res = await request(app).get('/api/departures/readiness-summary');
    expect(res.status).toBe(200);
    expect(res.body.departures[0].supplierIssues).toBeUndefined();
    expect(res.body.departures[0].hasBusTransport).toBe(true);
  });
});
