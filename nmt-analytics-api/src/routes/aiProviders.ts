import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { decryptSecret, encryptSecret, maskSecret } from '../lib/secretVault';
import { normalizeAiBaseUrl } from '../lib/aiUrlGuard';
import {
  sanitizeAiProviderRow,
  parseEncryptedCustomHeaders,
  executeOrgAiCompletion,
  executeOrgAiCompletionStream,
} from '../lib/aiProviderService';
import { discoverAiModels, invokeAiCompletion, type AiProtocol } from '../lib/aiProviders';

const router = Router();

const providerTypes = ['openai', 'anthropic', 'gemini', 'openai_compatible'] as const;
const protocols = [
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
  'gemini_generate_content',
  'ollama_compatible',
] as const;
const authMethods = ['bearer', 'x_api_key', 'x_goog_api_key', 'custom_header', 'none'] as const;

const DISALLOWED_HEADER_NAMES = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'cookie',
  'connection',
  'upgrade',
  'proxy-authorization',
]);

function sanitizeCustomHeadersInput(raw?: Record<string, string> | null): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim();
    if (!key) continue;
    if (DISALLOWED_HEADER_NAMES.has(key.toLowerCase())) {
      throw new Error(`Header "${key}" is not allowed in customHeaders`);
    }
    if (!/^[A-Za-z0-9-]+$/.test(key)) {
      throw new Error(`Invalid custom header name "${key}"`);
    }
    out[key] = String(v).trim().slice(0, 500);
  }
  return Object.keys(out).length > 0 ? out : null;
}

const createProviderSchema = z.object({
  providerSlug: z.string().trim().min(1).max(64).optional().nullable(),
  providerType: z.enum(providerTypes),
  protocol: z.enum(protocols).default('openai_chat_completions'),
  authMethod: z.enum(authMethods).default('bearer'),
  displayName: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().url().optional().nullable(),
  modelsEndpoint: z.string().trim().url().optional().nullable(),
  customHeaders: z.record(z.string(), z.string()).optional().nullable(),
  apiKey: z.string().trim().min(4).max(500),
  defaultModel: z.string().trim().min(1).max(120),
  fallbackModel: z.string().trim().max(120).optional().nullable(),
  connectTimeoutMs: z.number().int().min(1000).max(60000).default(10000),
  requestTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  maxOutputTokens: z.number().int().min(64).max(128000).default(2048),
  isDefault: z.boolean().default(false),
  isFallback: z.boolean().default(false),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
});

const updateProviderSchema = createProviderSchema.partial();

const manualModelSchema = z.object({
  providerId: z.string().uuid(),
  modelId: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  category: z.enum(['chat', 'reasoning', 'embedding', 'audio_asr', 'audio_tts', 'vision', 'other']).default('chat'),
  pricingType: z.enum(['token', 'per_request', 'free', 'unknown']).default('unknown'),
  inputCostPer1m: z.number().min(0).optional().nullable(),
  outputCostPer1m: z.number().min(0).optional().nullable(),
  perRequestCostUsd: z.number().min(0).optional().nullable(),
  contextWindow: z.number().int().positive().optional().nullable(),
  maxOutputTokens: z.number().int().positive().optional().nullable(),
});

const updateModelSchema = z.object({
  displayName: z.string().trim().min(1).max(160).optional(),
  category: z.enum(['chat', 'reasoning', 'embedding', 'audio_asr', 'audio_tts', 'vision', 'other']).optional(),
  isEnabled: z.boolean().optional(),
  isDefaultChat: z.boolean().optional(),
  isDefaultTools: z.boolean().optional(),
  isFallback: z.boolean().optional(),
  pricingType: z.enum(['token', 'per_request', 'free', 'unknown']).optional(),
  inputCostPer1m: z.number().min(0).optional().nullable(),
  outputCostPer1m: z.number().min(0).optional().nullable(),
  perRequestCostUsd: z.number().min(0).optional().nullable(),
});

