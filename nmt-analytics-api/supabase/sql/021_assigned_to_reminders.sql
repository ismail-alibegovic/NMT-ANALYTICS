-- NMT Analytics: assigned_to, departure reminders, audit enrich

-- 1. assigned_to for reservations (agent ownership)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN reservations.assigned_to IS 'Agent/user who owns this reservation. NULL = unassigned.';

CREATE INDEX IF NOT EXISTS idx_reservations_assigned_to
  ON reservations(org_id, assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 2. Update reservations RLS to allow agents to see their own + org-wide
DROP POLICY IF EXISTS "Tenant access - Reservations" ON reservations;
CREATE POLICY "Tenant access - Reservations" ON reservations
  FOR ALL
  USING (
    org_id = get_my_org_id()
    AND (
      assigned_to IS NULL
      OR assigned_to = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin', 'director', 'manager')
    )
  )
  WITH CHECK (org_id = get_my_org_id());

-- 3. Notify all org agents on departure reminder (cron-ready helper function)
CREATE OR REPLACE FUNCTION notify_upcoming_departures()
RETURNS TABLE(notification_id UUID) AS $$
DECLARE
  rec RECORD;
  nid UUID;
BEGIN
  FOR rec IN
    SELECT d.id AS departure_id, d.depart_at, p.name AS package_name, d.org_id
    FROM departures d
    JOIN packages p ON p.id = d.package_id
    WHERE d.depart_at::date = (CURRENT_DATE + 1)
      AND d.status = 'active'
      AND d.booked > 0
  LOOP
    INSERT INTO notifications (org_id, user_id, type, title, body, data)
    VALUES (
      rec.org_id,
      NULL, -- org-wide
      'departure_reminder',
      'Podsjetnik: Polazak sutra',
      rec.package_name || ' polazi sutra u ' || to_char(rec.depart_at, 'HH24:MI'),
      jsonb_build_object('departure_id', rec.departure_id, 'package_name', rec.package_name, 'departure_date', rec.depart_at::text)
    )
    RETURNING id INTO nid;

    notification_id := nid;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ensure audit_logs has org_id for proper RLS (add if missing)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);

UPDATE audit_logs SET org_id = get_my_org_id()
WHERE org_id IS NULL AND id IN (
  SELECT al.id FROM auth.users u
  JOIN profiles p ON p.id = u.id
  JOIN audit_logs al ON al.user_id = u.id
  WHERE p.org_id IS NOT NULL
);

COMMENT ON TABLE audit_logs IS 'Audit trail for org-scoped actions';
