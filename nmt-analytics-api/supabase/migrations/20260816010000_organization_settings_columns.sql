-- Migration: Organization settings columns
-- Adds nullable organization-level settings used by /api/settings and PDF templates.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Sarajevo',
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS invoice_footer text,
  ADD COLUMN IF NOT EXISTS invoice_notes text;

COMMENT ON COLUMN public.organizations.timezone IS
  'Default timezone for organization-facing scheduling and settings UI.';
COMMENT ON COLUMN public.organizations.tax_id IS
  'Organization tax/VAT identifier shown on generated documents when provided.';
COMMENT ON COLUMN public.organizations.bank_account IS
  'Default bank account shown on invoices and receipts when provided.';
COMMENT ON COLUMN public.organizations.invoice_footer IS
  'Custom footer text for generated invoice-style documents.';
COMMENT ON COLUMN public.organizations.invoice_notes IS
  'Default notes rendered on generated invoice-style documents.';
