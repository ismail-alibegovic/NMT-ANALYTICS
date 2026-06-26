import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from "../lib/errors";
import { z } from 'zod';
import { auditReservationCreate, auditReservationUpdate, auditReservationDelete } from '../middleware/auditLogger';
import { createSuccessResponse } from '../middleware/logging';
import { logAction } from '../lib/audit';
import { formatListResponse, paginationQuerySchema, dateRangeQuerySchema, getPaginationParams, getDateRangeParams } from '../utils/pagination';
import { calculateRemainingAmount, safeNumber } from '../utils/business';
import { generateVoucherPDF, generateInvoicePDF } from '../lib/pdfGenerator';
import { EmailService } from '../lib/email/EmailService';
import PDFDocument from 'pdfkit';
import { notifyNewReservation } from '../lib/notificationService';
import { requireMinimumRole } from '../middleware/requireRole';

const router = Router();

const getReservationsQuerySchema = z.object({
  search: z.string().optional(),
  ...paginationQuerySchema,
  ...dateRangeQuerySchema,
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  departureId: z.string().uuid('Invalid departure ID').optional(),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  assignedOnly: z.string().optional(),
}).transform(data => ({
  ...data,
  ...getPaginationParams(data),
  ...getDateRangeParams(data),
}));

const createReservationSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  customerPhone: z.string().min(1, 'Phone number is required'),
  partySize: z.number().int().min(1, 'Party size must be at least 1'),
  reservationAt: z.string().datetime('Invalid datetime format'),
  status: z.enum(['pending', 'confirmed', 'cancelled']).default('pending'),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  departureId: z.string().uuid('Invalid departure ID').optional(),
  totalAmount: z.number().min(0, 'Total amount must be non-negative').optional(),
  currency: z.string().default('BAM'),
  source: z.enum(['web', 'phone', 'agent', 'walk-in', 'other']).optional(),
  // Allow upsert by natural key (departure_id, customer_phone, reservation_at)
  upsert: z.boolean().default(false),
});

const updateReservationSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  departureId: z.string().uuid('Invalid departure ID').optional(),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  totalAmount: z.number().min(0, 'Total amount must be non-negative').optional(),
  paidAmount: z.number().min(0, 'Paid amount must be non-negative').optional(),
  reservationAt: z.string().datetime('Invalid datetime format').optional(),
  partySize: z.number().int().min(1, 'Party size must be at least 1').optional(),
  customerName: z.string().min(1, 'Customer name is required').optional(),
  customerPhone: z.string().optional(),
  currency: z.string().optional(),
  source: z.enum(['web', 'phone', 'agent', 'walk-in', 'other']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed'], {
    message: 'Invalid status. Must be pending, confirmed, cancelled, or completed'
  }),
});

/**
 * Helper to transform reservation for Admin UI
 * 
 * FINANCIAL TRUTH FIELDS (auto-calculated by DB trigger):
 * - paid_amount: SUM of succeeded payments
 * - balance_due: total_amount - paid_amount (can be negative for overpayment)
 * - payment_status: unpaid | partially_paid | paid | refunded
 */
function transformReservation(reservation: any) {
  const customer = reservation.customers;
  const departure = reservation.departures;
  const pkg = departure?.packages;

  const totalAmount = safeNumber(reservation.total_amount);
  const paidAmount = safeNumber(reservation.paid_amount);
  const balanceDue = safeNumber(reservation.balance_due);
  const remainingAmount = calculateRemainingAmount(totalAmount, paidAmount);

  return {
    id: reservation.id,
    orgId: reservation.org_id,
    customerId: reservation.customer_id,
    customerName: reservation.customer_name || customer?.full_name || '-',
    departureId: reservation.departure_id,
    packageName: pkg?.name || '-',
    bookingDate: reservation.reservation_at,
    totalAmount: totalAmount,
    paidAmount: paidAmount,
    balanceDue: balanceDue, // DB-calculated: total_amount - paid_amount
    remainingAmount: remainingAmount, // Legacy field for backward compatibility
    paymentStatus: reservation.payment_status || 'unpaid', // DB-calculated: unpaid|partially_paid|paid|refunded
    currency: reservation.currency || 'BAM',
    participants: safeNumber(reservation.party_size),
    status: reservation.status,
    source: reservation.source,
    createdAt: reservation.created_at,
    assignedTo: reservation.assigned_to || null,
    // Include nested objects if needed by some parts of the UI
    customer: customer,
    departure: departure
  };
}

/**
 * GET /api/reservations
 */
