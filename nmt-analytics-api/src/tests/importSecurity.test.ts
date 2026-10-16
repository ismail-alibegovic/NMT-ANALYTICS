import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({
  existingPhones: {} as Record<string, string[]>, // org -> phones already stored
  inserts: [] as { table: string; rows: any[] }[],
  lookups: [] as { table: string; filters: [string, unknown][] }[],
  insertError: null as null | { code?: string; message: string },
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const entry = { table, filters: [] as [string, unknown][] };
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { entry.filters.push([k, v]); return q; },
        in: (k: string, v: unknown) => { entry.filters.push([k, v]); return q; },
        insert: (rows: any[]) => {
          h.inserts.push({ table, rows });
          return {
            select: async () =>
              h.insertError
                ? { data: null, error: h.insertError }
                : { data: rows.map((_, i) => ({ id: `id-${i}` })), error: null },
          };
        },
        then: (resolve: (v: unknown) => void) => {
          h.lookups.push(entry);
          const org = entry.filters.find(([k]) => k === 'org_id')?.[1] as string;
          const phones = (entry.filters.find(([k]) => k === 'phone')?.[1] as string[]) || [];
          const data = (h.existingPhones[org] || []).filter((p) => phones.includes(p)).map((phone) => ({ phone }));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  },
  handleSupabaseError: (res: Response) => res.status(500).json({ code: 'DB_ERROR' }),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers.authorization) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { id: 'user-1', email: 'u@example.com', role: (req.headers['x-test-role'] || 'manager') as any };
    req.orgId = (req.headers['x-test-org'] as string) || ORG_A;
    next();
  },
}));
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import importRoutes from '../routes/import';

const app = express();
app.use(express.json());
app.use('/api', importRoutes);

const auth = { Authorization: 'Bearer t' };
const as = (role: string, org = ORG_A) => ({ ...auth, 'x-test-role': role, 'x-test-org': org });

const csv = (text: string) => Buffer.from(text, 'utf8');
const upload = (entity: string, text: string, headers: Record<string, string> = auth, query = '') =>
  request(app)
    .post(`/api/import/${entity}${query}`)
    .set(headers)
    .attach('file', csv(text), { filename: 'data.csv', contentType: 'text/csv' });

const CUSTOMERS = 'fullName,phone,email,notes\nAmra H,061123456,amra@example.com,VIP\nLejla K,+38762111222,,';

beforeEach(() => {
  h.existingPhones = {};
  h.inserts = [];
  h.lookups = [];
  h.insertError = null;
});

describe('import authorization', () => {
  it.each(['viewer', 'agent'])('%s gets 403 on every import route and nothing is read or written', async (role) => {
    const post = await upload('customers', CUSTOMERS, as(role));
    const headers = await request(app)
      .post('/api/import/customers/headers')
      .set(as(role))
      .attach('file', csv('a,b\n1,2'), { filename: 'h.csv', contentType: 'text/csv' });
    const template = await request(app).get('/api/import/customers/template.csv').set(as(role));

    for (const res of [post, headers, template]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
    }
    expect(h.inserts).toHaveLength(0);
    expect(h.lookups).toHaveLength(0);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await upload('customers', CUSTOMERS, {});
    expect(res.status).toBe(401);
    expect(h.inserts).toHaveLength(0);
  });

  it.each(['manager', 'director'])('allows %s to import customers', async (role) => {
    const res = await upload('customers', CUSTOMERS, as(role));
    expect(res.status).toBe(200);
    expect(res.body.results.importedCount).toBe(2);
  });
});

describe('disabled and unknown entities', () => {
  it.each(['reservations', 'departures'])('%s import is disabled (410) for managers on all routes', async (entity) => {
    const post = await upload(entity, 'customerId,departureId,partySize\nx,y,1', as('director'));
    const headers = await request(app)
      .post(`/api/import/${entity}/headers`)
      .set(as('director'))
      .attach('file', csv('a\n1'), { filename: 'h.csv', contentType: 'text/csv' });
    const template = await request(app).get(`/api/import/${entity}/template.csv`).set(as('director'));
    for (const res of [post, headers, template]) {
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('IMPORT_ENTITY_DISABLED');
    }
    expect(h.inserts).toHaveLength(0);
  });

  it('returns 404 for unknown entities, including prototype keys', async () => {
    for (const entity of ['payments', 'transactions', 'constructor', '__proto__']) {
      const res = await upload(entity, 'a\n1', as('director'));
      expect(res.status).toBe(404);
    }
    expect(h.inserts).toHaveLength(0);
  });
});

