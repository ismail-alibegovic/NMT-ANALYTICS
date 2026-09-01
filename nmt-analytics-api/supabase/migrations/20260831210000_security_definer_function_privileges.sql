-- Intentional, minimal privileges for SECURITY DEFINER functions introduced by
-- the accommodation demo flow. Without explicit REVOKE/GRANT these functions
-- default to EXECUTE FOR PUBLIC, which would let anon/authenticated PostgREST
-- callers invoke owner-privileged RPCs directly. The Express API invokes these
-- RPCs exclusively with the service_role key (supabaseAdmin).

REVOKE ALL ON FUNCTION public.sync_departure_room_slots_atomic(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_departure_room_slots_atomic(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.sync_departure_room_slots_atomic(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_departure_room_slots_atomic(UUID, UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_reservation_accommodation_requirement_atomic(UUID, UUID, UUID, INT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_reservation_accommodation_requirement_atomic(UUID, UUID, UUID, INT, INT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_reservation_accommodation_requirement_atomic(UUID, UUID, UUID, INT, INT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_reservation_accommodation_requirement_atomic(UUID, UUID, UUID, INT, INT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.replace_reservation_accommodation_requirements_atomic(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_reservation_accommodation_requirements_atomic(UUID, UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.replace_reservation_accommodation_requirements_atomic(UUID, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_reservation_accommodation_requirements_atomic(UUID, UUID, JSONB) TO service_role;
