-- Fix PUBLIC EXECUTE privilege on the SECURITY DEFINER function release_capacity_atomic.
-- Append-only follow-up to 20260831210000_security_definer_function_privileges.sql,
-- which granted service_role EXECUTE but left PUBLIC EXECUTE intact on this function.
-- This migration revokes broad execution and does NOT modify the function body.

REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.release_capacity_atomic(UUID, UUID, INT) TO service_role;
