import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = '00000000-0000-4000-8000-000000000001';
const DEPARTURE = '10000000-0000-4000-8000-000000000001';

let rows: Record<string, any[]> = {};
let app: express.Express;

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

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => query(table)),
  },
}));

function query(table: string) {
  const state = {
    filters: [] as Array<(row: any) => boolean>,
  };

  const api: any = {
    select: vi.fn(() => api),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      state.filters.push((row) => values.includes(row[column]));
      return api;
    }),
    order: vi.fn(() => api),
    single: vi.fn(async () => {
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      const row = result[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    then(resolve: any) {
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      return Promise.resolve({ data: result, error: null }).then(resolve);
    },
  };

  return api;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', (await import('../routes/departures')).default);
});

beforeEach(() => {
  rows = {
    departures: [
      {
        id: DEPARTURE,
        org_id: ORG,
        package_id: 'pkg-1',
        depart_at: '2026-09-09T08:00:00.000Z',
        return_at: '2026-09-12T18:00:00.000Z',
        capacity: 40,
        booked: 3,
        transport_type: 'bus',
        flight_id: null,
        document_readiness_required: false,
        traveler_requirements: null,
        packages: { id: 'pkg-1', name: 'Antalya', destination: 'Antalya', currency: 'BAM', transport_type: 'bus', traveler_requirements: null },
      },
    ],
    reservations: [
      {
        id: 'reservation-a',
        org_id: ORG,
        departure_id: DEPARTURE,
        customer_id: null,
        customer_name: 'Reservation A',
        customer_phone: null,
        party_size: 2,
        total_amount: 1000,
        currency: 'BAM',
        status: 'confirmed',
        source: 'direct',
        reservation_at: '2026-09-01T00:00:00.000Z',
        hotel_name: null,
        room_type: null,
        check_in: null,
        check_out: null,
        tour_guide: null,
        assigned_to: null,
        customers: null,
      },
      {
        id: 'reservation-b',
        org_id: ORG,
        departure_id: DEPARTURE,
        customer_id: null,
        customer_name: 'Reservation B',
        customer_phone: null,
        party_size: 1,
        total_amount: 500,
        currency: 'BAM',
        status: 'confirmed',
        source: 'direct',
        reservation_at: '2026-09-02T00:00:00.000Z',
        hotel_name: null,
        room_type: null,
        check_in: null,
        check_out: null,
        tour_guide: null,
        assigned_to: null,
        customers: null,
      },
    ],
    departure_passengers: [
      { id: 'passenger-a1', org_id: ORG, departure_id: DEPARTURE, reservation_id: 'reservation-a', full_name: 'A One', seat_number: null },
      { id: 'passenger-a2', org_id: ORG, departure_id: DEPARTURE, reservation_id: 'reservation-a', full_name: 'A Two', seat_number: null },
    ],
    payments: [
      { id: 'payment-a-success', org_id: ORG, reservation_id: 'reservation-a', amount: 300, currency: 'BAM', status: 'succeeded', payment_date: '2026-09-03' },
      { id: 'payment-a-pending', org_id: ORG, reservation_id: 'reservation-a', amount: 200, currency: 'BAM', status: 'pending', payment_date: '2026-09-04' },
      { id: 'payment-b-success', org_id: ORG, reservation_id: 'reservation-b', amount: 100, currency: 'BAM', status: 'succeeded', payment_date: '2026-09-05' },
    ],
    profiles: [],
    trip_passenger_group_members: [],
    trip_passenger_groups: [],
    hotel_allocations: [],
    reservation_accommodation_requirements: [],
  };
});

describe('GET /api/departures/:id/passengers finance summary', () => {
  it('aggregates paid and debt once per reservation, not once per passenger row', async () => {
    const res = await request(app).get(`/api/departures/${DEPARTURE}/passengers`);

    expect(res.status).toBe(200);
    expect(res.body.manifest).toHaveLength(3);
    expect(res.body.manifest.filter((row: any) => row.reservationId === 'reservation-a')).toHaveLength(2);
    expect(res.body.manifest.filter((row: any) => row.reservationId === 'reservation-a').map((row: any) => row.paid)).toEqual([300, 300]);
    expect(res.body.summary.totalPaid).toBe(400);
    expect(res.body.summary.totalDebt).toBe(1100);
  });
});
