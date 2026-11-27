-- Expand allowed AI action proposal types, add expiration/missing-fields/binding columns,
-- and allow NULL estimated_cost_usd when provider/model pricing is unknown.

ALTER TABLE public.ai_action_proposals
  DROP CONSTRAINT IF EXISTS ai_action_proposals_action_type_check;

ALTER TABLE public.ai_action_proposals
  ADD CONSTRAINT ai_action_proposals_action_type_check
  CHECK (action_type IN (
    'create_inquiry',
    'create_quotation_draft',
    'create_customer_draft',
    'create_package_draft',
    'create_departure_draft'
  ));

ALTER TABLE public.ai_action_proposals
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  ADD COLUMN IF NOT EXISTS missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payload_hash TEXT;

ALTER TABLE public.ai_usage_logs
  ALTER COLUMN estimated_cost_usd DROP NOT NULL,
  ALTER COLUMN estimated_cost_usd DROP DEFAULT;
