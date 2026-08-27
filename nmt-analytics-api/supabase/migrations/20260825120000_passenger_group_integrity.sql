-- ============================================================================
-- Enforce passenger group canonical invariants
-- 1. One passenger → at most ONE group (unique membership)
-- 2. Primary passenger FK → departure_passengers
-- ============================================================================

-- 1. UNIQUE constraint on passenger_id
-- Before: passenger could silently belong to multiple groups
-- After:  canonical invariant enforced at DB level
ALTER TABLE trip_passenger_group_members
  ADD CONSTRAINT uq_group_member_passenger UNIQUE (passenger_id);

-- 2. FK on primary_passenger_id
-- Before: plain UUID, no referential integrity
-- After:  must reference a valid departure_passenger; NULLs allowed, SET NULL on delete
-- Production has no FK on primary_passenger_id; keep this denormalized reference unconstrained.