const entitlementSchema = z.object({
  isEnabled: z.boolean(),
  status: z.enum(['disabled', 'trial', 'active', 'suspended', 'expired']),
  expiresAt: z.string().datetime().optional().nullable(),
  monthlyRequestLimit: z.number().int().min(0).max(10000000).default(500),
  monthlyTokenLimit: z.number().int().min(0).max(1000000000).default(500000),
  perUserDailyRequestLimit: z.number().int().min(0).max(100000).default(100),
  monthlySpendCeilingUsd: z.number().min(0).max(100000).default(25),
  enabledToolCategories: z.array(z.string()).default(['read_only', 'draft_actions']),
  approvedModelIds: z.array(z.string()).optional().nullable(),
  emergencyDisabled: z.boolean().default(false),
});

function validateProviderEndpoint(providerType: string, baseUrl?: string | null): string | null {
  if (providerType === 'openai_compatible') {
    if (!baseUrl) throw new Error('Custom / OpenAI-compatible provider requires a valid https:// Base URL');
    return normalizeAiBaseUrl(baseUrl);
  }
  if (baseUrl) {
    return normalizeAiBaseUrl(baseUrl);
  }
  return null;
}

const PROVIDER_SELECT_COLS =
  'id, scope, org_id, provider_slug, provider_type, protocol, auth_method, display_name, base_url, models_endpoint, key_hint, default_model, fallback_model, connect_timeout_ms, request_timeout_ms, max_output_tokens, is_default, is_fallback, is_active, priority, last_tested_at, last_test_status, last_test_error, created_at, updated_at';

// ---------------------------------------------------------------------------
// Agency Entitlement & Usage Summary (Non-sensitive, org-scoped)
// ---------------------------------------------------------------------------

router.get('/ai-entitlement', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const now = new Date();
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [{ data: ent, error }, { data: logs }] = await Promise.all([
    supabaseAdmin.from('org_ai_entitlements').select('*').eq('org_id', orgId).maybeSingle(),
    supabaseAdmin
      .from('ai_usage_logs')
      .select('total_tokens, status, created_at')
      .eq('org_id', orgId)
      .gte('created_at', monthStartIso)
      .eq('status', 'succeeded'),
  ]);

  if (error) return handleSupabaseError(res, error, 'Failed to load AI entitlement');

  const monthRequests = (logs || []).length;
  const monthTokens = (logs || []).reduce((s: number, r: any) => s + Number(r.total_tokens || 0), 0);

  return res.json({
    entitlement: ent || {
      org_id: orgId,
      is_enabled: false,
      status: 'disabled',
      monthly_request_limit: 0,
      monthly_token_limit: 0,
      per_user_daily_request_limit: 0,
      emergency_disabled: false,
    },
    consumption: {
      monthRequests,
      monthTokens,
    },
  });
});

// ---------------------------------------------------------------------------
// Organization-scoped AI Provider & Usage routes (preserved for dev/staging compatibility)
// ---------------------------------------------------------------------------

router.get('/ai-providers', authenticateToken, requireOrgContext, requireMinimumRole('director'), async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const [{ data: orgProviders, error }, { count: platformFallbackCount }] = await Promise.all([
    supabaseAdmin
      .from('ai_providers')
      .select(PROVIDER_SELECT_COLS)
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
      provider_slug: b.providerSlug || null,
      provider_type: b.providerType,
      protocol: b.protocol,
      auth_method: b.authMethod,
      display_name: b.displayName,
      base_url: normalizedBaseUrl,
      models_endpoint: b.modelsEndpoint ? normalizeAiBaseUrl(b.modelsEndpoint) : null,
      encrypted_api_key: encryptedKey,
      key_hint: maskSecret(b.apiKey),
      default_model: b.defaultModel,
      fallback_model: b.fallbackModel || null,
      connect_timeout_ms: b.connectTimeoutMs,
      request_timeout_ms: b.requestTimeoutMs,
      max_output_tokens: b.maxOutputTokens,
      is_default: b.isDefault,
      is_fallback: b.isFallback,
      is_active: b.isActive,
      priority: b.priority,
      created_by: req.user?.id || null,
    })
    .select(PROVIDER_SELECT_COLS)
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
  if (b.fallbackModel !== undefined) updates.fallback_model = b.fallbackModel;
  if (b.isActive !== undefined) updates.is_active = b.isActive;
  if (b.isDefault !== undefined) updates.is_default = b.isDefault;
  if (b.isFallback !== undefined) updates.is_fallback = b.isFallback;
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
    .select(PROVIDER_SELECT_COLS)
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
// Platform Owner Universal AI Provider Manager, Catalog & Playground
// ---------------------------------------------------------------------------

router.get('/platform/ai-providers', authenticateToken, requirePlatformAdmin, async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('ai_providers')
    .select(PROVIDER_SELECT_COLS)
    .eq('scope', 'platform')
    .is('org_id', null)
    .order('is_default', { ascending: false })
    .order('priority', { ascending: true });

  if (error) return handleSupabaseError(res, error, 'Failed to list platform AI providers');
  return res.json({ providers: (data || []).map(sanitizeAiProviderRow) });
});

