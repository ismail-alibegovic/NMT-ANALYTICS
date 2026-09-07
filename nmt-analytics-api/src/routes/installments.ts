import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { requireMinimumRole } from '../middleware/requireRole';
import { z } from 'zod';

const router = Router();

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

const replaceScheduleSchema = z.object({
  installmentCount: z.number().int().min(2).max(24),
  firstDueDate: z.string().regex(VALID_DATE, 'Must be YYYY-MM-DD').optional(),
  intervalDays: z.number().int().min(1).max(365).optional(),
});

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toCents(amount: unknown): number {
  return Math.round(Number(amount || 0) * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

export function buildInstallmentScheduleRows(input: {
  reservationId: string;
  orgId: string;
  totalAmount: number;
  currency: string;
  installmentCount: number;
  firstDueDate: string;
  intervalDays?: number;
}) {
  const totalCents = toCents(input.totalAmount);
  const count = input.installmentCount;
  const baseCents = Math.floor(totalCents / count);
  const finalCents = totalCents - baseCents * (count - 1);
  const intervalDays = input.intervalDays ?? 30;

  if (baseCents <= 0 || finalCents <= 0) {
    throw new Error('INSTALLMENT_AMOUNT_TOO_SMALL');
  }

  let scheduledCents = 0;
  return Array.from({ length: count }, (_, index) => {
    const amountCents = index === count - 1 ? finalCents : baseCents;
    scheduledCents += amountCents;
    return {
      reservation_id: input.reservationId,
      org_id: input.orgId,
      amount: fromCents(amountCents),
      currency: input.currency,
      status: 'pending',
      payment_method: null,
      payment_date: null,
      installment_number: index + 1,
      due_date: addDays(input.firstDueDate, index * intervalDays),
      remaining_after: fromCents(Math.max(totalCents - scheduledCents, 0)),
    };
  });
}

function transformInstallment(payment: any, fallbackCurrency: string) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: payment.id,
    installmentNumber: payment.installment_number,
    amount: Number(payment.amount ?? 0),
    currency: payment.currency || fallbackCurrency || 'BAM',
    status: payment.status,
    paymentDate: payment.payment_date,
    dueDate: payment.due_date,
    remainingAfter: payment.remaining_after !== null ? Number(payment.remaining_after) : null,
    overdue:
      payment.due_date !== null &&
      payment.due_date < today &&
      payment.status === 'pending',
    createdAt: payment.created_at,
  };
}

function summarizeInstallments(installments: any[]) {
  const totalScheduled = installments.reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);
  const paidScheduled = installments
    .filter((i: any) => i.status === 'succeeded')
    .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);
  return {
    totalScheduled,
    paidScheduled,
    outstandingScheduled: Math.max(0, totalScheduled - paidScheduled),
    overdueCount: installments.filter((i: any) => i.overdue).length,
  };
}

/**
 * GET /api/reservations/:id/installments
 * Returns the installment schedule for a reservation, derived from the
 * `payments` table (which gained installment_number/due_date/remaining_after
 * columns in migration 030). Each row is enriched with an `overdue` boolean.
 *
 * Manager+ can see all installments; agent can see installments for
 * reservations assigned to them.
 */
router.get(
  '/reservations/:id/installments',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;

      // Validate reservation exists / belongs to org
      const { data: reservation, error: resErr } = await supabaseAdmin
        .from('reservations')
        .select('id, total_amount, paid_amount, balance_due, currency, assigned_to')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();
      if (resErr || !reservation) {
        return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');
      }

      // Pull all payments tagged as installments (installment_number IS NOT NULL)
      const { data: installments, error: payErr } = await supabaseAdmin
        .from('payments')
        .select(
          'id, installment_number, amount, currency, status, payment_date, due_date, remaining_after, created_at'
        )
        .eq('reservation_id', id)
        .eq('org_id', orgId)
        .not('installment_number', 'is', null)
        .order('installment_number', { ascending: true, nullsFirst: false });

      if (payErr) throw payErr;

      const transformed = (installments || []).map((p: any) => transformInstallment(p, reservation.currency || 'BAM'));

      return res.json({
        reservationId: id,
        totalAmount: Number(reservation.total_amount ?? 0),
        paidAmount: Number(reservation.paid_amount ?? 0),
        balanceDue: Number(reservation.balance_due ?? 0),
        currency: reservation.currency || 'BAM',
        installments: transformed,
        summary: summarizeInstallments(transformed),
      });
    } catch (err) {
      console.error('Error in GET /api/reservations/:id/installments:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

router.put(
  '/reservations/:id/installments',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const parsed = replaceScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.issues);
      }

      const { data: reservation, error: reservationError } = await supabaseAdmin
        .from('reservations')
        .select('id, total_amount, paid_amount, balance_due, payment_status, currency')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (reservationError || !reservation) {
        return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');
      }

      const totalAmount = Number(reservation.total_amount || 0);
      const firstDueDate = parsed.data.firstDueDate || new Date().toISOString().slice(0, 10);
      let rows;
      try {
        rows = buildInstallmentScheduleRows({
          reservationId: id,
          orgId,
          totalAmount,
          currency: reservation.currency || 'BAM',
          installmentCount: parsed.data.installmentCount,
          firstDueDate,
          intervalDays: parsed.data.intervalDays,
        });
      } catch (error) {
        if ((error as Error).message === 'INSTALLMENT_AMOUNT_TOO_SMALL') {
          return apiError(res, 400, 'INSTALLMENT_AMOUNT_TOO_SMALL', 'Installment amount would be zero or negative');
        }
        throw error;
      }

      const rpcRows = rows.map(({ reservation_id, org_id, status, payment_method, payment_date, ...row }) => row);
      const { data: inserted, error: rpcError } = await supabaseAdmin.rpc(
        'replace_reservation_installment_schedule_atomic',
        {
          p_org_id: orgId,
          p_reservation_id: id,
          p_schedule: rpcRows,
        },
      );

      if (rpcError) {
        if (String(rpcError.message || '').includes('INSTALLMENT_HISTORY_EXISTS')) {
          return apiError(
            res,
            409,
            'INSTALLMENT_HISTORY_EXISTS',
            'Cannot replace installment schedule because historical installment payments already exist',
          );
        }
        if (String(rpcError.message || '').includes('RESERVATION_NOT_FOUND')) {
          return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');
        }
        return handleSupabaseError(res, rpcError, 'Failed to replace installment schedule');
      }

      const installments = (inserted || []).map((payment: any) => transformInstallment(payment, reservation.currency || 'BAM'));

      return res.json({
        reservationId: id,
        totalAmount: Number(reservation.total_amount ?? 0),
        paidAmount: Number(reservation.paid_amount ?? 0),
        balanceDue: Number(reservation.balance_due ?? 0),
        paymentStatus: reservation.payment_status || null,
        currency: reservation.currency || 'BAM',
        installments,
        summary: summarizeInstallments(installments),
      });
    } catch (err) {
      console.error('Error in PUT /api/reservations/:id/installments:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

export default router;
