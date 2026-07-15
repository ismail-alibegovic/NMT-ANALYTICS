-- Migration: Make get_my_org_id / get_my_role VOLATILE so SET LOCAL works
-- ---------------------------------------------------------------------------
-- 20260715020001 used SET LOCAL row_security = off inside the helpers but
-- declared them STABLE. PostgREST rejects SET in non-volatile functions
-- ("SET is not allowed in a non-volatile function", code 0A000).
--
-- Fix: change VOLATILITY to VOLATILE (default for plpgsql). The functions
-- still only read (no writes), so volatility is for planner/permission
-- purposes, not data mutation. This is the canonical pattern used by
-- Supabase multi-tenant helpers that bypass RLS internally.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SET LOCAL row_security = off;
  SELECT p.org_id INTO v_org_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1;
  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION public.get_my_org_id() IS
  'Caller''s org_id. VOLATILE + SECURITY DEFINER + SET LOCAL row_security=off so the inner profiles read bypasses RLS, breaking recursion._VOLATILE is required because SET is not allowed in STABLE functions.';

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SET LOCAL row_security = off;
  SELECT p.role INTO v_role
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1;
  RETURN v_role;
END;
$$;

COMMENT ON FUNCTION public.get_my_role() IS
  'Caller''s profiles.role. VOLATILE + SECURITY DEFINER + SET LOCAL row_security=off to bypass RLS on the inner read.';
