import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';

/**
 * Enforces cross-organization Platform Owner access backed by `public.platform_admins`.
 * Never trusts `profiles.org_id` or client-supplied headers alone.
 */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return apiError(res, 403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access required');
    }

    return next();
  } catch (err) {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to verify platform administrator status');
  }
}
