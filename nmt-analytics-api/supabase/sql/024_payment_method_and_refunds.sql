-- Add payment method tracking and refund workflow support
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN payments.payment_method IS 'Payment method: cash, card, bank_transfer, credit';

-- Refund endpoint needs a reason and original payment reference
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Add invoice design settings to org_settings  
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS invoice_primary_color TEXT DEFAULT '#1D4ED8';
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS invoice_secondary_color TEXT DEFAULT '#111827';
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS invoice_logo_url TEXT;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS invoice_footer_text TEXT DEFAULT 'Thank you for your business!';
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS invoice_show_qr BOOLEAN DEFAULT false;

COMMENT ON COLUMN org_settings.invoice_primary_color IS 'Primary color for invoice headers/accents';
COMMENT ON COLUMN org_settings.invoice_secondary_color IS 'Text color for invoice body';
COMMENT ON COLUMN org_settings.invoice_logo_url IS 'URL to company logo for invoices';
COMMENT ON COLUMN org_settings.invoice_footer_text IS 'Custom footer text on invoices';
COMMENT ON COLUMN org_settings.invoice_show_qr IS 'Show QR code on invoices';

-- Index for refund queries
CREATE INDEX IF NOT EXISTS idx_payments_refunded_at ON payments(refunded_at) WHERE refunded_at IS NOT NULL;
