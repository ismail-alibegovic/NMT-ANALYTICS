-- Migration: Fix get_my_org_id() / get_my_role() recursion at Postgres level
-- ---------------------------------------------------------------------------
-- The previous migration (20260715020000) made these functions SECURITY
-- DEFINER, but SECURITY DEFINER alone does NOT bypass RLS — it only changes
-- the effective user. When the function body does `SELECT ... FROM profiles`,
-- Postgres still evaluates profiles RLS, which calls get_my_org_id() again
-- → infinite recursion.
--
-- Fix: convert the helpers from LANGUAGE sql to LANGUAGE plpgsql SECURITY
-- DEFINER and explicitly SET LOCAL row_security = off inside the function,
-- so the inner SELECT bypasses RLS entirely. This is the canonical Supabase
-- pattern for org-scoping helpers.
--
-- Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
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
  'Caller''s org_id. SECURITY DEFINER + SET LOCAL row_security=off so the inner profiles read bypasses RLS, breaking the recursion that would otherwise occur when called from profiles-vs-org policies.';

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
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
  'Caller''s profiles.role. SECURITY DEFINER + SET LOCAL row_security=off so the inner profiles read bypasses RLS, avoiding recursion from profiles policies.';
