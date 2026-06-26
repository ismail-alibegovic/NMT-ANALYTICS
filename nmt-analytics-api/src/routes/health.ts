import { Router, Response, Request } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from "../lib/errors";

const router = Router();

/**
 * @api {get} /health Health check
 * @apiDescription Health check endpoint that also tests Supabase connectivity.
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Test Supabase connectivity
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .limit(1);

    if (error) {
      console.error('[HEALTH] Supabase test failed:', error);
      return apiError(res, 500, "INTERNAL_ERROR", "Supabase connectivity test failed", error.message);
    }

    res.json({
      ok: true,
      version: process.env.npm_package_version || '1.0.0',
      database: 'connected',
      config: {
        supabaseConfigured: true,
        devBypassEnabled: process.env.DEV_BYPASS_AUTH === 'true',
        devOrgIdSet: !!process.env.DEV_ORG_ID
      },
      time: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[HEALTH] Unexpected error:', err);
    apiError(res, 500, "INTERNAL_ERROR", "Unexpected health check error", err.message);
  }
});

export default router;
