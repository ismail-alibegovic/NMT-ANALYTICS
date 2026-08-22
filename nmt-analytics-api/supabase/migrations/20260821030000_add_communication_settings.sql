-- Add communication sender settings to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS email_sender_address TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_number TEXT,
  ADD COLUMN IF NOT EXISTS newsletter_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS installment_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN organizations.email_sender_name IS 'From name for emails';
COMMENT ON COLUMN organizations.email_sender_address IS 'From address for emails';
COMMENT ON COLUMN organizations.sms_sender_name IS 'Sender name for SMS';
COMMENT ON COLUMN organizations.sms_sender_number IS 'Sender number for SMS';
COMMENT ON COLUMN organizations.newsletter_enabled IS 'Allow newsletter sending';
COMMENT ON COLUMN organizations.reminders_enabled IS 'Allow client reminders';
COMMENT ON COLUMN organizations.installment_enabled IS 'Allow installment payments';
