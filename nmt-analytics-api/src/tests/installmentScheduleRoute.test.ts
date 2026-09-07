import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000ff';
const RESERVATION = '10000000-0000-4000-8000-000000000001';
const OTHER_RESERVATION = '10000000-0000-4000-8000-0000000000ff';

let reservations: any[] = [];
let payments: any[] = [];
let paymentSeq = 1;

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', email: 'agent@travline.test', role: 'manager' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    req.orgId = ORG;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createQuery(table)),
  },
  handleSupabaseError: (res: Response, error: any, message: string) =>
    res.status(500).json({ code: error?.code || 'DATABASE_ERROR', message }),
}));

function tableRows(table: string) {
  if (table === 'reservations') return reservations;
  if (table === 'payments') return payments;
  return [];
}

function createQuery(table: string) {
  const state = {
    filters: [] as ((row: any) => boolean)[],
    deleteMode: false,
    insertRows: null as any[] | null,
    orderColumn: null as string | null,
  };

  const apply = () => {
    let rows = tableRows(table).filter((row) => state.filters.every((filter) => filter(row)));
    if (state.orderColumn) {
      rows = [...rows].sort((a, b) => Number(a[state.orderColumn!] || 0) - Number(b[state.orderColumn!] || 0));
    }
    return rows;
  };

  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return query;
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      if (operator === 'is' && value === null) {
        state.filters.push((row) => row[column] !== null && row[column] !== undefined);
      }
      return query;
    }),
    order: vi.fn((column: string) => {
      state.orderColumn = column;
      return query;
    }),
    insert: vi.fn((rows: any[]) => {
      state.insertRows = rows.map((row) => ({
        id: `payment-${paymentSeq++}`,
        created_at: '2026-09-07T00:00:00.000Z',
        ...row,
      }));
      payments.push(...state.insertRows);
      return query;
    }),
    delete: vi.fn(() => {
      state.deleteMode = true;
      return query;
    }),
    single: vi.fn(async () => {
      const row = apply()[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    then(resolve: any) {
      if (state.deleteMode) {
        const before = payments.length;
        const rowsToDelete = new Set(apply().map((row) => row.id));
        payments = payments.filter((row) => !rowsToDelete.has(row.id));
        return Promise.resolve({ data: null, error: null, count: before - payments.length }).then(resolve);
      }
      return Promise.resolve({ data: state.insertRows || apply(), error: null, count: apply().length }).then(resolve);
    },
  };

  return query;
}

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const router = (await import('../routes/installments')).default;
  app.use('/api', router);
});

beforeEach(() => {
  reservations = [
    {
      id: RESERVATION,
      org_id: ORG,
      total_amount: 1200,
      paid_amount: 0,
      balance_due: 1200,
      payment_status: 'unpaid',
      currency: 'BAM',
      assigned_to: 'user-1',
    },
    {
      id: OTHER_RESERVATION,
      org_id: OTHER_ORG,
      total_amount: 900,
      paid_amount: 0,
      balance_due: 900,
      payment_status: 'unpaid',
      currency: 'EUR',
      assigned_to: 'user-2',
    },
  ];
  payments = [];
  paymentSeq = 1;
});

describe('canonical installment schedule API', () => {
  it('creates 3 × 400 pending installments for 1200 / 3 with deterministic numbering, currency, and due dates', async () => {
    const res = await request(app)
      .put(`/api/reservations/${RESERVATION}/installments`)
      .send({ installmentCount: 3, firstDueDate: '2027-01-10' });

    expect(res.status).toBe(200);
    expect(res.body.installments.map((row: any) => row.installmentNumber)).toEqual([1, 2, 3]);
    expect(res.body.installments.map((row: any) => row.amount)).toEqual([400, 400, 400]);
    expect(res.body.installments.map((row: any) => row.status)).toEqual(['pending', 'pending', 'pending']);
    expect(res.body.installments.map((row: any) => row.currency)).toEqual(['BAM', 'BAM', 'BAM']);
    expect(res.body.installments.map((row: any) => row.dueDate)).toEqual(['2027-01-10', '2027-02-09', '2027-03-11']);
    expect(res.body.summary).toMatchObject({
      totalScheduled: 1200,
      paidScheduled: 0,
      outstandingScheduled: 1200,
    });
  });

  it('splits 1000 / 3 exactly and puts the rounding remainder on the final installment', async () => {
    reservations[0] = { ...reservations[0], total_amount: 1000, balance_due: 1000 };

    const res = await request(app)
      .put(`/api/reservations/${RESERVATION}/installments`)
      .send({ installmentCount: 3, firstDueDate: '2027-01-10' });

    expect(res.status).toBe(200);
    const amounts = res.body.installments.map((row: any) => row.amount);
    expect(amounts).toEqual([333.33, 333.33, 333.34]);
    expect(amounts.reduce((sum: number, amount: number) => Number((sum + amount).toFixed(2)), 0)).toBe(1000);
  });

  it('pending schedule creation does not change paid amount, balance due, or payment status', async () => {
    const res = await request(app)
      .put(`/api/reservations/${RESERVATION}/installments`)
      .send({ installmentCount: 3, firstDueDate: '2027-01-10' });

    expect(res.status).toBe(200);
    expect(res.body.paidAmount).toBe(0);
    expect(res.body.balanceDue).toBe(1200);
    expect(res.body.paymentStatus).toBe('unpaid');
    expect(reservations[0]).toMatchObject({
      paid_amount: 0,
      balance_due: 1200,
      payment_status: 'unpaid',
    });
  });

  it('rejects cross-org reservations without creating payments', async () => {
    const res = await request(app)
      .put(`/api/reservations/${OTHER_RESERVATION}/installments`)
      .send({ installmentCount: 3, firstDueDate: '2027-01-10' });

    expect(res.status).toBe(404);
    expect(payments).toHaveLength(0);
  });

  it('rejects unsafe replacement and preserves succeeded installment history', async () => {
    payments = [
      {
        id: 'succeeded-payment',
        reservation_id: RESERVATION,
        org_id: ORG,
        amount: 400,
        currency: 'BAM',
        status: 'succeeded',
        payment_date: '2027-01-10',
        payment_method: 'cash',
        installment_number: 1,
        due_date: '2027-01-10',
        remaining_after: 800,
        created_at: '2027-01-10T00:00:00.000Z',
      },
    ];

    const res = await request(app)
      .put(`/api/reservations/${RESERVATION}/installments`)
      .send({ installmentCount: 3, firstDueDate: '2027-01-10' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSTALLMENT_HISTORY_EXISTS');
    expect(payments).toHaveLength(1);
    expect(payments[0].id).toBe('succeeded-payment');
  });

  it('GET returns the created schedule with summary and overdue derivation', async () => {
    await request(app)
      .put(`/api/reservations/${RESERVATION}/installments`)
      .send({ installmentCount: 3, firstDueDate: '2020-01-10' });

    const res = await request(app).get(`/api/reservations/${RESERVATION}/installments`);

    expect(res.status).toBe(200);
    expect(res.body.installments).toHaveLength(3);
    expect(res.body.installments[0]).toMatchObject({
      installmentNumber: 1,
      amount: 400,
      status: 'pending',
      dueDate: '2020-01-10',
      overdue: true,
    });
    expect(res.body.summary).toMatchObject({
      totalScheduled: 1200,
      paidScheduled: 0,
      outstandingScheduled: 1200,
      overdueCount: 3,
    });
  });
});
