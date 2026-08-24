import { get, post, patch, del } from './client';

// ─── Sub-agents ───────────────────────────────────────────────
export interface SubAgent {
  id: string;
  orgId: string;
  name: string;
  phone: string | null;
  email: string | null;
  commissionRate: number;
  partnerType: 'bronze' | 'silver' | 'gold' | 'platinum';
  portalTokenExpiresAt: string | null;
  portalLastSeenAt: string | null;
  isActive: boolean;
  createdAt: string;
  sales?: any[];
}

export async function getSubAgents(): Promise<SubAgent[]> {
  const { data } = await get<{ data: SubAgent[] }>('/subagents');
  return data.data || [];
}

export async function createSubAgent(payload: { name: string; phone?: string; email?: string; commissionRate?: number; partnerType?: string }): Promise<SubAgent> {
  const { data } = await post<SubAgent>('/subagents', payload);
  return data;
}

export async function updateSubAgent(id: string, payload: Partial<SubAgent>): Promise<SubAgent> {
  const { data } = await patch<SubAgent>(`/subagents/${id}`, payload);
  return data;
}

export async function deleteSubAgent(id: string): Promise<void> {
  await del(`/subagents/${id}`);
}

export async function generateSubAgentSale(subAgentId: string, body: Record<string, unknown>): Promise<Blob> {
  const api = (await import('../lib/apiClient')).default;
  const res = await api.post(`/subagents/${subAgentId}/generate-sale`, body, { responseType: 'blob' });
  return res.data as Blob;
}

// ─── Sub-agent portal tokens ─────────────────────────────────
export async function issueSubAgentPortalToken(id: string, ttlDays = 90): Promise<{ token: string; portalUrl: string; expiresAt: string; message: string }> {
  const { data } = await post<{ token: string; portalUrl: string; expiresAt: string; message: string }>(`/subagents/${id}/portal-token`, { ttlDays });
  return data;
}

export async function revokeSubAgentPortalToken(id: string): Promise<{ message: string }> {
  const { data } = await post<{ message: string }>(`/subagents/${id}/portal-token/revoke`, {});
  return data;
}

// ─── Excursions ───────────────────────────────────────────────
export interface ExcursionPassenger {
  id: string;
  reservationId: string;
  fullName: string;
  phone: string | null;
  idDocument: string | null;
  seatNumber: number;
  paidAmount: number;
  totalAmount: number;
  debtAmount: number;
  notes: string | null;
  createdAt: string;
}

export async function getExcursionPassengers(reservationId?: string): Promise<ExcursionPassenger[]> {
  const { data } = await get<{ data: ExcursionPassenger[] }>('/excursions', {
    params: reservationId ? { reservationId } : {},
  });
  return data.data || [];
}

export async function createExcursionPassenger(payload: {
  reservationId: string;
  fullName: string;
  phone?: string;
  idDocument?: string;
  seatNumber?: number;
  paidAmount?: number;
  notes?: string;
}): Promise<ExcursionPassenger> {
  const { data } = await post<ExcursionPassenger>('/excursions', payload);
  return data;
}

export async function updateExcursionPassenger(id: string, payload: {
  fullName?: string;
  phone?: string;
  idDocument?: string;
  seatNumber?: number;
  paidAmount?: number;
  notes?: string;
}): Promise<ExcursionPassenger> {
  const { data } = await patch<ExcursionPassenger>(`/excursions/${id}`, payload);
  return data;
}

export async function deleteExcursionPassenger(id: string): Promise<void> {
  await del(`/excursions/${id}`);
}

export async function downloadBusListPDF(reservationId: string): Promise<Blob> {
  const api = (await import('../lib/apiClient')).default;
  const res = await api.get(`/excursions/${reservationId}/bus-list`, { responseType: 'blob' });
  return res.data as Blob;
}

export async function downloadRumingListPDF(departureId: string): Promise<Blob> {
  const api = (await import('../lib/apiClient')).default;
  const res = await api.get(`/excursions/${departureId}/ruming-list`, { responseType: 'blob' });
  return res.data as Blob;
}

// ─── Hotels ───────────────────────────────────────────────────
export interface Hotel {
  id: string;
  orgId: string;
  name: string;
  destination: string;
  address: string | null;
  contact: string | null;
  totalRooms: number;
  createdAt: string;
  rooms?: HotelRoom[];
  stars?: number | null;
  description?: string | null;
  amenities?: string[] | null;
  email?: string | null;
  website?: string | null;
  allocations?: HotelAllocation[];
}

