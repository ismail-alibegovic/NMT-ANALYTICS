import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { encryptSecret, maskSecret } from '../lib/secretVault';
import { validateAiBaseUrl } from '../lib/aiUrlGuard';
import { sanitizeAiProviderRow } from '../lib/aiProviderService';

const router = Router();

const providerTypes = ['openai', 'anthropic', 'gemini', 'openai_compatible'] as const;

const createProviderSchema = z.object({
  providerType: z.enum(providerTypes),
  displayName: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().url().optional().nullable(),
  apiKey: z.string().trim().min(8).max(500),
  defaultModel: z.string().trim().min(1).max(120),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
});

const updateProviderSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  baseUrl: z.string().trim().url().optional().nullable(),
  apiKey: z.string().trim().min(8).max(500).optional(),
  defaultModel: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
});

function validateProviderEndpoint(providerType: string, baseUrl?: string | null): string | null {
  if (providerType === 'openai_compatible') {
    if (!baseUrl) throw new Error('openai_compatible requires a valid https:// baseUrl');
    return validateAiBaseUrl(baseUrl).toString().replace(/\/+$/, '');
  }
  if (baseUrl) {
    return validateAiBaseUrl(baseUrl).toString().replace(/\/+$/, '');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Organization-scoped AI Provider & Usage routes (Director / Manager)
// ---------------------------------------------------------------------------

router.get('/ai-providers', authenticateToken, requireOrgContext, requireMinimumRole('director'), async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const [{ data: orgProviders, error }, { count: platformFallbackCount }] = await Promise.all([
    supabaseAdmin
      .from('ai_providers')
      .select('id, scope, org_id, provider_type, display_name, base_url, key_hint, default_model, is_active, priority, created_at, updated_at')
      .eq('scope', 'org')
      .eq('org_id', orgId)
      .order('priority', { ascending: true }),
    supabaseAdmin
      .from('ai_providers')
      .select('id', { count: 'exact', head: true })
      .eq('scope', 'platform')
      .is('org_id', null)
      .eq('is_active', true),
  ]);

  if (error) return handleSupabaseError(res, error, 'Failed to list AI providers');
  return res.json({
    providers: (orgProviders || []).map(sanitizeAiProviderRow),
    hasPlatformFallback: (platformFallbackCount || 0) > 0,
  });
});

router.post('/ai-providers', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditLog('CREATE', 'ai_provider'), async (req: Request, res: Response) => {
  const parsed = createProviderSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid AI provider payload', parsed.error.issues);
  const b = parsed.data;

  let normalizedBaseUrl: string | null = null;
  try {
    normalizedBaseUrl = validateProviderEndpoint(b.providerType, b.baseUrl);
  } catch (err: any) {
    return apiError(res, 400, 'INVALID_BASE_URL', err.message || 'Invalid provider base URL');
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptSecret(b.apiKey);
  } catch (err: any) {
    return apiError(res, 500, 'VAULT_NOT_CONFIGURED', err.message || 'Secret vault unavailable');
  }

  const { data, error } = await supabaseAdmin
    .from('ai_providers')
    .insert({
      org_id: req.orgId!,
      scope: 'org',
      provider_type: b.providerType,
      display_name: b.displayName,
      base_url: normalizedBaseUrl,
      encrypted_api_key: encryptedKey,
      key_hint: maskSecret(b.apiKey),
      default_model: b.defaultModel,
      is_active: b.isActive,
      priority: b.priority,
      created_by: req.user?.id || null,
    })
    .select('id, scope, org_id, provider_type, display_name, base_url, key_hint, default_model, is_active, priority, created_at, updated_at')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to create AI provider');
  return res.status(201).json(sanitizeAiProviderRow(data));
});

router.patch('/ai-providers/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditLog('UPDATE', 'ai_provider', (req) => req.params.id), async (req: Request, res: Response) => {
  const parsed = updateProviderSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid AI provider update', parsed.error.issues);
  const b = parsed.data;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('ai_providers')
    .select('id, provider_type')
    .eq('id', req.params.id)
    .eq('scope', 'org')
    .eq('org_id', req.orgId!)
    .single();
  if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'AI provider not found');

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (b.displayName !== undefined) updates.display_name = b.displayName;
  if (b.defaultModel !== undefined) updates.default_model = b.defaultModel;
  if (b.isActive !== undefined) updates.is_active = b.isActive;
  if (b.priority !== undefined) updates.priority = b.priority;
  if (b.baseUrl !== undefined) {
    try {
      updates.base_url = validateProviderEndpoint(existing.provider_type, b.baseUrl);
    } catch (err: any) {
      return apiError(res, 400, 'INVALID_BASE_URL', err.message);
    }
  }
  if (b.apiKey !== undefined) {
    try {
      updates.encrypted_api_key = encryptSecret(b.apiKey);
      updates.key_hint = maskSecret(b.apiKey);
    } catch (err: any) {
      return apiError(res, 500, 'VAULT_NOT_CONFIGURED', err.message);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('ai_providers')
    .update(updates)
    .eq('id', req.params.id)
    .eq('scope', 'org')
    .eq('org_id', req.orgId!)
    .select('id, scope, org_id, provider_type, display_name, base_url, key_hint, default_model, is_active, priority, created_at, updated_at')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to update AI provider');
  return res.json(sanitizeAiProviderRow(data));
});

router.delete('/ai-providers/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditLog('DELETE', 'ai_provider', (req) => req.params.id), async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('ai_providers')
    .delete()
    .eq('id', req.params.id)
    .eq('scope', 'org')
    .eq('org_id', req.orgId!);

  if (error) return handleSupabaseError(res, error, 'Failed to delete AI provider');
  return res.status(204).send();
});

