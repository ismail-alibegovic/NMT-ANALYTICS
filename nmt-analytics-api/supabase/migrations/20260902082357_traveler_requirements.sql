ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS traveler_requirements JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.departures
  ADD COLUMN IF NOT EXISTS traveler_requirements JSONB NULL;

COMMENT ON COLUMN public.packages.traveler_requirements IS
  'Default traveler readiness requirements for departures created from this package.';

COMMENT ON COLUMN public.departures.traveler_requirements IS
  'Optional departure-level override for package traveler readiness requirements.';
