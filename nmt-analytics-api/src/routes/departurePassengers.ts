import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { logAuditEntry } from '../middleware/auditLogger';
import { z } from 'zod';
import { apiError } from '../lib/errors';
import { formatListResponse, paginationQuerySchema, getPaginationParams } from '../utils/pagination';
import {
  assertPassengerCreationCapacity,
  DepartureCapacityExceededError,
  ReservationPartySizeExceededError,
} from '../lib/departureCapacity';

const router = Router();

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(v: string): boolean {
  const d = new Date(v + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  const [y, m, day] = v.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

const dateStringNullable = z
  .string()
  .regex(VALID_DATE, "Must be YYYY-MM-DD")
  .refine(isValidCalendarDate, "Invalid calendar date")
  .nullable();

const createSchema = z.object({
  reservation_id: z.string().uuid(),
  departure_id: z.string().uuid(),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  id_document_number: z.string().optional(),
  id_document_type: z.enum(['passport', 'id_card', 'none']).optional(),
  nationality: z.string().optional(),
  date_of_birth: z.string().optional(),
  id_document_expiry: dateStringNullable.optional(),
  seat_number: z.number().int().optional(),
  notes: z.string().optional(),
});

const seatAssignSchema = z.object({
  seatNumber: z.number().int().positive().nullable(),
});

const seatLockSchema = z.object({
  locked: z.boolean(),
});

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  id_document_number: z.string().optional(),
  id_document_type: z.enum(['passport', 'id_card', 'none']).optional(),
  nationality: z.string().optional(),
  date_of_birth: z.string().optional(),
  id_document_expiry: dateStringNullable.optional(),
  notes: z.string().optional(),
});

/** Which PATCH fields carry document data (for audit). */
const DOCUMENT_FIELDS = new Set([
  'id_document_number',
  'id_document_type',
  'nationality',
  'date_of_birth',
  'id_document_expiry',
]);

/**
 * GET /api/departure-passengers
 * Query: ?reservation_id=... or ?departure_id=...
 */
router.get('/departure-passengers', authenticateToken, requireOrgContext, async (req, res) => {
  try {
    const orgId = req.orgId!;
    const { reservation_id, departure_id, limit, page } = req.query as any;
    const { offset, limit: lim } = getPaginationParams({ page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50 });

    let query = supabaseAdmin
      .from('departure_passengers')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .range(offset, offset + lim - 1);

    if (reservation_id) query = query.eq('reservation_id', reservation_id);
    if (departure_id) query = query.eq('departure_id', departure_id);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json(formatListResponse(data || [], count || 0, Number(page) || 1, lim));
  } catch (err) {
    console.error('GET /departure-passengers:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Failed to list passengers');
  }
});

/**
 * POST /api/departure-passengers
 */
router.post('/departure-passengers', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid passenger data', parsed.error.issues);
    }

    const orgId = req.orgId!;
    const { reservation_id, departure_id } = parsed.data;

    // Verify reservation exists and belongs to this org
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select('id, departure_id, org_id')
      .eq('id', reservation_id)
      .eq('org_id', orgId)
      .single();

    if (resErr || !reservation) {
      return apiError(res, 404, 'RESERVATION_NOT_FOUND', 'Reservation not found or access denied');
    }

    // Verify departure exists and belongs to this org
    const { data: departure, error: depErr } = await supabaseAdmin
      .from('departures')
      .select('id, org_id')
      .eq('id', departure_id)
      .eq('org_id', orgId)
      .single();

    if (depErr || !departure) {
      return apiError(res, 404, 'DEPARTURE_NOT_FOUND', 'Departure not found or access denied');
    }

    // Verify reservation.departure_id matches requested departure
    if (reservation.departure_id !== departure_id) {
      return apiError(res, 409, 'RESERVATION_DEPARTURE_MISMATCH', 'Reservation does not belong to the specified departure');
    }

    try {
      await assertPassengerCreationCapacity(orgId, reservation_id, departure_id, 1);
    } catch (capacityError) {
      if (capacityError instanceof DepartureCapacityExceededError) {
        return apiError(
          res,
          409,
          'DEPARTURE_CAPACITY_EXCEEDED',
          'Departure capacity would be exceeded',
          capacityError.details,
        );
      }
      if (capacityError instanceof ReservationPartySizeExceededError) {
        return apiError(
          res,
          409,
          'RESERVATION_PARTY_SIZE_EXCEEDED',
          'Reservation passenger count would exceed party size',
          capacityError.details,
        );
      }
      throw capacityError;
    }

    const { data, error } = await supabaseAdmin
      .from('departure_passengers')
      .insert({ ...parsed.data, org_id: orgId })
      .select()
      .single();

    if (error) {
      const message = error.message || '';
      if (message.includes('DEPARTURE_CAPACITY_EXCEEDED')) {
        return apiError(res, 409, 'DEPARTURE_CAPACITY_EXCEEDED', 'Departure capacity would be exceeded');
      }
      if (message.includes('RESERVATION_PARTY_SIZE_EXCEEDED')) {
        return apiError(res, 409, 'RESERVATION_PARTY_SIZE_EXCEEDED', 'Reservation passenger count would exceed party size');
      }
      if (isSeatConflict(error)) {
        return apiError(res, 409, 'SEAT_CONFLICT', 'That seat is already assigned to another passenger on this departure.');
      }
      return handleSupabaseError(res, error, 'Failed to create passenger');
    }
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /departure-passengers:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Failed to create passenger');
  }
});