router.get('/reservations', authenticateToken, requireOrgContext, async (req, res, next) => {
  try {
    const validationResult = getReservationsQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error");
    }

    const { search, from, to, status, departureId, customerId, page, limit, offset, orderBy, orderDir, assignedOnly } = validationResult.data;
    const orgId = req.orgId!;

    let dateFrom: string;
    let dateTo: string;

    if (from && to) {
      dateFrom = `${from}T00:00:00Z`;
      dateTo = `${to}T23:59:59Z`;
    } else {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90); // default to 90 days for reservations
      dateFrom = startDate.toISOString().split('T')[0] + 'T00:00:00Z';
      dateTo = endDate.toISOString().split('T')[0] + 'T23:59:59Z';
    }

    let query = supabaseAdmin
      .from('reservations')
      .select(`
        id,
        org_id,
        customer_id,
        departure_id,
        customer_name,
        customer_phone,
        party_size,
        reservation_at,
        status,
        total_amount,
        paid_amount,
        balance_due,
        payment_status,
        currency,
        source,
        created_at,
        assigned_to,
        customers (id, full_name, phone, email),
        departures (
          id,
          depart_at,
          return_at,
          packages (id, name, destination)
        )
      `, { count: 'exact' })
      .eq('org_id', orgId)
      .gte('reservation_at', dateFrom)
      .lte('reservation_at', dateTo)
      .order(orderBy as string || 'reservation_at', { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (departureId) query = query.eq('departure_id', departureId);
    if (customerId) query = query.eq('customer_id', customerId);

    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`customer_name.ilike.%${searchTerm}%,customer_phone.ilike.%${searchTerm}%`);
    }

    // Filter by assigned_to (My Clients mode for agents)
    if (assignedOnly === 'true') {
      query = query.eq('assigned_to', req.user!.id);
    }

    const { data: reservations, error, count } = await query;
    if (error) throw error;

    // Map to Admin interface exactly
    const transformedData = (reservations || []).map(transformReservation);

    return res.json(formatListResponse(transformedData, count || 0, page, limit));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reservations
 */
router.post('/reservations', authenticateToken, requireOrgContext, auditReservationCreate, async (req, res: Response) => {
  try {
    const validationResult = createReservationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid request body", validationResult.error.issues);
    }

    const { departureId, status, partySize, customerId, upsert, ...rest } = validationResult.data;
    const orgId = req.orgId!;

    // 1. Validate customer if provided
    if (customerId) {
      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('id', customerId)
        .eq('org_id', orgId)
        .single();
      if (!customer) {
        return apiError(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");
      }
    }

    // 2. Call the atomic RPC function
    const { data: reservation, error } = await supabaseAdmin
      .rpc('create_reservation_atomic', {
        p_org_id: orgId,
        p_departure_id: departureId || null,
        p_customer_data: { ...rest, customerId },
        p_party_size: partySize,
        p_status: status,
        p_assigned_to: req.user!.id
      });

    if (error) {
      if (error.message === 'CAPACITY_FULL') {
        return apiError(res, 400, "CAPACITY_FULL", "Departure capacity is full");
      }
      if (error.message === 'DEPARTURE_NOT_FOUND') {
        return apiError(res, 404, "DEPARTURE_NOT_FOUND", "Departure not found");
      }
      return handleSupabaseError(res, error, "Failed to create reservation");
    }

    try {
      const createdReservation = Array.isArray(reservation) ? reservation[0] : reservation;
      let packageName = 'aranžman';

      if (departureId) {
        const { data: departure } = await supabaseAdmin
          .from('departures')
          .select('packages(name)')
          .eq('id', departureId)
          .eq('org_id', orgId)
          .single();

        const packages = departure?.packages as any;
        packageName = Array.isArray(packages) ? packages[0]?.name || packageName : packages?.name || packageName;
      }

      await notifyNewReservation(
        orgId,
        rest.customerName,
        packageName,
        createdReservation?.id || createdReservation?.reservation_id || ''
      );
    } catch (notificationError) {
      console.warn('Failed to create reservation notification:', notificationError);
    }

    res.status(201).json(reservation);
  } catch (error) {
    console.error('Error in POST /reservations:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", String(error));
  }
});

/**
 * PATCH /api/reservations/:id
 */
router.patch('/reservations/:id', authenticateToken, requireOrgContext, auditReservationUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const validationResult = updateReservationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid request body", validationResult.error.issues);
    }

    const updates = validationResult.data;
    const orgId = req.orgId!;

    // 1. Fetch current reservation
    const { data: reservation, error: fetchErr } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (fetchErr || !reservation) {
      return apiError(res, 404, "NOT_FOUND", "Reservation not found");
    }

    const oldStatus = reservation.status;
    const newStatus = updates.status || oldStatus;
    const oldDepId = reservation.departure_id;
    const newDepId = updates.departureId !== undefined ? updates.departureId : oldDepId;
    const partySize = updates.partySize || reservation.party_size;

    // 2. Atomic Capacity Management
    if (newDepId && newStatus === 'confirmed') {
      // Verify new departure exists and belongs to org
      const { data: newDep, error: newDepErr } = await supabaseAdmin
        .from('departures')
        .select('id, booked, capacity')
        .eq('id', newDepId)
        .eq('org_id', orgId)
        .single();

      if (newDepErr || !newDep) {
        return apiError(res, 404, "DEPARTURE_NOT_FOUND", "New departure not found");
      }

      // If departure changed, handle old departure first
      if (newDepId !== oldDepId && oldDepId && oldStatus === 'confirmed') {
        // Decrement old departure
        const { data: oldDep } = await supabaseAdmin
          .from('departures')
          .select('booked')
          .eq('id', oldDepId)
          .single();
        if (oldDep) {
          await supabaseAdmin
            .from('departures')
            .update({ booked: Math.max(0, oldDep.booked - reservation.party_size) })
            .eq('id', oldDepId);
        }
      }

      // Atomic increment of new departure with capacity check
      const { data: updatedNewDep, error: capacityErr } = await supabaseAdmin
        .from('departures')
        .update({ booked: newDep.booked + partySize })
        .eq('id', newDepId)
        .eq('org_id', orgId)
        .lte('booked', newDep.capacity - partySize)
        .select('booked, capacity')
        .single();

      if (capacityErr || !updatedNewDep) {
        // Rollback old departure decrement if it was decremented
        if (newDepId !== oldDepId && oldDepId && oldStatus === 'confirmed') {
          const { data: oldDep } = await supabaseAdmin
            .from('departures')
            .select('booked')
            .eq('id', oldDepId)
            .single();
          if (oldDep) {
            await supabaseAdmin
              .from('departures')
              .update({ booked: oldDep.booked + reservation.party_size })
              .eq('id', oldDepId);
          }
        }
        return apiError(res, 400, "CAPACITY_FULL", "Departure capacity is full");
      }
    } else if (oldDepId && oldStatus === 'confirmed' && newStatus !== 'confirmed') {
      // Status changed from confirmed to non-confirmed, decrement capacity
      const { data: dep } = await supabaseAdmin
        .from('departures')
        .select('booked')
        .eq('id', oldDepId)
        .single();
      if (dep) {
        await supabaseAdmin
          .from('departures')
          .update({ booked: Math.max(0, dep.booked - partySize) })
          .eq('id', oldDepId);
      }
    }

    // 3. Apply updates to Reservation
    const newTotalAmount = updates.totalAmount !== undefined ? updates.totalAmount : reservation.total_amount;
    const newPaidAmountInput = updates.paidAmount !== undefined ? updates.paidAmount : reservation.paid_amount;

    // Note: We now allow overpayments (paid_amount > total_amount)
    // The database trigger will calculate balance_due correctly (can be negative)
    // Only validate that paid_amount is non-negative
    if (newPaidAmountInput < 0) {
      return apiError(res, 400, "VALIDATION_ERROR", "Paid amount cannot be negative");
    }

    const updateData: any = {
      status: updates.status,
      departure_id: updates.departureId === undefined ? reservation.departure_id : (updates.departureId === null ? null : updates.departureId),
      customer_id: updates.customerId === undefined ? reservation.customer_id : (updates.customerId === null ? null : updates.customerId),
      total_amount: updates.totalAmount,
      paid_amount: updates.paidAmount,
      reservation_at: updates.reservationAt,
      party_size: updates.partySize,
      customer_name: updates.customerName,
      customer_phone: updates.customerPhone,
      currency: updates.currency,
      source: updates.source
    };

    const { data: updatedReservation, error: updateErr } = await supabaseAdmin
      .from('reservations')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateErr) {
      // Detect constraint violations for paid_amount as fallback
      if (updateErr.code === '23514') { // PostgreSQL check constraint violation
        const constraintName = updateErr.details || updateErr.message || '';

        // Check if it's the paid_amount >= 0 constraint
        if (constraintName.includes('reservations_paid_amount_check') ||
          (constraintName.includes('paid_amount') && constraintName.includes('non-negative'))) {
          return apiError(res, 400, "VALIDATION_ERROR", "Paid amount must be non-negative");
        }
      }

      // For other errors, use the standard handler
      return handleSupabaseError(res, updateErr, "Failed to update reservation");
    }

    // 4. Create audit log entry
    await logAction(req, 'update', 'reservation', id, {
      oldValues: reservation,
      newValues: updatedReservation
    });

    res.json(updatedReservation);
  } catch (error) {
    console.error('Error in PATCH /reservations/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", String(error));
  }
});

