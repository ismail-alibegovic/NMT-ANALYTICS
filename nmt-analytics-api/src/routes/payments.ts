import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { logAction } from '../lib/audit';
import { z } from 'zod';
import { auditPaymentCreate, auditPaymentUpdate } from '../middleware/auditLogger';
import { notifyPaymentReceived } from '../lib/notificationService';
import { requireMinimumRole } from '../middleware/requireRole';


const router = Router();

// All payment routes require manager or higher
router.use(authenticateToken, requireOrgContext, requireMinimumRole('manager'));

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const getPaymentsQuerySchema = z.object({
    reservation_id: z.string().uuid('Invalid reservation_id UUID').optional(),
    from: z.string().optional(), // Allow flexible date formats
    to: z.string().optional(),
    page: z.preprocess(
        (val) => val === undefined ? 1 : Number(val),
        z.number().int().positive()
    ),
    limit: z.preprocess(
        (val) => val === undefined ? 20 : Number(val),
        z.number().int().positive()
    ),
});

const createPaymentSchema = z.object({
    reservation_id: z.string().uuid('Invalid reservation_id UUID'),
    amount: z.number().nonnegative('Amount must be >= 0'),
    currency: z.string().optional(), // Optional: defaults to reservation.currency
    status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'cancelled']).optional().default('succeeded'),
    payment_date: z.string().optional(), // YYYY-MM-DD
});

type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// ============================================================================
// GET /api/payments
// ============================================================================

/**
 * GET /api/payments
 * 
 * Query params:
 * - reservation_id (optional): Filter by reservation UUID
 * - from (optional): Start date (YYYY-MM-DD)
 * - to (optional): End date (YYYY-MM-DD)
 * - page (optional): Page number (default: 1)
 * - limit (optional): Items per page (default: 50, max: 200)
 * 
 * Returns paginated list of payments for the organization
 */
router.get('/payments', async (req: Request, res: Response) => {
    const orgId = req.orgId;
    const requestId = (req as any).requestId || 'unknown';

    try {
        // 1. Log incoming request
        console.log(`[GET /api/payments] [Req:${requestId}] Query:`, JSON.stringify(req.query));

        // 2. Validate query parameters
        const validationResult = getPaymentsQuerySchema.safeParse(req.query);
        if (!validationResult.success) {
            console.warn(`[GET /api/payments] [Req:${requestId}] Validation failed:`, validationResult.error.issues);
            return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', validationResult.error.issues);
        }

        const { reservation_id, from, to, page, limit } = validationResult.data;

        // 3. Check org context
        if (!orgId) {
            console.error(`[GET /api/payments] [Req:${requestId}] Missing org_id in request context`);
            return apiError(res, 401, 'ORG_REQUIRED', 'Organization context required');
        }

        // 4. Build query
        const effectiveLimit = Math.min(limit, 200);
        const offset = (page - 1) * effectiveLimit;

        let query = supabaseAdmin
            .from('payments')
            .select(`
                id,
                reservation_id,
                amount,
                currency,
                status,
                payment_date,
                created_at
            `, { count: 'exact' })
            .eq('org_id', orgId);

        if (reservation_id) {
            console.log(`[GET /api/payments] [Req:${requestId}] Filtering by reservation_id:`, {
                reservation_id,
                type: typeof reservation_id,
                length: reservation_id.length,
                isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservation_id)
            });
            query = query.eq('reservation_id', reservation_id);
        }

        if (from) query = query.gte('payment_date', from);
        if (to) query = query.lte('payment_date', to);

        query = query
            .order('payment_date', { ascending: false })
            .order('created_at', { ascending: false })
            .range(offset, offset + effectiveLimit - 1);

        // 5. Execute query
        console.log(`[GET /api/payments] [Req:${requestId}] Executing Supabase query for org ${orgId}`);
        const { data: payments, error, count } = await query;

        // 6. Handle Supabase errors
        if (error) {
            console.error(`[GET /api/payments] [Req:${requestId}] Supabase error:`, {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });

            // Specific error handling
            if (error.code === '42P01') {
                return apiError(res, 500, 'TABLE_MISSING', 'Database table "payments" is missing. Please run migrations.', error.message);
            }

            if (error.code === 'PGRST200') {
                return apiError(res, 500, 'RELATIONSHIP_MISSING', 'Relationship between payments and reservations not found.', error.message);
            }

            return apiError(res, 500, error.code || 'DATABASE_ERROR', 'Failed to fetch payments from database', { message: error.message, hint: error.hint });
        }

        // 7. Transform and return data
        const transformedPayments = (payments || []).map((payment: any) => {
            return {
                id: payment.id,
                reservationId: payment.reservation_id,
                amount: Number(payment.amount),
                currency: payment.currency,
                status: payment.status,
                paymentDate: payment.payment_date,
                createdAt: payment.created_at,
            };
        });

        console.log(`[GET /api/payments] [Req:${requestId}] Returning ${transformedPayments.length} results (Total: ${count})`);

        return res.json({
            data: transformedPayments,
            pagination: {
                page,
                limit: effectiveLimit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / effectiveLimit),
            },
        });

    } catch (error) {
        console.error(`[GET /api/payments] [Req:${requestId}] Unexpected error:`, error);
        return apiError(res, 500, 'INTERNAL_ERROR', 'An unexpected internal error occurred', error instanceof Error ? error.message : String(error));
    }
});

