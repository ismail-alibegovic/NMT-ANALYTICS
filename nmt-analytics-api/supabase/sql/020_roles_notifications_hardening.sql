-- NMT Analytics hardening: strict roles + real notifications

-- 1. Normalize legacy roles before enforcing the final role model
UPDATE profiles SET role = 'director' WHERE role = 'admin';
UPDATE profiles SET role = 'agent' WHERE role = 'user';
UPDATE profiles SET role = 'viewer' WHERE role IS NULL OR role = '';

-- 2. Enforce final role model
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'viewer';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'director', 'manager', 'agent', 'viewer'));

-- 2.1. Replace legacy admin-only policies with final role model
-- Requires prior migrations that create org_modules, documents, and audit_logs.
DROP POLICY IF EXISTS "Admins can read all profiles in their org" ON profiles;
DROP POLICY IF EXISTS "Directors can read profiles in their org" ON profiles;
CREATE POLICY "Directors can read profiles in their org" ON profiles
  FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director')
  );

DROP POLICY IF EXISTS "Admins can manage org modules" ON org_modules;
DROP POLICY IF EXISTS "Directors can manage org modules" ON org_modules;
CREATE POLICY "Directors can manage org modules" ON org_modules
  FOR ALL
  USING (
    org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director')
  )
  WITH CHECK (
    org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director')
  );

DROP POLICY IF EXISTS "Admins can manage documents" ON documents;
DROP POLICY IF EXISTS "Managers can manage documents" ON documents;
CREATE POLICY "Managers can manage documents" ON documents
  FOR ALL
  USING (
    org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director', 'manager')
  )
  WITH CHECK (
    org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director', 'manager')
  );

DROP POLICY IF EXISTS "Admins can read audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Directors can read audit logs" ON audit_logs;
CREATE POLICY "Directors can read audit logs" ON audit_logs
  FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director')
  );

-- 3. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
      'new_reservation',
      'payment_received',
      'departure_reminder',
      'payment_overdue',
      'system'
    )),
    title TEXT NOT NULL,
    body TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org_created_at
  ON notifications(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_user_created_at
  ON notifications(org_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(org_id, user_id, is_read)
  WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant read notifications" ON notifications;
CREATE POLICY "Tenant read notifications" ON notifications
  FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

DROP POLICY IF EXISTS "Tenant update own notifications" ON notifications;
CREATE POLICY "Tenant update own notifications" ON notifications
  FOR UPDATE
  USING (
    org_id = get_my_org_id()
    AND (user_id = auth.uid() OR user_id IS NULL)
  )
  WITH CHECK (
    org_id = get_my_org_id()
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- Backend service role inserts notifications; no public insert policy is needed.
COMMENT ON TABLE notifications IS 'Org-scoped user and org-wide notifications';
COMMENT ON COLUMN notifications.user_id IS 'NULL means notification is visible to every user in the organization';
