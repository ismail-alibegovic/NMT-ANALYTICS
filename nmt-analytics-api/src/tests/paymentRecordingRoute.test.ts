import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const ORG = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000ff';
const RESERVATION = '10000000-0000-4000-8000-000000000001';
const OTHER_RESERVATION = '10000000-0000-4000-8000-0000000000ff';
const INSTALLMENT_1 = '20000000-0000-4000-8000-000000000001';
const INSTALLMENT_2 = '20000000-0000-4000-8000-000000000002';
const OTHER_INSTALLMENT = '20000000-0000-4000-8000-0000000000ff';

let reservations: any[] = [];
let payments: any[] = [];
let seq = 10;

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

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditPaymentCreate: (_req: Request, _res: Response, next: NextFunction) => next(),
  auditPaymentUpdate: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../lib/audit', () => ({ logAction: vi.fn() }));
vi.mock('../lib/notificationService', () => ({ notifyPaymentReceived: vi.fn(() => Promise.resolve()) }));
vi.mock('../lib/email/EmailService', () => ({ EmailService: { sendPaymentConfirmation: vi.fn() } }));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createQuery(table)),
  },
  handleSupabaseError: (res: Response, error: any, message: string) =>
    res.status(500).json({ code: error?.code || 'DATABASE_ERROR', message }),
}));

function toCents(value: unknown) {
  return Math.round(Number(value || 0) * 100);
}

function fromCents(value: number) {
  return value / 100;
}

function recalcReservation(id: string) {
  const reservation = reservations.find((row) => row.id === id);
  if (!reservation) return;
  const paidCents = payments
    .filter((row) => row.reservation_id === id && row.status === 'succeeded')
    .reduce((sum, row) => sum + toCents(row.amount), 0);
  const totalCents = toCents(reservation.total_amount);
  reservation.paid_amount = fromCents(paidCents);
  reservation.balance_due = fromCents(Math.max(totalCents - paidCents, 0));
  reservation.payment_status =
    paidCents <= 0 ? 'unpaid' : paidCents < totalCents ? 'partially_paid' : 'paid';
}

function tableRows(table: string) {
  if (table === 'reservations') return reservations;
  if (table === 'payments') return payments;
  if (table === 'customers') return [];
  return [];
}

function createQuery(table: string) {
  const state = {
    filters: [] as ((row: any) => boolean)[],
    insertRow: null as any,
    updateData: null as any,
  };

  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return query;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      state.filters.push((row) => values.includes(row[column]));
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    not: vi.fn(() => query),
    neq: vi.fn(() => query),
    lt: vi.fn(() => query),
    range: vi.fn(() => query),
    insert: vi.fn((row: any) => {
      state.insertRow = {
        id: `30000000-0000-4000-8000-0000000000${seq++}`,
        created_at: '2026-09-08T00:00:00.000Z',
        installment_number: null,
        due_date: null,
        remaining_after: null,
        ...row,
      };
      payments.push(state.insertRow);
      recalcReservation(state.insertRow.reservation_id);
      return query;
    }),
    update: vi.fn((data: any) => {
      state.updateData = data;
      return query;
    }),
    single: vi.fn(async () => {
      let rows = tableRows(table).filter((row) => state.filters.every((filter) => filter(row)));
      if (state.updateData) {
        rows = rows.map((row) => Object.assign(row, state.updateData));
        rows.forEach((row) => row.reservation_id && recalcReservation(row.reservation_id));
      }
      const row = state.insertRow || rows[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    then(resolve: any) {
      const rows = tableRows(table).filter((row) => state.filters.every((filter) => filter(row)));
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
    },
  };

  return query;
}

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const router = (await import('../routes/payments')).default;
  app.use('/api', router);
});

