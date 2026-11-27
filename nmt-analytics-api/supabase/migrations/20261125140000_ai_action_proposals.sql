-- Additive-only AI Action Proposals table (Milestone 9)
CREATE TABLE IF NOT EXISTS public.ai_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('create_inquiry', 'create_quotation_draft', 'create_customer_draft')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'executed', 'rejected')),
  prompt TEXT NOT NULL,
  proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_payload JSONB,
  idempotency_key TEXT,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_action_proposals_org_idempotency_key UNIQUE (org_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_org_status ON public.ai_action_proposals(org_id, status, created_at DESC);

ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_action_proposals_org_isolation" ON public.ai_action_proposals
  FOR ALL
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID)
  WITH CHECK (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::UUID);
