import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = '00000000-0000-4000-8000-000000000001';
const DEPARTURE_FLIGHT = '10000000-0000-4000-8000-000000000010';
const DEPARTURE_DMC = '10000000-0000-4000-8000-000000000020';
const FLIGHT_OUTBOUND = '20000000-0000-4000-8000-000000000001';
const FLIGHT_RETURN = '20000000-0000-4000-8000-000000000002';
const RES_FLIGHT = '30000000-0000-4000-8000-000000000001';
const RES_DMC = '30000000-0000-4000-8000-000000000002';
const QUOTE_ID = '40000000-0000-4000-8000-000000000001';

let rows: Record<string, any[]> = {};
let app: express.Express;

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 'manager-1', email: 'manager@travline.test', role: 'manager' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).orgId = ORG;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/auditLogger', () => {
  const passthrough = () => (_req: Request, _res: Response, next: NextFunction) => next();
  return {
    auditLog: () => passthrough(),
    logAuditEntry: vi.fn(),
    auditDepartureCreate: passthrough(),
    auditDepartureUpdate: passthrough(),
    auditDepartureDelete: passthrough(),
    auditReservationCreate: passthrough(),
    auditReservationUpdate: passthrough(),
    auditReservationDelete: passthrough(),
    auditPaymentCreate: passthrough(),
    auditPaymentUpdate: passthrough(),
    auditPaymentDelete: passthrough(),
  };
});

vi.mock('../lib/audit', () => ({
  logAction: vi.fn(),
}));

vi.mock('../lib/orgBranding', () => ({
  getOrgBranding: vi.fn().mockResolvedValue({
    orgName: 'Travline Agency',
    primaryColor: '#003366',
    secondaryColor: '#f0f0f0',
    logoUrl: null,
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => query(table)),
    rpc: vi.fn(async (fnName: string, args: any) => {
      if (fnName === 'update_reservation_core_atomic') {
        // HTTP scenario stub; real capacity/rollback is tested in the SQL contract.
        const row = (rows.reservations || []).find(r => r.id === args.p_reservation_id && r.org_id === args.p_org_id);
        if (!row) return { data: null, error: { message: 'RESERVATION_NOT_FOUND' } };
        Object.assign(row, args.p_updates);
        return { data: row, error: null };
      }
      if (fnName === 'list_supplier_payables') {
        const payables = (rows['supplier_payables'] || []).filter(
          (p) => p.org_id === args.p_org_id && p.departure_id === args.p_departure_id
        );
        return { data: payables, error: null };
      }
      return { data: null, error: null };
    }),
  },
  handleSupabaseError: vi.fn((res: Response, error: any, message: string) =>
    res.status(500).json({ code: 'SUPABASE_ERROR', message, error })
  ),
}));

function query(table: string) {
  const state = {
    filters: [] as Array<(row: any) => boolean>,
    selectFields: '*',
    orderColumn: null as string | null,
    orderAsc: true,
    pendingUpdates: null as any,
  };

  const applyUpdates = () => {
    if (!state.pendingUpdates) return;
    const tableRows = rows[table] || [];
    for (let i = 0; i < tableRows.length; i++) {
      if (state.filters.every((f) => f(tableRows[i]))) {
        tableRows[i] = { ...tableRows[i], ...state.pendingUpdates, updated_at: new Date().toISOString() };
      }
    }
  };

  const api: any = {
    select: vi.fn((fields?: string) => {
      if (fields) state.selectFields = fields;
      return api;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    neq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] !== value);
      return api;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      state.filters.push((row) => values.includes(row[column]));
      return api;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] >= (value as any));
      return api;
    }),
    lte: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] <= (value as any));
      return api;
    }),
    gt: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] > (value as any));
      return api;
    }),
    lt: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] < (value as any));
      return api;
    }),
    order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
      state.orderColumn = col;
      state.orderAsc = opts?.ascending ?? true;
      return api;
    }),
    limit: vi.fn(() => api),
    range: vi.fn(() => api),
    insert: vi.fn((payload: any) => {
      const inserted = Array.isArray(payload) ? payload : [payload];
      const records = inserted.map((item) => ({
        id: item.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        created_at: new Date().toISOString(),
        ...item,
      }));
      rows[table] = (rows[table] || []).concat(records);
      const resData = Array.isArray(payload) ? records : records[0];
      const resultObj: any = {
        data: resData,
        error: null,
        select: vi.fn(() => resultObj),
        single: vi.fn(async () => ({ data: records[0], error: null })),
        maybeSingle: vi.fn(async () => ({ data: records[0], error: null })),
        then(resolve: any) {
          return Promise.resolve({ data: resData, error: null }).then(resolve);
        },
      };
      return resultObj;
    }),
    update: vi.fn((updates: any) => {
      state.pendingUpdates = updates;
      return api;
    }),
    delete: vi.fn(() => {
      const initial = rows[table] || [];
      const remaining = initial.filter((row) => !state.filters.every((f) => f(row)));
      rows[table] = remaining;
      return Promise.resolve({ data: null, error: null });
    }),
    single: vi.fn(async () => {
      applyUpdates();
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      const row = result[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    maybeSingle: vi.fn(async () => {
      applyUpdates();
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      return { data: result[0] || null, error: null };
    }),
    then(resolve: any) {
      applyUpdates();
      let result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      if (state.orderColumn) {
        result = [...result].sort((a, b) => {
          const valA = a[state.orderColumn!];
          const valB = b[state.orderColumn!];
          if (valA < valB) return state.orderAsc ? -1 : 1;
          if (valA > valB) return state.orderAsc ? 1 : -1;
          return 0;
        });
      }
      return Promise.resolve({ data: result, error: null, count: result.length }).then(resolve);
    },
  };

  return api;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api', (await import('../routes/departures')).default);
  app.use('/api', (await import('../routes/departureDocuments')).default);
  app.use('/api', (await import('../routes/reservations')).default);
  app.use('/api', (await import('../routes/flights')).default);
  app.use('/api', (await import('../routes/departureProfitability')).default);
  app.use('/api', (await import('../routes/contracts')).default);
});