router.get('/ai-usage', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('id, provider_type, model, feature_key, prompt_tokens, completion_tokens, total_tokens, status, latency_ms, created_at')
    .eq('org_id', req.orgId!)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return handleSupabaseError(res, error, 'Failed to load AI usage logs');
  const logs = data || [];
  const totalTokens = logs.reduce((sum: number, r: any) => sum + Number(r.total_tokens || 0), 0);
  return res.json({ logs, summary: { count: logs.length, totalTokens } });
});

// ---------------------------------------------------------------------------
// Platform Owner routes (cross-org `platform_admins` boundary)
// ---------------------------------------------------------------------------

router.get('/platform/ai-providers', authenticateToken, requirePlatformAdmin, async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('ai_providers')
    .select('id, scope, org_id, provider_type, display_name, base_url, key_hint, default_model, is_active, priority, created_at, updated_at')
    .eq('scope', 'platform')
    .is('org_id', null)
    .order('priority', { ascending: true });

  if (error) return handleSupabaseError(res, error, 'Failed to list platform AI providers');
  return res.json({ providers: (data || []).map(sanitizeAiProviderRow) });
});

router.post('/platform/ai-providers', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = createProviderSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid platform AI provider payload', parsed.error.issues);
  const b = parsed.data;

  let normalizedBaseUrl: string | null = null;
  try {
    normalizedBaseUrl = validateProviderEndpoint(b.providerType, b.baseUrl);
  } catch (err: any) {
    return apiError(res, 400, 'INVALID_BASE_URL', err.message);
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptSecret(b.apiKey);
  } catch (err: any) {
    return apiError(res, 500, 'VAULT_NOT_CONFIGURED', err.message);
  }

  const { data, error } = await supabaseAdmin
    .from('ai_providers')
    .insert({
      org_id: null,
      scope: 'platform',
      provider_type: b.providerType,
      display_name: b.displayName,
      base_url: normalizedBaseUrl,
      encrypted_api_key: encryptedKey,
      key_hint: maskSecret(b.apiKey),
      default_model: b.defaultModel,
      is_active: b.isActive,
      priority: b.priority,
      created_by: req.user?.id || null,
    })
    .select('id, scope, org_id, provider_type, display_name, base_url, key_hint, default_model, is_active, priority, created_at, updated_at')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to create platform AI provider');
  return res.status(201).json(sanitizeAiProviderRow(data));
});

router.get('/platform/ai-usage', authenticateToken, requirePlatformAdmin, async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('id, org_id, provider_type, model, feature_key, total_tokens, status, latency_ms, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return handleSupabaseError(res, error, 'Failed to load platform AI usage');
  const logs = data || [];
  const totalTokens = logs.reduce((sum: number, r: any) => sum + Number(r.total_tokens || 0), 0);
  return res.json({ logs, summary: { count: logs.length, totalTokens } });
});

export default router;