/**
 * DELETE /api/reservations/:id
 */
router.delete('/reservations/:id', authenticateToken, requireOrgContext, auditReservationDelete, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // 1. Fetch current reservation to handle capacity
    const { data: reservation, error: fetchErr } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (fetchErr || !reservation) {
      return apiError(res, 404, "NOT_FOUND", "Reservation not found");
    }

    // 2. Decrement booked count if confirmed
    if (reservation.departure_id && reservation.status === 'confirmed') {
      const { data: departure } = await supabaseAdmin
        .from('departures')
        .select('booked')
        .eq('id', reservation.departure_id)
        .single();
      if (departure) {
        await supabaseAdmin
          .from('departures')
          .update({ booked: Math.max(0, departure.booked - reservation.party_size) })
          .eq('id', reservation.departure_id);
      }
    }

    // 3. Delete reservation
    const { error } = await supabaseAdmin
      .from('reservations')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) return handleSupabaseError(res, error, "Failed to delete reservation");

    // 4. Create audit log entry
    await logAction(req, 'delete', 'reservation', id, {
      oldValues: reservation
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error in DELETE /reservations/:id:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", String(error));
  }
});

/**
 * GET /api/reservations/:id/voucher.pdf
 */
router.get('/reservations/:id/voucher.pdf', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // Load reservation + departure + package + customer + org
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select(`
        *,
        assigned_to,
        customers (id, full_name, phone, email),
        departures (
          id,
          depart_at,
          return_at,
          packages (id, name, destination)
        ),
        organizations (id, name, slug)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (resErr || !reservation) {
      return apiError(res, 404, "NOT_FOUND", "Reservation not found");
    }

    // Generate PDF using helper
    const pdfBuffer = await generateVoucherPDF(reservation);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="voucher_${id.substring(0, 8)}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating voucher PDF:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Failed to generate voucher", String(error));
  }
});

/**
 * GET /api/reservations/:id/invoice.pdf
 */
router.get('/reservations/:id/invoice.pdf', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select(`
        *,
        assigned_to,
        customers (id, full_name, phone, email),
        departures (
          id,
          depart_at,
          return_at,
          packages (id, name, destination)
        ),
        organizations (id, name, slug, email, phone, address, currency)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (resErr || !reservation) {
      return apiError(res, 404, "NOT_FOUND", "Reservation not found");
    }

    const pdfBuffer = await generateInvoicePDF(reservation);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${id.substring(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Failed to generate invoice", String(error));
  }
});

/**
 * POST /api/reservations/:id/send-email
 */
router.post('/reservations/:id/send-email', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // 1. Fetch reservation data with all relations needed for PDF and Email
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select(`
        *,
        assigned_to,
        customers (id, full_name, phone, email),
        departures (
          id,
          depart_at,
          return_at,
          packages (id, name, destination)
        ),
        organizations (id, name, slug)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (resErr || !reservation) {
      return apiError(res, 404, "NOT_FOUND", "Reservation not found");
    }

    // 2. Generate PDF Buffer
    const pdfBuffer = await generateVoucherPDF(reservation);

    // 3. Send Email
    await EmailService.sendBookingConfirmation(reservation, pdfBuffer);

    // 4. Audit Log
    await logAction(req, 'send_email', 'reservation', id, {
      metadata: { type: 'booking_confirmation' }
    });

    res.json({ success: true, message: 'Confirmation email sent' });
  } catch (error) {
    console.error('Error in POST /reservations/:id/send-email:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Failed to send email", String(error));
  }
});

/**
 * PATCH /api/reservations/:id/status
 */
router.patch('/reservations/:id/status', authenticateToken, requireOrgContext, auditReservationUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const validationResult = updateStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid request body", validationResult.error.issues);
    }

    const { status: newStatus } = validationResult.data;
    const orgId = req.orgId!;

    // 1. Fetch current reservation
    const { data: reservation, error: fetchErr } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (fetchErr || !reservation) {
      return apiError(res, 404, "NOT_FOUND", "Reservation not found");
    }

    const oldStatus = reservation.status;
    const departureId = reservation.departure_id;
    const partySize = reservation.party_size;

    // 2. Handle capacity changes based on status transition
    if (departureId) {
      // Fetch current departure capacity info
      const { data: departure, error: depErr } = await supabaseAdmin
        .from('departures')
        .select('booked, capacity')
        .eq('id', departureId)
        .eq('org_id', orgId)
        .single();

      if (depErr || !departure) {
        return apiError(res, 404, "DEPARTURE_NOT_FOUND", "Departure not found");
      }

      // Status transition logic
      if (oldStatus !== 'confirmed' && newStatus === 'confirmed') {
        // Moving to confirmed: increment booked
        if (departure.booked + partySize > departure.capacity) {
          return apiError(res, 400, "CAPACITY_FULL", "Departure capacity is full");
        }

        const { error: updateErr } = await supabaseAdmin
          .from('departures')
          .update({ booked: departure.booked + partySize })
          .eq('id', departureId)
          .eq('org_id', orgId);

        if (updateErr) return handleSupabaseError(res, updateErr, "Failed to update departure capacity");

      } else if (oldStatus === 'confirmed' && newStatus !== 'confirmed') {
        // Moving from confirmed to non-confirmed: decrement booked
        const { error: updateErr } = await supabaseAdmin
          .from('departures')
          .update({ booked: Math.max(0, departure.booked - partySize) })
          .eq('id', departureId)
          .eq('org_id', orgId);

        if (updateErr) return handleSupabaseError(res, updateErr, "Failed to update departure capacity");
      }
      // Other transitions (pending->cancelled, confirmed->completed, etc.) don't affect capacity
    }

    // 3. Update reservation status
    const { data: updatedReservation, error: updateErr } = await supabaseAdmin
      .from('reservations')
      .update({ status: newStatus })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateErr) return handleSupabaseError(res, updateErr, "Failed to update reservation status");

    // 4. Create audit log entry
    await logAction(req, 'status_change', 'reservation', id, {
      oldValues: { status: oldStatus },
      newValues: { status: newStatus, ...updatedReservation }
    });

    res.json(updatedReservation);

  } catch (error) {
    console.error('Error in PATCH /reservations/:id/status:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", String(error));
  }
});

/**
 * POST /api/reservations/batch/status
 * Batch update status for multiple reservations
 */
const batchStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one reservation ID is required'),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed'], {
    message: 'Invalid status. Must be pending, confirmed, cancelled, or completed'
  }),
});

router.post('/reservations/batch/status', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const validationResult = batchStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid request body", validationResult.error.issues);
    }

    const { ids, status: newStatus } = validationResult.data;
    const orgId = req.orgId!;

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        // Fetch current reservation
        const { data: reservation, error: fetchErr } = await supabaseAdmin
          .from('reservations')
          .select('*')
          .eq('id', id)
          .eq('org_id', orgId)
          .single();

        if (fetchErr || !reservation) {
          results.push({ id, success: false, error: 'Reservation not found' });
          continue;
        }

        const oldStatus = reservation.status;
        const departureId = reservation.departure_id;
        const partySize = reservation.party_size;

        // Handle capacity changes
        if (departureId) {
          const { data: departure } = await supabaseAdmin
            .from('departures')
            .select('booked, capacity')
            .eq('id', departureId)
            .eq('org_id', orgId)
            .single();

          if (!departure) {
            results.push({ id, success: false, error: 'Departure not found' });
            continue;
          }

          if (oldStatus !== 'confirmed' && newStatus === 'confirmed') {
            if (departure.booked + partySize > departure.capacity) {
              results.push({ id, success: false, error: 'Departure capacity is full' });
              continue;
            }
            await supabaseAdmin
              .from('departures')
              .update({ booked: departure.booked + partySize })
              .eq('id', departureId)
              .eq('org_id', orgId);
          } else if (oldStatus === 'confirmed' && newStatus !== 'confirmed') {
            await supabaseAdmin
              .from('departures')
              .update({ booked: Math.max(0, departure.booked - partySize) })
              .eq('id', departureId)
              .eq('org_id', orgId);
          }
        }

        // Update reservation status
        const { error: updateErr } = await supabaseAdmin
          .from('reservations')
          .update({ status: newStatus })
          .eq('id', id)
          .eq('org_id', orgId);

        if (updateErr) {
          results.push({ id, success: false, error: 'Failed to update reservation' });
          continue;
        }

        // Audit log
        await logAction(req, 'status_change', 'reservation', id, {
          oldValues: { status: oldStatus },
          newValues: { status: newStatus }
        });

        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: String(err) });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      results,
      summary: { total: ids.length, succeeded, failed }
    });
  } catch (error) {
    console.error('Error in POST /reservations/batch/status:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error", String(error));
  }
});

export default router;
