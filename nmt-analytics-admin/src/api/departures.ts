import { get, post, patch, del } from './client';

export interface DepartureCapabilities {
  transportType: "bus" | "flight" | "none";
  hasBusTransport: boolean;
  hasFlight: boolean;
  flightConfigured?: boolean;
  hasManagedSeatLayout: boolean;
  hasAccommodation: boolean;
  needTravelDocuments?: boolean;
}

export interface LinkedFlight {
  id: string;
  airline: string;
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time: string;
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
  transport_mode?: string;
  transport_capacity?: number | null;
  // --- Phase 1 domain wiring ---
  capabilities?: DepartureCapabilities;
  linkedFlight?: LinkedFlight | null;
  documentReadiness?: {
    required: boolean;
    totalRelevant: number;
    ready: number;
    missing: number;
    expiredBeforeDeparture: number;
    expiredBeforeReturn: number;
  };
  packageServices?: any[];
  packageHotels?: any[];
  hotelAllocations?: any[];
  accommodationBuildings?: any[];
  passengerGroups?: any[];
}

export interface DepartureAccommodationAllotment {
  id: string;
  departureId: string;
  hotelId: string;
  packageHotelId: string | null;
  roomType: string;
  roomLabel: string;
  templateRooms: number;
  departureRooms: number;
  roomsReserved: number;
  capacityPerRoom: number;
  capacity: number;
  allocated: number;
  available: number;
  checkIn: string;
  checkOut: string;
  netPrice: number;
  sellPrice: number;
  pricePerNight: number;
  sortOrder: number;
  hotel?: {
    id: string;
    name: string;
    destination?: string | null;
    stars?: number | null;
  } | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface DepartureAccommodationResponse {
  departureId: string;
  items: DepartureAccommodationAllotment[];
}


export interface ReadinessDeparture {
  departureId: string;
  hasFlight: boolean;
  flightConfigured: boolean;
  needTravelDocuments: boolean;
  hasAccommodation: boolean;
  documentIssues: number;
  splitOrPartialGroups: number;
  unassignedAccommodation: number;
  departureLabel: string;
  accommodationConfigured: boolean;
}

export interface ReadinessSummary {
  departures: ReadinessDeparture[];
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
  flight_id?: string | null;
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

export async function getDepartureAccommodationAllotments(id: string): Promise<DepartureAccommodationResponse> {
  const { data } = await get<DepartureAccommodationResponse>(`/departures/${id}/accommodation-allotments`);
  return data;
}

export async function updateDepartureAccommodationAllotment(
  departureId: string,
  itemId: string,
  roomCount: number,
): Promise<DepartureAccommodationAllotment> {
  const { data } = await patch<DepartureAccommodationAllotment>(
    `/departures/${departureId}/accommodation-allotments/${itemId}`,
    { roomCount },
  );
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
  // Snake-case aliases for raw Supabase responses
  full_name?: string;
  passport_number?: string | null;
  seat_number?: string | number | null;
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
  capabilities?: DepartureCapabilities;
  documentReadiness?: {
    required: boolean;
    totalRelevant: number;
    ready: number;
    missing: number;
    expiredBeforeDeparture: number;
    expiredBeforeReturn: number;
  };
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

// ── Passenger Groups (Društva) ──

export interface PassengerGroupMember {
  id: string;
  group_id: string;
  passenger_id: string;
  reservation_id: string | null;
  is_primary?: boolean;
}

export interface PassengerGroup {
  id: string;
  name: string | null;
  color: string | null;
  seating_preference: string;
  accommodation_preference: string;
  notes: string | null;
  locked?: boolean;
  primary_passenger_id: string | null;
  primary_passenger_name?: string | null;
  members: PassengerGroupMember[];
}

export async function getPassengerGroups(departureId: string): Promise<PassengerGroup[]> {
  const { data } = await get<PassengerGroup[]>(`/departures/${departureId}/passenger-groups`);
  return data;
}

export interface CreateGroupPayload {
  name?: string;
  notes?: string | null;
  seatingPreference?: string;
  accommodationPreference?: string;
  memberIds: string[];
}

export async function createPassengerGroup(departureId: string, payload: CreateGroupPayload): Promise<PassengerGroup> {
  const { data } = await post<PassengerGroup>(`/departures/${departureId}/passenger-groups`, payload);
  return data;
}

export interface UpdateGroupPayload {
  name?: string;
  color?: string;
  notes?: string | null;
  seatingPreference?: string;
  accommodationPreference?: string;
  locked?: boolean;
}

export async function updatePassengerGroup(groupId: string, payload: UpdateGroupPayload): Promise<PassengerGroup> {
  const { data } = await patch<PassengerGroup>(`/passenger-groups/${groupId}`, payload);
  return data;
}

export async function deletePassengerGroup(groupId: string): Promise<void> {
  await del(`/passenger-groups/${groupId}`);
}

export async function addGroupMember(groupId: string, passengerId: string): Promise<{ added: boolean }> {
  const { data } = await post<{ added: boolean }>(`/passenger-groups/${groupId}/members`, { passengerId });
  return data;
}

export async function removeGroupMember(groupId: string, memberId: string): Promise<void> {
  await del(`/passenger-groups/${groupId}/members/${memberId}`);
}

export interface UpdatePassengerDocumentData {
  id_document_type?: string | null;
  id_document_number?: string | null;
  id_document_expiry?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
}

export interface CreateDeparturePassengerData {
  reservation_id: string;
  departure_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  nationality?: string;
  date_of_birth?: string;
}

export interface UpdateDeparturePassengerData {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  id_document_type?: string | null;
  id_document_number?: string | null;
  id_document_expiry?: string | null;
  notes?: string | null;
}

export async function createDeparturePassenger(data: CreateDeparturePassengerData) {
  const { data: result } = await post('/departure-passengers', data);
  return result;
}

export async function deleteDeparturePassenger(passengerId: string): Promise<void> {
  await del('/departure-passengers/' + passengerId);
}

export async function updateDeparturePassenger(passengerId: string, data: UpdateDeparturePassengerData) {
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
  // Flat accessors mirroring summary + UI fields
  items?: RoomingProposalItem[];
  placedCount?: number;
  unplacedCount?: number;
  groupsKeptTogether?: number;
  groupsSplit?: number;
  groups?: RoomingGroupSummary[];
}

export interface RoomingProposalApplyItem {
  passengerId: string;
  roomId: string;
}

function normalizeRoomingProposal(proposal: RoomingProposal): RoomingProposal {
  return {
    ...proposal,
    items: proposal.items ?? proposal.assignments,
    placedCount: proposal.placedCount ?? proposal.summary?.passengersProposed ?? proposal.assignments.length,
    unplacedCount: proposal.unplacedCount ?? proposal.summary?.unplacedCount ?? proposal.unplaced.length,
    groupsKeptTogether:
      proposal.groupsKeptTogether ?? proposal.summary?.groupsTogether ?? proposal.groupResults.filter((group) => group.status === 'together').length,
    groupsSplit:
      proposal.groupsSplit ?? proposal.summary?.groupsSplit ?? proposal.groupResults.filter((group) => group.status === 'split').length,
    groups: proposal.groups ?? proposal.groupResults,
  };
}

export async function generateRoomingProposal(departureId: string): Promise<RoomingProposal> {
  const r = await post<RoomingProposal>(`/departures/${departureId}/rooming/proposal`, {});
  return normalizeRoomingProposal(r.data);
}

export async function applyRoomingProposal(
  departureId: string,
  assignmentIds: string[],
  proposalAssignments: RoomingProposalApplyItem[],
): Promise<{ applied: number }> {
  const r = await post<{ applied: number }>(`/departures/${departureId}/rooming/apply`, {
    assignmentIds,
    proposalAssignments,
  });
  return r.data;
}



export async function moveAccommodationAssignment(assignmentId: string, targetRoomId: string, bedLabel?: string | null): Promise<AccommodationAssignment> {
  const res = await post(`/accommodation/assignments/${assignmentId}/move`, { targetRoomId, bedLabel: bedLabel || null });
  return res.data;
}