router.post('/platform/ai-providers', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = createProviderSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid platform AI provider payload', parsed.error.issues);
  const b = parsed.data;

  let normalizedBaseUrl: string | null = null;
  let normalizedModelsEndpoint: string | null = null;
  let validatedCustomHeaders: Record<string, string> | null = null;
  try {
    normalizedBaseUrl = validateProviderEndpoint(b.providerType, b.baseUrl);
    if (b.modelsEndpoint) normalizedModelsEndpoint = normalizeAiBaseUrl(b.modelsEndpoint);
    validatedCustomHeaders = sanitizeCustomHeadersInput(b.customHeaders);
  } catch (err: any) {
    return apiError(res, 400, 'INVALID_BASE_URL', err.message);
  }

  let encryptedKey: string;
  let encryptedHeaders: string | null = null;
  try {
    encryptedKey = encryptSecret(b.apiKey);
    if (validatedCustomHeaders) encryptedHeaders = encryptSecret(JSON.stringify(validatedCustomHeaders));
  } catch (err: any) {
    return apiError(res, 500, 'VAULT_NOT_CONFIGURED', err.message);
  }

  let shouldBeDefault = b.isDefault;
  if (!shouldBeDefault && b.isActive !== false) {
    const { count: defaultCount } = await supabaseAdmin
      .from('ai_providers')
      .select('id', { count: 'exact', head: true })
      .eq('scope', 'platform')
      .is('org_id', null)
      .eq('is_default', true);
    if ((defaultCount || 0) === 0) shouldBeDefault = true;
  }

  if (shouldBeDefault) {
    await supabaseAdmin.from('ai_providers').update({ is_default: false }).eq('scope', 'platform').is('org_id', null);
  }
  if (b.isFallback) {
    await supabaseAdmin.from('ai_providers').update({ is_fallback: false }).eq('scope', 'platform').is('org_id', null);
  }

  const { data, error } = await supabaseAdmin
    .from('ai_providers')
    .insert({
      org_id: null,
      scope: 'platform',
      provider_slug: b.providerSlug || null,
      provider_type: b.providerType,
      protocol: b.protocol,
      auth_method: b.authMethod,
      display_name: b.displayName,
      base_url: normalizedBaseUrl,
      models_endpoint: normalizedModelsEndpoint,
      custom_headers_encrypted: encryptedHeaders,
      encrypted_api_key: encryptedKey,
      key_hint: maskSecret(b.apiKey),
      default_model: b.defaultModel,
      fallback_model: b.fallbackModel || null,
      connect_timeout_ms: b.connectTimeoutMs,
      request_timeout_ms: b.requestTimeoutMs,
      max_output_tokens: b.maxOutputTokens,
      is_default: shouldBeDefault,
      is_fallback: b.isFallback,
      is_active: b.isActive,
      priority: b.priority,
      created_by: req.user?.id || null,
    })
    .select(PROVIDER_SELECT_COLS)
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to create platform AI provider');
  return res.status(201).json(sanitizeAiProviderRow(data));
});

