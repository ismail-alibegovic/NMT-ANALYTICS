-- M01.1: Departure transport identity — enforce UNIQUE (org_id, package_id, depart_at, transport_type)
--
-- This adds transport_type to the departure identity so that a single package
-- can have simultaneous Bus and Flight departures on the same date without collision.
--
-- Step 1: Backfill NULL transport_type values to 'none'.
-- Step 2: Safety guard — fail if duplicate identities exist (manual reconciliation required).
-- Step 3: Add the UNIQUE constraint covering all 4 identity columns.

-- Step 1: Backfill
UPDATE public.departures
SET transport_type = 'none'
WHERE transport_type IS NULL;

-- Step 2: Safety guard — fail fast if duplicate departure identities exist.
-- Duplicates must be reconciled manually before this migration can proceed.
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  WITH duplicates AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY org_id, package_id, depart_at, transport_type
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM public.departures
  )
  SELECT COUNT(*) INTO duplicate_count FROM duplicates WHERE rn > 1;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add departure transport identity constraint: % duplicate departure identities require manual reconciliation before this migration can proceed.',
      duplicate_count;
  END IF;
END $$;

-- Step 3: Unique constraint
ALTER TABLE public.departures
  ADD CONSTRAINT departures_org_package_depart_transport_key
  UNIQUE (org_id, package_id, depart_at, transport_type);

COMMENT ON CONSTRAINT departures_org_package_depart_transport_key ON public.departures
  IS 'Each departure is uniquely identified by org, package, departure date, and transport type. This allows Bus and Flight departures for the same package on the same date to coexist.';
