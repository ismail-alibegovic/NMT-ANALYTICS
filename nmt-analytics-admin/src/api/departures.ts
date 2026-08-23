import { get, post, patch, del } from './client';

export interface DepartureCapabilities {
  transportType: "bus" | "flight" | "none";
  hasBusTransport: boolean;
  hasFlight: boolean;
  hasManagedSeatLayout: boolean;
  hasAccommodation: boolean;
}

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
  // --- Phase 1 domain wiring ---
  capabilities?: DepartureCapabilities;
  packageServices?: any[];
  packageHotels?: any[];
  hotelAllocations?: any[];
  accommodationBuildings?: any[];
  passengerGroups?: any[];
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

export type PassengerDocumentStatus =
  | "not_required"
  | "ready"
  | "missing"
  | "expired_before_departure"
  | "expired_before_return";

export interface DeparturePassenger {
  id?: string | null;
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
  // Document fields
  id_document_type?: string | null;
  id_document_number?: string | null;
  id_document_expiry?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  documentReadinessStatus?: string | null;
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



export async function updatePassengerSeat(passengerId: string, seatNumber: number | null) {
  const { data } = await patch(`/departure-passengers/${passengerId}`, { seat_number: seatNumber });
  return data;
}

export async function getDepartureGroups(id: string): Promise<{ byHotel: DepartureGroup[]; byAgent: DepartureGroup[] }> {
  const { data } = await get<{ byHotel: DepartureGroup[]; byAgent: DepartureGroup[] }>(`/departures/${id}/groups`);
  return data;
}

export interface UpdatePassengerDocumentData {
  id_document_type?: string | null;
  id_document_number?: string | null;
  id_document_expiry?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
}

export async function updateDeparturePassenger(passengerId: string, data: UpdatePassengerDocumentData) {
  const { data: result } = await patch(`/departure-passengers/${passengerId}`, data);
  return result;
}


// ─── Accommodation Rooming API ─────────────────────────────────────────────

export interface AccommodationBuilding {
  id: string;
  name: string;
  type: 'hotel' | 'hostel' | 'dormitory' | 'apartment' | 'other';
  departure_id: string;
  org_id: string;
  address?: string;
  contact?: string;
  notes?: string;
  floors?: AccommodationFloor[];
}

export interface AccommodationFloor {
  id: string;
  building_id: string;
  floor_number: number;
  label?: string;
  rooms?: AccommodationRoom[];
}

export interface AccommodationRoom {
  id: string;
  floor_id: string;
  building_id: string;
  room_number: string;
  type: 'single' | 'double' | 'triple' | 'quadruple' | 'custom';
  capacity: number;
  beds?: AccommodationBed[];
  notes?: string;
  assignments?: AccommodationAssignment[];
}

export interface AccommodationBed {
  label: string;
  assignedPassengerId?: string | null;
}

export interface AccommodationAssignment {
  id: string;
  room_id: string;
  passenger_id: string | null;
  passenger_name: string;
  bed_label?: string | null;
  reservation_id?: string | null;
  assigned_by?: string | null;
}

export async function getAccommodationBuildings(departureId: string): Promise<AccommodationBuilding[]> {
  const res = await get(`/departures/${departureId}/accommodation`);
  return res.data ?? [];
}

export async function assignPassengerToRoom(
  roomId: string,
  passengerId: string,
  passengerName: string,
  reservationId: string,
  bedLabel?: string | null
): Promise<AccommodationAssignment> {
  const res = await post(`/accommodation/rooms/${roomId}/assign`, {
    roomId, passengerId, passengerName, reservationId, bedLabel: bedLabel || null,
  });
  return res.data;
}

export async function unassignPassengerFromRoom(assignmentId: string): Promise<void> {
  await del(`/accommodation/assignments/${assignmentId}`);
}

// ── Phase 6C: Auto-Rooming ──
export interface RoomingProposalItem {
  passengerId: string;
  passengerName: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  roomId: string;
  roomNumber: string;
  buildingName: string;
  floorNumber: number;
  floorLabel: string | null;
}

export interface RoomingGroupSummary {
  groupId: string;
  groupName: string | null;
  groupColor: string | null;
  status: 'together' | 'split' | 'partial' | 'unassigned';
  memberCount: number;
  assignedCount: number;
  assignedRoomIds: string[];
}

export interface RoomingProposal {
  assignments: RoomingProposalItem[];
  groupResults: RoomingGroupSummary[];
  unplaced: { id: string; fullName: string }[];
  warnings: string[];
  summary: {
    totalPassengers: number;
    passengersProposed: number;
    groupsTogether: number;
    groupsSplit: number;
    unplacedCount: number;
    remainingCapacity: number;
  };
}

export async function generateRoomingProposal(departureId: string): Promise<RoomingProposal> {
  const r = await post<RoomingProposal>(`/departures/${departureId}/rooming/proposal`, {});
  return r.data;
}

export async function applyRoomingProposal(departureId: string, assignmentIds: string[]): Promise<{ applied: number }> {
  const r = await post<{ applied: number }>(`/departures/${departureId}/rooming/apply`, { assignmentIds });
  return r.data;
}
