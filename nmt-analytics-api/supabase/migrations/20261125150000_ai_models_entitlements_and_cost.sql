-- Stage B & C: AI Models Catalog, Provider Protocols, Commercial Entitlements, and Accurate Cost Accounting
ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS provider_slug TEXT,
  ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'openai_chat_completions',
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'bearer',
  ADD COLUMN IF NOT EXISTS custom_headers_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS models_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS fallback_model TEXT,
  ADD COLUMN IF NOT EXISTS connect_timeout_ms INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS request_timeout_ms INTEGER NOT NULL DEFAULT 30000,
  ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER NOT NULL DEFAULT 2048,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_status TEXT,
  ADD COLUMN IF NOT EXISTS last_test_error TEXT;

CREATE TABLE IF NOT EXISTS public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'chat' CHECK (category IN ('chat', 'reasoning', 'embedding', 'audio_asr', 'audio_tts', 'vision', 'other')),
  source TEXT NOT NULL DEFAULT 'discovered' CHECK (source IN ('discovered', 'manual')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_default_chat BOOLEAN NOT NULL DEFAULT false,
  is_default_tools BOOLEAN NOT NULL DEFAULT false,
  is_fallback BOOLEAN NOT NULL DEFAULT false,
  advertised_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_window INTEGER,
  max_output_tokens INTEGER,
  pricing_type TEXT NOT NULL DEFAULT 'unknown' CHECK (pricing_type IN ('token', 'per_request', 'free', 'unknown')),
  input_cost_per_1m NUMERIC(12,6),
  output_cost_per_1m NUMERIC(12,6),
  per_request_cost_usd NUMERIC(12,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_models_provider_enabled ON public.ai_models(provider_id, is_enabled);
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_models_platform_or_org_read" ON public.ai_models
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_providers p
      WHERE p.id = ai_models.provider_id
        AND (
          p.scope = 'platform'
          OR p.org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID
        )
    )
  );

CREATE TABLE IF NOT EXISTS public.org_ai_entitlements (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'trial', 'active', 'suspended', 'expired')),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  monthly_request_limit INTEGER NOT NULL DEFAULT 500,
  monthly_token_limit INTEGER NOT NULL DEFAULT 500000,
  per_user_daily_request_limit INTEGER NOT NULL DEFAULT 100,
  monthly_spend_ceiling_usd NUMERIC(10,2) NOT NULL DEFAULT 25.00,
  enabled_tool_categories TEXT[] NOT NULL DEFAULT ARRAY['read_only', 'draft_actions']::TEXT[],
  approved_model_ids TEXT[],
  emergency_disabled BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_ai_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_ai_entitlements_org_read" ON public.org_ai_entitlements
  FOR SELECT
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID);

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS cost_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS actual_cost_usd NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS tool_name TEXT,
  ADD COLUMN IF NOT EXISTS ttft_ms INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_per_sec NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS error_message TEXT;
