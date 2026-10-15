import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const TEST_ORG = '00000000-0000-0000-0000-000000000001';
const OTHER_ORG = '00000000-0000-0000-0000-000000000002';

type Passenger = {
  id: string;
  org_id: string;
  reservation_id: string;
  departure_id: string;
  full_name: string;
  phone: string;
  email: string;
  id_document_number: string;
};

let passengerStore: Passenger[] = [];

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'departure_passengers') {
        throw new Error(`Unexpected table ${table}`);
      }

      let currentOrgId: string | null = null;
      let reservationIdFilter: string | null = null;
      let departureIdFilter: string | null = null;
      let orFilter: string | null = null;
      let offset = 0;
      let limit = 50;

      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: any) => {
          if (col === 'org_id') currentOrgId = val;
          if (col === 'reservation_id') reservationIdFilter = val;
          if (col === 'departure_id') departureIdFilter = val;
          return chain;
        }),
        order: vi.fn(() => chain),
        range: vi.fn((from: number, to: number) => {
          offset = from;
          limit = to - from + 1;
          return chain;
        }),
        or: vi.fn((clause: string) => {
          orFilter = clause;
          return chain;
        }),
        then: (resolve: any) => {
          let rows = passengerStore.filter((p) => p.org_id === currentOrgId);
          if (reservationIdFilter) rows = rows.filter((p) => p.reservation_id === reservationIdFilter);
          if (departureIdFilter) rows = rows.filter((p) => p.departure_id === departureIdFilter);

          if (orFilter) {
            // Mock matching ILIKE pattern from full_name, id_document_number, phone, email
            const match = orFilter.match(/%\${?(.*?)}?%/);
            // Extracts search term between %%
            const terms = orFilter.split(',').map((part) => {
              const m = part.match(/%([^%]+)%/);
              return m ? m[1].toLowerCase() : '';
            }).filter(Boolean);
            const searchTerm = terms[0] || '';

            rows = rows.filter((p) =>
              p.full_name.toLowerCase().includes(searchTerm) ||
              p.id_document_number.toLowerCase().includes(searchTerm) ||
              p.phone.toLowerCase().includes(searchTerm) ||
              p.email.toLowerCase().includes(searchTerm)
            );
          }

          const count = rows.length;
          const paged = rows.slice(offset, offset + limit);
          return resolve({ data: paged, error: null, count });
        },
      };

      return chain;
    }),
  },
  handleSupabaseError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 'user-1', email: 'test@example.com' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, res: Response, next: NextFunction) => {
    const org = req.headers['x-org-id'] as string;
    if (!org) return res.status(403).json({ error: 'Org required' });
    (req as any).orgId = org;
    next();
  },
}));

import departurePassengersRouter from '../routes/departurePassengers';

const app = express();
app.use(express.json());
app.use('/api', departurePassengersRouter);

describe('GET /api/departure-passengers search & tenant isolation', () => {
  beforeEach(() => {
    passengerStore = [
      {
        id: 'p1',
        org_id: TEST_ORG,
        reservation_id: 'res-1',
        departure_id: 'dep-1',
        full_name: 'Mirza Delibašić',
        phone: '+38761111222',
        email: 'mirza@example.com',
        id_document_number: 'P01928374',
      },
      {
        id: 'p2',
        org_id: TEST_ORG,
        reservation_id: 'res-2',
        departure_id: 'dep-1',
        full_name: 'Edin Džeko',
        phone: '+38761333444',
        email: 'edin@example.com',
        id_document_number: 'B82736451',
      },
      {
        id: 'p3',
        org_id: OTHER_ORG,
        reservation_id: 'res-other',
        departure_id: 'dep-other',
        full_name: 'Mirza Rival',
        phone: '+38761999888',
        email: 'mirza.rival@example.com',
        id_document_number: 'P99999999',
      },
    ];
  });

  it('filters passengers by name across the authenticated tenant', async () => {
    const res = await request(app)
      .get('/api/departure-passengers?search=Mirza')
      .set('x-org-id', TEST_ORG);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].full_name).toBe('Mirza Delibašić');
    expect(res.body.data[0].id).toBe('p1');
  });

  it('filters passengers by passport / ID document number', async () => {
    const res = await request(app)
      .get('/api/departure-passengers?search=B82736451')
      .set('x-org-id', TEST_ORG);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].full_name).toBe('Edin Džeko');
  });

  it('enforces strict tenant isolation and does not return passengers of other orgs', async () => {
    // Searching for 'Mirza' in OTHER_ORG should only return Mirza Rival, not Mirza Delibašić
    const res = await request(app)
      .get('/api/departure-passengers?search=Mirza')
      .set('x-org-id', OTHER_ORG);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].full_name).toBe('Mirza Rival');
    expect(res.body.data[0].id).toBe('p3');
  });
});
