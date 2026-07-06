-- 032b_fix_excursion_org_id.sql
-- Fix: Add org_id to excursion_passengers (was missing from original 032)
-- Required for RLS policy and backend route queries

ALTER TABLE excursion_passengers
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill org_id from the reservation's org_id for existing rows
UPDATE excursion_passengers ep
SET org_id = r.org_id
FROM reservations r
WHERE ep.reservation_id = r.id AND ep.org_id IS NULL;

-- Make org_id NOT NULL after backfill
ALTER TABLE excursion_passengers
    ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_excursions_org ON excursion_passengers(org_id, created_at DESC);

COMMENT ON COLUMN excursion_passengers.org_id IS 'Organization owning this passenger record';
