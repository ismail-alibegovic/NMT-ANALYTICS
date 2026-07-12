import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { auditLog } from '../middleware/auditLogger';
import { logAction } from '../lib/audit';
import {
  formatListResponse,
  paginationQuerySchema,
  getPaginationParams,
} from '../utils/pagination';
import { requireMinimumRole } from '../middleware/requireRole';
import { generateBusListPDF, generateRumingListPDF } from '../lib/excursionGenerator';
import { getOrgBranding } from '../lib/orgBranding';

const router = Router();

const auditExcursionCreate = auditLog('CREATE', 'excursion_passenger', undefined, (req) => (req.body as any)?.fullName);

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    reservationId: z.string().uuid().optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({ ...data, ...getPaginationParams(data) }));

const createSchema = z.object({
  reservationId: z.string().uuid('Invalid reservation ID'),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
  idDocument: z.string().optional(),
  seatNumber: z.number().int().positive().default(1),
  paidAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
});

const bulkImportSchema = z.object({
  reservationId: z.string().uuid(),
  passengers: z.array(z.object({
    fullName: z.string().min(1),
    phone: z.string().optional(),
    idDocument: z.string().optional(),
    seatNumber: z.number().int().positive().optional(),
    paidAmount: z.number().min(0).default(0),
    notes: z.string().optional(),
  })).min(1).max(500),
});

function transformPassenger(p: any) {
  return {
    id: p.id,
    reservationId: p.reservation_id,
    fullName: p.full_name,
    phone: p.phone,
    idDocument: p.id_document,
    seatNumber: p.seat_number,
    paidAmount: Number(p.paid_amount || 0),
    totalAmount: Number(p.total_amount || 0),
    debtAmount: Number(p.debt_amount || 0),
    notes: p.notes,
  };
}

/** GET /api/excursions */
router.get('/excursions', authenticateToken, requireOrgContext, async (req, res, next) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { search, reservationId, page, limit, offset } = r.data;
    let query = supabaseAdmin
      .from('excursion_passengers')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .range(offset, offset + limit - 1);

    if (search && search.trim()) {
      const t = search.trim();
      query = query.or(`full_name.ilike.%${t}%,phone.ilike.%${t}%`);
    }
    if (reservationId) query = query.eq('reservation_id', reservationId);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json(formatListResponse(data || [], count || 0, page, limit));
  } catch (err) { next(err); }
});