beforeEach(() => {
  reservations = [
    {
      id: RESERVATION,
      org_id: ORG,
      total_amount: 1000,
      paid_amount: 0,
      balance_due: 1000,
      payment_status: 'unpaid',
      status: 'confirmed',
      currency: 'BAM',
      customer_name: 'Amina Hadžić',
      customer_id: null,
    },
    {
      id: OTHER_RESERVATION,
      org_id: OTHER_ORG,
      total_amount: 900,
      paid_amount: 0,
      balance_due: 900,
      payment_status: 'unpaid',
      status: 'confirmed',
      currency: 'EUR',
      customer_name: 'Other Org',
      customer_id: null,
    },
  ];
  payments = [
    {
      id: INSTALLMENT_1,
      reservation_id: RESERVATION,
      org_id: ORG,
      amount: 300,
      currency: 'BAM',
      status: 'pending',
      payment_method: null,
      payment_date: null,
      installment_number: 1,
      due_date: '2026-09-15',
      remaining_after: 700,
      created_at: '2026-09-08T00:00:00.000Z',
    },
    {
      id: INSTALLMENT_2,
      reservation_id: RESERVATION,
      org_id: ORG,
      amount: 700,
      currency: 'BAM',
      status: 'pending',
      payment_method: null,
      payment_date: null,
      installment_number: 2,
      due_date: '2026-10-15',
      remaining_after: 0,
      created_at: '2026-09-08T00:00:00.000Z',
    },
    {
      id: OTHER_INSTALLMENT,
      reservation_id: OTHER_RESERVATION,
      org_id: OTHER_ORG,
      amount: 900,
      currency: 'EUR',
      status: 'pending',
      payment_method: null,
      payment_date: null,
      installment_number: 1,
      due_date: '2026-09-15',
      remaining_after: 0,
      created_at: '2026-09-08T00:00:00.000Z',
    },
  ];
  seq = 10;
});

describe('M14.2 payment recording', () => {
  it('recovers a failed installment using its existing row and rejects another successful recording', async () => {
    payments[0].status = 'failed';
    const payload = { reservation_id: RESERVATION, installment_id: INSTALLMENT_1, amount: 300, currency: 'BAM', status: 'succeeded' };
    const recovered = await request(app).post('/api/payments').send(payload);
    expect(recovered.status).toBe(201);
    expect(recovered.body.payment.id).toBe(INSTALLMENT_1);
    expect(recovered.body.reservation.paidAmount).toBe(300);
    expect(payments).toHaveLength(3);
    const repeated = await request(app).post('/api/payments').send(payload);
    expect(repeated.status).toBe(409);
    expect(repeated.body.code).toBe('INSTALLMENT_ALREADY_RECORDED');
    expect(reservations[0].paid_amount).toBe(300);
  });

  it.each(['cancelled', 'refunded'])('does not revive a %s installment', async (status) => {
    payments[0].status = status;
    const res = await request(app).post('/api/payments').send({ reservation_id: RESERVATION, installment_id: INSTALLMENT_1, amount: 300, currency: 'BAM', status: 'succeeded' });
    expect(res.status).toBe(409);
    expect(reservations[0].paid_amount).toBe(0);
    expect(payments[0].status).toBe(status);
  });

  it('inherits EUR from the reservation when payment currency is omitted', async () => {
    reservations.push({
      id: '10000000-0000-4000-8000-0000000000ee',
      org_id: ORG,
      total_amount: 500,
      paid_amount: 0,
      balance_due: 500,
      payment_status: 'unpaid',
      status: 'confirmed',
      currency: 'EUR',
      customer_name: 'EUR Customer',
      customer_id: null,
    });

    const res = await request(app).post('/api/payments').send({
      reservation_id: '10000000-0000-4000-8000-0000000000ee',
      amount: 125,
      status: 'succeeded',
    });

    expect(res.status).toBe(201);
    expect(res.body.payment.currency).toBe('EUR');
    expect(payments[payments.length - 1]).toMatchObject({ currency: 'EUR' });
  });

  it('rejects a payment currency that differs from reservation currency', async () => {
    reservations[0].currency = 'EUR';

    const res = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      amount: 125,
      currency: 'BAM',
      status: 'succeeded',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CURRENCY_MISMATCH');
  });

  it('records a succeeded payment against the pending installment row and derives partial finance state', async () => {
    const res = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      installment_id: INSTALLMENT_1,
      amount: 300,
      currency: 'BAM',
      status: 'succeeded',
      payment_method: 'cash',
      payment_date: '2026-09-08',
    });

    expect(res.status).toBe(201);
    expect(payments).toHaveLength(3);
    expect(payments.find((row) => row.id === INSTALLMENT_1)).toMatchObject({
      status: 'succeeded',
      payment_method: 'cash',
      payment_date: '2026-09-08',
    });
    expect(res.body.reservation).toMatchObject({
      totalAmount: 1000,
      paidAmount: 300,
      remainingAmount: 700,
      balanceDue: 700,
      paymentStatus: 'partially_paid',
    });
  });

  it('marks the reservation paid after all scheduled installments succeed', async () => {
    await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      installment_id: INSTALLMENT_1,
      amount: 300,
      currency: 'BAM',
      status: 'succeeded',
    });

    const res = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      installment_id: INSTALLMENT_2,
      amount: 700,
      currency: 'BAM',
      status: 'succeeded',
    });

    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({
      paidAmount: 1000,
      remainingAmount: 0,
      paymentStatus: 'paid',
    });
  });

  it('does not count pending, failed, or cancelled payment records as received', async () => {
    for (const status of ['pending', 'failed', 'cancelled'] as const) {
      const res = await request(app).post('/api/payments').send({
        reservation_id: RESERVATION,
        amount: 123.45,
        currency: 'BAM',
        status,
      });
      expect(res.status).toBe(201);
    }

    expect(reservations[0]).toMatchObject({
      paid_amount: 0,
      balance_due: 1000,
      payment_status: 'unpaid',
    });
  });

  it('sums only successful payments with cent-safe rounding', async () => {
    await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      amount: 333.33,
      currency: 'BAM',
      status: 'succeeded',
    });
    const res = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      amount: 666.67,
      currency: 'BAM',
      status: 'succeeded',
    });

    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({
      paidAmount: 1000,
      remainingAmount: 0,
      paymentStatus: 'paid',
    });
  });

  it('rejects cross-org reservation and installment access', async () => {
    const reservationRes = await request(app).post('/api/payments').send({
      reservation_id: OTHER_RESERVATION,
      amount: 900,
      currency: 'EUR',
      status: 'succeeded',
    });
    expect(reservationRes.status).toBe(404);

    const installmentRes = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      installment_id: OTHER_INSTALLMENT,
      amount: 900,
      currency: 'BAM',
      status: 'succeeded',
    });
    expect(installmentRes.status).toBe(404);
  });

  it('rejects invalid reservation/installment relationship, invalid amount, and currency mismatch', async () => {
    const mismatchRes = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      installment_id: INSTALLMENT_1,
      amount: 300,
      currency: 'EUR',
      status: 'succeeded',
    });
    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.body.code).toBe('CURRENCY_MISMATCH');

    const amountRes = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      installment_id: INSTALLMENT_1,
      amount: 0,
      currency: 'BAM',
      status: 'succeeded',
    });
    expect(amountRes.status).toBe(400);

    const relationshipRes = await request(app).post('/api/payments').send({
      reservation_id: RESERVATION,
      installment_id: INSTALLMENT_2,
      amount: 300,
      currency: 'BAM',
      status: 'succeeded',
    });
    expect(relationshipRes.status).toBe(400);
    expect(relationshipRes.body.code).toBe('INSTALLMENT_AMOUNT_MISMATCH');
  });
});


