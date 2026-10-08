import { beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const ORG = 'e1e1e1e1-1111-4111-8111-111111111111'
const USER = 'e1e1e1e1-1111-4111-8111-444444444444'
const RES = 'e1e1e1e1-1111-4111-8111-222222222222'
const PAY = 'e1e1e1e1-1111-4111-8111-333333333333'

const h = vi.hoisted(() => ({
  paymentInserts: [] as unknown[],
  auditInserts: [] as unknown[],
  reservationQueue: [] as unknown[],
  paymentResult: { data: null as unknown, error: null as unknown },
}))

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'reservations') {
        const queue = h.reservationQueue
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve(
                    queue.length
                      ? queue.shift()
                      : { data: null, error: { message: 'no reservation fixture' } }
                  ),
              }),
            }),
          }),
        }
      }
      if (table === 'payments') {
        return {
          insert: (payload: unknown) => {
            h.paymentInserts.push(payload)
            return { select: () => ({ single: () => Promise.resolve(h.paymentResult) }) }
          },
        }
      }
      if (table === 'audit_logs') {
        return {
          insert: (payload: unknown) => {
            h.auditInserts.push(payload)
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'customers') {
        return {
          select: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }
      }
      return {}
    }),
  },
  handleSupabaseError: (res: Response, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}))

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../lib/notificationService', () => ({
  notifyPaymentReceived: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/email/EmailService', () => ({
  EmailService: { sendPaymentConfirmation: vi.fn() },
}))

const reservationRow = {
  id: RES,
  org_id: ORG,
  total_amount: 200,
  paid_amount: 0,
  status: 'completed',
  currency: 'EUR',
  customer_name: 'Acceptance EUR',
  customer_id: null,
}

const paymentRow = {
  id: PAY,
  reservation_id: RES,
  amount: 200,
  currency: 'EUR',
  status: 'succeeded',
  payment_method: 'cash',
  payment_date: '2026-10-08',
  installment_number: null,
  due_date: null,
  remaining_after: null,
  created_at: '2026-10-08T00:00:00Z',
}

const updatedReservationRow = {
  id: RES,
  total_amount: 200,
  paid_amount: 200,
  balance_due: 0,
  payment_status: 'paid',
  status: 'completed',
}

let app: express.Express

beforeEach(async () => {
  h.paymentInserts.length = 0
  h.auditInserts.length = 0
  h.reservationQueue.length = 0
  h.paymentResult = { data: paymentRow, error: null }

  app = express()
  app.use(express.json())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    ;(req as unknown as Record<string, unknown>).orgId = ORG
    ;(req as unknown as Record<string, unknown>).user = { id: USER }
    next()
  })
  const { default: paymentsRouter } = await import('../routes/payments')
  app.use('/api', paymentsRouter)
})

describe('POST /api/payments — overpayment guard', () => {
  it('rejects a succeeded payment larger than the outstanding balance with 422', async () => {
    h.reservationQueue.push({ data: reservationRow, error: null })

    const res = await request(app)
      .post('/api/payments')
      .send({ reservation_id: RES, amount: 250, currency: 'EUR' })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('PAYMENT_EXCEEDS_TOTAL')
    expect(h.paymentInserts).toHaveLength(0)
    expect(h.auditInserts).toHaveLength(0)
  })

  it('rejects a payment that overflows a partially paid reservation', async () => {
    h.reservationQueue.push({ data: { ...reservationRow, paid_amount: 150 }, error: null })

    const res = await request(app)
      .post('/api/payments')
      .send({ reservation_id: RES, amount: 60, currency: 'EUR' })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('PAYMENT_EXCEEDS_TOTAL')
    expect(h.paymentInserts).toHaveLength(0)
  })

  it('allows a payment equal to the outstanding balance and audits the payment id', async () => {
    h.reservationQueue.push({ data: reservationRow, error: null })
    h.reservationQueue.push({ data: updatedReservationRow, error: null })

    const res = await request(app)
      .post('/api/payments')
      .send({ reservation_id: RES, amount: 200, currency: 'EUR', payment_method: 'cash' })

    expect(res.status).toBe(201)
    expect(res.body.payment.id).toBe(PAY)
    expect(h.paymentInserts).toHaveLength(1)

    expect(h.auditInserts).toHaveLength(1)
    const audit = h.auditInserts[0] as Record<string, unknown>
    expect(audit.action).toBe('CREATE')
    expect(audit.entity).toBe('payment')
    expect(audit.org_id).toBe(ORG)
    expect(audit.entity_id).toBe(PAY)
  })

  it('still rejects a currency mismatch before balance validation', async () => {
    h.reservationQueue.push({ data: reservationRow, error: null })

    const res = await request(app)
      .post('/api/payments')
      .send({ reservation_id: RES, amount: 100, currency: 'BAM' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('CURRENCY_MISMATCH')
  })
})

describe('resolveEntityId', () => {
  it('resolves flat, nested, and missing ids', async () => {
    const { resolveEntityId } = await import('../middleware/auditLogger')

    expect(resolveEntityId({ id: 'a' })).toBe('a')
    expect(resolveEntityId({ payment: { id: 'b' } })).toBe('b')
    expect(resolveEntityId({ reservation: { id: 'c' } })).toBe('c')
    expect(resolveEntityId({ payment: { id: PAY }, reservation: { id: RES } })).toBe(PAY)
    expect(resolveEntityId({ data: { id: 'd' } })).toBe('d')
    expect(resolveEntityId({})).toBeUndefined()
    expect(resolveEntityId(null)).toBeUndefined()
  })

  it('logAuditEntry skips inserts when no entity id is resolved instead of violating NOT NULL', async () => {
    const { logAuditEntry } = await import('../middleware/auditLogger')

    await logAuditEntry({
      org_id: ORG,
      user_id: USER,
      action: 'LOGIN',
      entity: 'user',
    } as Parameters<typeof logAuditEntry>[0])

    expect(h.auditInserts).toHaveLength(0)
  })
})
