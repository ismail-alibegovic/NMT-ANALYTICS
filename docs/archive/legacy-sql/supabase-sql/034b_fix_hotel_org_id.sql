-- 034b_fix_hotel_org_id.sql
-- Fix: Add org_id to hotel_rooms and hotel_allocations (was missing from original 034)
-- Required for RLS policy and backend route queries

ALTER TABLE hotel_rooms
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE hotel_rooms hr
SET org_id = h.org_id
FROM hotels h
WHERE hr.hotel_id = h.id AND hr.org_id IS NULL;

ALTER TABLE hotel_rooms
    ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE hotel_allocations
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE hotel_allocations ha
SET org_id = h.org_id
FROM hotels h
WHERE ha.hotel_id = h.id AND ha.org_id IS NULL;

ALTER TABLE hotel_allocations
    ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_rooms_org ON hotel_rooms(org_id);
CREATE INDEX IF NOT EXISTS idx_hotel_allocations_org ON hotel_allocations(org_id);

COMMENT ON COLUMN hotel_rooms.org_id IS 'Organization owning these rooms';
COMMENT ON COLUMN hotel_allocations.org_id IS 'Organization owning this allocation';
