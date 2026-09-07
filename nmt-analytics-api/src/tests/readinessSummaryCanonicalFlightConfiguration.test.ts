import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockState = vi.hoisted(() => ({
  departures: [] as any[],
  flightSegments: [] as any[],
  flightSegmentsError: null as any,
  calls: [] as Array<{ table: string; method: string; args: any[] }>,
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'test@example.com' };
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
  if (table === 'departures') {
    return { data: mockState.departures, error: null };
  }
  if (table === 'departure_flights') {
    return { data: mockState.flightSegments, error: mockState.flightSegmentsError };
  }
  return { data: [], error: null };
}

function flightDeparture(overrides: Record<string, any> = {}) {
  return {
    id: 'dep-1',
    org_id: 'org-1',
    depart_at: '2027-03-10T08:00:00.000Z',
    return_at: '2027-03-17T18:00:00.000Z',
    transport_type: 'flight',
    flight_id: null,
    document_readiness_required: false,
    traveler_requirements: null,
    package_id: 'package-1',
    packages: {
      id: 'package-1',
      name: 'Vienna Imperial Tour',
      destination: 'Vienna',
      transport_type: 'flight',
      trip_type: 'tour',
      traveler_requirements: null,
    },
    ...overrides,
  };
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
  mockState.flightSegments = [];
  mockState.flightSegmentsError = null;
  mockState.calls = [];
});

describe('GET /api/departures/readiness-summary — canonical flight configuration', () => {
  it('returns flightConfigured false when legacy flight_id exists but canonical departure_flights is empty', async () => {
    mockState.departures = [flightDeparture({ id: 'dep-empty', flight_id: 'legacy-flight-id' })];
    mockState.flightSegments = [];

    const res = await request(app).get('/api/departures/readiness-summary?dateFrom=2027-01-01');

    expect(res.status).toBe(200);
    expect(res.body.departures).toHaveLength(1);
    expect(res.body.departures[0].departureId).toBe('dep-empty');
    expect(res.body.departures[0].flightConfigured).toBe(false);
  });

  it('returns flightConfigured true when legacy flight_id is null but canonical departure_flights has a segment', async () => {
    mockState.departures = [flightDeparture({ id: 'dep-configured', flight_id: null })];
    mockState.flightSegments = [{ departure_id: 'dep-configured' }];

    const res = await request(app).get('/api/departures/readiness-summary?dateFrom=2027-01-01');

    expect(res.status).toBe(200);
    expect(res.body.departures).toHaveLength(1);
    expect(res.body.departures[0].departureId).toBe('dep-configured');
    expect(res.body.departures[0].flightConfigured).toBe(true);
  });

  it('returns the normal DB error when the batch departure_flights query fails', async () => {
    mockState.departures = [flightDeparture({ id: 'dep-error', flight_id: 'legacy-flight-id' })];
    mockState.flightSegmentsError = { message: 'departure_flights failed' };

    const res = await request(app).get('/api/departures/readiness-summary?dateFrom=2027-01-01');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'DB_ERROR',
      message: 'Failed to fetch departure flight segments',
    });
  });

  it('uses one org-scoped batch departure_flights query for all returned departures', async () => {
    mockState.departures = [
      flightDeparture({ id: 'dep-empty', flight_id: 'legacy-flight-id' }),
      flightDeparture({ id: 'dep-configured', flight_id: null }),
    ];
    mockState.flightSegments = [{ departure_id: 'dep-configured' }];

    const res = await request(app).get('/api/departures/readiness-summary?dateFrom=2027-01-01');

    expect(res.status).toBe(200);
    expect(
      mockState.calls.filter((call) => call.table === 'departure_flights' && call.method === 'select'),
    ).toHaveLength(1);
    expect(mockState.calls).toContainEqual({
      table: 'departure_flights',
      method: 'eq',
      args: ['org_id', 'org-1'],
    });
    expect(mockState.calls).toContainEqual({
      table: 'departure_flights',
      method: 'in',
      args: ['departure_id', ['dep-empty', 'dep-configured']],
    });
  });
});