router.patch('/platform/ai-providers/:id', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = updateProviderSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid platform AI provider update', parsed.error.issues);
  const b = parsed.data;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('ai_providers')
    .select('id, provider_type')
    .eq('id', req.params.id)
    .eq('scope', 'platform')
    .is('org_id', null)
    .single();
  if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'Platform AI provider not found');

  if (b.isDefault) {
    await supabaseAdmin.from('ai_providers').update({ is_default: false }).eq('scope', 'platform').is('org_id', null);
  }
  if (b.isFallback) {
    await supabaseAdmin.from('ai_providers').update({ is_fallback: false }).eq('scope', 'platform').is('org_id', null);
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (b.providerSlug !== undefined) updates.provider_slug = b.providerSlug;
  if (b.providerType !== undefined) updates.provider_type = b.providerType;
  if (b.protocol !== undefined) updates.protocol = b.protocol;
  if (b.authMethod !== undefined) updates.auth_method = b.authMethod;
  if (b.displayName !== undefined) updates.display_name = b.displayName;
  if (b.defaultModel !== undefined) updates.default_model = b.defaultModel;
  if (b.fallbackModel !== undefined) updates.fallback_model = b.fallbackModel;
  if (b.connectTimeoutMs !== undefined) updates.connect_timeout_ms = b.connectTimeoutMs;
  if (b.requestTimeoutMs !== undefined) updates.request_timeout_ms = b.requestTimeoutMs;
  if (b.maxOutputTokens !== undefined) updates.max_output_tokens = b.maxOutputTokens;
  if (b.isDefault !== undefined) updates.is_default = b.isDefault;
  if (b.isFallback !== undefined) updates.is_fallback = b.isFallback;
  if (b.isActive !== undefined) updates.is_active = b.isActive;
  if (b.priority !== undefined) updates.priority = b.priority;
  if (b.baseUrl !== undefined) {
    try {
      updates.base_url = validateProviderEndpoint(b.providerType || existing.provider_type, b.baseUrl);
    } catch (err: any) {
      return apiError(res, 400, 'INVALID_BASE_URL', err.message);
    }
  }
  if (b.modelsEndpoint !== undefined) {
    try {
      updates.models_endpoint = b.modelsEndpoint ? normalizeAiBaseUrl(b.modelsEndpoint) : null;
    } catch (err: any) {
      return apiError(res, 400, 'INVALID_BASE_URL', err.message);
    }
  }
  if (b.customHeaders !== undefined) {
    try {
      const cleanedHeaders = sanitizeCustomHeadersInput(b.customHeaders);
      updates.custom_headers_encrypted = cleanedHeaders ? encryptSecret(JSON.stringify(cleanedHeaders)) : null;
    } catch (err: any) {
      return apiError(res, 400, 'VALIDATION_ERROR', err.message);
    }
  }
  if (b.apiKey !== undefined && b.apiKey.trim()) {
    updates.encrypted_api_key = encryptSecret(b.apiKey.trim());
    updates.key_hint = maskSecret(b.apiKey.trim());
  }

  const { data, error } = await supabaseAdmin
    .from('ai_providers')
    .update(updates)
    .eq('id', req.params.id)
    .eq('scope', 'platform')
    .is('org_id', null)
    .select(PROVIDER_SELECT_COLS)
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to update platform AI provider');
  return res.json(sanitizeAiProviderRow(data));
});

router.delete('/platform/ai-providers/:id', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from('ai_providers')
    .delete()
    .eq('id', req.params.id)
    .eq('scope', 'platform')
    .is('org_id', null);
  if (error) return handleSupabaseError(res, error, 'Failed to delete platform AI provider');
  return res.status(204).send();
});

router.post('/platform/ai-providers/:id/test', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const { data: p, error } = await supabaseAdmin
    .from('ai_providers')
    .select('*')
    .eq('id', req.params.id)
    .eq('scope', 'platform')
    .single();
  if (error || !p) return apiError(res, 404, 'NOT_FOUND', 'Platform AI provider not found');

  const startedAt = Date.now();
  try {
    const apiKey = decryptSecret(p.encrypted_api_key);
    const customHeaders = parseEncryptedCustomHeaders(p.custom_headers_encrypted);

    const discovery = await discoverAiModels({
      providerType: p.provider_type,
      protocol: p.protocol as AiProtocol,
      authMethod: p.auth_method || 'bearer',
      apiKey,
      baseUrl: p.base_url,
      modelsEndpoint: p.models_endpoint,
      customHeaders,
      timeoutMs: p.connect_timeout_ms || 10000,
    });

    const completion = await invokeAiCompletion({
      providerType: p.provider_type,
      protocol: p.protocol as AiProtocol,
      authMethod: p.auth_method || 'bearer',
      apiKey,
      model: req.body?.model || p.default_model,
      baseUrl: p.base_url,
      customHeaders,
      timeoutMs: p.request_timeout_ms || 30000,
    }, {
      messages: [{ role: 'user', content: 'Reply concisely with: OK' }],
      temperature: 0,
      maxTokens: 128,
    });

    if (!completion.text.trim() && !completion.toolCalls?.length) {
      throw new Error('Provider responded with empty content');
    }

    await supabaseAdmin
      .from('ai_providers')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: 'ok',
        last_test_error: null,
      })
      .eq('id', p.id);

    return res.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      routedModel: completion.routedModel || completion.model,
      discoverySupported: discovery.supported,
      discoveredCount: discovery.models.length,
      discoveryError: discovery.error || null,
      sampleReply: completion.text.slice(0, 120),
      usage: completion.usage,
    });
  } catch (err: any) {
    const msg = String(err?.message || 'Connection test failed').slice(0, 300);
    await supabaseAdmin
      .from('ai_providers')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: 'failed',
        last_test_error: msg,
      })
      .eq('id', p.id);

    return res.status(502).json({
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: msg,
    });
  }
});

