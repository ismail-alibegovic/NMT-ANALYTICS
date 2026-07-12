-- Migration: PDF Template Editor + Onboarding Checklist
-- Sprint 4 of Travline Improvement Plan
--
-- Creates:
-- 1. pdf_template_config JSONB column on org_branding (block-based template configs per doc type)
-- 2. onboarding_completed boolean + onboarding_steps JSONB on org_settings

-- ============ PDF Template Config ============

ALTER TABLE org_branding
  ADD COLUMN IF NOT EXISTS pdf_template_config jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN org_branding.pdf_template_config IS
  'Block-based PDF template configs keyed by document type: invoice, voucher, contract, receipt. Each value is a JSON array of block definitions.';

-- ============ Onboarding State ============

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_steps jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN org_settings.onboarding_completed IS
  'Whether the user dismissed or completed the onboarding checklist.';
COMMENT ON COLUMN org_settings.onboarding_steps IS
  'JSON object tracking which onboarding steps have been completed. Keys: org_name, logo, currency, first_package, first_reservation.';

-- Allow skipping onboarding from the dashboard
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_skipped boolean DEFAULT false;

-- ============ Default Template Config ============
-- Seed a sensible default block config for all existing orgs

DO $$
DECLARE
  default_config jsonb;
  org_row RECORD;
BEGIN
  default_config := jsonb_build_object(
    'invoice', jsonb_build_array(
      jsonb_build_object('type', 'header', 'enabled', true, 'order', 0),
      jsonb_build_object('type', 'logo', 'enabled', true, 'order', 1),
      jsonb_build_object('type', 'invoice_meta', 'enabled', true, 'order', 2),
      jsonb_build_object('type', 'party_info', 'enabled', true, 'order', 3),
      jsonb_build_object('type', 'pricing_table', 'enabled', true, 'order', 4),
      jsonb_build_object('type', 'payment_info', 'enabled', true, 'order', 5),
      jsonb_build_object('type', 'qr_code', 'enabled', false, 'order', 6),
      jsonb_build_object('type', 'footer', 'enabled', true, 'order', 7)
    ),
    'voucher', jsonb_build_array(
      jsonb_build_object('type', 'header', 'enabled', true, 'order', 0),
      jsonb_build_object('type', 'logo', 'enabled', true, 'order', 1),
      jsonb_build_object('type', 'voucher_meta', 'enabled', true, 'order', 2),
      jsonb_build_object('type', 'trip_details', 'enabled', true, 'order', 3),
      jsonb_build_object('type', 'passenger_list', 'enabled', true, 'order', 4),
      jsonb_build_object('type', 'pricing_table', 'enabled', true, 'order', 5),
      jsonb_build_object('type', 'hotel_info', 'enabled', true, 'order', 6),
      jsonb_build_object('type', 'footer', 'enabled', true, 'order', 7)
    ),
    'contract', jsonb_build_array(
      jsonb_build_object('type', 'header', 'enabled', true, 'order', 0),
      jsonb_build_object('type', 'logo', 'enabled', true, 'order', 1),
      jsonb_build_object('type', 'contract_meta', 'enabled', true, 'order', 2),
      jsonb_build_object('type', 'party_info', 'enabled', true, 'order', 3),
      jsonb_build_object('type', 'trip_details', 'enabled', true, 'order', 4),
      jsonb_build_object('type', 'passenger_list', 'enabled', true, 'order', 5),
      jsonb_build_object('type', 'pricing_table', 'enabled', true, 'order', 6),
      jsonb_build_object('type', 'terms_text', 'enabled', true, 'order', 7),
      jsonb_build_object('type', 'signature_block', 'enabled', true, 'order', 8),
      jsonb_build_object('type', 'footer', 'enabled', true, 'order', 9)
    ),
    'receipt', jsonb_build_array(
      jsonb_build_object('type', 'header', 'enabled', true, 'order', 0),
      jsonb_build_object('type', 'logo', 'enabled', true, 'order', 1),
      jsonb_build_object('type', 'receipt_meta', 'enabled', true, 'order', 2),
      jsonb_build_object('type', 'payment_breakdown', 'enabled', true, 'order', 3),
      jsonb_build_object('type', 'pricing_table', 'enabled', true, 'order', 4),
      jsonb_build_object('type', 'footer', 'enabled', true, 'order', 5)
    )
  );

  FOR org_row IN SELECT org_id FROM org_branding WHERE pdf_template_config = '{}'::jsonb OR pdf_template_config IS NULL LOOP
    UPDATE org_branding
    SET pdf_template_config = default_config
    WHERE org_id = org_row.org_id;
  END LOOP;
END;
$$;
