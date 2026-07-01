import { get, post, patch, del } from './client';

export interface Departure {
  id: string;
  package_id: string;
  depart_at: string;
  return_at: string;
  capacity: number;
  booked: number;
  status: 'active' | 'cancelled' | 'completed';
  created_at: string;
  updated_at: string;
  packageName: string;
  destination: string;
  packages?: {
    id: string;
    name: string;
    destination: string;
    base_price: number;
    currency: string;
  };
}

export interface CreateDepartureData {
  packageId: string;
  departAt: string;
  returnAt: string;
  capacity: number;
  status?: 'active' | 'cancelled' | 'completed';
}

export interface UpdateDepartureData {
  packageId?: string;
  departAt?: string;
  returnAt?: string;
  capacity?: number;
  status?: 'active' | 'cancelled' | 'completed';
}

export interface DepartureFilters {
  packageId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface DepartureListResponse {
  data: Departure[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getDepartures(filters: DepartureFilters = {}): Promise<DepartureListResponse> {
  const params: Record<string, any> = {};
  if (filters.packageId) {
    params.packageId = filters.packageId;
  }
  if (filters.search) {
    params.search = filters.search;
  }
  if (filters.dateFrom) {
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    params.dateTo = filters.dateTo;
  }
  if (filters.status) {
    params.status = filters.status;
  }
  if (filters.page !== undefined) {
    params.page = filters.page;
  }
  if (filters.limit !== undefined) {
    params.limit = filters.limit;
  }

  const { data } = await get<DepartureListResponse>("/departures", { params });
  return data;
}

export async function getDeparture(id: string): Promise<Departure> {
  const { data } = await get<Departure>(`/departures/${id}`);
  return data;
}

export async function createDeparture(departureData: CreateDepartureData): Promise<Departure> {
  const { data } = await post<Departure>('/departures', departureData);
  return data;
}

export async function updateDeparture(id: string, departureData: UpdateDepartureData): Promise<Departure> {
  const { data } = await patch<Departure>(`/departures/${id}`, departureData);
  return data;
}

export async function deleteDeparture(id: string): Promise<void> {
  await del(`/departures/${id}`);
}
