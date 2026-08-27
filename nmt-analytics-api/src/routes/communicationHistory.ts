import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  channel: z.enum(['email', 'sms']).optional(),
  status: z.enum(['sent', 'failed', 'skipped']).optional(),
  related_departure_id: z.string().uuid().optional(),
  related_reservation_id: z.string().uuid().optional(),
});

const detailParamsSchema = z.object({
  id: z.string().uuid(),
});

const historySelect = `
  id,
  org_id,
  channel,
  recipient,
  subject,
  body_preview,
  status,
  error_message,
  related_departure_id,
  related_reservation_id,
  created_at,
  sent_at,
  departures:related_departure_id (
    id,
    depart_at,
    packages (
      id,
      name
    )
  ),
  reservations:related_reservation_id (
    id,
    customer_name
  )
`;

router.use(authenticateToken, requireOrgContext);

router.get('/communication-history', async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid communication history filters', parsed.error.issues);
  }

  const { page, limit, channel, status, related_departure_id, related_reservation_id } = parsed.data;
  const offset = (page - 1) * limit;
  const orgId = req.orgId!;

  let query = supabaseAdmin
    .from('communication_history')
    .select(historySelect, { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (channel) query = query.eq('channel', channel);
  if (status) query = query.eq('status', status);
  if (related_departure_id) query = query.eq('related_departure_id', related_departure_id);
  if (related_reservation_id) query = query.eq('related_reservation_id', related_reservation_id);

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.error('[communication-history] fetch failed:', error);
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch communication history', error.message);
  }

  return res.json({
    data: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
});

router.get('/communication-history/:id', async (req: Request, res: Response) => {
  const parsed = detailParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid communication history id', parsed.error.issues);
  }

  const { data, error } = await supabaseAdmin
    .from('communication_history')
    .select(historySelect)
    .eq('id', parsed.data.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();

  if (error) {
    console.error('[communication-history] detail fetch failed:', error);
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch communication history item', error.message);
  }

  if (!data) {
    return apiError(res, 404, 'NOT_FOUND', 'Communication history item not found');
  }

  return res.json({ data });
});

export default router;
