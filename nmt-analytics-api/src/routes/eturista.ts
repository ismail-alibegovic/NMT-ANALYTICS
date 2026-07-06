import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { auditLog } from '../middleware/auditLogger';
import { requireMinimumRole } from '../middleware/requireRole';
import {
  getEturistaConfig,
  buildGuestPayload,
  submitToEturista,
  saveSubmissionRecord,
} from '../lib/eturistaClient';

const router = Router();

const auditSubmission = auditLog('CREATE', 'eturista_submission', undefined, (req) => `departure:${(req.body as any)?.departureId}`);

const submitSchema = z.object({
  departureId: z.string().uuid('Invalid departure ID'),
});

/**
 * POST /api/integrations/eturista/submit
 * Submit guest data for a departure to the configured government endpoint.
 * Requires manager+ role.
 */
router.post(
  '/integrations/eturista/submit',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  auditSubmission,
  async (req, res: Response) => {
    try {
      const r = submitSchema.safeParse(req.body);
      if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

      const orgId = req.orgId!;
      const { departureId } = r.data;

      // Load eTurista config
      const config = await getEturistaConfig(orgId);
      if (!config) {
        return apiError(
          res,
          400,
          'NOT_CONFIGURED',
          'eTurista nije konfigurisan. Postavite endpoint i kredencijale u Postavkama organizacije.',
        );
      }

      // Build guest payload from departure data
      const payload = await buildGuestPayload(orgId, departureId);
      if (!payload) {
        return apiError(res, 404, 'NOT_FOUND', 'Polazak nije pronađen.');
      }

      if (payload.guests.length === 0) {
        return apiError(res, 400, 'NO_GUESTS', 'Nema gostiju za ovaj polazak.');
      }

      // Build submission payload
      const submissionPayload = {
        accommodationUnit: payload.departure.packages?.name || 'Unknown',
        guests: payload.guests,
        submitDate: new Date().toISOString().slice(0, 10),
        agencyCode: orgId.slice(0, 8),
      };

      // Submit to government endpoint
      const result = await submitToEturista(config, submissionPayload);

      // Save record regardless of result
      await saveSubmissionRecord(
        orgId,
        departureId,
        payload.guests.length,
        submissionPayload,
        result,
      );

      if (!result.success) {
        return res.status(502).json({
          success: false,
          message: 'Slanje nije uspjelo. Provjerite konfiguraciju eTurista endpointa.',
          details: result.body,
        });
      }

      return res.json({
        success: true,
        message: `Podaci za ${payload.guests.length} gostiju uspješno poslani.`,
        details: result.body,
      });
    } catch (err) {
      console.error('Error in POST /integrations/eturista/submit:', err);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
    }
  },
);

/**
 * GET /api/integrations/eturista/history
 * View submission history for the organization.
 */
router.get(
  '/integrations/eturista/history',
  authenticateToken,
  requireOrgContext,
  async (req, res, next) => {
    try {
      const orgId = req.orgId!;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, error, count } = await supabaseAdmin
        .from('eturista_submissions')
        .select('*, departures!inner(depart_at, packages!inner(name))', { count: 'exact' })
        .eq('org_id', orgId)
        .order('submitted_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const transformed = (data || []).map((s: any) => ({
        id: s.id,
        departureId: s.departure_id,
        submissionDate: s.submission_date,
        guestCount: s.guest_count,
        responseStatus: s.response_status,
        submittedAt: s.submitted_at,
        packageName: s.departures?.packages?.name || '—',
        departureDate: s.departures?.depart_at || null,
      }));

      return res.json({
        data: transformed,
        total: count || 0,
        limit,
        offset,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/integrations/eturista/status
 * Check if eTurista is configured for this org.
 */
router.get(
  '/integrations/eturista/status',
  authenticateToken,
  requireOrgContext,
  async (req, res) => {
    try {
      const orgId = req.orgId!;
      const config = await getEturistaConfig(orgId);

      return res.json({
        configured: config !== null,
        endpoint: config?.endpoint ? maskEndpoint(config.endpoint) : null,
      });
    } catch (err) {
      return res.json({ configured: false, endpoint: null });
    }
  },
);

function maskEndpoint(url: string): string {
  if (!url || url.length < 20) return url;
  return url.slice(0, 15) + '****' + url.slice(-5);
}

export default router;
