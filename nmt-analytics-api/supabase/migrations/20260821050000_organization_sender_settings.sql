ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS email_sender_address TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_number TEXT;
