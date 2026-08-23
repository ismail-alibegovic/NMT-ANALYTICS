import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { logAuditEntry } from '../middleware/auditLogger';
import { z } from 'zod';
import { apiError } from '../lib/errors';
import { formatListResponse, paginationQuerySchema, getPaginationParams } from '../utils/pagination';

const router = Router();

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
  id_document_expiry: z.string().optional().nullable(),
  seat_number: z.number().int().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  seat_number: z.number().int().optional().nullable(),
  id_document_number: z.string().optional(),
  id_document_type: z.enum(['passport', 'id_card', 'none']).optional(),
  nationality: z.string().optional(),
  date_of_birth: z.string().optional(),
  id_document_expiry: z.string().optional().nullable(),
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
    const { data, error } = await supabaseAdmin
      .from('departure_passengers')
      .insert({ ...parsed.data, org_id: orgId })
      .select()
      .single();

    if (error) {
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
