-- Communication Center 2.0 — Automation rules (configuration only; no execution in this phase)

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('before_departure', 'after_reservation', 'before_payment_due')),
  timing_offset integer NOT NULL DEFAULT 0 CHECK (timing_offset >= 0),
  timing_unit text NOT NULL DEFAULT 'days' CHECK (timing_unit IN ('hours', 'days')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON public.automation_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON public.automation_rules(is_active) WHERE is_active = true;

-- API-only table: revoke direct access from authenticated users (service_role used by API).
REVOKE ALL ON TABLE public.automation_rules FROM authenticated;
GRANT ALL ON TABLE public.automation_rules TO service_role;