export interface HotelRoom {
  id: string;
  hotelId: string;
  roomType: string;
  capacity: number;
  basePrice: number;
  currency: string;
  available: number;
  total: number;
}

export interface HotelAllocation {
  id: string;
  departureId: string;
  hotelId: string;
  roomType: string;
  roomsReserved: number;
  checkIn: string;
  checkOut: string;
  pricePerNight: number;
}

function normalizeHotelRoom(row: any): HotelRoom {
  return {
    id: row.id,
    hotelId: row.hotelId ?? row.hotel_id,
    roomType: row.roomType ?? row.room_type,
    capacity: row.capacity,
    basePrice: row.basePrice ?? row.base_price,
    currency: row.currency,
    available: row.available,
    total: row.total,
  };
}

function normalizeHotelAllocation(row: any): HotelAllocation {
  return {
    id: row.id,
    departureId: row.departureId ?? row.departure_id,
    hotelId: row.hotelId ?? row.hotel_id,
    roomType: row.roomType ?? row.room_type,
    roomsReserved: row.roomsReserved ?? row.rooms_reserved,
    checkIn: row.checkIn ?? row.check_in,
    checkOut: row.checkOut ?? row.check_out,
    pricePerNight: row.pricePerNight ?? row.price_per_night,
  };
}

function normalizeHotel(row: any): Hotel {
  return {
    id: row.id,
    orgId: row.orgId ?? row.org_id,
    name: row.name,
    destination: row.destination,
    address: row.address,
    contact: row.contact,
    totalRooms: row.totalRooms ?? row.total_rooms,
    createdAt: row.createdAt ?? row.created_at,
    stars: row.stars ?? null,
    description: row.description ?? null,
    amenities: row.amenities ?? null,
    email: row.email ?? null,
    website: row.website ?? null,
    rooms: (row.rooms ?? row.hotel_rooms ?? []).map(normalizeHotelRoom),
    allocations: (row.allocations ?? row.hotel_allocations ?? []).map(normalizeHotelAllocation),
  };
}

export async function getHotels(): Promise<Hotel[]> {
  const { data } = await get<{ data: Hotel[] }>('/hotels');
  return (data.data || []).map((row: any) => normalizeHotel(row));
}

export async function createHotel(payload: {
  name: string;
  destination: string;
  address?: string;
  contact?: string;
  totalRooms?: number;
  stars?: number | null;
  description?: string | null;
  amenities?: string[] | null;
  email?: string | null;
  website?: string | null;
}): Promise<Hotel> {
  const { data } = await post<Hotel>('/hotels', payload);
  return data;
}

export async function updateHotel(id: string, payload: Partial<Hotel>): Promise<Hotel> {
  const { data } = await patch<Hotel>(`/hotels/${id}`, payload);
  return data;
}

export async function deleteHotel(id: string): Promise<void> {
  await del(`/hotels/${id}`);
}

export async function getHotelRooms(hotelId: string): Promise<HotelRoom[]> {
  const { data } = await get<{ data: HotelRoom[] }>(`/hotels/${hotelId}/rooms`);
  const rows = Array.isArray(data) ? data : data.data || [];
  return rows.map((row: any) => normalizeHotelRoom(row));
}

export async function createHotelRoom(hotelId: string, payload: {
  roomType: string;
  capacity: number;
  basePrice: number;
  currency?: string;
}): Promise<HotelRoom> {
  const { data } = await post<HotelRoom>(`/hotels/${hotelId}/rooms`, payload);
  return data;
}

export async function updateHotelRoom(roomId: string, payload: Partial<HotelRoom>): Promise<HotelRoom> {
  const { data } = await patch<HotelRoom>(`/hotel-rooms/${roomId}`, payload);
  return data;
}

export async function deleteHotelRoom(roomId: string): Promise<void> {
  await del(`/hotel-rooms/${roomId}`);
}

export async function createHotelAllocation(departureId: string, payload: {
  hotelId: string;
  roomType: string;
  roomsReserved: number;
  checkIn: string;
  checkOut: string;
  pricePerNight: number;
}): Promise<HotelAllocation> {
  const { data } = await post<HotelAllocation>(`/departures/${departureId}/allocations`, payload);
  return data;
}

