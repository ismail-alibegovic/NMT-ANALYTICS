/**
 * Sub-agent self-serve portal routes.
 *
 * Auth model:
 *  - Admin-issued endpoints (issue/revoke token, list portal activity) use
 *    authenticateToken + requireOrgContext + requireMinimumRole('director').
 *  - Public portal endpoints (login, list own sales, fetch own documents) use
 *    a portalTokenExtractor middleware that verifies the bearer token against
 *    sub_agents.portal_token_hash.
 *
 * Improvement plan §5.3 item #3 — Sub-agent self-serve portal.
 */
import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { auditLog } from '../middleware/auditLogger';
import { z } from 'zod';

const router = Router();

const auditTokenIssue = auditLog('UPDATE', 'sub_agent', (req) => req.params.id, (req) => 'issue portal token');
const auditTokenRevoke = auditLog('UPDATE', 'sub_agent', (req) => req.params.id, (req) => 'revoke portal token');

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Admin: issue a portal access token ─────────────────────────
router.post('/subagents/:id/portal-token', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditTokenIssue, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const ttlDays = Math.min(Number(req.body?.ttlDays) || 90, 365);

    // Verify sub-agent belongs to this org
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from('sub_agents')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();
    if (agentErr || !agent) return apiError(res, 404, 'NOT_FOUND', 'Sub-agent not found');

    // Generate raw token, store SHA-256 hash
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from('sub_agents')
      .update({
        portal_token_hash: tokenHash,
        portal_token_expires_at: expiresAt,
        portal_last_seen_at: null,
      })
      .eq('id', id)
      .eq('org_id', orgId);
    if (updateErr) return handleSupabaseError(res, updateErr, 'Failed to issue portal token');

    // Build the public portal URL
    const base = process.env.PUBLIC_PORTAL_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://travline-sprypine.zocomputer.io' : 'http://localhost:3001');
    const portalUrl = `${base}/portal/subagent?token=${rawToken}`;

    return res.json({
      token: rawToken,
      tokenHash,
      expiresAt,
      portalUrl,
      message: 'Token issued. Share this link with the sub-agent — it will not be shown again.',
    });
  } catch (err) {
    console.error('Error in POST /subagents/:id/portal-token:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

// ─── Admin: revoke a portal token ────────────────────────────────
router.post('/subagents/:id/portal-token/revoke', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditTokenRevoke, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;

    const { error } = await supabaseAdmin
      .from('sub_agents')
      .update({
        portal_token_hash: null,
        portal_token_expires_at: null,
        portal_last_seen_at: null,
      })
      .eq('id', id)
      .eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to revoke portal token');

    return res.json({ message: 'Portal access revoked' });
  } catch (err) {
    console.error('Error in POST /subagents/:id/portal-token/revoke:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

// ─── Portal auth middleware (public, token-based) ─────────────────
async function portalAuth(req: any, res: Response, next: any) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return apiError(res, 401, 'UNAUTHORIZED', 'Portal token required');
  }
  const rawToken = auth.split(' ')[1];
  const tokenHash = hashToken(rawToken);

  const { data: agent, error } = await supabaseAdmin
    .from('sub_agents')
    .select('id, org_id, name, is_active, portal_token_expires_at')
    .eq('portal_token_hash', tokenHash)
    .single();

  if (error || !agent) {
    return apiError(res, 401, 'UNAUTHORIZED', 'Invalid or revoked portal token');
  }
  if (!agent.is_active) {
    return apiError(res, 403, 'FORBIDDEN', 'Sub-agent account is inactive');
  }
  if (agent.portal_token_expires_at && new Date(agent.portal_token_expires_at) < new Date()) {
    return apiError(res, 401, 'TOKEN_EXPIRED', 'Portal token has expired. Contact the agency for a new link.');
  }

  // Stamp last-seen (fire-and-forget)
  supabaseAdmin.from('sub_agents').update({ portal_last_seen_at: new Date().toISOString() }).eq('id', agent.id).then(() => {}, () => {});

  req.portalAgent = agent;
  req.orgId = agent.org_id;
  next();
}

// ─── Public: get own sub-agent profile ────────────────────────────
router.get('/portal/me', portalAuth, async (req: any, res: Response) => {
  try {
    const a = req.portalAgent;
    return res.json({
      data: {
        id: a.id,
        name: a.name,
        partnerType: a.partner_type || 'bronze',
      },
    });
  } catch (err) {
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

// ─── Public: list own sales ───────────────────────────────────────
router.get('/portal/sales', portalAuth, async (req: any, res: Response) => {
  try {
    const agentId = req.portalAgent.id;
    const orgId = req.orgId;

    const { data, error } = await supabaseAdmin
      .from('sub_agent_sales')
      .select('id, reservation_id, commission_amount, documents_generated, created_at, reservations(customer_name, departure_id, total_amount, currency, status)')
      .eq('sub_agent_id', agentId)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return handleSupabaseError(res, error, 'Failed to fetch sales');

    return res.json({ data: data || [] });
  } catch (err) {
    console.error('Error in GET /portal/sales:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

// ─── Public: list partner-type commission rules (read-only) ───────
router.get('/portal/commission-rules', portalAuth, async (req: any, res: Response) => {
  try {
    const partnerType = req.portalAgent.partner_type;
    const orgId = req.orgId;

    const { data, error } = await supabaseAdmin
      .from('commission_rules')
      .select('partner_type, service_type, commission_pct, markup_pct, priority')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('partner_type', partnerType)
      .order('priority', { ascending: true });

    if (error) return handleSupabaseError(res, error, 'Failed to fetch commission rules');

    return res.json({ data: data || [] });
  } catch (err) {
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

export default router;
