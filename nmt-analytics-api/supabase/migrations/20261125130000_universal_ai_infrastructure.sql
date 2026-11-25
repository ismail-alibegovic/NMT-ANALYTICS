-- Additive-only Universal AI Infrastructure & Platform Admin Boundary (Milestone 5)

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_self_read" ON public.platform_admins
  FOR SELECT
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'org' CHECK (scope IN ('platform', 'org')),
  provider_type TEXT NOT NULL CHECK (provider_type IN ('openai', 'anthropic', 'gemini', 'openai_compatible')),
  display_name TEXT NOT NULL,
  base_url TEXT,
  encrypted_api_key TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  default_model TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_providers_scope_org_check CHECK (
    (scope = 'platform' AND org_id IS NULL) OR (scope = 'org' AND org_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_org_active ON public.ai_providers(org_id, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_ai_providers_scope_active ON public.ai_providers(scope, is_active, priority);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_providers_org_isolation" ON public.ai_providers
  FOR ALL
  USING (
    scope = 'org'
    AND org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID
  )
  WITH CHECK (
    scope = 'org'
    AND org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID
  );

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  provider_type TEXT NOT NULL,
  model TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'rate_limited', 'denied')),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_org_created ON public.ai_usage_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature ON public.ai_usage_logs(org_id, feature_key, created_at DESC);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_logs_org_isolation" ON public.ai_usage_logs
  FOR SELECT
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID);
