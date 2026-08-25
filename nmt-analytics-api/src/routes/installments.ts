import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { requireMinimumRole } from '../middleware/requireRole';

const router = Router();

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

      const now = new Date().toISOString().slice(0, 10);
      const transformed = (installments || []).map((p: any) => ({
        id: p.id,
        installmentNumber: p.installment_number,
        amount: Number(p.amount ?? 0),
        currency: p.currency || reservation.currency || 'BAM',
        status: p.status,
        paymentDate: p.payment_date,
        dueDate: p.due_date,
        remainingAfter: p.remaining_after !== null ? Number(p.remaining_after) : null,
        overdue:
          p.due_date !== null &&
          p.due_date < now &&
          p.status === 'pending',
        createdAt: p.created_at,
      }));

      // Summary: total scheduled, paid, outstanding
      const totalScheduled = transformed.reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);
      const paidScheduled = transformed
        .filter((i: any) => i.status === 'succeeded')
        .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);
      const outstandingScheduled = Math.max(0, totalScheduled - paidScheduled);
      const overdueCount = transformed.filter((i: any) => i.overdue).length;

      return res.json({
        reservationId: id,
        totalAmount: Number(reservation.total_amount ?? 0),
        paidAmount: Number(reservation.paid_amount ?? 0),
        balanceDue: Number(reservation.balance_due ?? 0),
        currency: reservation.currency || 'BAM',
        installments: transformed,
        summary: {
          totalScheduled,
          paidScheduled,
          outstandingScheduled,
          overdueCount,
        },
      });
    } catch (err) {
      console.error('Error in GET /api/reservations/:id/installments:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

export default router;
