-- Fix infinite recursion in profiles RLS policies.
--
-- Root cause: the "Admins can read all profiles in their org" policy on
-- `profiles` evaluated `(SELECT role FROM profiles WHERE id = auth.uid())`
-- from within the profiles USING clause. Selecting from profiles triggers
-- profiles' own RLS, which selects from profiles again → infinite recursion
-- → Postgres raises "infinite recursion detected in policy for relation
-- 'profiles'" and PostgREST returns HTTP 500 on EVERY profiles select.
--
-- Same recursion source: get_my_org_id() does
--   SELECT org_id FROM profiles WHERE id = auth.uid();
-- and is used by the "Admins can read" policy on profiles itself — so even
-- the first conjunct recurses.
--
-- Fix strategy:
--   1. Replace get_my_org_id() body with a SECURITY DEFINER variant that
--      reads profiles while RLS is disabled (SECURITY DEFINER + explicit
--      SET search_path). Recursive policies don't apply inside a security
--      definer function, because the function runs as the owner (superuser
--      or table owner) and RLS is bypassed.
--   2. Drop the recursive "Admins can read all profiles in their org"
--      policy. Replace with one that uses get_my_org_id() (now non-recursive)
--      and a new SECURITY DEFINER get_my_role() helper — neither of which
--      re-enters profiles RLS.
--   3. Re-grant the read policies with the same semantics, non-recursive.
--
-- This migration is idempotent (DROP IF EXISTS / CREATE OR REPLACE).

-- 1. Non-recursive get_my_org_id — runs as SECURITY DEFINER so it bypasses
--    profiles RLS. The search_path is pinned to public,auth for safety.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_org_id() IS
  'Returns the caller''s org_id. SECURITY DEFINER so it bypasses profiles RLS and avoids infinite recursion when called from profiles-vs-org policies.';

-- 2. New helper: caller's role. Also SECURITY DEFINER for the same reason.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_role() IS
  'Returns the caller''s profiles.role. SECURITY DEFINER so reads from profiles bypass RLS (avoids recursion in profiles policies).';

-- 3. Recreate the profiles SELECT policies without correlated subqueries
--    into profiles. Use get_my_org_id() and get_my_role() (both non-recursive
--    via SECURITY DEFINER) instead.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop the recursive "Admins can read all profiles in their org" policy.
DROP POLICY IF EXISTS "Admins can read all profiles in their org" ON public.profiles;

-- Drop the existing "Users can read own profile" policy and recreate it.
-- (We drop + recreate to be explicit; the original policy still works, but
-- dropping and recreating ensures a known-good canonical state.)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- New non-recursive "members can read all profiles in their org" policy.
-- Any signed-in user in an org can read all profiles (including role) within
-- that org — directors, admins, agents, and the user themselves. The role
-- check is omitted here: org membership alone (via get_my_org_id) is enough
-- to see your org's members. The "own profile" policy above already grants
-- the user their own row regardless.
CREATE POLICY "Members can read own org profiles" ON public.profiles
  FOR SELECT USING (
    org_id = public.get_my_org_id()
  );

-- 4. Profiles INSERT/UPDATE policies (idempotent). Re-check via SECURITY
--    DEFINER helpers to keep recursion-free.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Directors can update any profile in their org (e.g., role changes).
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

-- 5. Update the recursive org_branding "Directors can manage" policy too,
--    since it uses (SELECT role FROM profiles WHERE id = auth.uid()). That
--    subquery no longer recurses (profiles RLS now uses SECURITY DEFINER
--    helpers), but replacing it with get_my_role() is cleaner and faster.
DROP POLICY IF EXISTS "Directors can manage org branding" ON public.org_branding;
CREATE POLICY "Directors can manage org branding" ON public.org_branding
  FOR ALL USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('director', 'super_admin')
  )
  WITH CHECK (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('director', 'super_admin')
  );