// ============================================================================
// POST /api/payments
// ============================================================================

/**
 * POST /api/payments
 * 
 * Body:
 * {
 *   reservation_id: string (UUID),
 *   amount: number (positive),
 *   currency?: string (optional, defaults to reservation.currency),
 *   status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled' (default: 'succeeded'),
 *   payment_date?: string (YYYY-MM-DD, optional, defaults to today UTC)
 * }
 * 
 * Response:
 * {
 *   payment: { id, reservationId, amount, currency, status, paymentDate, createdAt },
 *   reservation: { id, totalAmount, paidAmount, remainingAmount, status }
 * }
 * 
 * CURRENCY RULE: reservation.currency is the source of truth.
 * If payment currency is not provided, it inherits from the reservation.
 * 
 * Creates a new payment record and automatically updates reservations.paid_amount via trigger.
 * Returns both the created payment and the updated reservation for immediate UI updates.
 */
router.post('/payments', auditPaymentCreate, async (req: Request, res: Response) => {
    try {
        // Validate request body
        const validationResult = createPaymentSchema.safeParse(req.body);
        if (!validationResult.success) {
            return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', validationResult.error.issues);
        }

        const { reservation_id, amount, currency, status, payment_date } = validationResult.data;
        const orgId = req.orgId!;

        // Verify reservation exists and belongs to this org
        // ALSO fetch currency to use as source of truth
        const { data: reservation, error: reservationError } = await supabaseAdmin
            .from('reservations')
            .select('id, org_id, total_amount, paid_amount, status, currency, customer_name')
            .eq('id', reservation_id)
            .eq('org_id', orgId)
            .single();

        if (reservationError || !reservation) {
            return apiError(res, 404, 'RESERVATION_NOT_FOUND', 'Reservation not found or does not belong to your organization');
        }

        // CURRENCY RULE: reservation.currency is the source of truth
        // If payment currency not provided, inherit from reservation
        const effectiveCurrency = currency || reservation.currency || 'BAM';

        // Set payment_date to today (UTC) if not provided
        const effectivePaymentDate = payment_date || new Date().toISOString().split('T')[0];

        // Insert payment
        const { data: payment, error: insertError } = await supabaseAdmin
            .from('payments')
            .insert({
                reservation_id,
                org_id: orgId,
                amount,
                currency: effectiveCurrency,
                status,
                payment_date: effectivePaymentDate,
            })
            .select(`
        id,
        reservation_id,
        amount,
        currency,
        status,
        payment_date,
        created_at
      `)
            .single();

        if (insertError) {
            return handleSupabaseError(res, insertError, 'Failed to create payment');
        }

        // Fetch updated reservation to get the new paid_amount (updated by trigger)
        const { data: updatedReservation, error: fetchError } = await supabaseAdmin
            .from('reservations')
            .select('id, total_amount, paid_amount, status')
            .eq('id', reservation_id)
            .eq('org_id', orgId) // Ensure org_id scoping
            .single();

        if (fetchError) {
            console.warn('Failed to fetch updated reservation:', fetchError);
        }

        if (status === 'succeeded') {
            notifyPaymentReceived(orgId, reservation.customer_name || 'Klijent', amount, effectiveCurrency, payment.id)
                .catch((notificationError) => console.warn('Failed to create payment notification:', notificationError));
        }

        // Return created payment with updated reservation info
        return res.status(201).json({
            payment: {
                id: payment.id,
                reservationId: payment.reservation_id,
                amount: Number(payment.amount),
                currency: payment.currency,
                status: payment.status,
                paymentDate: payment.payment_date,
                createdAt: payment.created_at,
            },
            reservation: updatedReservation ? {
                id: updatedReservation.id,
                totalAmount: Number(updatedReservation.total_amount),
                paidAmount: Number(updatedReservation.paid_amount || 0),
                remainingAmount: Math.max(
                    Number(updatedReservation.total_amount) - Number(updatedReservation.paid_amount || 0),
                    0
                ),
                status: updatedReservation.status,
            } : null,
        });

    } catch (error) {
        console.error('Error creating payment:', error);
        return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to create payment', error instanceof Error ? error.message : String(error));
    }
});

