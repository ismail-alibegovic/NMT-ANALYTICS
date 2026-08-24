CREATE TABLE IF NOT EXISTS communication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  related_departure_id UUID REFERENCES departures(id) ON DELETE SET NULL,
  related_reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_communication_history_org_id_created_at
  ON communication_history (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_history_related_departure_id
  ON communication_history (related_departure_id)
  WHERE related_departure_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_history_related_reservation_id
  ON communication_history (related_reservation_id)
  WHERE related_reservation_id IS NOT NULL;
