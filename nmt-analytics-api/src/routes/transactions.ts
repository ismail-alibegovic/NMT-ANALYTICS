import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { requireMinimumRole } from '../middleware/requireRole';
import { formatListResponse, paginationQuerySchema, dateRangeQuerySchema, getPaginationParams, getDateRangeParams } from '../utils/pagination';
import { apiError } from "../lib/errors";

const router = Router();
const getTransactionsQuerySchema = z.object({
  ...paginationQuerySchema,
  ...dateRangeQuerySchema,
  type: z.string().optional(),
}).transform(data => ({
  ...data,
  ...getPaginationParams(data),
  ...getDateRangeParams(data),
}));

/**
 * GET /api/transactions
 *
 * Query params (optional):
 * - from,to: YYYY-MM-DD format
 * - type: transaction type filter
 *
 * Defaults: if from/to not provided -> last 30 days
 *
 * Returns: list of transactions for ctx.orgId, sorted by occurred_at desc
 */
router.get('/transactions', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res, next) => {
  try {
    // Validate query params
    const validationResult = getTransactionsQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error");
    }

    const { from, to, type, page, limit, offset, orderBy, orderDir } = validationResult.data;
    const orgId = req.orgId!;

    // Set default date range to last 30 days if not provided
    let dateFrom: string;
    let dateTo: string;

    if (from && to) {
      dateFrom = `${from}T00:00:00Z`;
      dateTo = `${to}T23:59:59Z`;
    } else {
      // Default to last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      dateFrom = startDate.toISOString().split('T')[0] + 'T00:00:00Z';
      dateTo = endDate.toISOString().split('T')[0] + 'T23:59:59Z';
    }

    // Build query
    let query = supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .gte('occurred_at', dateFrom)
      .lte('occurred_at', dateTo)
      .order(orderBy as string || 'occurred_at', { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);

    // Add type filter if provided
    if (type) {
      query = query.eq('type', type);
    }

    const { data: transactions, error, count } = await query;

    if (error) throw error;

    return res.json(formatListResponse(transactions || [], count || 0, page, limit));

  } catch (error) {
    next(error);
  }
});

const legacyReservationSchema = z.object({
  reservationId: z.string().uuid().optional(),
  reservation_id: z.string().uuid().optional(),
}).refine(data => !data.reservationId || !data.reservation_id || data.reservationId === data.reservation_id);

const retired = (res: Response) => apiError(
  res, 410, 'LEGACY_TRANSACTIONS_READ_ONLY',
  'Legacy transactions are read-only. Record or correct payments through /api/payments; reconcile legacy history before recording money again.',
);

router.post('/transactions', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const parsed = legacyReservationSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid reservation reference');
    const reservationId = parsed.data.reservationId || parsed.data.reservation_id;
    if (reservationId) {
      const { data, error } = await supabaseAdmin.from('reservations')
        .select('id').eq('id', reservationId).eq('org_id', req.orgId!).maybeSingle();
      if (error) return handleSupabaseError(res, error, 'Failed to verify reservation');
      if (!data) return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');
    }
    return retired(res);
  } catch (error) {
    return handleSupabaseError(res, error, 'Failed to verify legacy request');
  }
});

router.route('/transactions/:id')
  .all(authenticateToken, requireOrgContext, requireMinimumRole('manager'))
  .patch(rejectLegacyMutation)
  .delete(rejectLegacyMutation);

async function rejectLegacyMutation(req: Request, res: Response) {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid transaction ID');
  }
  try {
    const { data, error } = await supabaseAdmin.from('transactions')
      .select('id').eq('id', req.params.id).eq('org_id', req.orgId!).maybeSingle();
    if (error) return handleSupabaseError(res, error, 'Failed to verify transaction');
    if (!data) return apiError(res, 404, 'NOT_FOUND', 'Transaction not found');
    return retired(res);
  } catch (error) {
    return handleSupabaseError(res, error, 'Failed to verify transaction');
  }
}

export default router;
