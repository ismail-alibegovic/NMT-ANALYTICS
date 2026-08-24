import { get, post, patch, del } from './client';

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
  created_at: string;
  // Aliases for compatibility
  base_price?: number;
  is_active?: boolean;
  // --- Nova Prodaja wizard support (migration 036) ---
  transport_type?: 'bus' | 'flight' | 'none';
  transport_capacity?: number | null;
  trip_type?: string | null;
  tags?: string[] | null;
  tripType?: string | null;
  variants?: PackageVariant[];
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
  id: string;
  name: string;             // e.g. "Deluxe", "Standard", "Premium"
  accommodation?: string;   // e.g. "Hotel 5* — Half board"
  price_delta?: number;     // amount added to base price
  currency?: string;
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

export async function getPackages(filters: PackageFilters = {}, config?: any): Promise<PackageListResponse> {
  const params: Record<string, any> = {
    page: filters.page,
    limit: filters.limit,
    search: filters.search
  };

  const { data } = await get<PackageListResponse>('/packages', { params, ...config });

  // Ensure price and active are populated for frontend
  const transformedData = data.data.map(pkg => ({
    ...pkg,
    price: pkg.price ?? pkg.base_price ?? 0,
    active: pkg.active ?? pkg.is_active ?? true,
  }));

  return {
    ...data,
    data: transformedData,
  };
}


export async function getPackageById(id: string): Promise<PackageDetail> {
  const { data } = await get<{ data: PackageDetail }>(`/packages/${id}`);
  return data.data;
}
export async function createPackage(data: any): Promise<Package> {
  const { data: result } = await post<Package>('/packages', data);
  return result;
}

export async function updatePackage(id: string, data: any): Promise<Package> {
  const { data: result } = await patch<Package>(`/packages/${id}`, data);
  return result;
}

export async function deletePackage(id: string): Promise<void> {
  await del(`/packages/${id}`);
}