/**
 * PATCH /api/departure-passengers/:id
 */
router.patch('/departure-passengers/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid update data', parsed.error.issues);
    }

    const orgId = req.orgId!;

    const { data, error } = await supabaseAdmin
      .from('departure_passengers')
      .update(parsed.data)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      if (isSeatConflict(error)) {
        return apiError(res, 409, 'SEAT_CONFLICT', 'That seat is already assigned to another passenger on this departure.');
      }
      return handleSupabaseError(res, error, 'Failed to update passenger');
    }

    // Audit: log when document fields changed, but do NOT copy the actual
    // document number/value into the audit detail (privacy).
    const changedDocFields = Object.keys(parsed.data).filter((k) => DOCUMENT_FIELDS.has(k));
    if (changedDocFields.length > 0 && req.user!.id) {
      await logAuditEntry({
        org_id: orgId,
        user_id: req.user!.id,
        action: 'UPDATE',
        entity: 'departure_passenger',
        entity_id: id,
        metadata: {
          changed_document_fields: changedDocFields,
          note: 'Passenger travel-document data updated.',
        },
      }).catch((auditErr) => {
        console.warn('PATCH passenger audit log failed:', auditErr);
      });
    }

    res.json(data);
  } catch (err) {
    console.error('PATCH /departure-passengers/:id:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update passenger');
  }
});


/** PATCH /departure-passengers/:id/seat — manual seat assign/unassign */
router.patch('/departure-passengers/:id/seat', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = seatAssignSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Expected { seatNumber: number | null }', parsed.error.issues);
    }

    const orgId = req.orgId!;
    const { seatNumber } = parsed.data;

    const { data: passenger, error: passengerErr } = await supabaseAdmin
      .from('departure_passengers')
      .select('id, departure_id, seat_number, seat_locked')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (passengerErr || !passenger) {
      return apiError(res, 404, 'NOT_FOUND', 'Passenger not found');
    }

    const { data: departure, error: depErr } = await supabaseAdmin
      .from('departures')
      .select('id, transport_type, org_id')
      .eq('id', passenger.departure_id)
      .eq('org_id', orgId)
      .single();

    if (depErr || !departure) {
      return apiError(res, 404, 'DEPARTURE_NOT_FOUND', 'Departure not found');
    }

    if (departure.transport_type !== 'bus') {
      return apiError(res, 400, 'NOT_BUS_DEPARTURE', 'Manual seat assignment is only supported for bus departures');
    }

    const { data: vehicle, error: vehicleErr } = await supabaseAdmin
      .from('departure_vehicle_assignments')
      .select('id')
      .eq('departure_id', passenger.departure_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (vehicleErr) {
      return handleSupabaseError(res, vehicleErr, 'Failed to load vehicle');
    }
    if (!vehicle) {
      return apiError(res, 400, 'NO_VEHICLE', 'No vehicle configured for this departure');
    }

    if (seatNumber === null) {
      // Unassign
      if (passenger.seat_locked) {
        return apiError(res, 409, 'SEAT_LOCKED', 'Unlock the seat before changing it.');
      }
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('departure_passengers')
        .update({ seat_number: null, seat_is_manual: false, seat_locked: false })
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (updateErr) {
        if (isSeatConflict(updateErr)) {
          return apiError(res, 409, 'SEAT_CONFLICT', 'That seat is already assigned to another passenger on this departure.');
        }
        return handleSupabaseError(res, updateErr, 'Failed to unassign seat');
      }
      return res.json(updated);
    }

    // Assign
    if (passenger.seat_locked) {
      return apiError(res, 409, 'SEAT_LOCKED', 'Unlock the seat before changing it.');
    }

    const { data: targetSeat, error: seatErr } = await supabaseAdmin
      .from('departure_vehicle_seats')
      .select('id')
      .eq('departure_vehicle_assignment_id', vehicle.id)
      .eq('seat_number', seatNumber)
      .eq('is_active', true)
      .single();

    if (seatErr || !targetSeat) {
      return apiError(res, 400, 'SEAT_NOT_FOUND', 'The requested seat does not exist or is not available');
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('departure_passengers')
      .update({ seat_number: seatNumber, seat_is_manual: true })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateErr) {
      if (isSeatConflict(updateErr)) {
        return apiError(res, 409, 'SEAT_CONFLICT', 'That seat is already assigned to another passenger on this departure.');
      }
      return handleSupabaseError(res, updateErr, 'Failed to assign seat');
    }

    return res.json(updated);
  } catch (err) {
    console.error('PATCH /departure-passengers/:id/seat:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update seat');
  }
});