beforeEach(() => {
  rows = {
    organizations: [
      {
        id: ORG,
        name: 'Travline Central Agency',
        slug: 'travline-central',
        email: 'info@travline.test',
        currency: 'BAM',
      },
    ],
    packages: [
      {
        id: 'pkg-flight-1',
        org_id: ORG,
        name: 'Istanbul Flight Tour',
        destination: 'Istanbul',
        currency: 'BAM',
        transport_type: 'flight',
        base_price: 600,
      },
      {
        id: 'pkg-dmc-1',
        org_id: ORG,
        name: 'Bosnia Highlights DMC',
        destination: 'Sarajevo',
        currency: 'EUR',
        transport_type: 'none',
        base_price: 1200,
      },
    ],
    departures: [
      {
        id: DEPARTURE_FLIGHT,
        org_id: ORG,
        package_id: 'pkg-flight-1',
        depart_at: '2026-11-10T08:00:00.000Z',
        return_at: '2026-11-15T18:00:00.000Z',
        capacity: 30,
        booked: 2,
        transport_type: 'flight',
        flight_id: null,
        status: 'active',
        packages: {
          id: 'pkg-flight-1',
          name: 'Istanbul Flight Tour',
          destination: 'Istanbul',
          currency: 'BAM',
          transport_type: 'flight',
        },
      },
      {
        id: DEPARTURE_DMC,
        org_id: ORG,
        package_id: 'pkg-dmc-1',
        depart_at: '2026-12-01T10:00:00.000Z',
        return_at: '2026-12-07T12:00:00.000Z',
        capacity: 10,
        booked: 2,
        transport_type: 'none',
        status: 'active',
        packages: {
          id: 'pkg-dmc-1',
          name: 'Bosnia Highlights DMC',
          destination: 'Sarajevo',
          currency: 'EUR',
          transport_type: 'none',
        },
      },
    ],
    flights: [
      {
        id: FLIGHT_OUTBOUND,
        org_id: ORG,
        airline: 'Turkish Airlines',
        flight_number: 'TK101',
        departure_airport: 'SJJ',
        arrival_airport: 'IST',
        departure_time: '2026-11-10T08:30:00Z',
        arrival_time: '2026-11-10T12:00:00Z',
        capacity: 180,
        base_price: 350,
        currency: 'BAM',
        active: true,
      },
      {
        id: FLIGHT_RETURN,
        org_id: ORG,
        airline: 'Turkish Airlines',
        flight_number: 'TK102',
        departure_airport: 'IST',
        arrival_airport: 'SJJ',
        departure_time: '2026-11-15T15:00:00Z',
        arrival_time: '2026-11-15T16:30:00Z',
        capacity: 180,
        base_price: 350,
        currency: 'BAM',
        active: true,
      },
    ],
    departure_flights: [
      {
        id: 'df-1',
        org_id: ORG,
        departure_id: DEPARTURE_FLIGHT,
        flight_id: FLIGHT_OUTBOUND,
        direction: 'outbound',
        segment_order: 0,
        flights: {
          id: FLIGHT_OUTBOUND,
          airline: 'Turkish Airlines',
          flight_number: 'TK101',
          departure_airport: 'SJJ',
          arrival_airport: 'IST',
          departure_time: '2026-11-10T08:30:00Z',
          arrival_time: '2026-11-10T12:00:00Z',
          capacity: 180,
          active: true,
        },
      },
      {
        id: 'df-2',
        org_id: ORG,
        departure_id: DEPARTURE_FLIGHT,
        flight_id: FLIGHT_RETURN,
        direction: 'return',
        segment_order: 0,
        flights: {
          id: FLIGHT_RETURN,
          airline: 'Turkish Airlines',
          flight_number: 'TK102',
          departure_airport: 'IST',
          arrival_airport: 'SJJ',
          departure_time: '2026-11-15T15:00:00Z',
          arrival_time: '2026-11-15T16:30:00Z',
          capacity: 180,
          active: true,
        },
      },
    ],
    reservations: [
      {
        id: RES_FLIGHT,
        org_id: ORG,
        departure_id: DEPARTURE_FLIGHT,
        customer_id: null,
        customer_name: 'Adnan Cengic',
        customer_phone: '+38761111222',
        party_size: 2,
        total_amount: 1200,
        currency: 'BAM',
        status: 'confirmed',
        source: 'direct',
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: RES_DMC,
        org_id: ORG,
        departure_id: DEPARTURE_DMC,
        customer_id: null,
        customer_name: 'Elena Rostova',
        customer_phone: '+43699111222',
        party_size: 2,
        total_amount: 2400,
        currency: 'EUR',
        status: 'confirmed',
        quotation_id: QUOTE_ID,
        source: 'quotation',
        created_at: '2026-10-02T12:00:00Z',
      },
    ],
    departure_passengers: [
      {
        id: 'pass-flight-1',
        org_id: ORG,
        departure_id: DEPARTURE_FLIGHT,
        reservation_id: RES_FLIGHT,
        full_name: 'Adnan Cengic',
        phone: '+38761111222',
        email: 'adnan@example.ba',
        id_document_type: 'passport',
        id_document_number: 'B1234567',
        id_document_expiry: '2029-05-20',
        nationality: 'BIH',
        date_of_birth: '1988-04-12',
        seat_number: null,
      },
      {
        id: 'pass-flight-2',
        org_id: ORG,
        departure_id: DEPARTURE_FLIGHT,
        reservation_id: RES_FLIGHT,
        full_name: 'Lejla Cengic',
        phone: '+38761111223',
        email: 'lejla@example.ba',
        id_document_type: 'passport',
        id_document_number: 'B7654321',
        id_document_expiry: '2028-11-15',
        nationality: 'BIH',
        date_of_birth: '1990-09-24',
        seat_number: null,
      },
    ],
    payments: [
      {
        id: 'pay-flight-1',
        org_id: ORG,
        reservation_id: RES_FLIGHT,
        amount: 1200,
        currency: 'BAM',
        status: 'succeeded',
        payment_date: '2026-10-01',
      },
      {
        id: 'pay-dmc-1',
        org_id: ORG,
        reservation_id: RES_DMC,
        amount: 2400,
        currency: 'EUR',
        status: 'succeeded',
        payment_date: '2026-10-02',
      },
    ],
    supplier_payables: [
      {
        id: 'payable-dmc-1',
        org_id: ORG,
        departure_id: DEPARTURE_DMC,
        supplier_id: 'supp-hotel-1',
        category: 'accommodation',
        label: 'Sarajevo Boutique Hotel 6N',
        currency: 'EUR',
        amount: 1400,
        amount_total: 1400,
        amount_paid: 1400,
        amount_outstanding: 0,
        status: 'paid',
        payment_status: 'paid',
        due_date: '2026-11-20',
        entries: [
          {
            id: 'entry-1',
            kind: 'payment',
            amount: 1400,
          },
        ],
      },
    ],
    departure_cost_items: [
      {
        id: 'cost-dmc-1',
        org_id: ORG,
        departure_id: DEPARTURE_DMC,
        category: 'accommodation',
        label: 'Sarajevo Boutique Hotel 6N',
        quantity: 1,
        unit_cost: 1400,
        currency: 'EUR',
        total_cost: 1400,
        confirmation_status: 'confirmed',
      },
    ],
    contracts: [],
    hotel_allocations: [],
    reservation_accommodation_requirements: [],
    trip_passenger_group_members: [],
    trip_passenger_groups: [],
    customers: [],
  };
});

