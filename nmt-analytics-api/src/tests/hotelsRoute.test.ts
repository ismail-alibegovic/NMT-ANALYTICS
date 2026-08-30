import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';
let hotels: any[] = [];
let hotelRooms: any[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function createBuilder(table: string) {
  const state: Record<string, any> = {
    payload: undefined,
    filters: {},
    action: 'select',
  };

  const builder: any = {
    insert: vi.fn((payload: any) => {
      state.action = 'insert';
      state.payload = payload;
      return builder;
    }),
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: any) => {
      state.filters[column] = value;
      return builder;
    }),
    single: vi.fn(async () => {
      const result = await execute();
      if (Array.isArray(result.data)) {
        return { data: result.data[0] ?? null, error: result.error };
      }
      return result;
    }),
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  async function execute() {
    if (table === 'hotels') {
      if (state.action === 'insert') {
        const row = {
          id: `hotel-${hotels.length + 1}`,
          org_id: state.payload.org_id,
          name: state.payload.name,
          destination: state.payload.destination,
          address: state.payload.address ?? null,
          contact: state.payload.contact ?? null,
          total_rooms: state.payload.total_rooms ?? 0,
          stars: state.payload.stars ?? null,
          description: state.payload.description ?? null,
          amenities: state.payload.amenities ?? null,
          email: state.payload.email ?? null,
          website: state.payload.website ?? null,
          slug: state.payload.slug,
          created_at: '2026-08-30T12:00:00.000Z',
        };
        hotels.push(row);
        return { data: clone([row]), error: null };
      }

      return { data: clone(hotels), error: null };
    }

    if (table === 'hotel_rooms') {
      if (state.action === 'insert') {
        hotelRooms.push(clone(state.payload));
        return { data: clone([state.payload]), error: null };
      }
      return { data: clone(hotelRooms), error: null };
    }

    throw new Error(`Unhandled table: ${table}`);
  }

  return builder;
}

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
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

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/audit', () => ({
  logAction: vi.fn(),
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
  const mod = await import('../routes/hotels');
  app.use('/api', mod.default);
});

beforeEach(() => {
  currentOrgId = 'org-1';
  hotels = [];
  hotelRooms = [];
});

describe('POST /api/hotels', () => {
  it('accepts totalRooms = 0 and does not create derived hotel rooms', async () => {
    const res = await request(app).post('/api/hotels').send({
      name: 'Hotel Zero',
      destination: 'Mostar',
      totalRooms: 0,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Hotel Zero',
      destination: 'Mostar',
      totalRooms: 0,
    });
    expect(hotelRooms).toHaveLength(0);
  });

  it('accepts omitted totalRooms and defaults safely to zero', async () => {
    const res = await request(app).post('/api/hotels').send({
      name: 'Hotel Default',
      destination: 'Sarajevo',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Hotel Default',
      destination: 'Sarajevo',
      totalRooms: 0,
    });
    expect(hotelRooms).toHaveLength(0);
  });

  it('rejects negative totalRooms', async () => {
    const res = await request(app).post('/api/hotels').send({
      name: 'Hotel Invalid',
      destination: 'Tuzla',
      totalRooms: -1,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
