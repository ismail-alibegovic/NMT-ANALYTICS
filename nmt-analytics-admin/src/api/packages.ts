import { get, post, patch, del } from './client';

export type PackageTransportType = 'bus' | 'flight' | 'none';
export type PackageVariantTier = 'standard' | 'premium' | 'deluxe' | 'custom';

export interface Package {
  id: string;
  org_id?: string;
  name: string;
  destination: string;
  price: number;
  currency: string;
  active: boolean;
  description?: string;
  durationDays?: number;
  maxParticipants?: number;
  startDate?: string;
  endDate?: string;
  transportType?: PackageTransportType | null;
  transportCapacity?: number | null;
  tripType?: string | null;
  tags?: string[] | null;
  variants?: PackageVariant[];
  created_at: string;
  // Read compatibility aliases
  base_price?: number;
  is_active?: boolean;
  transport_type?: PackageTransportType | null;
  transport_capacity?: number | null;
  trip_type?: string | null;
}

export interface PackageDetailService {
  id: string;
  service_type?: string | null;
  provider_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface PackageDetailHotel {
  id: string;
  hotel_id?: string | null;
  hotel_name?: string | null;
  room_type?: string | null;
  price_per_night?: number | null;
  check_in?: string | null;
  check_out?: string | null;
  rooms_reserved?: number | null;
  hotels?: {
    id: string;
    name: string;
  } | null;
}

export interface PackageDetailDeparture {
  id: string;
  depart_at: string;
  return_at?: string | null;
  status?: string | null;
  capacity?: number | null;
  booked?: number | null;
  transport_type?: string | null;
}

export interface PackageDetail extends Package {
  package_services?: PackageDetailService[];
  hotels?: PackageDetailHotel[];
  departures?: PackageDetailDeparture[];
}

export interface PackageVariant {
  id?: string;
  name: string;
  tier?: PackageVariantTier | null;
  accommodation?: string | null;
  priceModifier?: number | null;
  capacity?: number | null;
  currency?: string | null;
  hotelName?: string | null;
  roomType?: string | null;
}

export interface PackageUpsertInput {
  name: string;
  destination: string;
  price: number;
  currency: string;
  active: boolean;
  description?: string | null;
  durationDays?: number | null;
  maxParticipants?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  transportType?: PackageTransportType | null;
  transportCapacity?: number | null;
  tripType?: string | null;
  tags?: string[] | null;
  variants?: PackageVariant[] | null;
  itineraryId?: string | null;
}

export interface PackageListResponse {
  data: Package[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PackageFilters {
  search?: string;
  page?: number;
  limit?: number;
}

type RawPackage = Package & Record<string, any>;

function normalizeVariant(raw: any): PackageVariant {
  const normalizedTier = raw?.tier === 'delux' ? 'deluxe' : raw?.tier;
  return {
    id: raw?.id || undefined,
    name: raw?.name || '',
    tier: normalizedTier ?? null,
    accommodation: raw?.accommodation ?? raw?.hotelName ?? null,
    priceModifier: raw?.priceModifier ?? raw?.price_delta ?? raw?.price ?? null,
    capacity: raw?.capacity ?? null,
    currency: raw?.currency ?? null,
    hotelName: raw?.hotelName ?? null,
    roomType: raw?.roomType ?? null,
  };
}

export function normalizePackage(raw: RawPackage): Package {
  const price = raw.price ?? raw.base_price ?? 0;
  const active = raw.active ?? raw.is_active ?? true;
  const durationDays = raw.durationDays ?? raw.duration_days ?? undefined;
  const maxParticipants = raw.maxParticipants ?? raw.max_participants ?? undefined;
  const startDate = raw.startDate ?? raw.start_date ?? undefined;
  const endDate = raw.endDate ?? raw.end_date ?? undefined;
  const transportType = raw.transportType ?? raw.transport_type ?? null;
  const transportCapacity = raw.transportCapacity ?? raw.transport_capacity ?? null;
  const tripType = raw.tripType ?? raw.trip_type ?? null;
  const variants = Array.isArray(raw.variants) ? raw.variants.map(normalizeVariant) : [];

  return {
    ...raw,
    price,
    active,
    durationDays,
    maxParticipants,
    startDate,
    endDate,
    transportType,
    transportCapacity,
    tripType,
    variants,
    base_price: raw.base_price ?? price,
    is_active: raw.is_active ?? active,
    transport_type: raw.transport_type ?? transportType,
    transport_capacity: raw.transport_capacity ?? transportCapacity,
    trip_type: raw.trip_type ?? tripType,
  };
}

export function serializePackageVariant(variant: PackageVariant): Record<string, unknown> {
  return {
    ...(variant.id ? { id: variant.id } : {}),
    name: variant.name.trim(),
    tier: variant.tier ?? null,
    accommodation: variant.accommodation ?? null,
    priceModifier: variant.priceModifier ?? null,
    capacity: variant.capacity ?? null,
    currency: variant.currency ?? null,
    hotelName: variant.hotelName ?? null,
    roomType: variant.roomType ?? null,
  };
}

export function serializePackageUpsert(input: PackageUpsertInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    destination: input.destination.trim(),
    price: input.price,
    currency: input.currency || 'BAM',
    active: input.active,
    description: input.description ?? null,
    durationDays: input.durationDays ?? null,
    maxParticipants: input.maxParticipants ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    transportType: input.transportType ?? null,
    transportCapacity: input.transportType === 'none' ? null : (input.transportCapacity ?? null),
    tripType: input.tripType ?? null,
    tags: input.tags ?? null,
    variants: (input.variants ?? [])
      .filter((variant) => variant.name.trim())
      .map(serializePackageVariant),
    ...(input.itineraryId ? { itineraryId: input.itineraryId } : {}),
  };
}

export async function getPackages(filters: PackageFilters = {}, config?: any): Promise<PackageListResponse> {
  const params: Record<string, any> = {
    page: filters.page,
    limit: filters.limit,
    search: filters.search
  };

  const { data } = await get<PackageListResponse>('/packages', { params, ...config });

  return {
    ...data,
    data: (data.data || []).map((pkg) => normalizePackage(pkg as RawPackage)),
  };
}


export async function getPackageById(id: string): Promise<PackageDetail> {
  const { data } = await get<{ data: PackageDetail }>(`/packages/${id}`);
  return normalizePackage(data.data as RawPackage) as PackageDetail;
}
export async function createPackage(data: PackageUpsertInput): Promise<Package> {
  const { data: result } = await post<Package>('/packages', serializePackageUpsert(data));
  return normalizePackage(result as RawPackage);
}

export async function updatePackage(id: string, data: PackageUpsertInput): Promise<Package> {
  const { data: result } = await patch<Package>(`/packages/${id}`, serializePackageUpsert(data));
  return normalizePackage(result as RawPackage);
}

export async function deletePackage(id: string): Promise<void> {
  await del(`/packages/${id}`);
}
