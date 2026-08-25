-- Capture communication_settings + whatsapp_sender columns from
-- the removed duplicate migration 20260821050000.
-- Clean up the obsolete departure_passenger_groups view that
-- referenced a now-removed column (departure_passengers.customer_id).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS communication_settings JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_sender TEXT;

COMMENT ON COLUMN organizations.communication_settings IS 'JSON blob for communication preferences (WhatsApp, etc.)';
COMMENT ON COLUMN organizations.whatsapp_sender IS 'WhatsApp sender number or identifier';

-- Drop view that was defined in 20260822010000 but never succeeded live
-- because it referenced obsolete departure_passengers.customer_id
DROP VIEW IF EXISTS departure_passenger_groups;