// ============================================================================
// PATCH /api/payments/:id
// ============================================================================

const updatePaymentSchema = z.object({
    reservation_id: z.string().uuid('Invalid reservation_id UUID').optional(),
    amount: z.number().nonnegative('Amount must be >= 0').optional(),
    currency: z.string().optional(),
    status: z.enum(['pending', 'succeeded', 'failed', 'refunded', 'cancelled']).optional(),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
});

type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;

/**
 * PATCH /api/payments/:id
 * 
 * Update a payment record (for correcting mistakes)
 * 
 * Allowed fields:
 * - reservation_id: UUID (optional) - move payment to different reservation
 * - amount: number >= 0 (optional)
 * - currency: string (optional)
 * - status: enum (optional)
 * - payment_date: YYYY-MM-DD (optional)
 * 
 * Returns:
 * - payment: Updated payment object
 * - affectedReservations: Array of reservations with updated paid_amount
 */
router.patch('/payments/:id', auditPaymentUpdate, async (req: Request, res: Response) => {
    try {
        const paymentId = req.params.id;
        const orgId = req.orgId;

        if (!orgId) {
            return apiError(res, 403, 'ORG_REQUIRED', 'Organization context required');
        }

        // Validate payment ID
        if (!z.string().uuid().safeParse(paymentId).success) {
            return apiError(res, 400, 'INVALID_ID', 'Invalid payment ID format');
        }

        // Validate request body
        const validationResult = updatePaymentSchema.safeParse(req.body);
        if (!validationResult.success) {
            return apiError(res, 400, 'VALIDATION_ERROR', 'Validation failed', validationResult.error.issues);
        }

        const updateData = validationResult.data;

        // Check if payment exists and belongs to org
        const { data: existingPayment, error: fetchError } = await supabaseAdmin
            .from('payments')
            .select('id, reservation_id, org_id, amount, currency, status, payment_date')
            .eq('id', paymentId)
            .eq('org_id', orgId)
            .single();

        if (fetchError || !existingPayment) {
            return apiError(res, 404, 'NOT_FOUND', 'Payment not found');
        }

        const oldReservationId = existingPayment.reservation_id;
        const newReservationId = updateData.reservation_id || oldReservationId;

        // If reservation_id is changing, verify new reservation exists and belongs to org
        if (updateData.reservation_id && updateData.reservation_id !== oldReservationId) {
            const { data: newReservation, error: reservationError } = await supabaseAdmin
                .from('reservations')
                .select('id, org_id')
                .eq('id', updateData.reservation_id)
                .eq('org_id', orgId)
                .single();

            if (reservationError || !newReservation) {
            return apiError(res, 404, 'RESERVATION_NOT_FOUND', 'Target reservation not found');
            }
        }

        // Update payment
        const { data: updatedPayment, error: updateError } = await supabaseAdmin
            .from('payments')
            .update({
                ...(updateData.reservation_id && { reservation_id: updateData.reservation_id }),
                ...(updateData.amount !== undefined && { amount: updateData.amount }),
                ...(updateData.currency && { currency: updateData.currency }),
                ...(updateData.status && { status: updateData.status }),
                ...(updateData.payment_date && { payment_date: updateData.payment_date }),
            })
            .eq('id', paymentId)
            .eq('org_id', orgId)
            .select('id, reservation_id, amount, currency, status, payment_date, created_at')
            .single();

        if (updateError) {
            return handleSupabaseError(res, updateError, 'Failed to update payment');
        }

        // Audit log: payment.updated
        await logAction(req, 'payment.updated', 'payment', paymentId, {
            oldValues: {
                reservation_id: existingPayment.reservation_id,
                amount: existingPayment.amount,
                currency: existingPayment.currency,
                status: existingPayment.status,
                payment_date: existingPayment.payment_date,
            },
            newValues: {
                reservation_id: updatedPayment.reservation_id,
                amount: updatedPayment.amount,
                currency: updatedPayment.currency,
                status: updatedPayment.status,
                payment_date: updatedPayment.payment_date,
            },
            metadata: {
                reservation_id: updatedPayment.reservation_id,
                old_reservation_id: oldReservationId !== newReservationId ? oldReservationId : undefined,
            },
        });

        // Fetch affected reservations (old and new if changed)
        const affectedReservationIds = [oldReservationId];
        if (newReservationId !== oldReservationId) {
            affectedReservationIds.push(newReservationId);
        }

        const { data: affectedReservations } = await supabaseAdmin
            .from('reservations')
            .select('id, total_amount, paid_amount, status')
            .in('id', affectedReservationIds)
            .eq('org_id', orgId);

        return res.status(200).json({
            payment: {
                id: updatedPayment.id,
                reservationId: updatedPayment.reservation_id,
                amount: Number(updatedPayment.amount),
                currency: updatedPayment.currency,
                status: updatedPayment.status,
                paymentDate: updatedPayment.payment_date,
                createdAt: updatedPayment.created_at,
                updatedAt: updatedPayment.created_at,
            },
            affectedReservations: affectedReservations?.map(r => ({
                id: r.id,
                totalAmount: Number(r.total_amount),
                paidAmount: Number(r.paid_amount || 0),
                remainingAmount: Math.max(Number(r.total_amount) - Number(r.paid_amount || 0), 0),
                status: r.status,
            })) || [],
        });

    } catch (error) {
        console.error('Error updating payment:', error);
        return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update payment', error instanceof Error ? error.message : String(error));
    }
});

