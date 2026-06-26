import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.use(authenticateToken, requireOrgContext);

router.get('/notifications', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues);
  }

  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const orgId = req.orgId!;
  const userId = req.user!.id;

  const { data, error, count } = await supabaseAdmin
    .from('notifications')
    .select('id,type,title,body,data,is_read,created_at,user_id', { count: 'exact' })
    .eq('org_id', orgId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[notifications] fetch failed:', error);
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch notifications', error.message);
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

router.get('/notifications/unread-count', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const userId = req.user!.id;

  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('is_read', false);

  if (error) {
    console.error('[notifications] unread-count failed:', error);
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch unread count', error.message);
  }

  return res.json({ count: count || 0 });
});

router.patch('/notifications/read-all', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const userId = req.user!.id;

  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('org_id', orgId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('is_read', false);

  if (error) {
    console.error('[notifications] read-all failed:', error);
    return apiError(res, 500, 'UPDATE_FAILED', 'Failed to mark notifications as read', error.message);
  }

  return res.json({ success: true });
});

router.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  const idResult = z.string().uuid().safeParse(req.params.id);
  if (!idResult.success) {
    return apiError(res, 400, 'INVALID_ID', 'Invalid notification ID');
  }

  const orgId = req.orgId!;
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('id', idResult.data)
    .eq('org_id', orgId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .select('id,type,title,body,data,is_read,created_at,user_id')
    .single();

  if (error) {
    console.error('[notifications] mark read failed:', error);
    return apiError(res, 500, 'UPDATE_FAILED', 'Failed to mark notification as read', error.message);
  }

  return res.json(data);
});

export default router;
