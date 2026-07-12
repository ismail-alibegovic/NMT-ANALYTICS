-- 20260712020000_sub_agent_portal_tokens.sql
-- Sub-agent self-serve portal: director generates a one-time link, sub-agent opens it
-- to view their sales history and download generated documents without a full admin login.
--
-- Token is stored as a SHA-256 hash (same pattern as waiver_tokens).
-- Token is single-use-issued but multi-use-consumed: once verified, the sub-agent
-- can keep using the same link until it expires or is revoked.

CREATE TABLE IF NOT EXISTS public.sub_agent_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sub_agent_id UUID NOT NULL REFERENCES public.sub_agents(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    revoked_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_agent_tokens_sub_agent ON public.sub_agent_tokens(sub_agent_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_tokens_hash ON public.sub_agent_tokens(token_hash);

ALTER TABLE public.sub_agent_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Sub agent tokens" ON public.sub_agent_tokens;
CREATE POLICY "Tenant access - Sub agent tokens" ON public.sub_agent_tokens
    FOR ALL USING (org_id = public.get_my_org_id())
    WITH CHECK (org_id = public.get_my_org_id());

COMMENT ON TABLE public.sub_agent_tokens IS 'One-time-issued access tokens for the sub-agent self-serve portal';
COMMENT ON COLUMN public.sub_agent_tokens.token_hash IS 'SHA-256 hash of the bearer token (raw token never stored)';
COMMENT ON COLUMN public.sub_agent_tokens.expires_at IS 'Token expiry (default 90 days)';
COMMENT ON COLUMN public.sub_agent_tokens.revoked_at IS 'Set when director manually revokes portal access';
