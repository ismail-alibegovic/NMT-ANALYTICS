-- Deterministic seed-ownership registry for controlled internal demo datasets.
--
-- Golden demo seeds (travline_golden_demo_2027) register every record they create
-- so a rerun can identify and delete ONLY seed-owned records. This prevents the
-- seed from ever deleting all tenant packages/departures or arbitrary
-- user-created records inside the target organization.
--
-- Access is intentionally minimal: only the service role (API server / seed
-- scripts) may touch this table. No RLS policies are defined, so row level
-- security denies access to anon and authenticated roles.

CREATE TABLE IF NOT EXISTS public.seed_owned_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seed_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  record_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seed_owned_records_unique UNIQUE (org_id, seed_id, entity, record_id),
  CONSTRAINT seed_owned_records_seed_id_format CHECK (seed_id ~ '^[a-z0-9_]{3,64}$'),
  CONSTRAINT seed_owned_records_entity_format CHECK (entity ~ '^[a-z_]{3,64}$')
);

CREATE INDEX IF NOT EXISTS idx_seed_owned_records_lookup
  ON public.seed_owned_records(org_id, seed_id, entity);

ALTER TABLE public.seed_owned_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.seed_owned_records FROM anon;
REVOKE ALL ON TABLE public.seed_owned_records FROM authenticated;
GRANT ALL ON TABLE public.seed_owned_records TO service_role;
