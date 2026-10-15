import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const DEP_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID = 'org-doc-test';

const departureRow = {
  id: DEP_ID,
  org_id: ORG_ID,
  transport_type: 'bus',
  capacity: 45,
  depart_at: '2026-05-01T08:00:00Z',
  return_at: '2026-05-10T18:00:00Z',
  packages: {
    id: 'pkg-1',
    name: 'Istanbul Express',
    destination: 'Istanbul, Turska',
    currency: 'BAM',
  },
};

const reservationRow = {
  id: '22222222-2222-2222-2222-222222222222',
  departure_id: DEP_ID,
  org_id: ORG_ID,
  party_size: 2,
  hotel_name: 'Grand Hotel Istanbul',
  room_type: 'Double Room',
  total_amount: 1200,
  paid_amount: 600,
  currency: 'BAM',
  customers: {
    first_name: 'Mirza',
    last_name: 'Delic',
    phone: '+38761123456',
    email: 'mirza@example.com',
  },
};

const passengerRow = {
  id: 'pax-1',
  reservation_id: reservationRow.id,
  departure_id: DEP_ID,
  org_id: ORG_ID,
  full_name: 'Mirza Delic',
  phone: '+38761123456',
  email: 'mirza@example.com',
  seat_number: 12,
  id_document_number: 'B1234567',
  id_document_type: 'Pasoš',
  id_document_expiry: '2030-01-01',
  nationality: 'BiH',
  date_of_birth: '1990-05-15',
  notes: 'Vegetarijanska ishrana',
};

const vehicleRow = {
  id: 'veh-1',
  departure_id: DEP_ID,
  org_id: ORG_ID,
  vehicle_label: 'Setra S 515 HD',
  registration_number: 'A12-E-345',
  capacity: 49,
  layout_type: 'standard_49',
};

const roomSlotRow = {
  id: 'slot-1',
  departure_id: DEP_ID,
  org_id: ORG_ID,
  room_number: '204',
  room_type: 'Double',
  capacity: 2,
  hotels: {
    id: 'hotel-1',
    name: 'Grand Hotel Istanbul',
    destination: 'Istanbul',
    stars: 4,
  },
  assignments: [{ passenger_id: 'pax-1' }],
};

const singleMock = vi.fn();
const maybeSingleMock = vi.fn();
const orderMock = vi.fn();

function makeChain(data: any = []) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: singleMock,
    maybeSingle: maybeSingleMock,
    then: (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'departures') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: singleMock,
              })),
            })),
          })),
        };
      }
      if (table === 'reservations') {
        return makeChain([reservationRow]);
      }
      if (table === 'departure_passengers') {
        return makeChain([passengerRow]);
      }
      if (table === 'departure_room_slots') {
        return makeChain([roomSlotRow]);
      }
      if (table === 'departure_vehicle_assignments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: maybeSingleMock,
              })),
            })),
          })),
        };
      }
      return makeChain([]);
    }),
  },
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = ORG_ID;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const departureDocsRouter = (await import('../routes/departureDocuments')).default;
  app.use('/api', departureDocsRouter);
});

beforeEach(() => {
  singleMock.mockReset();
  maybeSingleMock.mockReset();

  singleMock.mockResolvedValue({ data: departureRow, error: null });
  maybeSingleMock.mockResolvedValue({ data: vehicleRow, error: null });
});

describe('Departure Documents API (M15)', () => {
  describe('GET /api/departures/:id/manifest.pdf', () => {
    it('returns PDF stream with correct content disposition inline', async () => {
      const res = await request(app).get(`/api/departures/${DEP_ID}/manifest.pdf`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`manifest-${DEP_ID.slice(0, 8)}.pdf`);
      expect(res.body).toBeInstanceOf(Buffer);
    });

    it('returns 404 if departure not found', async () => {
      singleMock.mockResolvedValueOnce({ data: null, error: null });
      const res = await request(app).get('/api/departures/missing/manifest.pdf');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/departures/:id/manifest.csv', () => {
    it('returns UTF-8 CSV with passenger headers and authoritative data', async () => {
      const res = await request(app).get(`/api/departures/${DEP_ID}/manifest.csv`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`manifest-${DEP_ID.slice(0, 8)}.csv`);
      expect(res.text).toContain('Ime i prezime');
      expect(res.text).toContain('Mirza Delic');
      expect(res.text).toContain('B1234567');
      expect(res.text).toContain('12'); // Seat number
      expect(res.text).toContain('Grand Hotel Istanbul');
    });
  });

  describe('GET /api/departures/:id/rooming-list.pdf', () => {
    it('returns PDF stream for rooming list', async () => {
      const res = await request(app).get(`/api/departures/${DEP_ID}/rooming-list.pdf`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`rooming-list-${DEP_ID.slice(0, 8)}.pdf`);
    });
  });

  describe('GET /api/departures/:id/rooming-list.csv', () => {
    it('returns CSV with hotel, room number and assigned occupants', async () => {
      const res = await request(app).get(`/api/departures/${DEP_ID}/rooming-list.csv`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`rooming-list-${DEP_ID.slice(0, 8)}.csv`);
      expect(res.text).toContain('Hotel');
      expect(res.text).toContain('Broj sobe');
      expect(res.text).toContain('Grand Hotel Istanbul');
      expect(res.text).toContain('204');
      expect(res.text).toContain('Mirza Delic');
    });
  });

  describe('GET /api/departures/:id/bus-seating.pdf', () => {
    it('returns bus seating chart PDF', async () => {
      const res = await request(app).get(`/api/departures/${DEP_ID}/bus-seating.pdf`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`bus-seating-${DEP_ID.slice(0, 8)}.pdf`);
    });
  });

  describe('GET /api/departures/:id/bus-seating.csv', () => {
    it('returns bus seating list CSV', async () => {
      const res = await request(app).get(`/api/departures/${DEP_ID}/bus-seating.csv`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`bus-seating-${DEP_ID.slice(0, 8)}.csv`);
      expect(res.text).toContain('Sjediste');
      expect(res.text).toContain('Mirza Delic');
      expect(res.text).toContain('12');
    });
  });

  describe('GET /api/departures/:id/vouchers-batch.pdf', () => {
    it('returns batch vouchers PDF for reservations', async () => {
      const res = await request(app).get(`/api/departures/${DEP_ID}/vouchers-batch.pdf`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`vouchers-${DEP_ID.slice(0, 8)}.pdf`);
    });
  });
});