router.post('/platform/ai-providers/:id/discover-models', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const { data: p, error } = await supabaseAdmin
    .from('ai_providers')
    .select('*')
    .eq('id', req.params.id)
    .eq('scope', 'platform')
    .single();
  if (error || !p) return apiError(res, 404, 'NOT_FOUND', 'Platform AI provider not found');

  const apiKey = decryptSecret(p.encrypted_api_key);
  const customHeaders = parseEncryptedCustomHeaders(p.custom_headers_encrypted);

  const result = await discoverAiModels({
    providerType: p.provider_type,
    protocol: p.protocol as AiProtocol,
    authMethod: p.auth_method || 'bearer',
    apiKey,
    baseUrl: p.base_url,
    modelsEndpoint: p.models_endpoint,
    customHeaders,
    timeoutMs: p.connect_timeout_ms || 15000,
  });

  let savedCount = 0;
  if (result.supported && result.models.length > 0) {
    const uniqueByModelId = new Map<string, any>();
    const nowIso = new Date().toISOString();
    for (const m of result.models) {
      if (uniqueByModelId.has(m.modelId)) continue;
      uniqueByModelId.set(m.modelId, {
        provider_id: p.id,
        model_id: m.modelId,
        display_name: m.displayName,
        category: m.category,
        source: 'discovered',
        advertised_capabilities: m.advertisedCapabilities,
        context_window: m.contextWindow,
        updated_at: nowIso,
      });
    }
    const rows = Array.from(uniqueByModelId.values());
    const { error: upsertErr } = await supabaseAdmin
      .from('ai_models')
      .upsert(rows, { onConflict: 'provider_id,model_id' });
    if (upsertErr) {
      return handleSupabaseError(res, upsertErr, 'Failed to save discovered AI models');
    }
    savedCount = rows.length;
  }

  return res.json({ ...result, savedCount });
});

router.get('/platform/ai-models', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const providerId = typeof req.query.providerId === 'string' ? req.query.providerId : null;
  const category = typeof req.query.category === 'string' ? req.query.category : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  let query = supabaseAdmin
    .from('ai_models')
    .select('*, ai_providers(id, display_name, provider_type, provider_slug)')
    .order('is_default_chat', { ascending: false })
    .order('model_id', { ascending: true });

  if (providerId) query = query.eq('provider_id', providerId);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return handleSupabaseError(res, error, 'Failed to load AI model catalog');

  const filtered = (data || []).filter((m: any) =>
    !q || String(m.model_id).toLowerCase().includes(q) || String(m.display_name).toLowerCase().includes(q),
  );
  return res.json({ models: filtered });
});

