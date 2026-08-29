-- Communication Center 2.0 — Automation execution hardening + idempotency tracking

-- 1) Enable RLS on automation_rules (API/service_role only).
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

-- Revoke direct anon/authenticated access entirely
REVOKE ALL ON TABLE public.automation_rules FROM anon;
REVOKE ALL ON TABLE public.automation_rules FROM authenticated;
GRANT ALL ON TABLE public.automation_rules TO service_role;

-- 2) Execution tracking table for atomic claim + idempotency/audit.
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('departure', 'reservation', 'payment')),
  entity_id uuid NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'skipped')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (rule_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_executions_rule ON public.automation_executions(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_org ON public.automation_executions(org_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_due ON public.automation_executions(status, scheduled_for);

-- Backend-only: revoke direct access from anon/authenticated
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_executions FROM anon;
REVOKE ALL ON TABLE public.automation_executions FROM authenticated;
GRANT ALL ON TABLE public.automation_executions TO service_role;
