ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS agency_profiles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enabled_capabilities TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_agency_profiles_valid,
  ADD CONSTRAINT organizations_agency_profiles_valid CHECK (
    agency_profiles <@ ARRAY[
      'retail_agency',
      'group_tours',
      'dmc_incoming',
      'tour_operator'
    ]::TEXT[]
  );

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_enabled_capabilities_valid,
  ADD CONSTRAINT organizations_enabled_capabilities_valid CHECK (
    enabled_capabilities <@ ARRAY[
      'customer_sales',
      'scheduled_departures',
      'group_operations',
      'tailor_made_itineraries',
      'supplier_management',
      'accommodation_operations',
      'transport_operations',
      'inventory_contracting',
      'b2b_distribution',
      'document_generation',
      'customer_finance',
      'supplier_finance'
    ]::TEXT[]
  );

COMMENT ON COLUMN organizations.agency_profiles IS
  'Agency operating models selected during onboarding. Separate from subscription plan and user roles.';

COMMENT ON COLUMN organizations.enabled_capabilities IS
  'Additional operational capabilities enabled beyond those derived from agency_profiles.';
