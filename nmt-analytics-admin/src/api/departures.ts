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
  // --- Nova Prodaja wizard support (migration 036) ---
  transport_type?: 'bus' | 'flight' | 'none';
  transport_capacity?: number | null;
}

export interface CreateDepartureData {
  packageId: string;
  departAt: string;
  returnAt: string;
  capacity: number;
  status?: 'active' | 'cancelled' | 'completed';
  booked?: number;
  transportType?: 'bus' | 'flight' | 'none';
}

export interface UpdateDepartureData {
  packageId?: string;
  departAt?: string;
  returnAt?: string;
  capacity?: number;
  booked?: number;
  status?: 'active' | 'cancelled' | 'completed';
  transportType?: 'bus' | 'flight' | 'none';
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

export interface DeparturePassenger {
  passengerId?: string | null;
  reservationId: string;
  customerId?: string | null;
  customerLinked?: boolean;
  fullName: string;
  phone?: string;
  email?: string;
  seat?: string | number | null;
  seatCategory?: string | null;
  groupName?: string | null;
  groupId?: string | null;
  groupColor?: string | null;
  groupSize?: number;
  groupMemberIds?: string[];
  passengerGroupName?: string | null;
  hotelName?: string | null;
  roomType?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  tourGuide?: string | null;
  paid?: number;
  debt?: number;
  paidAmount?: number;
  debtAmount?: number;
  status?: 'confirmed' | 'pending' | 'cancelled';
  reservationStatus?: 'confirmed' | 'pending' | 'cancelled';
  source?: string;
  agent?: string | null;
  partySize?: number;
  reservationTotal?: number;
  currency?: string;
  payments?: any[];
  notes?: string | null;
}

export interface DepartureManifest {
  departure?: {
    id: string;
    departAt?: string;
    returnAt?: string;
    capacity?: number;
    booked?: number;
    package?: {
      id: string;
      name: string;
      destination?: string;
      base_price?: number;
      currency?: string;
    };
  };
  summary: {
    totalReservations?: number;
    totalGuests?: number;
    confirmedGuests?: number;
    bookedVsCapacity?: string;
    fillRate?: number;
    totalPaid?: number;
    totalDebt?: number;
    currency?: string;
    guides?: string[];
    hotels?: any[];
    allocations?: any[];
  };
  manifest: DeparturePassenger[];
}

export async function getDeparturePassengers(id: string): Promise<DepartureManifest> {
  const { data } = await get<DepartureManifest>(`/departures/${id}/passengers`);
  return data;
}

export interface DepartureGroup {
  label: string;
  count: number;
  passengers: DeparturePassenger[];
}

export async function getDepartureGroups(id: string): Promise<{ byHotel: DepartureGroup[]; byAgent: DepartureGroup[] }> {
  const { data } = await get<{ byHotel: DepartureGroup[]; byAgent: DepartureGroup[] }>(`/departures/${id}/groups`);
  return data;
}