// ============================================================================
// POST /api/payments/:id/void
// ============================================================================

/**
 * POST /api/payments/:id/void
 * 
 * Void/cancel a payment (sets status to 'cancelled')
 * Use this to correct mistakes or cancel erroneous payments
 * 
 * Returns:
 * - payment: Updated payment with status='cancelled'
 * - reservation: Affected reservation with updated paid_amount
 */
router.post('/payments/:id/void', auditPaymentUpdate, async (req: Request, res: Response) => {
    try {
        const paymentId = req.params.id;
        const orgId = req.orgId;

        if (!orgId) {
            return apiError(res, 403, 'ORG_REQUIRED', 'Organization context required');
        }

        // Validate payment ID
        if (!z.string().uuid().safeParse(paymentId).success) {
            return apiError(res, 400, 'INVALID_ID', 'Invalid payment ID format');
        }

        // Check if payment exists and belongs to org
        const { data: existingPayment, error: fetchError } = await supabaseAdmin
            .from('payments')
            .select('id, reservation_id, org_id, status')
            .eq('id', paymentId)
            .eq('org_id', orgId)
            .single();

        if (fetchError || !existingPayment) {
            return apiError(res, 404, 'NOT_FOUND', 'Payment not found');
        }

        // Check if already cancelled
        if (existingPayment.status === 'cancelled') {
            return apiError(res, 400, 'ALREADY_CANCELLED', 'Payment is already cancelled');
        }

        // Update payment status to cancelled
        const { data: updatedPayment, error: updateError } = await supabaseAdmin
            .from('payments')
            .update({
                status: 'cancelled',
            })
            .eq('id', paymentId)
            .eq('org_id', orgId)
            .select('id, reservation_id, amount, currency, status, payment_date, created_at')
            .single();

        if (updateError) {
            return handleSupabaseError(res, updateError, 'Failed to void payment');
        }

        // Audit log: payment.voided
        await logAction(req, 'payment.voided', 'payment', paymentId, {
            oldValues: {
                status: existingPayment.status,
            },
            newValues: {
                status: 'cancelled',
            },
            metadata: {
                reservation_id: existingPayment.reservation_id,
                payment_id: paymentId,
            },
        });

        // Fetch updated reservation (trigger will have updated paid_amount)
        const { data: updatedReservation } = await supabaseAdmin
            .from('reservations')
            .select('id, total_amount, paid_amount, status')
            .eq('id', existingPayment.reservation_id)
            .eq('org_id', orgId)
            .single();

        return res.status(200).json({
            payment: {
                id: updatedPayment.id,
                reservationId: updatedPayment.reservation_id,
                amount: Number(updatedPayment.amount),
                currency: updatedPayment.currency,
                status: updatedPayment.status,
                paymentDate: updatedPayment.payment_date,
                createdAt: updatedPayment.created_at,
                updatedAt: updatedPayment.created_at,
            },
            reservation: updatedReservation ? {
                id: updatedReservation.id,
                totalAmount: Number(updatedReservation.total_amount),
                paidAmount: Number(updatedReservation.paid_amount || 0),
                remainingAmount: Math.max(
                    Number(updatedReservation.total_amount) - Number(updatedReservation.paid_amount || 0),
                    0
                ),
                status: updatedReservation.status,
            } : null,
        });

    } catch (error) {
        console.error('Error voiding payment:', error);
        return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to void payment', error instanceof Error ? error.message : String(error));
    }
});

