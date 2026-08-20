export const AGENCY_PROFILES = [
  'retail_agency',
  'group_tours',
  'dmc_incoming',
  'tour_operator',
] as const;

export type AgencyProfile = (typeof AGENCY_PROFILES)[number];

export const AGENCY_CAPABILITIES = [
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
  'supplier_finance',
] as const;

export type AgencyCapability = (typeof AGENCY_CAPABILITIES)[number];

const PROFILE_CAPABILITIES: Record<AgencyProfile, readonly AgencyCapability[]> = {
  retail_agency: [
    'customer_sales',
    'supplier_management',
    'document_generation',
    'customer_finance',
  ],
  group_tours: [
    'customer_sales',
    'scheduled_departures',
    'group_operations',
    'accommodation_operations',
    'transport_operations',
    'document_generation',
    'customer_finance',
  ],
  dmc_incoming: [
    'customer_sales',
    'tailor_made_itineraries',
    'supplier_management',
    'accommodation_operations',
    'transport_operations',
    'document_generation',
    'customer_finance',
    'supplier_finance',
  ],
  tour_operator: [
    'customer_sales',
    'scheduled_departures',
    'group_operations',
    'supplier_management',
    'accommodation_operations',
    'transport_operations',
    'inventory_contracting',
    'b2b_distribution',
    'document_generation',
    'customer_finance',
    'supplier_finance',
  ],
};

function isAgencyProfile(value: unknown): value is AgencyProfile {
  return typeof value === 'string' && (AGENCY_PROFILES as readonly string[]).includes(value);
}

function isAgencyCapability(value: unknown): value is AgencyCapability {
  return typeof value === 'string' && (AGENCY_CAPABILITIES as readonly string[]).includes(value);
}

export function resolveAgencyConfiguration(
  rawProfiles: unknown,
  rawCapabilities: unknown,
): { profiles: AgencyProfile[]; capabilities: AgencyCapability[]; configured: boolean } {
  const profiles = Array.isArray(rawProfiles) ? rawProfiles.filter(isAgencyProfile) : [];
  const explicitCapabilities = Array.isArray(rawCapabilities)
    ? rawCapabilities.filter(isAgencyCapability)
    : [];

  if (profiles.length === 0) {
    return { profiles: [], capabilities: [], configured: false };
  }

  const capabilities = new Set<AgencyCapability>();
  profiles.forEach((profile) => {
    PROFILE_CAPABILITIES[profile].forEach((capability) => capabilities.add(capability));
  });
  explicitCapabilities.forEach((capability) => capabilities.add(capability));

  return {
    profiles: [...new Set(profiles)],
    capabilities: [...capabilities],
    configured: true,
  };
}