/** POST /api/excursions/bulk-import */
router.post('/excursions/bulk-import', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditExcursionCreate, async (req, res: Response) => {
  try {
    const r = bulkImportSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { reservationId, passengers } = r.data;

    // Verify org owns the reservation
    const { data: resCheck } = await supabaseAdmin.from('reservations').select('id').eq('id', reservationId).eq('org_id', orgId).single();
    if (!resCheck) return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');

    const toInsert = passengers.map((p) => ({
      org_id: orgId,
      reservation_id: reservationId,
      full_name: p.fullName,
      phone: p.phone,
      id_document: p.idDocument,
      seat_number: p.seatNumber || null,
      paid_amount: p.paidAmount,
      total_amount: p.paidAmount,
      debt_amount: 0,
      notes: p.notes,
    }));

    const { data: created, error: err } = await supabaseAdmin
      .from('excursion_passengers')
      .insert(toInsert)
      .select();
    if (err) return handleSupabaseError(res, err, 'Failed to import passengers');

    return res.status(201).json({ data: (created || []).map(transformPassenger), count: created?.length || 0 });
  } catch (err) { console.error('Error in POST /excursions/bulk-import:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** POST /api/excursions — single passenger */
router.post('/excursions', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditExcursionCreate, async (req, res: Response) => {
  try {
    const r = createSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { reservationId, fullName, phone, idDocument, seatNumber, paidAmount, notes } = r.data;

    // Verify reservation belongs to org
    const { data: resCheck } = await supabaseAdmin.from('reservations').select('id').eq('id', reservationId).eq('org_id', orgId).single();
    if (!resCheck) return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');

    const { data: passenger, error: err } = await supabaseAdmin
      .from('excursion_passengers')
      .insert({
        org_id: orgId,
        reservation_id: reservationId,
        full_name: fullName,
        phone: phone || null,
        id_document: idDocument || null,
        seat_number: seatNumber,
        paid_amount: paidAmount,
        total_amount: paidAmount,
        debt_amount: 0,
        notes: notes || null,
      })
      .select()
      .single();
    if (err) return handleSupabaseError(res, err, 'Failed to create passenger');

    return res.status(201).json(transformPassenger(passenger));
  } catch (err) { console.error('Error in POST /excursions:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** DELETE /api/excursions/:id */
router.delete('/excursions/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { error } = await supabaseAdmin.from('excursion_passengers').delete().eq('id', id).eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to delete passenger');
    return res.status(204).send();
  } catch (err) { console.error('Error in DELETE /excursions/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** PATCH /api/excursions/:id — update passenger (seat assignment, paid, notes) */
router.patch('/excursions/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const schema = z.object({
      seatNumber: z.number().int().positive().nullish(),
      paidAmount: z.number().min(0).nullish(),
      debtAmount: z.number().min(0).nullish(),
      notes: z.string().max(500).nullish(),
      fullName: z.string().min(1).max(200).nullish(),
      phone: z.string().max(50).nullish(),
      idDocument: z.string().max(100).nullish(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);

    // Build update object — only include defined fields
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (parsed.data.seatNumber !== undefined) update.seat_number = parsed.data.seatNumber;
    if (parsed.data.paidAmount !== undefined) update.paid_amount = parsed.data.paidAmount;
    if (parsed.data.debtAmount !== undefined) update.debt_amount = parsed.data.debtAmount;
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
    if (parsed.data.fullName !== undefined) update.full_name = parsed.data.fullName;
    if (parsed.data.phone !== undefined) update.phone = parsed.data.phone;
    if (parsed.data.idDocument !== undefined) update.id_document = parsed.data.idDocument;

    const { data, error } = await supabaseAdmin
      .from('excursion_passengers')
      .update(update)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    if (error) return handleSupabaseError(res, error, 'Failed to update passenger');

    return res.json(transformPassenger(data));
  } catch (err) { console.error('Error in PATCH /excursions/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** GET /api/excursions/:id/bus-list */
router.get('/excursions/:id/bus-list', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const { data, error } = await supabaseAdmin
      .from('excursion_passengers')
      .select('*')
      .eq('reservation_id', id)
      .eq('org_id', orgId)
      .order('seat_number', { ascending: true });
    if (error) return handleSupabaseError(res, error, 'Failed to fetch bus list');

    const branding = await getOrgBranding(orgId);
    const pdfBuffer = await generateBusListPDF(data || [], branding);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bus_list_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { console.error('Error in GET /excursions/:id/bus-list:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** GET /api/excursions/:id/ruming-list
 * Path param is a reservation ID. The ruming list is logically per-departure
 * (it queries hotel_allocations keyed by departure_id), so we resolve the
 * reservation's departure_id first, then fetch allocations for that departure.
 */
router.get('/excursions/:id/ruming-list', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // Load the reservation to find its departure_id
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select('id, departure_id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();
    if (resErr || !reservation?.departure_id) {
      return apiError(res, 404, 'NOT_FOUND', 'Reservation not found or has no departure');
    }
    const departureId = reservation.departure_id;

    const { data, error } = await supabaseAdmin
      .from('hotel_allocations')
      .select('*, hotels(name, destination, address)')
      .eq('departure_id', departureId)
      .eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to fetch ruming list');

    const rumingBranding = await getOrgBranding(orgId);
    const pdfBuffer = await generateRumingListPDF(data || [], rumingBranding);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ruming_list_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { console.error('Error in GET /excursions/:id/ruming-list:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

export default router;
