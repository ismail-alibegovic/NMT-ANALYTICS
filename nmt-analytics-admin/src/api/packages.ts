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