describe('M24: Complete Business Scenarios', () => {
  describe('Scenario 1: Flight Operations (M13) + Passenger Travel Manifest', () => {
    it('retrieves flight segments attached to the departure', async () => {
      const res = await request(app).get(`/api/departures/${DEPARTURE_FLIGHT}/flights`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].direction).toBe('outbound');
      expect(res.body.data[0].flight.flightNumber).toBe('TK101');
      expect(res.body.data[1].direction).toBe('return');
      expect(res.body.data[1].flight.flightNumber).toBe('TK102');
    });

    it('returns complete passport, nationality and DOB fields in departure manifest', async () => {
      const res = await request(app).get(`/api/departures/${DEPARTURE_FLIGHT}/passengers`);
      expect(res.status).toBe(200);
      expect(res.body.manifest).toHaveLength(2);

      const traveler1 = res.body.manifest.find((p: any) => p.fullName === 'Adnan Cengic');
      expect(traveler1).toBeDefined();
      expect(traveler1.id_document_type).toBe('passport');
      expect(traveler1.id_document_number).toBe('B1234567');
      expect(traveler1.id_document_expiry).toBe('2029-05-20');
      expect(traveler1.nationality).toBe('BIH');
      expect(traveler1.date_of_birth).toBe('1988-04-12');

      const traveler2 = res.body.manifest.find((p: any) => p.fullName === 'Lejla Cengic');
      expect(traveler2).toBeDefined();
      expect(traveler2.id_document_type).toBe('passport');
      expect(traveler2.id_document_number).toBe('B7654321');
      expect(traveler2.nationality).toBe('BIH');
    });

    it('generates departure manifest PDF document without errors', async () => {
      const res = await request(app).get(`/api/departures/${DEPARTURE_FLIGHT}/manifest.pdf`);
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/pdf');
      expect(res.header['content-disposition']).toContain(`manifest-${DEPARTURE_FLIGHT.slice(0, 8)}.pdf`);
    });
  });

  describe('Scenario 2: Tailor-made / DMC (M19 + M20) Lifecycle & Profitability', () => {
    it('calculates departure profitability with supplier payables and realized cash profit', async () => {
      const res = await request(app).get(`/api/departures/${DEPARTURE_DMC}/profitability`);
      expect(res.status).toBe(200);
      expect(res.body.currency).toBe('EUR');
      expect(res.body.revenue).toBe(2400);
      expect(res.body.collected).toBe(2400);
      expect(res.body.supplierCosts).toBe(1400);
      expect(res.body.estimatedGrossProfit).toBe(1000);
      expect(res.body.supplierObligationsIssued).toBe(1400);
      expect(res.body.supplierPaid).toBe(1400);
      expect(res.body.supplierOutstanding).toBe(0);
      expect(res.body.realizedCashProfit).toBe(1000); // 2400 collected - 1400 supplier paid
      expect(res.body.warnings).toEqual([]);
    });

    it('protects quotation-locked bookings from accidental deletion', async () => {
      const res = await request(app).delete(`/api/reservations/${RES_DMC}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('QUOTATION_BOOKING_LOCKED');
    });
  });

  describe('Scenario 3: Operational Documents (M15)', () => {
    it('creates a formal contract for a reservation', async () => {
      const res = await request(app).post('/api/contracts').send({
        reservationId: RES_FLIGHT,
        travelerName: 'Adnan Cengic',
        travelerPhone: '+38761111222',
        partySize: 2,
        totalAmount: 1200,
        currency: 'BAM',
        status: 'draft',
      });
      expect(res.status).toBe(201);
      expect(res.body.reservationId).toBe(RES_FLIGHT);
      expect(res.body.travelerName).toBe('Adnan Cengic');
      expect(res.body.status).toBe('draft');
    });

    it('generates a reservation voucher PDF', async () => {
      const res = await request(app).get(`/api/reservations/${RES_FLIGHT}/voucher.pdf`);
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/pdf');
      expect(res.header['content-disposition']).toContain(`voucher_${RES_FLIGHT.slice(0, 8)}.pdf`);
    });
  });

  describe('Scenario 4: Cancellations & Capacity Release (M02 / M08 / M24)', () => {
    it('cancels confirmed reservation and updates status cleanly', async () => {
      const res = await request(app)
        .patch(`/api/reservations/${RES_FLIGHT}/status`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');

      // Verify DB record is updated
      const updated = rows.reservations.find((r) => r.id === RES_FLIGHT);
      expect(updated.status).toBe('cancelled');
    });
  });
});
