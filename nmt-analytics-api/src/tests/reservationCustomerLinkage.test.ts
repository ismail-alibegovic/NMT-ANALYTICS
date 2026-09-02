import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const EXISTING_CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const NEW_CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';
const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
const DEPARTURE_ID = '44444444-4444-4444-8444-444444444444';
const HOTEL_ALLOCATION_ID = '55555555-5555-4555-8555-555555555555';
const PACKAGE_A_ID = '66666666-6666-4666-8666-666666666666';
const PACKAGE_B_ID = '77777777-7777-4777-8777-777777777777';
const INSURANCE_ID = '88888888-8888-4888-8888-888888888888';
const PACKAGE_B_SERVICE_ID = '99999999-9999-4999-8999-999999999999';
const INCLUDED_SERVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CROSS_ORG_SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let customers = [
  {
    id: EXISTING_CUSTOMER_ID,
    org_id: ORG_ID,
    full_name: 'Existing Customer',
    phone: '+38761111111',
    email: 'existing@example.com',
    status: 'active',
  },
];

let reservations: any[] = [];
let createdDeparturePassengers = [
  { id: 'passenger-1', full_name: 'Traveller One' },
];
let insertedDeparturePassengers: any[] = [];
let packageServices: any[] = [];
const replaceReservationAccommodation = vi.fn(async () => []);
type LooseRow = Record<string, any>;

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: USER_ID, email: 'agent@example.com', role: 'agent' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = ORG_ID;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditReservationCreate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditReservationUpdate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditReservationDelete: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../lib/notificationService', () => ({
  notifyNewReservation: vi.fn(async () => undefined),
}));

vi.mock('../lib/email/EmailService', () => ({
  EmailService: {},
}));

vi.mock('../lib/orgBranding', () => ({
  getOrgBranding: vi.fn(async () => ({})),
}));

vi.mock('../lib/pdfGenerator', () => ({
  generateVoucherPDF: vi.fn(async () => Buffer.from('pdf')),
  generateInvoicePDF: vi.fn(async () => Buffer.from('pdf')),
}));

vi.mock('../lib/audit', () => ({
  logAction: vi.fn(async () => undefined),
}));

vi.mock('../lib/reservationAccommodation', () => ({
  getReservationAccommodation: vi.fn(async () => []),
  replaceReservationAccommodation,
  deleteReservationAccommodation: vi.fn(async () => true),
  mapAccommodationError: vi.fn(() => null),
}));

