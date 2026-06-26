import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { createSuccessResponse } from '../middleware/logging';
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

const createTransactionSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('BAM'),
  type: z.string().min(1, 'Type is required'),
  note: z.string().optional(),
  occurredAt: z.string().datetime('Invalid datetime format'),
  reservationId: z.string().uuid('Invalid reservation ID').optional(),
});

const updateTransactionSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
  currency: z.string().optional(),
  type: z.string().min(1, 'Type is required').optional(),
  note: z.string().optional(),
  occurredAt: z.string().datetime('Invalid datetime format').optional(),
});

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
router.get('/transactions', authenticateToken, requireOrgContext, async (req, res, next) => {
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

/**
 * POST /api/transactions
 *
 * Body:
 * {
 *   amount: number,
 *   currency: string (default "BAM"),
 *   type: string,
 *   note: string (optional),
 *   occurredAt: ISO datetime string
 * }
 *
 * Rules:
 * - Validates with Zod
 * - Uses ctx.orgId (not from client)
 * - Returns created row
 */
router.post('/transactions', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    // Validate request body
    const validationResult = createTransactionSchema.safeParse(req.body);
    if (!validationResult.success) {
      apiError(res, 400, "VALIDATION_ERROR", "Validation error", validationResult.error.issues);
      return;
    }

    const { amount, currency, type, note, occurredAt, reservationId } = validationResult.data;
    const orgId = req.orgId!;

    // Create transaction
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        org_id: orgId,
        amount: amount,
        currency: currency,
        type: type,
        note: note,
        occurred_at: occurredAt,
        reservation_id: reservationId
      })
      .select()
      .single();

    if (error) return handleSupabaseError(res, error, "Failed to create transaction");

    // If linked to reservation and is a payment, update reservation's paid_amount
    if (reservationId && type === 'payment') {
      try {
        const { data: resData } = await supabaseAdmin
          .from('reservations')
          .select('paid_amount')
          .eq('id', reservationId)
          .single();

        if (resData) {
          const currentPaid = parseFloat(resData.paid_amount || 0);
          await supabaseAdmin
            .from('reservations')
            .update({ paid_amount: currentPaid + amount })
            .eq('id', reservationId);
        }
      } catch (err) {
        console.error('Failed to update reservation paid_amount:', err);
      }
    }

    res.status(201).json(transaction);

  } catch (error) {
    console.error('Error in POST /transactions:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * PATCH /api/transactions/:id
 */
router.patch('/transactions/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const validationResult = updateTransactionSchema.safeParse(req.body);
    if (!validationResult.success) {
      apiError(res, 400, "VALIDATION_ERROR", "Invalid request body", validationResult.error.issues);
      return;
    }

    const updateData: any = {};
    const { amount, currency, type, note, occurredAt } = validationResult.data;

    if (amount !== undefined) updateData.amount = amount;
    if (currency !== undefined) updateData.currency = currency;
    if (type !== undefined) updateData.type = type;
    if (note !== undefined) updateData.note = note;
    if (occurredAt !== undefined) updateData.occurred_at = occurredAt;

    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', req.orgId!)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        apiError(res, 404, "NOT_FOUND", "Transaction not found");
        return;
      }
      return handleSupabaseError(res, error, "Failed to update transaction");
    }

    res.json(transaction);

  } catch (error) {
    console.error('Error in PATCH /transactions/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * DELETE /api/transactions/:id
 */
router.delete('/transactions/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('org_id', req.orgId!);

    if (error) {
      if (error.code === 'PGRST116') {
        apiError(res, 404, "NOT_FOUND", "Transaction not found");
        return;
      }
      return handleSupabaseError(res, error, "Failed to delete transaction");
    }

    res.status(204).send();

  } catch (error) {
    console.error('Error in DELETE /transactions/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default router;
