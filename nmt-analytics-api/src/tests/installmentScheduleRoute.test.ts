import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ORG = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000ff';
const RESERVATION = '10000000-0000-4000-8000-000000000001';
const OTHER_RESERVATION = '10000000-0000-4000-8000-0000000000ff';
const repoRoot = resolve(__dirname, '..', '..');

let reservations: any[] = [];
let payments: any[] = [];
let paymentSeq = 1;
let failNextRpcInsert = false;
let lastRpcCall: { functionName: string; args: any } | null = null;
let tableMutationCalls: string[] = [];

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
    rpc: vi.fn((functionName: string, args: any) => runRpc(functionName, args)),
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
      tableMutationCalls.push(`${table}.insert`);
      state.insertRows = rows.map((row) => ({
        id: `payment-${paymentSeq++}`,
        created_at: '2026-09-07T00:00:00.000Z',
        ...row,
      }));
      payments.push(...state.insertRows);
      return query;
    }),
    delete: vi.fn(() => {
      tableMutationCalls.push(`${table}.delete`);
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

async function runRpc(functionName: string, args: any) {
  lastRpcCall = { functionName, args };

  if (functionName !== 'replace_reservation_installment_schedule_atomic') {
    return { data: null, error: { code: 'RPC_NOT_FOUND', message: functionName } };
  }

  const reservation = reservations.find((row) => row.id === args.p_reservation_id && row.org_id === args.p_org_id);
  if (!reservation) {
    return { data: null, error: { code: 'P0001', message: 'RESERVATION_NOT_FOUND' } };
  }

  const historicalInstallments = payments.filter(
    (row) =>
      row.reservation_id === args.p_reservation_id &&
      row.org_id === args.p_org_id &&
      row.installment_number !== null &&
      row.installment_number !== undefined &&
      row.status !== 'pending',
  );
  if (historicalInstallments.length > 0) {
    return { data: null, error: { code: 'P0001', message: 'INSTALLMENT_HISTORY_EXISTS' } };
  }

  const snapshot = payments.map((row) => ({ ...row }));
  try {
    payments = payments.filter(
      (row) =>
        !(
          row.reservation_id === args.p_reservation_id &&
          row.org_id === args.p_org_id &&
          row.installment_number !== null &&
          row.installment_number !== undefined &&
          row.status === 'pending'
        ),
    );

    if (failNextRpcInsert) {
      throw new Error('FORCED_INSERT_FAILURE');
    }

    const inserted = args.p_schedule.map((row: any) => ({
      id: `payment-${paymentSeq++}`,
      created_at: '2026-09-07T00:00:00.000Z',
      reservation_id: args.p_reservation_id,
      org_id: args.p_org_id,
      amount: row.amount,
      currency: row.currency,
      status: 'pending',
      payment_method: null,
      payment_date: null,
      installment_number: row.installment_number,
      due_date: row.due_date,
      remaining_after: row.remaining_after,
    }));
    payments.push(...inserted);
    return { data: inserted, error: null };
  } catch (error) {
    payments = snapshot;
    return { data: null, error: { code: '23514', message: (error as Error).message } };
  } finally {
    failNextRpcInsert = false;
  }
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
  failNextRpcInsert = false;
  lastRpcCall = null;
  tableMutationCalls = [];
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
    expect(lastRpcCall?.functionName).toBe('replace_reservation_installment_schedule_atomic');
    expect(lastRpcCall?.args).toMatchObject({
      p_org_id: ORG,
      p_reservation_id: RESERVATION,
    });
    expect(lastRpcCall?.args.p_schedule).toHaveLength(3);
    expect(tableMutationCalls).toEqual([]);
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

  it('replaces an existing pending schedule atomically on success', async () => {
    payments = [
      {
        id: 'old-1',
        reservation_id: RESERVATION,
        org_id: ORG,
        amount: 400,
        currency: 'BAM',
        status: 'pending',
        payment_date: null,
        payment_method: null,
        installment_number: 1,
        due_date: '2027-01-10',
        remaining_after: 800,
        created_at: '2027-01-10T00:00:00.000Z',
      },
      {
        id: 'old-2',
        reservation_id: RESERVATION,
        org_id: ORG,
        amount: 400,
        currency: 'BAM',
        status: 'pending',
        payment_date: null,
        payment_method: null,
        installment_number: 2,
        due_date: '2027-02-09',
        remaining_after: 400,
        created_at: '2027-01-10T00:00:00.000Z',
      },
      {
        id: 'old-3',
        reservation_id: RESERVATION,
        org_id: ORG,
        amount: 400,
        currency: 'BAM',
        status: 'pending',
        payment_date: null,
        payment_method: null,
        installment_number: 3,
        due_date: '2027-03-11',
        remaining_after: 0,
        created_at: '2027-01-10T00:00:00.000Z',
      },
    ];

    const res = await request(app)
      .put(`/api/reservations/${RESERVATION}/installments`)
      .send({ installmentCount: 2, firstDueDate: '2027-04-01' });

    expect(res.status).toBe(200);
    expect(res.body.installments.map((row: any) => row.amount)).toEqual([600, 600]);
    expect(payments.map((row) => row.id)).not.toContain('old-1');
    expect(payments).toHaveLength(2);
    expect(tableMutationCalls).toEqual([]);
  });

  it('rolls back replacement when new schedule insertion fails and preserves the original pending rows', async () => {
    payments = [
      {
        id: 'old-1',
        reservation_id: RESERVATION,
        org_id: ORG,
        amount: 400,
        currency: 'BAM',
        status: 'pending',
        payment_date: null,
        payment_method: null,
        installment_number: 1,
        due_date: '2027-01-10',
        remaining_after: 800,
        created_at: '2027-01-10T00:00:00.000Z',
      },
      {
        id: 'old-2',
        reservation_id: RESERVATION,
        org_id: ORG,
        amount: 400,
        currency: 'BAM',
        status: 'pending',
        payment_date: null,
        payment_method: null,
        installment_number: 2,
        due_date: '2027-02-09',
        remaining_after: 400,
        created_at: '2027-01-10T00:00:00.000Z',
      },
      {
        id: 'old-3',
        reservation_id: RESERVATION,
        org_id: ORG,
        amount: 400,
        currency: 'BAM',
        status: 'pending',
        payment_date: null,
        payment_method: null,
        installment_number: 3,
        due_date: '2027-03-11',
        remaining_after: 0,
        created_at: '2027-01-10T00:00:00.000Z',
      },
    ];
    failNextRpcInsert = true;

    const res = await request(app)
      .put(`/api/reservations/${RESERVATION}/installments`)
      .send({ installmentCount: 2, firstDueDate: '2027-04-01' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to replace installment schedule');
    expect(payments).toEqual([
      expect.objectContaining({ id: 'old-1', amount: 400, installment_number: 1 }),
      expect.objectContaining({ id: 'old-2', amount: 400, installment_number: 2 }),
      expect.objectContaining({ id: 'old-3', amount: 400, installment_number: 3 }),
    ]);
    expect(payments).toHaveLength(3);
    expect(payments.some((row) => row.amount === 600)).toBe(false);
    expect(tableMutationCalls).toEqual([]);
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

describe('canonical installment schedule migration contract', () => {
  it('adds a single atomic RPC for replacement instead of client-side delete then insert', async () => {
    const migration = await readFile(
      resolve(repoRoot, 'supabase', 'migrations', '20260906000000_replace_installment_schedule_atomic.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.replace_reservation_installment_schedule_atomic');
    expect(migration).toContain('p_org_id UUID');
    expect(migration).toContain('p_reservation_id UUID');
    expect(migration).toContain('p_schedule JSONB');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("RAISE EXCEPTION 'RESERVATION_NOT_FOUND'");
    expect(migration).toContain("RAISE EXCEPTION 'INSTALLMENT_HISTORY_EXISTS'");
    expect(migration).toContain('DELETE FROM public.payments');
    expect(migration).toContain('INSERT INTO public.payments');
    expect(migration).toContain('FROM jsonb_to_recordset(p_schedule)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) FROM PUBLIC;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) FROM anon;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) FROM authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.replace_reservation_installment_schedule_atomic(UUID, UUID, JSONB) TO service_role;');
  });
});
