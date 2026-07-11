-- Migration: Self-service signup flow
-- Phase 1 of Travline Improvement Plan
--
-- Creates:
-- 1. org_branding table (logo, colors, display name per org)
-- 2. handle_new_user trigger function — auto-creates org + profile + modules + branding on signup
-- 3. Trigger on auth.users table

-- ============================================================
-- 1. ORG BRANDING
-- ============================================================
CREATE TABLE IF NOT EXISTS org_branding (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  display_name TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563EB',
  accent_color TEXT DEFAULT '#0EA5E9',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE org_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own org branding"
  ON org_branding FOR SELECT
  USING (org_id = get_my_org_id());

CREATE POLICY "Directors can manage org branding"
  ON org_branding FOR ALL
  USING (org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director'))
  WITH CHECK (org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director'));

-- ============================================================
-- 2. SLUG HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION generate_org_slug(p_name TEXT)
RETURNS TEXT AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
  v_counter INT := 0;
BEGIN
  v_base := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  IF v_base = '' OR v_base IS NULL THEN
    v_base := 'org';
  END IF;
  v_slug := v_base;
  LOOP
    v_counter := v_counter + 1;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM organizations WHERE organizations.slug = v_slug);
    v_slug := v_base || '-' || v_counter::TEXT;
  END LOOP;
  RETURN v_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. HANDLE NEW USER TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id UUID;
  v_email TEXT;
  v_org_name TEXT;
BEGIN
  v_email := NEW.email;
  v_org_name := split_part(v_email, '@', 1);
  IF v_org_name IS NULL OR v_org_name = '' THEN
    v_org_name := 'My Organization';
  END IF;

  -- 1. Create organization
  INSERT INTO public.organizations (name, slug)
  VALUES (v_org_name, public.generate_org_slug(v_org_name))
  RETURNING id INTO v_org_id;

  -- 2. Create profile as director of the new org
  INSERT INTO public.profiles (id, org_id, role, email)
  VALUES (NEW.id, v_org_id, 'director', v_email)
  ON CONFLICT (id) DO UPDATE
    SET org_id = v_org_id, role = 'director';

  -- 3. Seed default org_modules
  INSERT INTO public.org_modules (org_id, module_key, enabled)
  SELECT v_org_id, m.module_key, true
  FROM (VALUES
    ('travel_core'),
    ('analytics'),
    ('documents'),
    ('integrations')
  ) AS m(module_key)
  ON CONFLICT (org_id, module_key) DO NOTHING;

  -- 4. Seed empty org_branding
  INSERT INTO public.org_branding (org_id, display_name)
  VALUES (v_org_id, v_org_name)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log but don't crash the auth flow
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
