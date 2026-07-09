-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org_user ON notifications(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = false;

COMMENT ON TABLE notifications IS 'User notifications for org activities';
COMMENT ON COLUMN notifications.user_id IS 'NULL = org-wide notification';
COMMENT ON COLUMN notifications.type IS 'new_reservation, payment_received, departure_reminder, system';
COMMENT ON COLUMN notifications.data IS 'Additional context (reservation_id, amount, etc.)';