/** PATCH /departure-passengers/:id/seat-lock — lock/unlock seat assignment */
router.patch('/departure-passengers/:id/seat-lock', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = seatLockSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Expected { locked: boolean }', parsed.error.issues);
    }

    const orgId = req.orgId!;
    const { locked } = parsed.data;

    const { data: passenger, error: passengerErr } = await supabaseAdmin
      .from('departure_passengers')
      .select('id, seat_number')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (passengerErr || !passenger) {
      return apiError(res, 404, 'NOT_FOUND', 'Passenger not found');
    }

    if (!passenger.seat_number || passenger.seat_number <= 0) {
      return apiError(res, 400, 'SEAT_NOT_ASSIGNED', 'Passenger does not have an assigned seat');
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('departure_passengers')
      .update({ seat_locked: locked })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateErr) {
      return handleSupabaseError(res, updateErr, 'Failed to update seat lock');
    }

    return res.json(updated);
  } catch (err) {
    console.error('PATCH /departure-passengers/:id/seat-lock:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update seat lock');
  }
});

/**
 * DELETE /api/departure-passengers/:id
 * Safe deletion: cascades to groups (CASCADE), seat (null), accommodation (CASCADE).
 * Does NOT delete reservation, customer, departure, or package.
 */
router.delete('/departure-passengers/:id', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    // M08.3: canonical atomic removal. The DB function owns group lock
    // enforcement, primary reassignment, last-member group cleanup, and
    // member_count integrity. Org isolation is enforced inside the RPC.
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
      'delete_departure_passenger_safe',
      {
        p_org_id: orgId,
        p_passenger_id: id,
      },
    );

    if (rpcErr) {
      const rpcCode = (rpcErr as { message?: string }).message || '';
      if (rpcCode === 'GROUP_LOCKED') {
        return apiError(
          res,
          409,
          'GROUP_LOCKED',
          'Unlock the passenger group before removing this passenger.',
        );
      }
      if (rpcCode === 'PASSENGER_NOT_FOUND') {
        return apiError(res, 404, 'NOT_FOUND', 'Passenger not found');
      }
      return handleSupabaseError(res, rpcErr, 'Failed to delete passenger');
    }

    const removal = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

    if (req.user?.id) {
      await logAuditEntry({
        org_id: orgId,
        user_id: req.user.id,
        action: 'DELETE',
        entity: 'departure_passenger',
        entity_id: id,
        metadata: {
          passenger_name: removal?.full_name ?? null,
          reservation_id: removal?.reservation_id ?? null,
          departure_id: removal?.departure_id ?? null,
          group_id: removal?.group_id ?? null,
          group_deleted: removal?.group_deleted === true,
          reassigned_primary_passenger_id: removal?.new_primary_passenger_id ?? null,
          reassigned_primary_passenger_name: removal?.new_primary_passenger_name ?? null,
          note: 'Passenger removed via atomic safe-delete. Group lock enforced; primary reassigned deterministically when required; seat and accommodation assignments cascade-deleted.',
        },
      }).catch((auditErr) => {
        console.warn('DELETE passenger audit log failed:', auditErr);
      });
    }

    res.json({ deleted: true, id });
  } catch (err) {
    console.error('DELETE /departure-passengers/:id:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Failed to delete passenger');
  }
});

function isSeatConflict(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err && (err as any).code === '23505') {
    const msg: string = (err as any).message ?? '';
    const detail: string = (err as any).details ?? '';
    return (
      msg.includes('idx_departure_passengers_departure_seat_unique') ||
      msg.includes('bus_seat_categories_unique') ||
      detail.includes('seat_number')
    );
  }
  return false;
}

export default router;
