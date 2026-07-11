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
  base TEXT;
  slug TEXT;
  counter INT := 0;
BEGIN
  base := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  IF base = '' OR base IS NULL THEN
    base := 'org';
  END IF;
  slug := base;
  LOOP
    counter := counter + 1;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM organizations WHERE slug = slug);
    slug := base || '-' || counter;
  END LOOP;
  RETURN slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. HANDLE NEW USER TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  user_email TEXT;
  org_name TEXT;
BEGIN
  user_email := NEW.email;

  -- Derive org name from email domain (before @)
  org_name := split_part(user_email, '@', 1);
  IF org_name IS NULL OR org_name = '' THEN
    org_name := 'My Organization';
  END IF;

  -- 1. Create organization
  INSERT INTO organizations (name, slug)
  VALUES (org_name, generate_org_slug(org_name))
  RETURNING id INTO new_org_id;

  -- 2. Create profile as director of the new org
  INSERT INTO profiles (id, org_id, role)
  VALUES (NEW.id, new_org_id, 'director')
  ON CONFLICT (id) DO UPDATE
    SET org_id = new_org_id, role = 'director';

  -- 3. Seed default org_modules
  INSERT INTO org_modules (org_id, module_key, enabled)
  SELECT new_org_id, m.module_key, true
  FROM (VALUES
    ('travel_core'),
    ('analytics'),
    ('documents'),
    ('integrations')
  ) AS m(module_key)
  ON CONFLICT (org_id, module_key) DO NOTHING;

  -- 4. Seed empty org_branding
  INSERT INTO org_branding (org_id, display_name)
  VALUES (new_org_id, org_name)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