describe('standalone payment request replay', () => {
  const key = '55555555-5555-4555-8555-555555555555';
  it('replays a fully paid reservation without a second ledger row or notification', async () => {
    const payload = { reservation_id: RESERVATION, amount: 1000, idempotency_key: key };
    const first = await request(app).post('/api/payments').send(payload);
    expect(first.status).toBe(201);
    const retry = await request(app).post('/api/payments').send(payload);
    expect(retry.status).toBe(200);
    expect(retry.body.payment.id).toBe(first.body.payment.id);
    expect(retry.body.replayed).toBe(true);
    expect(payments.filter(row => row.id === first.body.payment.id)).toHaveLength(1);
    expect(reservations[0].paid_amount).toBe(1000);
  });
  it('rejects reuse of a request key with different financial terms', async () => {
    const payload = { reservation_id: RESERVATION, amount: 100, idempotency_key: key };
    expect((await request(app).post('/api/payments').send(payload)).status).toBe(201);
    const retry = await request(app).post('/api/payments').send({ ...payload, amount: 101 });
    expect(retry.status).toBe(409);
    expect(retry.body.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');
    expect(reservations[0].paid_amount).toBe(100);
  });
  it('does not use a request key to access a reservation from another tenant', async () => {
    const res = await request(app).post('/api/payments').send({ reservation_id: OTHER_RESERVATION, amount: 10, idempotency_key: key });
    expect(res.status).toBe(404);
    expect(payments.every(row => row.status !== 'succeeded')).toBe(true);
  });
});