export default router;

// ============================================================================
// GET /api/payments/dashboard
// Returns payment dashboard data: metrics, overdue, pending, recent
// ============================================================================
router.get('/payments/dashboard', async (req: Request, res: Response) => {
  try {
    const orgId = req.orgId!;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const [overdueRes, pendingPayments, recentPayments, metrics] = await Promise.all([
      // Overdue reservations: balance_due > 0 and departure date has passed
      supabaseAdmin
        .from('reservations')
        .select(`
          id, customer_id, customer_name, customer_phone, total_amount, paid_amount,
          balance_due, payment_status, currency, status,
          departures!inner(depart_at, packages!inner(name))
        `)
        .eq('org_id', orgId)
        .not('balance_due', 'eq', 0)
        .not('balance_due', 'is', null)
        .neq('status', 'cancelled')
        .lt('departures.depart_at', now.toISOString())
        .order('departures.depart_at', { ascending: false })
        .limit(20),

      // Pending payments
      supabaseAdmin
        .from('payments')
        .select(`
          id, reservation_id, amount, currency, status, payment_date, created_at,
          reservations!inner(customer_name, customer_phone)
        `)
        .eq('org_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),

      // Recent successful payments
      supabaseAdmin
        .from('payments')
        .select(`
          id, reservation_id, amount, currency, status, payment_date, created_at,
          reservations!inner(customer_name, customer_phone)
        `)
        .eq('org_id', orgId)
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(10),

      // Metrics
      supabaseAdmin
        .from('payments')
        .select('status, amount, payment_date')
        .eq('org_id', orgId),
    ]);

    const allPayments = metrics.data || [];

    const totalPaidToday = allPayments
      .filter(p => p.status === 'succeeded' && p.payment_date >= todayStr)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalPaidThisMonth = allPayments
      .filter(p => p.status === 'succeeded' && p.payment_date >= monthStart)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalPendingAmount = allPayments
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalFailedAmount = allPayments
      .filter(p => p.status === 'failed')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const overdueAmount = (overdueRes.data || []).reduce(
      (sum, r) => sum + Number(r.balance_due), 0
    );

    const formatOverdue = (r: any) => ({
      id: r.id,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      packageName: r.departures?.packages?.name || '-',
      departureDate: r.departures?.depart_at,
      totalAmount: Number(r.total_amount),
      paidAmount: Number(r.paid_amount),
      balanceDue: Number(r.balance_due),
      currency: r.currency || 'BAM',
      paymentStatus: r.payment_status,
      reservationStatus: r.status,
    });

    const formatPayment = (p: any) => ({
      id: p.id,
      reservationId: p.reservation_id,
      customerName: p.reservations?.customer_name || '-',
      customerPhone: p.reservations?.customer_phone || '',
      amount: Number(p.amount),
      currency: p.currency || 'BAM',
      status: p.status,
      paymentDate: p.payment_date,
      createdAt: p.created_at,
    });

    res.json({
      metrics: {
        totalPaidToday,
        totalPaidThisMonth,
        totalPendingAmount,
        totalFailedAmount,
        overdueAmount,
        overdueCount: (overdueRes.data || []).length,
        pendingCount: (pendingPayments.data || []).length,
      },
      overdueReservations: (overdueRes.data || []).map(formatOverdue),
      pendingPayments: (pendingPayments.data || []).map(formatPayment),
      recentPayments: (recentPayments.data || []).map(formatPayment),
    });
  } catch (err) {
    console.error('[payments/dashboard] Error:', err);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to load payment dashboard');
  }
});

// ============================================================================
// EXAMPLE CURL COMMANDS
// ============================================================================

/*

# GET all payments for organization (last 20)
curl -X GET "http://localhost:3001/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN"

# GET payments for specific reservation
curl -X GET "http://localhost:3001/api/payments?reservation_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_TOKEN"

# GET payments within date range (ISO Date or Latetime)
curl -X GET "http://localhost:3001/api/payments?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z" \
  -H "Authorization: Bearer YOUR_TOKEN"

# GET payments with pagination
curl -X GET "http://localhost:3001/api/payments?page=2&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"

# POST create new payment
curl -X POST "http://localhost:3001/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 500.00,
    "currency": "BAM",
    "status": "succeeded",
    "payment_date": "2026-01-12"
  }'

# POST create payment with defaults (currency=BAM, status=succeeded, payment_date=today)
curl -X POST "http://localhost:3001/api/payments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 250.00
  }'

# Example Response (201 Created):
# {
#   "payment": {
#     "id": "uuid",
#     "reservationId": "uuid",
#     "amount": 250.00,
#     "currency": "BAM",
#     "status": "succeeded",
#     "paymentDate": "2026-01-14",
#     "createdAt": "2026-01-14T13:30:00Z"
#   },
#   "reservation": {
#     "id": "uuid",
#     "totalAmount": 1000.00,
#     "paidAmount": 250.00,
#     "remainingAmount": 750.00,
#     "status": "confirmed"
#   }
# }

# PATCH update payment (correct mistakes)
curl -X PATCH "http://localhost:3001/api/payments/abc123-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 300.00,
    "status": "succeeded"
  }'

# PATCH move payment to different reservation
curl -X PATCH "http://localhost:3001/api/payments/abc123-uuid" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reservation_id": "new-reservation-uuid"
  }'

# Example Response (200 OK):
# {
#   "payment": {
#     "id": "abc123-uuid",
#     "reservationId": "new-reservation-uuid",
#     "amount": 300.00,
#     "currency": "BAM",
#     "status": "succeeded",
#     "paymentDate": "2026-01-14",
#     "createdAt": "2026-01-14T13:30:00Z",
#     "updatedAt": "2026-01-14T15:00:00Z"
#   },
#   "affectedReservations": [
#     {
#       "id": "old-reservation-uuid",
#       "totalAmount": 1000.00,
#       "paidAmount": 0.00,
#       "remainingAmount": 1000.00,
#       "status": "confirmed"
#     },
#     {
#       "id": "new-reservation-uuid",
#       "totalAmount": 2000.00,
#       "paidAmount": 300.00,
#       "remainingAmount": 1700.00,
#       "status": "confirmed"
#     }
#   ]
# }

# POST void/cancel payment
curl -X POST "http://localhost:3001/api/payments/abc123-uuid/void" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Example Response (200 OK):
# {
#   "payment": {
#     "id": "abc123-uuid",
#     "reservationId": "uuid",
#     "amount": 250.00,
#     "currency": "BAM",
#     "status": "cancelled",
#     "paymentDate": "2026-01-14",
#     "createdAt": "2026-01-14T13:30:00Z",
#     "updatedAt": "2026-01-14T15:10:00Z"
#   },
#   "reservation": {
#     "id": "uuid",
#     "totalAmount": 1000.00,
#     "paidAmount": 0.00,
#     "remainingAmount": 1000.00,
#     "status": "confirmed"
#   }
# }

*/