router.post('/platform/ai-models', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = manualModelSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid model payload', parsed.error.issues);
  const b = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('ai_models')
    .upsert({
      provider_id: b.providerId,
      model_id: b.modelId,
      display_name: b.displayName,
      category: b.category,
      source: 'manual',
      pricing_type: b.pricingType,
      input_cost_per_1m: b.inputCostPer1m ?? null,
      output_cost_per_1m: b.outputCostPer1m ?? null,
      per_request_cost_usd: b.perRequestCostUsd ?? null,
      context_window: b.contextWindow ?? null,
      max_output_tokens: b.maxOutputTokens ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id,model_id' })
    .select('*')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to register manual model');
  return res.status(201).json(data);
});

router.patch('/platform/ai-models/:id', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = updateModelSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid model update', parsed.error.issues);
  const b = parsed.data;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('ai_models')
    .select('id, provider_id, model_id')
    .eq('id', req.params.id)
    .single();
  if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'AI model not found');

  if (b.isDefaultChat === true) {
    await supabaseAdmin.from('ai_models').update({ is_default_chat: false }).eq('provider_id', existing.provider_id);
  }
  if (b.isDefaultTools === true) {
    await supabaseAdmin.from('ai_models').update({ is_default_tools: false }).eq('provider_id', existing.provider_id);
  }
  if (b.isFallback === true) {
    await supabaseAdmin.from('ai_models').update({ is_fallback: false }).eq('provider_id', existing.provider_id);
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (b.displayName !== undefined) updates.display_name = b.displayName;
  if (b.category !== undefined) updates.category = b.category;
  if (b.isEnabled !== undefined) updates.is_enabled = b.isEnabled;
  if (b.isDefaultChat !== undefined) updates.is_default_chat = b.isDefaultChat;
  if (b.isDefaultTools !== undefined) updates.is_default_tools = b.isDefaultTools;
  if (b.isFallback !== undefined) updates.is_fallback = b.isFallback;
  if (b.pricingType !== undefined) updates.pricing_type = b.pricingType;
  if (b.inputCostPer1m !== undefined) updates.input_cost_per_1m = b.inputCostPer1m;
  if (b.outputCostPer1m !== undefined) updates.output_cost_per_1m = b.outputCostPer1m;
  if (b.perRequestCostUsd !== undefined) updates.per_request_cost_usd = b.perRequestCostUsd;

  const { data, error } = await supabaseAdmin.from('ai_models').update(updates).eq('id', req.params.id).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to update AI model');

  if (b.isDefaultChat === true) {
    await supabaseAdmin.from('ai_providers').update({ default_model: existing.model_id, updated_at: new Date().toISOString() }).eq('id', existing.provider_id);
  }
  if (b.isFallback === true) {
    await supabaseAdmin.from('ai_providers').update({ fallback_model: existing.model_id, updated_at: new Date().toISOString() }).eq('id', existing.provider_id);
  }

  return res.json(data);
});

const playgroundSchema = z.object({
  providerId: z.string().uuid(),
  modelId: z.string().trim().min(1),
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().min(1) })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(16384).optional(),
  responseFormat: z.enum(['text', 'json_object']).optional(),
  testTools: z.boolean().optional(),
});

router.post('/platform/ai-playground/run', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = playgroundSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid playground request', parsed.error.issues);
  const b = parsed.data;

  const { data: p, error } = await supabaseAdmin.from('ai_providers').select('*').eq('id', b.providerId).single();
  if (error || !p) return apiError(res, 404, 'NOT_FOUND', 'Provider not found');

  const apiKey = decryptSecret(p.encrypted_api_key);
  const customHeaders = parseEncryptedCustomHeaders(p.custom_headers_encrypted);
  const tools = b.testTools
    ? [{
        name: 'search_departures',
        description: 'Search upcoming synthetic Travline departures',
        parameters: { type: 'object', properties: { destination: { type: 'string' } } },
      }]
    : undefined;

  try {
    const result = await executeOrgAiCompletion(
      req.orgId || p.org_id || '00000000-0000-0000-0000-000000000000',
      req.user?.id || null,
      'developer_playground',
      {
        messages: b.messages,
        temperature: b.temperature,
        maxTokens: b.maxTokens,
        responseFormat: b.responseFormat,
        tools,
      },
      fetch,
      {
        id: p.id,
        scope: p.scope,
        providerType: p.provider_type,
        protocol: p.protocol || 'openai_chat_completions',
        authMethod: p.auth_method || 'bearer',
        apiKey,
        model: b.modelId,
        baseUrl: p.base_url,
        customHeaders,
        timeoutMs: p.request_timeout_ms || 30000,
      },
    );
    return res.json(result);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Playground execution failed' });
  }
});

