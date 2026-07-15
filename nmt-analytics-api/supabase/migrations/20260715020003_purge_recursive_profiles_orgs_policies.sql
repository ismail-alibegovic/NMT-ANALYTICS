-- Migration: purge ALL recursive profiles/organizations RLS policies.
-- Sprint 2026-07-15
--
-- The legacy init migration (001_init.sql) and others created RLS policies that
-- use correlated subqueries of the form:
--   (SELECT role FROM profiles WHERE id = auth.uid())
--   (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND ...))
--   (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
-- These read `profiles` from inside a `profiles` (or `organizations`) policy,
-- which deadlocks PostgREST's policy evaluator -> "infinite recursion detected".
--
-- Fix: DROP every recursive policy name that still exists, then re-create
-- non-recursive replacements using the SECURITY DEFINER helpers
-- get_my_org_id() and get_my_role() (both VOLATILE + bypass RLS).

-- ============================================================
-- 1. PROFILES — drop ALL recursive policies, keep `get_my_role()` versions
-- ============================================================

-- Drop every recursive leftover. Per the live pg_policies output these are
-- the exact names present. DROP IF EXISTS makes this safe to re-run.
DROP POLICY IF EXISTS "Directors can read profiles in their org" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
-- (legacy duplicates of "Users can update own profile")

-- Keep and re-affirm our existing non-recursive set: DROP + re-CREATE idempotently
-- so this migration stands alone even if the earlier 20260715020000 migration
-- never landed (idempotent on every policy name).
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "Members can read own org profiles" ON public.profiles;
CREATE POLICY "Members can read own org profiles" ON public.profiles
  FOR SELECT USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Directors can manage org profiles" ON public.profiles;
CREATE POLICY "Directors can manage org profiles" ON public.profiles
  FOR ALL USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('director', 'super_admin')
  )
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('director', 'super_admin')
  );

-- ============================================================
-- 2. ORGANIZATIONS — drop ALL recursive policies
-- ============================================================

DROP POLICY IF EXISTS "Super admins can view all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;

-- Replace with non-recursive policies.
DROP POLICY IF EXISTS "Users can read their own organization" ON public.organizations;
CREATE POLICY "Users can read their own organization" ON public.organizations
  FOR SELECT USING (id = public.get_my_org_id());

DROP POLICY IF EXISTS "Directors can update their own organization" ON public.organizations;
CREATE POLICY "Directors can update their own organization" ON public.organizations
  FOR UPDATE USING (
    id = public.get_my_org_id()
    AND public.get_my_role() IN ('director', 'super_admin')
  )
  WITH CHECK (
    id = public.get_my_org_id()
    AND public.get_my_role() IN ('director', 'super_admin')
  );

-- ============================================================
-- 3. HOUSEKEEPING: introspection function cleanup
-- ============================================================
-- Drop the ad-hoc `inspect_policies(text)` helper we used during diagnosis —
-- it served its purpose (introspecting pg_policies without tripping the WAF)
-- and shouldn't remain in the schema.
DROP FUNCTION IF EXISTS public.inspect_policies(text);