// ─── Package Services ─────────────────────────────────────────
export interface PackageService {
  id: string;
  packageId: string;
  serviceType: 'hotel' | 'transport' | 'tour' | 'insurance' | 'extra';
  providerName: string;
  providerContact: string | null;
  unitPrice: number;
  currency: string;
  quantity: number;
  totalPrice: number;
  description: string | null;
  isOptional: boolean;
  createdAt: string;
}

export async function getPackageServices(packageId: string): Promise<PackageService[]> {
  const { data } = await get<{ data: PackageService[] }>(`/package-services/${packageId}`);
  return data.data || [];
}

export async function createPackageService(packageId: string, payload: {
  serviceType: string;
  providerName: string;
  unitPrice: number;
  quantity?: number;
  description?: string;
  isOptional?: boolean;
}): Promise<PackageService> {
  const { data } = await post<PackageService>(`/package-services/${packageId}/services`, payload);
  return data;
}

export async function updatePackageService(serviceId: string, payload: Partial<PackageService>): Promise<PackageService> {
  const { data } = await patch<PackageService>(`/package-services/${serviceId}`, payload);
  return data;
}

export async function deletePackageService(serviceId: string): Promise<void> {
  await del(`/package-services/${serviceId}`);
}
// ─── eTurista ──────────────────────────────────────────────
export interface ETuristaSubmission {
  id: string;
  submissionDate: string;
  departureId: string;
  guestCount: number;
  responseStatus: string;
  createdAt: string;
}

export async function submitETurista(): Promise<{ message: string; id: string }> {
  const { data } = await post<{ message: string; id: string }>('/integrations/eturista/submit', {});
  return data;
}

export async function getETuristaHistory(): Promise<ETuristaSubmission[]> {
  const { data } = await get<{ data: ETuristaSubmission[] }>('/integrations/eturista/history');
  return data.data || [];
}

// ─── Commission Rules ────────────────────────────────────────
export interface CommissionRule {
  id: string;
  partnerType: 'bronze' | 'silver' | 'gold' | 'platinum';
  serviceType: string | null;
  commissionPct: number;
  markupPct: number;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export async function getCommissionRules(): Promise<CommissionRule[]> {
  const { data } = await get<{ data: CommissionRule[] }>('/commission-rules');
  return data.data || [];
}

export async function createCommissionRule(payload: {
  partnerType: string;
  serviceType: string | null;
  commissionPct: number;
  markupPct: number;
  isActive: boolean;
  priority: number;
}): Promise<CommissionRule> {
  const { data } = await post<CommissionRule>('/commission-rules', payload);
  return data;
}

export async function updateCommissionRule(id: string, payload: Partial<CommissionRule>): Promise<CommissionRule> {
  const { data } = await patch<CommissionRule>(`/commission-rules/${id}`, payload);
  return data;
}

export async function deleteCommissionRule(id: string): Promise<void> {
  await del(`/commission-rules/${id}`);
}

export async function previewCommission(
  partnerType: string,
  bookingAmount: number,
  serviceType?: string,
): Promise<{ matchedRule: CommissionRule | null; commissionAmount: number; finalAmount: number; breakdown: any }> {
  const { data } = await get<any>('/commission-rules/preview', {
    params: { partnerType, bookingAmount, serviceType },
  });
  return data.data || data;
}
// ─── Flights ────────────────────────────────────────────────────────────
export interface Flight {
  id: string;
  orgId: string;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  capacity: number;
  basePrice: number;
  currency: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  linkedDepartureCount?: number;
  linkedDepartures?: Array<{
    id: string;
    departAt: string;
    returnAt: string;
    status: 'active' | 'cancelled' | 'completed';
    packageName: string;
    destination: string;
  }>;
}

export async function getFlights(params?: { search?: string; active?: string }): Promise<Flight[]> {
  const { data } = await get<{ data: Flight[] }>('/flights', params);
  return data.data || [];
}

export async function createFlight(payload: {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  capacity?: number;
  basePrice?: number;
  currency?: string;
  notes?: string;
  active?: boolean;
}): Promise<Flight> {
  const { data } = await post<Flight>('/flights', payload);
  return data;
}

export async function deleteFlight(id: string): Promise<void> {
  await del(`/flights/${id}`);
}