router.post('/platform/ai-playground/stream', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = playgroundSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid playground stream request', parsed.error.issues);
  const b = parsed.data;

  const { data: p, error } = await supabaseAdmin.from('ai_providers').select('*').eq('id', b.providerId).single();
  if (error || !p) return apiError(res, 404, 'NOT_FOUND', 'Provider not found');

  const apiKey = decryptSecret(p.encrypted_api_key);
  const customHeaders = parseEncryptedCustomHeaders(p.custom_headers_encrypted);
  const tools = b.testTools
    ? [{
        name: 'search_departures',
        description: 'Search upcoming synthetic Travline departures',
        parameters: { type: 'object', properties: { destination: { type: 'string' } } },
      }]
    : undefined;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  const abortController = new AbortController();
  const onClose = () => abortController.abort();
  req.on('close', onClose);

  try {
    const result = await executeOrgAiCompletionStream(
      req.orgId || p.org_id || '00000000-0000-0000-0000-000000000000',
      req.user?.id || null,
      'developer_playground',
      {
        messages: b.messages,
        temperature: b.temperature,
        maxTokens: b.maxTokens,
        responseFormat: b.responseFormat,
        tools,
      },
      {
        id: p.id,
        scope: p.scope,
        providerType: p.provider_type,
        protocol: p.protocol || 'openai_chat_completions',
        authMethod: p.auth_method || 'bearer',
        apiKey,
        model: b.modelId,
        baseUrl: p.base_url,
        customHeaders,
        timeoutMs: p.request_timeout_ms || 30000,
      },
      (delta) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
        }
      },
      fetch,
      abortController.signal,
    );

    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
      res.end();
    }
  } catch (err: any) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'Playground stream failed' })}\n\n`);
      res.end();
    }
  } finally {
    req.off('close', onClose);
  }
});

router.get('/platform/ai-entitlements', authenticateToken, requirePlatformAdmin, async (_req: Request, res: Response) => {
  const { data: orgs, error: orgErr } = await supabaseAdmin.from('organizations').select('id, name, slug, plan').order('name');
  if (orgErr) return handleSupabaseError(res, orgErr, 'Failed to list organizations');
  const { data: ents } = await supabaseAdmin.from('org_ai_entitlements').select('*');
  const entMap = new Map((ents || []).map((e: any) => [e.org_id, e]));
  return res.json({
    organizations: (orgs || []).map((o: any) => ({
      ...o,
      entitlement: entMap.get(o.id) || {
        org_id: o.id,
        is_enabled: false,
        status: 'disabled',
        monthly_request_limit: 500,
        monthly_token_limit: 500000,
        per_user_daily_request_limit: 100,
        monthly_spend_ceiling_usd: 25,
        emergency_disabled: false,
      },
    })),
  });
});

router.put('/platform/ai-entitlements/:orgId', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = entitlementSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid entitlement payload', parsed.error.issues);
  const b = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('org_ai_entitlements')
    .upsert({
      org_id: req.params.orgId,
      is_enabled: b.isEnabled,
      status: b.status,
      activated_at: b.isEnabled ? new Date().toISOString() : null,
      expires_at: b.expiresAt ?? null,
      monthly_request_limit: b.monthlyRequestLimit,
      monthly_token_limit: b.monthlyTokenLimit,
      per_user_daily_request_limit: b.perUserDailyRequestLimit,
      monthly_spend_ceiling_usd: b.monthlySpendCeilingUsd,
      enabled_tool_categories: b.enabledToolCategories,
      approved_model_ids: b.approvedModelIds ?? null,
      emergency_disabled: b.emergencyDisabled,
      updated_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' })
    .select('*')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to update AI entitlement');
  return res.json(data);
});

router.get('/platform/ai-usage', authenticateToken, requirePlatformAdmin, async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('id, org_id, provider_type, model, feature_key, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, actual_cost_usd, cost_status, status, latency_ms, ttft_ms, tokens_per_sec, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) return handleSupabaseError(res, error, 'Failed to load platform AI usage');
  const logs = data || [];
  const totalTokens = logs.reduce((sum: number, r: any) => sum + Number(r.total_tokens || 0), 0);
  const totalKnownCostUsd = logs.reduce((sum: number, r: any) => {
    if (r.cost_status === 'unknown') return sum;
    return sum + Number(r.actual_cost_usd ?? r.estimated_cost_usd ?? 0);
  }, 0);
  return res.json({ logs, summary: { count: logs.length, totalTokens, totalKnownCostUsd: Number(totalKnownCostUsd.toFixed(6)) } });
});

export default router;