describe('customer import integrity', () => {
  it('forces org_id from the authenticated context and ignores file-supplied ownership columns', async () => {
    const res = await upload(
      'customers',
      'fullName,phone,org_id,id\nAmra H,061123456,' + ORG_B + ',00000000-0000-4000-8000-000000000000',
      as('manager', ORG_A),
    );
    expect(res.status).toBe(200);
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].rows).toEqual([
      { full_name: 'Amra H', phone: '061123456', email: null, notes: null, org_id: ORG_A },
    ]);
  });

  it('a hostile columnMap cannot target org_id or other columns', async () => {
    const res = await request(app)
      .post('/api/import/customers')
      .set(as('manager', ORG_A))
      .field('options', JSON.stringify({ mode: 'insert', columnMap: { A: 'fullName', B: 'phone', C: 'org_id', D: 'status' } }))
      .attach('file', csv('A,B,C,D\nAmra H,061123456,' + ORG_B + ',blocked'), { filename: 'd.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);
    expect(Object.keys(h.inserts[0].rows[0]).sort()).toEqual(['email', 'full_name', 'notes', 'org_id', 'phone']);
    expect(h.inserts[0].rows[0].org_id).toBe(ORG_A);
  });

  it('keeps leading zeros in phone numbers', async () => {
    await upload('customers', CUSTOMERS, as('manager'));
    expect(h.inserts[0].rows[0].phone).toBe('061123456');
  });

  it('duplicate detection is scoped to the caller organization (no cross-tenant leak or blocking)', async () => {
    h.existingPhones[ORG_B] = ['061123456'];
    const ok = await upload('customers', CUSTOMERS, as('manager', ORG_A));
    expect(ok.status).toBe(200);
    expect(h.lookups.every((l) => l.filters.some(([k, v]) => k === 'org_id' && v === ORG_A))).toBe(true);

    h.inserts = [];
    h.existingPhones[ORG_A] = ['061123456'];
    const dup = await upload('customers', CUSTOMERS, as('manager', ORG_A));
    expect(dup.status).toBe(422);
    expect(dup.body.results.invalidRows).toEqual([
      { row: 1, errors: [expect.stringContaining('already exists')] },
    ]);
    expect(h.inserts).toHaveLength(0);
  });

  it('rejects a phone repeated inside the file and imports nothing', async () => {
    const res = await upload('customers', 'fullName,phone\nA,061123456\nB,061123456', as('manager'));
    expect(res.status).toBe(422);
    expect(res.body.results.invalidRows).toHaveLength(1);
    expect(res.body.results.invalidRows[0].row).toBe(2);
    expect(h.inserts).toHaveLength(0);
  });

  it('is all-or-nothing: one malformed row rejects the whole file', async () => {
    const res = await upload('customers', 'fullName,phone,email\nGood,061123456,\nBad,061999888,not-an-email', as('manager'));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('IMPORT_VALIDATION_FAILED');
    expect(res.body.results.importedCount).toBe(0);
    expect(res.body.results.invalidRows[0].row).toBe(2);
    expect(h.inserts).toHaveLength(0);
  });

  it('dry run validates and previews without writing', async () => {
    const res = await upload('customers', CUSTOMERS, as('manager'), '?dryRun=true');
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.results.validCount).toBe(2);
    expect(h.inserts).toHaveLength(0);
  });
});

