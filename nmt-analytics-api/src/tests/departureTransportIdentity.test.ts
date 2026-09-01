import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── mock middleware ──────────────────────────────────────────
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

vi.mock('../middleware/audit', () => ({
  auditDepartureCreate: (_req: any, _res: any, next: any) => next(),
  auditDepartureUpdate: (_req: any, _res: any, next: any) => next(),
  auditDepartureDelete: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/departureAccommodation', () => ({
  materializeDepartureAccommodationFromPackage: vi.fn(async () => {}),
  releaseDepartureAccommodation: vi.fn(async () => {}),
}));

// ── test data ────────────────────────────────────────────────
const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = 'org-1';

const packageData = {
  id: PACKAGE_ID,
  org_id: ORG_ID,
  name: 'Istanbul Tour',
  destination: 'Istanbul',
  transport_type: 'bus',
};

let departuresDb: any[] = [];
let departureCounter = 0;
let capturedSelects: Record<string, string[]> = {};

function makeDeparture(overrides: Record<string, any> = {}) {
  departureCounter++;
  return {
    id: `dep-${departureCounter}`,
    org_id: ORG_ID,
    package_id: PACKAGE_ID,
    depart_at: '2026-09-10T08:00:00.000Z',
    return_at: '2026-09-17T18:00:00.000Z',
    capacity: 50,
    booked: 0,
    status: 'active',
    transport_type: 'bus',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function matchesFilters(row: Record<string, any>, filters: Record<string, any>) {
  return Object.entries(filters).every(([key, value]) => row[key] === value);
}

function withPackage(row: any) {
  return {
    ...row,
    packages: { id: packageData.id, name: packageData.name, destination: packageData.destination, base_price: null, currency: 'EUR' },
  };
}

// ── mock supabaseAdmin ───────────────────────────────────────
function createMockBuilder(table: string) {
  const state: Record<string, any> = { action: 'select', filters: {}, payload: {} };

  const select = vi.fn((columns: string) => {
    capturedSelects[table] = capturedSelects[table] || [];
    capturedSelects[table].push(columns);
    state.action = 'select';
    return chainable;
  });

  const eq = vi.fn((col: string, val: any) => {
    state.filters[col] = val;
    return chainable;
  });

  const maybeSingle = vi.fn(async () => {
    if (table === 'packages') {
      if (matchesFilters(packageData, state.filters)) return { data: { ...packageData }, error: null };
      return { data: null, error: null };
    }
    if (table === 'departures') {
      const match = departuresDb.find((r) => matchesFilters(r, state.filters));
      return { data: match || null, error: null };
    }
    return { data: null, error: null };
  });

  const single = vi.fn(async () => {
    if (table === 'packages') {
      if (matchesFilters(packageData, state.filters)) return { data: { ...packageData }, error: null };
      return { data: null, error: { message: 'not found', code: 'PGRST116' } };
    }
    if (table === 'departures') {
      const match = departuresDb.find((r) => matchesFilters(r, state.filters));
      if (!match) return { data: null, error: { message: 'not found', code: 'PGRST116' } };
      return { data: withPackage(match), error: null };
    }
    if (table === 'package_hotels') return { data: [], error: null };
    if (table === 'passengers') return { data: [], error: null };
    return { data: {}, error: null };
  });

  const upsert = vi.fn((payload: any, options: any) => {
    const conflictCols = options?.onConflict?.split(',') || [];
    if (conflictCols.length > 0) {
      const existing = departuresDb.find((r) =>
        conflictCols.every((col: string) => r[col] === payload[col])
      );
      if (existing) {
        Object.assign(existing, payload);
        return chainable;
      }
    }
    const newDep = makeDeparture(payload);
    departuresDb.push(newDep);
    return chainable;
  });

  const update = vi.fn((_payload: any) => chainable);
  const deleteFn = vi.fn(() => chainable);
  const insert = vi.fn(async () => ({ data: null, error: null }));

  const chainable = {
    select, eq, maybeSingle, single, upsert, update, insert, delete: deleteFn,
    order: vi.fn(() => chainable),
    limit: vi.fn(() => chainable),
    then: vi.fn((resolve) => resolve({ data: null, error: null })),
  };

  return chainable;
}

const mockFrom = vi.fn((table: string) => createMockBuilder(table));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { from: (table: string) => mockFrom(table) },
  handleSupabaseError: vi.fn((res: any, _err: any, _msg: string) => {
    res.status(500).json({ error: 'DB_ERROR' });
  }),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/departures');
  app.use('/api', mod.default);
});

