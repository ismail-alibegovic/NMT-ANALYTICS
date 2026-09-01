-- M01.1: Departure transport identity — enforce UNIQUE (org_id, package_id, depart_at, transport_type)
--
-- This adds transport_type to the departure identity so that a single package
-- can have simultaneous Bus and Flight departures on the same date without collision.
--
-- Step 1: Backfill NULL transport_type values to 'none'.
-- Step 2: Remove true duplicates (same 4-tuple). Keep the row with the latest created_at.
-- Step 3: Add the UNIQUE constraint covering all 4 identity columns.

-- Step 1: Backfill
UPDATE public.departures
SET transport_type = 'none'
WHERE transport_type IS NULL;

-- Step 2: Deduplicate
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
    RAISE NOTICE 'Removing % duplicate departure rows before adding UNIQUE constraint', duplicate_count;

    DELETE FROM public.departures
    WHERE id IN (
      SELECT id FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY org_id, package_id, depart_at, transport_type
            ORDER BY created_at DESC, id DESC
          ) AS rn
        FROM public.departures
      ) sub
      WHERE sub.rn > 1
    );
  END IF;
END $$;

-- Step 3: Unique constraint
ALTER TABLE public.departures
  ADD CONSTRAINT departures_org_package_depart_transport_key
  UNIQUE (org_id, package_id, depart_at, transport_type);

COMMENT ON CONSTRAINT departures_org_package_depart_transport_key ON public.departures
  IS 'Each departure is uniquely identified by org, package, departure date, and transport type. This allows Bus and Flight departures for the same package on the same date to coexist.';