describe('malformed requests', () => {
  it('rejects upsert mode', async () => {
    const res = await request(app)
      .post('/api/import/customers')
      .set(as('manager'))
      .field('mode', 'upsert')
      .attach('file', csv(CUSTOMERS), { filename: 'd.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_IMPORT_MODE');
    expect(h.inserts).toHaveLength(0);
  });

  it('rejects invalid options JSON and invalid columnMap', async () => {
    const bad = await request(app)
      .post('/api/import/customers').set(as('manager')).field('options', '{nope')
      .attach('file', csv(CUSTOMERS), { filename: 'd.csv', contentType: 'text/csv' });
    expect(bad.status).toBe(400);
    const badMap = await request(app)
      .post('/api/import/customers').set(as('manager')).field('options', JSON.stringify({ columnMap: { A: 1 } }))
      .attach('file', csv(CUSTOMERS), { filename: 'd.csv', contentType: 'text/csv' });
    expect(badMap.status).toBe(400);
  });

  it('rejects a missing file and a wrong file type', async () => {
    const none = await request(app).post('/api/import/customers').set(as('manager'));
    expect(none.status).toBe(400);
    const wrong = await request(app)
      .post('/api/import/customers').set(as('manager'))
      .attach('file', csv('x'), { filename: 'evil.exe', contentType: 'application/octet-stream' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('INVALID_FILE');
  });

  it('rejects oversized imports', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `Name ${i},06${String(1000000 + i)}`).join('\n');
    const res = await upload('customers', 'fullName,phone\n' + rows, as('manager'));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('TOO_MANY_ROWS');
    expect(h.inserts).toHaveLength(0);
  });

  it('rejects a corrupt xlsx without a 500', async () => {
    const res = await request(app)
      .post('/api/import/customers').set(as('manager'))
      .attach('file', Buffer.from('not a zip'), {
        filename: 'bad.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNREADABLE_FILE');
  });
});

describe('package import integrity', () => {
  const header = 'name,destination,basePrice,currency,isActive,durationDays,maxParticipants,startDate,endDate';

  it('imports valid packages with parsed numeric and boolean values', async () => {
    const res = await upload('packages', `${header}\nBeach,Cancun,"1200,50",eur,false,7,40,2026-07-01,2026-07-08`, as('manager'));
    expect(res.status).toBe(200);
    expect(h.inserts[0].table).toBe('packages');
    expect(h.inserts[0].rows[0]).toMatchObject({
      name: 'Beach', base_price: 1200.5, currency: 'EUR', is_active: false,
      duration_days: 7, max_participants: 40, start_date: '2026-07-01', end_date: '2026-07-08', org_id: ORG_A,
    });
  });

  it.each([
    ['negative price', 'Beach,Cancun,-5,BAM,true,,,,', 'basePrice'],
    ['non-numeric price', 'Beach,Cancun,abc,BAM,true,,,,', 'basePrice'],
    ['too many decimals', 'Beach,Cancun,10.999,BAM,true,,,,', 'basePrice'],
    ['bad currency', 'Beach,Cancun,10,EURO1,true,,,,', 'currency'],
    ['bad boolean', 'Beach,Cancun,10,BAM,maybe,,,,', 'isActive'],
    ['end before start', 'Beach,Cancun,10,BAM,true,,,2026-07-08,2026-07-01', 'endDate'],
    ['zero duration', 'Beach,Cancun,10,BAM,true,0,,,', 'durationDays'],
    ['missing name', ',Cancun,10,BAM,true,,,,', 'name'],
  ])('rejects %s and writes nothing', async (_label, row, field) => {
    const res = await upload('packages', `${header}\n${row}`, as('manager'));
    expect(res.status).toBe(422);
    expect(res.body.results.invalidRows[0].errors.join(' ')).toContain(field);
    expect(h.inserts).toHaveLength(0);
  });
});

describe('atomicity and concurrency', () => {
  it('writes the whole batch in a single insert statement', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => `Name ${i},06${String(1000000 + i)}`).join('\n');
    const res = await upload('customers', 'fullName,phone\n' + rows, as('manager'));
    expect(res.status).toBe(200);
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].rows).toHaveLength(50);
    expect(res.body.results.importedCount).toBe(50);
  });

  it('maps a database unique violation to 409 and reports zero imported', async () => {
    h.insertError = { code: '23505', message: 'duplicate key' };
    const res = await upload('customers', CUSTOMERS, as('manager'));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('IMPORT_CONFLICT');
    expect(h.inserts).toHaveLength(1);
  });

  it('a database failure surfaces as a server error with no retry or partial write', async () => {
    h.insertError = { message: 'boom' };
    const errApp = express();
    errApp.use(express.json());
    errApp.use('/api', importRoutes);
    errApp.use((_e: any, _req: Request, res: Response, _n: NextFunction) => res.status(500).json({ code: 'INTERNAL_ERROR' }));
    const res = await request(errApp)
      .post('/api/import/customers').set(as('manager'))
      .attach('file', csv(CUSTOMERS), { filename: 'd.csv', contentType: 'text/csv' });
    expect(res.status).toBe(500);
    expect(h.inserts).toHaveLength(1);
  });

  it('concurrent imports from two organizations never cross tenants', async () => {
    const [a, b] = await Promise.all([
      upload('customers', 'fullName,phone\nAlpha,061000001\nAlpha2,061000002', as('manager', ORG_A)),
      upload('customers', 'fullName,phone\nBravo,062000001', as('manager', ORG_B)),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const forA = h.inserts.filter((i) => i.rows.every((r) => r.org_id === ORG_A));
    const forB = h.inserts.filter((i) => i.rows.every((r) => r.org_id === ORG_B));
    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(1);
    expect(forA[0].rows.map((r) => r.full_name)).toEqual(['Alpha', 'Alpha2']);
    expect(forB[0].rows.map((r) => r.full_name)).toEqual(['Bravo']);
  });
});
