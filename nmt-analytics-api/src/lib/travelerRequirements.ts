import { z } from 'zod';

export const travelScopeSchema = z.enum(['unspecified', 'domestic', 'international']);
export const travelerDocumentTypeSchema = z.enum(['none', 'id_card', 'passport']);

export const travelerRequirementsWriteSchema = z.object({
  travelScope: travelScopeSchema.optional(),
  documentType: travelerDocumentTypeSchema.optional(),
  allowFillLater: z.boolean().optional(),
  requireExpiry: z.boolean().optional(),
  requireNationality: z.boolean().optional(),
  requireDateOfBirth: z.boolean().optional(),
}).strict();

export type TravelerRequirementsInput = z.infer<typeof travelerRequirementsWriteSchema>;

export type ResolvedTravelerRequirements = {
  travelScope: 'unspecified' | 'domestic' | 'international';
  documentType: 'none' | 'id_card' | 'passport';
  allowFillLater: boolean;
  requireExpiry: boolean;
  requireNationality: boolean;
  requireDateOfBirth: boolean;
};

export const DEFAULT_NO_DOCUMENT_REQUIREMENTS: ResolvedTravelerRequirements = {
  travelScope: 'unspecified',
  documentType: 'none',
  allowFillLater: true,
  requireExpiry: false,
  requireNationality: false,
  requireDateOfBirth: false,
};

export const DEFAULT_PASSPORT_REQUIREMENTS: ResolvedTravelerRequirements = {
  travelScope: 'unspecified',
  documentType: 'passport',
  allowFillLater: true,
  requireExpiry: true,
  requireNationality: false,
  requireDateOfBirth: false,
};

function hasOwn(value: object, key: keyof ResolvedTravelerRequirements): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isExplicitTravelerRequirements(value: unknown): value is TravelerRequirementsInput {
  return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0;
}

export function snakeToCamelTravelerRequirements(value: unknown): TravelerRequirementsInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  if ('travel_scope' in raw) result.travelScope = raw.travel_scope;
  if ('document_type' in raw) result.documentType = raw.document_type;
  if ('allow_fill_later' in raw) result.allowFillLater = raw.allow_fill_later;
  if ('require_expiry' in raw) result.requireExpiry = raw.require_expiry;
  if ('require_nationality' in raw) result.requireNationality = raw.require_nationality;
  if ('require_date_of_birth' in raw) result.requireDateOfBirth = raw.require_date_of_birth;

  const parsed = travelerRequirementsWriteSchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}

export function camelToSnakeTravelerRequirements(value: TravelerRequirementsInput): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (value.travelScope !== undefined) result.travel_scope = value.travelScope;
  if (value.documentType !== undefined) result.document_type = value.documentType;
  if (value.allowFillLater !== undefined) result.allow_fill_later = value.allowFillLater;
  if (value.requireExpiry !== undefined) result.require_expiry = value.requireExpiry;
  if (value.requireNationality !== undefined) result.require_nationality = value.requireNationality;
  if (value.requireDateOfBirth !== undefined) result.require_date_of_birth = value.requireDateOfBirth;

  return result;
}

export function normalizeTravelerRequirements(
  value: TravelerRequirementsInput | null | undefined,
  fallback: ResolvedTravelerRequirements,
): ResolvedTravelerRequirements {
  if (!value) return { ...fallback };

  return {
    travelScope: hasOwn(value, 'travelScope') ? value.travelScope! : fallback.travelScope,
    documentType: hasOwn(value, 'documentType') ? value.documentType! : fallback.documentType,
    allowFillLater: hasOwn(value, 'allowFillLater') ? value.allowFillLater! : fallback.allowFillLater,
    requireExpiry: hasOwn(value, 'requireExpiry') ? value.requireExpiry! : fallback.requireExpiry,
    requireNationality: hasOwn(value, 'requireNationality') ? value.requireNationality! : fallback.requireNationality,
    requireDateOfBirth: hasOwn(value, 'requireDateOfBirth') ? value.requireDateOfBirth! : fallback.requireDateOfBirth,
  };
}

export function resolveTravelerRequirements(input: {
  packageTravelerRequirements?: unknown;
  departureTravelerRequirements?: unknown;
  effectiveTransportType?: string | null;
  documentReadinessRequired?: boolean | null;
}): ResolvedTravelerRequirements {
  const legacyFallback =
    input.effectiveTransportType === 'flight' || input.documentReadinessRequired === true
      ? DEFAULT_PASSPORT_REQUIREMENTS
      : DEFAULT_NO_DOCUMENT_REQUIREMENTS;

  const packageRequirements = snakeToCamelTravelerRequirements(input.packageTravelerRequirements);
  const departureRequirements = snakeToCamelTravelerRequirements(input.departureTravelerRequirements);
  const packageResolved = isExplicitTravelerRequirements(packageRequirements)
    ? normalizeTravelerRequirements(packageRequirements, legacyFallback)
    : legacyFallback;

  return isExplicitTravelerRequirements(departureRequirements)
    ? normalizeTravelerRequirements(departureRequirements, packageResolved)
    : { ...packageResolved };
}