beforeEach(() => {
  departuresDb = [];
  departureCounter = 0;
  capturedSelects = {};
  packageData.transport_type = 'bus';
});

// ── tests ────────────────────────────────────────────────────
describe('POST /departures — transport identity', () => {
  const basePayload = {
    packageId: PACKAGE_ID,
    departAt: '2026-09-10T08:00:00.000Z',
    returnAt: '2026-09-17T18:00:00.000Z',
    capacity: 50,
    booked: 0,
  };

  it('creates two distinct departures for same package + same date with different transport types', async () => {
    const busRes = await request(app).post('/api/departures').send({ ...basePayload, transportType: 'bus' });
    const flightRes = await request(app).post('/api/departures').send({ ...basePayload, transportType: 'flight' });

    expect(busRes.status).toBe(201);
    expect(flightRes.status).toBe(201);
    expect(departuresDb.length).toBe(2);
    expect(departuresDb[0].transport_type).toBe('bus');
    expect(departuresDb[1].transport_type).toBe('flight');
  });

  it('assigns independent capacities to Bus and Flight departures', async () => {
    await request(app).post('/api/departures').send({ ...basePayload, transportType: 'bus', capacity: 50 });
    await request(app).post('/api/departures').send({ ...basePayload, transportType: 'flight', capacity: 25 });

    const busDep = departuresDb.find((d) => d.transport_type === 'bus');
    const flightDep = departuresDb.find((d) => d.transport_type === 'flight');

    expect(busDep).toBeDefined();
    expect(flightDep).toBeDefined();
    expect(busDep!.capacity).toBe(50);
    expect(flightDep!.capacity).toBe(25);
  });

  it('Bus upsert updates only Bus departure, Flight untouched', async () => {
    await request(app).post('/api/departures').send({ ...basePayload, transportType: 'bus', capacity: 50 });
    await request(app).post('/api/departures').send({ ...basePayload, transportType: 'flight', capacity: 25 });

    const upRes = await request(app).post('/api/departures').send({ ...basePayload, transportType: 'bus', capacity: 55, upsert: true });

    const busDep = departuresDb.find((d) => d.transport_type === 'bus');
    const flightDep = departuresDb.find((d) => d.transport_type === 'flight');

    expect(upRes.status).toBe(200);
    expect(busDep!.capacity).toBe(55);
    expect(flightDep!.capacity).toBe(25);
    expect(departuresDb.length).toBe(2);
  });

  it('Flight upsert updates only Flight departure, Bus untouched', async () => {
    await request(app).post('/api/departures').send({ ...basePayload, transportType: 'bus', capacity: 50 });
    await request(app).post('/api/departures').send({ ...basePayload, transportType: 'flight', capacity: 25 });

    const upRes = await request(app).post('/api/departures').send({ ...basePayload, transportType: 'flight', capacity: 30, upsert: true });

    const busDep = departuresDb.find((d) => d.transport_type === 'bus');
    const flightDep = departuresDb.find((d) => d.transport_type === 'flight');

    expect(upRes.status).toBe(200);
    expect(busDep!.capacity).toBe(50);
    expect(flightDep!.capacity).toBe(30);
    expect(departuresDb.length).toBe(2);
  });

  it('falls back to package transport_type when transportType is not provided', async () => {
    // packageData.transport_type = 'bus'
    const res = await request(app).post('/api/departures').send({ ...basePayload });

    expect(res.status).toBe(201);
    expect(departuresDb.length).toBe(1);
    expect(departuresDb[0].transport_type).toBe('bus');
  });

  it('uses "none" when neither transportType nor package transport_type are provided', async () => {
    packageData.transport_type = null as any;

    const res = await request(app).post('/api/departures').send({ ...basePayload });

    expect(res.status).toBe(201);
    expect(departuresDb.length).toBe(1);
    expect(departuresDb[0].transport_type).toBe('none');
  });
});
