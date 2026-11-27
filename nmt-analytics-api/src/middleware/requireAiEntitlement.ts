import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';

export interface OrgAiEntitlement {
  org_id: string;
  is_enabled: boolean;
  status: 'disabled' | 'trial' | 'active' | 'suspended' | 'expired';
  expires_at: string | null;
  monthly_request_limit: number;
  monthly_token_limit: number;
  per_user_daily_request_limit: number;
  monthly_spend_ceiling_usd: number;
  enabled_tool_categories: string[];
  approved_model_ids: string[] | null;
  emergency_disabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      aiEntitlement?: OrgAiEntitlement;
    }
  }
}

export async function requireAiEntitlement(req: Request, res: Response, next: NextFunction) {
  const orgId = req.orgId;
  if (!orgId) {
    return apiError(res, 403, 'ORG_CONTEXT_REQUIRED', 'Organization context required');
  }

  try {
    const { data: ent, error } = await supabaseAdmin
      .from('org_ai_entitlements')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      return apiError(res, 500, 'AI_ENTITLEMENT_CHECK_FAILED', 'Failed to verify AI entitlement');
    }

    if (!ent || !ent.is_enabled || ent.emergency_disabled || !['trial', 'active'].includes(ent.status)) {
      return apiError(
        res,
        403,
        'AI_ENTITLEMENT_REQUIRED',
        'Travline AI add-on is not active for this organization.',
      );
    }

    if (ent.expires_at && new Date(ent.expires_at).getTime() < Date.now()) {
      return apiError(
        res,
        403,
        'AI_ENTITLEMENT_EXPIRED',
        'Travline AI add-on has expired for this organization.',
      );
    }

    // Monthly & daily usage budget enforcement
    const now = new Date();
    const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const dayStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    const { data: logs } = await supabaseAdmin
      .from('ai_usage_logs')
      .select('user_id, total_tokens, estimated_cost_usd, actual_cost_usd, created_at, status')
      .eq('org_id', orgId)
      .gte('created_at', monthStartIso)
      .eq('status', 'succeeded');

    const monthLogs = logs || [];
    const monthRequests = monthLogs.length;
    const monthTokens = monthLogs.reduce((s: number, r: any) => s + Number(r.total_tokens || 0), 0);
    const monthSpend = monthLogs.reduce(
      (s: number, r: any) => s + Number(r.actual_cost_usd ?? r.estimated_cost_usd ?? 0),
      0,
    );
    const userDailyRequests = req.user?.id
      ? monthLogs.filter((r: any) => r.user_id === req.user!.id && r.created_at >= dayStartIso).length
      : 0;

    if (monthRequests >= Number(ent.monthly_request_limit || 0)) {
      return apiError(res, 429, 'AI_MONTHLY_REQUEST_LIMIT', 'Monthly AI request allowance exceeded.');
    }
    if (monthTokens >= Number(ent.monthly_token_limit || 0)) {
      return apiError(res, 429, 'AI_MONTHLY_TOKEN_LIMIT', 'Monthly AI token allowance exceeded.');
    }
    if (userDailyRequests >= Number(ent.per_user_daily_request_limit || 0)) {
      return apiError(res, 429, 'AI_USER_DAILY_LIMIT', 'Daily per-user AI request limit exceeded.');
    }
    if (monthSpend >= Number(ent.monthly_spend_ceiling_usd || 0) && Number(ent.monthly_spend_ceiling_usd || 0) > 0) {
      return apiError(res, 429, 'AI_SPEND_CEILING_REACHED', 'Monthly AI spending ceiling reached.');
    }

    req.aiEntitlement = ent as OrgAiEntitlement;
    return next();
  } catch {
    return apiError(res, 500, 'AI_ENTITLEMENT_CHECK_FAILED', 'Failed to verify AI entitlement');
  }
}