vi.mock('../lib/supabase', () => {
  function buildCustomersQuery() {
    let rows = customers.slice();
    let insertedPayload: any = null;
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: any) => {
        rows = rows.filter((row: LooseRow) => row[column] === value);
        return builder;
      }),
      or: vi.fn((expression: string) => {
        const phoneMatch = expression.match(/phone\.eq\.(.+)$/);
        const phone = phoneMatch ? phoneMatch[1] : '';
        rows = rows.filter((row) => row.phone === phone);
        return builder;
      }),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => {
        if (insertedPayload) {
          const newRow = { id: NEW_CUSTOMER_ID, ...insertedPayload };
          customers.push(newRow);
          insertedPayload = null;
          return { data: newRow, error: null };
        }
        return { data: rows[0] || null, error: rows[0] ? null : { code: 'PGRST116', message: 'Not found' } };
      }),
      maybeSingle: vi.fn(async () => ({ data: rows[0] || null, error: null })),
      insert: vi.fn((payload: any) => {
        insertedPayload = payload;
        return builder;
      }),
      then: (resolve: any) => {
        if (insertedPayload) {
          const newRow = { id: NEW_CUSTOMER_ID, ...insertedPayload };
          customers.push(newRow);
          insertedPayload = null;
          return Promise.resolve(resolve({ data: [newRow], error: null, count: 1 }));
        }
        return Promise.resolve(resolve({ data: rows, error: null, count: rows.length }));
      },
    };
    return builder;
  }

  function buildReservationsQuery() {
    let insertPayload: any = null;
    const builder: any = {
      insert: vi.fn((payload: any) => {
        insertPayload = payload;
        return builder;
      }),
      select: vi.fn(() => builder),
      single: vi.fn(async () => {
        const row = {
          id: RESERVATION_ID,
          ...insertPayload,
          total_amount: insertPayload?.total_amount ?? 0,
          currency: insertPayload?.currency ?? 'BAM',
          customer_name: insertPayload?.customer_name,
          customer_phone: insertPayload?.customer_phone,
          party_size: insertPayload?.party_size,
          options: insertPayload?.options || {},
          notes: insertPayload?.notes || null,
        };
        reservations.push(row);
        return { data: row, error: null };
      }),
      delete: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
      eq: vi.fn(() => builder),
      then: (resolve: any) => Promise.resolve(resolve({ data: [], error: null, count: 0 })),
    };
    return builder;
  }

  function buildDeparturesQuery() {
    let rows = [{ id: DEPARTURE_ID, org_id: ORG_ID, package_id: PACKAGE_A_ID, packages: { name: 'Test package' } }];
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: any) => {
        rows = rows.filter((row: LooseRow) => row[column] === value);
        return builder;
      }),
      single: vi.fn(async () => ({ data: rows[0] || null, error: rows[0] ? null : { code: 'PGRST116', message: 'Not found' } })),
      then: (resolve: any) => Promise.resolve(resolve({ data: rows, error: null, count: rows.length })),
    };
    return builder;
  }

  function buildPackageServicesQuery() {
    let rows = packageServices.slice();
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: any) => {
        rows = rows.filter((row: LooseRow) => row[column] === value);
        return builder;
      }),
      in: vi.fn((column: string, values: any[]) => {
        const allowed = new Set(values);
        rows = rows.filter((row: LooseRow) => allowed.has(row[column]));
        return builder;
      }),
      then: (resolve: any) => Promise.resolve(resolve({ data: rows, error: null, count: rows.length })),
    };
    return builder;
  }

  function buildDeparturePassengersQuery() {
    return {
      insert: vi.fn((payload: any) => {
        insertedDeparturePassengers.push(payload);
        return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: createdDeparturePassengers.shift() || null, error: null })),
        })),
      };
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    };
  }

  return {
    supabaseAdmin: {
      from: vi.fn((table: string) => {
        if (table === 'customers') return buildCustomersQuery();
        if (table === 'reservations') return buildReservationsQuery();
        if (table === 'departures') return buildDeparturesQuery();
        if (table === 'departure_passengers') return buildDeparturePassengersQuery();
        if (table === 'package_services') return buildPackageServicesQuery();
        if (table === 'package_hotels') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }
        throw new Error(`Unhandled table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
    handleSupabaseError: (res: Response, _error: unknown, message: string) => res.status(500).json({ code: 'DB_ERROR', message }),
  };
});

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const mod = await import('../routes/reservations');
  app.use('/api', mod.default);
});

beforeEach(() => {
  vi.clearAllMocks();
  customers = [
    {
      id: EXISTING_CUSTOMER_ID,
      org_id: ORG_ID,
      full_name: 'Existing Customer',
      phone: '+38761111111',
      email: 'existing@example.com',
      status: 'active',
    },
  ];
  reservations = [];
  createdDeparturePassengers = [
    { id: 'passenger-1', full_name: 'Traveller One' },
  ];
  insertedDeparturePassengers = [];
  packageServices = [
    {
      id: INSURANCE_ID,
      org_id: ORG_ID,
      package_id: PACKAGE_A_ID,
      service_type: 'insurance',
      provider_name: 'Travel insurance',
      description: 'Medical and baggage coverage',
      unit_price: 50,
      currency: 'BAM',
      is_optional: true,
    },
    {
      id: PACKAGE_B_SERVICE_ID,
      org_id: ORG_ID,
      package_id: PACKAGE_B_ID,
      service_type: 'tour',
      provider_name: 'Other package excursion',
      description: 'Wrong package',
      unit_price: 75,
      currency: 'BAM',
      is_optional: true,
    },
    {
      id: INCLUDED_SERVICE_ID,
      org_id: ORG_ID,
      package_id: PACKAGE_A_ID,
      service_type: 'hotel',
      provider_name: 'Included Hotel',
      description: 'Included in package',
      unit_price: 300,
      currency: 'BAM',
      is_optional: false,
    },
    {
      id: CROSS_ORG_SERVICE_ID,
      org_id: 'other-org',
      package_id: PACKAGE_A_ID,
      service_type: 'insurance',
      provider_name: 'Foreign insurance',
      description: 'Foreign org',
      unit_price: 10,
      currency: 'BAM',
      is_optional: true,
    },
  ];
});

describe('POST /api/reservations customer linkage', () => {
  it('creates and links a commercial customer when new sale submits upsert=true', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'New Commercial Customer',
        customerPhone: '+38762222222',
        customerEmail: 'new@example.com',
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        upsert: true,
      });

    expect(res.status).toBe(201);
    expect(customers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: NEW_CUSTOMER_ID,
        full_name: 'New Commercial Customer',
        phone: '+38762222222',
      }),
    ]));
    expect(reservations[0]).toMatchObject({
      customer_id: NEW_CUSTOMER_ID,
      customer_name: 'New Commercial Customer',
      customer_phone: '+38762222222',
    });
  });

  it('maps accommodation passengerIndexes to persisted passengerIds before saving accommodation requirements', async () => {
    createdDeparturePassengers = [
      { id: 'passenger-a', full_name: 'Traveller A' },
      { id: 'passenger-b', full_name: 'Traveller B' },
      { id: 'passenger-c', full_name: 'Traveller C' },
    ];
    replaceReservationAccommodation.mockResolvedValueOnce([
      {
        id: 'requirement-1',
        reservationId: RESERVATION_ID,
        hotelAllocationId: HOTEL_ALLOCATION_ID,
        roomCount: 2,
        guestsExpected: 3,
        passengerIds: ['passenger-a', 'passenger-b', 'passenger-c'],
      },
    ] as any);

    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Accommodation Customer',
        customerPhone: '+38763333333',
        customerEmail: 'accommodation@example.com',
        departureId: DEPARTURE_ID,
        partySize: 3,
        passengers: [
          { full_name: 'Traveller A' },
          { full_name: 'Traveller B' },
          { full_name: 'Traveller C' },
        ],
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        upsert: true,
        accommodationRequirements: [
          {
            hotelAllocationId: HOTEL_ALLOCATION_ID,
            roomCount: 2,
            guestsExpected: 3,
            passengerIndexes: [0, 1, 2],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(replaceReservationAccommodation).toHaveBeenCalledWith(
      RESERVATION_ID,
      ORG_ID,
      [
        expect.objectContaining({
          hotelAllocationId: HOTEL_ALLOCATION_ID,
          roomCount: 2,
          guestsExpected: 3,
          passengerIds: ['passenger-a', 'passenger-b', 'passenger-c'],
        }),
      ],
    );
    expect(res.body.accommodationRequirements).toEqual([
      expect.objectContaining({
        id: 'requirement-1',
        hotelAllocationId: HOTEL_ALLOCATION_ID,
        roomCount: 2,
        guestsExpected: 3,
        passengerIds: ['passenger-a', 'passenger-b', 'passenger-c'],
      }),
    ]);
  });

  it('persists server-generated selected add-on snapshot from package service data', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Add-on Customer',
        customerPhone: '+38764444444',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        selectedAddons: [
          { serviceId: INSURANCE_ID, quantity: 2 },
        ],
      });

    expect(res.status).toBe(201);
    expect(reservations).toHaveLength(1);
    expect(reservations[0].options.selected_addons).toEqual([
      {
        service_id: INSURANCE_ID,
        service_type: 'insurance',
        provider_name: 'Travel insurance',
        description: 'Medical and baggage coverage',
        unit_price: 50,
        currency: 'BAM',
        quantity: 2,
        line_total: 100,
      },
    ]);
    expect(reservations[0].options.addons_total_at_booking).toBe(100);
    expect(res.body.options.selected_addons[0]).toMatchObject({
      service_id: INSURANCE_ID,
      quantity: 2,
      line_total: 100,
    });
  });

  it.each([
    ['unrelated package service', PACKAGE_B_SERVICE_ID],
    ['included package service', INCLUDED_SERVICE_ID],
    ['cross-org package service', CROSS_ORG_SERVICE_ID],
  ])('rejects %s as invalid selected add-on', async (_label, serviceId) => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Invalid Add-on Customer',
        customerPhone: '+38765555555',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        selectedAddons: [
          { serviceId, quantity: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDON_SELECTION');
    expect(reservations).toHaveLength(0);
  });

  it('rejects duplicate selected add-on service IDs at validation', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Duplicate Add-on Customer',
        customerPhone: '+38766666666',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        selectedAddons: [
          { serviceId: INSURANCE_ID, quantity: 1 },
          { serviceId: INSURANCE_ID, quantity: 2 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(reservations).toHaveLength(0);
  });

  it('keeps existing create flow unchanged when selectedAddons is omitted', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'No Add-ons Customer',
        customerPhone: '+38767777777',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
      });

    expect(res.status).toBe(201);
    expect(reservations[0].options.selected_addons).toBeUndefined();
    expect(reservations[0].options.addons_total_at_booking).toBeUndefined();
  });

  it('persists traveler document values into departure passengers', async () => {
    createdDeparturePassengers = [
      { id: 'passenger-doc', full_name: 'Ahmed Hodžić' },
    ];

    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Document Customer',
        customerPhone: '+38768888888',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        passengers: [
          {
            full_name: 'Ahmed Hodžić',
            id_document_type: 'passport',
            id_document_number: 'P123456',
            id_document_expiry: '2028-06-20',
            nationality: 'BA',
            date_of_birth: '1998-03-12',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(insertedDeparturePassengers[0]).toMatchObject({
      org_id: ORG_ID,
      departure_id: DEPARTURE_ID,
      reservation_id: RESERVATION_ID,
      full_name: 'Ahmed Hodžić',
      id_document_type: 'passport',
      id_document_number: 'P123456',
      id_document_expiry: '2028-06-20',
      nationality: 'BA',
      date_of_birth: '1998-03-12',
    });
  });

  it('rejects invalid traveler document type', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Invalid Type Customer',
        customerPhone: '+38769999991',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        passengers: [
          { full_name: 'Ahmed Hodžić', id_document_type: 'visa' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(insertedDeparturePassengers).toHaveLength(0);
  });

  it('rejects invalid traveler document expiry calendar date', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Invalid Expiry Customer',
        customerPhone: '+38769999992',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        passengers: [
          { full_name: 'Ahmed Hodžić', id_document_type: 'passport', id_document_expiry: '2028-02-31' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(insertedDeparturePassengers).toHaveLength(0);
  });

  it('accepts omitted traveler document values for fill-in-later bookings', async () => {
    createdDeparturePassengers = [
      { id: 'passenger-later', full_name: 'Ahmed Hodžić' },
    ];

    const res = await request(app)
      .post('/api/reservations')
      .send({
        customerName: 'Fill Later Customer',
        customerPhone: '+38769999993',
        departureId: DEPARTURE_ID,
        partySize: 1,
        reservationAt: '2026-09-01T12:00:00.000Z',
        status: 'pending',
        source: 'agent',
        passengers: [
          { full_name: 'Ahmed Hodžić' },
        ],
      });

    expect(res.status).toBe(201);
    expect(insertedDeparturePassengers[0]).toMatchObject({
      full_name: 'Ahmed Hodžić',
      id_document_type: null,
      id_document_number: null,
      id_document_expiry: null,
      nationality: null,
      date_of_birth: null,
    });
  });
});
