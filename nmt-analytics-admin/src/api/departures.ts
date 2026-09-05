import { get, post, patch, put, del } from './client';
import type { TravelerRequirements } from './packages';

export interface DepartureCapabilities {
  transportType: "bus" | "flight" | "none";
  hasBusTransport: boolean;
  hasFlight: boolean;
  flightConfigured?: boolean;
  hasManagedSeatLayout: boolean;
  hasAccommodation: boolean;
  needTravelDocuments?: boolean;
  travelerRequirements?: Required<TravelerRequirements>;
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
  travelerRequirements?: TravelerRequirements | null;
  resolvedTravelerRequirements?: Required<TravelerRequirements>;
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
  reservedRooms?: number;
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
  travelerRequirements?: TravelerRequirements | null;
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
  travelerRequirements?: TravelerRequirements | null;
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

export interface DepartureAccommodationOption {
  id: string;
  departureId: string;
  hotelId: string;
  roomType: string;
  roomLabel: string;
  departureRooms: number;
  reservedRooms: number;
  availableRooms: number;
  capacityPerRoom: number;
  availableGuestCapacity: number;
  unitSellPrice: number;
  unitNetPrice: number;
  checkIn: string;
  checkOut: string;
  hotel?: {
    id: string;
    name: string;
    destination?: string | null;
    stars?: number | null;
  } | null;
}

export interface DepartureAccommodationOptionsResponse {
  departureId: string;
  items: DepartureAccommodationOption[];
}

export async function getDepartureAccommodationOptions(id: string, reservationId?: string): Promise<DepartureAccommodationOptionsResponse> {
  const query = reservationId ? `?reservationId=${encodeURIComponent(reservationId)}` : '';
  const { data } = await get<DepartureAccommodationOptionsResponse>(`/departures/${id}/accommodation-options${query}`);
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
  hotelId?: string | null;
  hotelAllocationId?: string | null;
  reservationAccommodationRequirementId?: string | null;
  roomType?: string | null;
  accommodationNotes?: string | null;
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
  seat_is_manual?: boolean;
  seat_locked?: boolean;
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

// ── M11 Manual Bus Seating ──────────────────────────────────────────────────────


/** Canonical seat metadata from departure_vehicle_seats */
export interface VehicleSeat {
  id: string;
  seat_number: number;
  seat_label: string;
  row_number: number;
  column_index: number;
  side: 'left' | 'right' | 'aisle' | string;
  is_active: boolean;
}

export interface DepartureVehicleResponse {
  vehicle: {
    id: string;
    departure_id: string;
    org_id: string;
    vehicle_label: string;
    registration_number: string | null;
    capacity: number;
    layout_type: string;
    created_at: string;
    updated_at: string;
  } | null;
  seats: VehicleSeat[];
}

export async function getDepartureVehicle(departureId: string): Promise<DepartureVehicleResponse> {
  const { data } = await get<DepartureVehicleResponse>(`/departures/${departureId}/vehicle`);
  return data;
}

export interface UpdateDepartureVehicleData {
  vehicleLabel?: string;
  registrationNumber?: string | null;
  capacity?: number;
  layoutType?: 'standard_2_plus_2';
}

export async function updateDepartureVehicle(
  departureId: string,
  payload: UpdateDepartureVehicleData,
): Promise<DepartureVehicleResponse> {
  const { data } = await put<DepartureVehicleResponse>(`/departures/${departureId}/vehicle`, payload);
  return data;
}

/**
 * Canonical M11 manual seat assign / unassign.
 * Never uses the generic updatePassengerSeat (which patches seat_number via old endpoint).
 */
export async function assignPassengerSeat(passengerId: string, seatNumber: number | null): Promise<any> {
  const { data } = await patch(`/departure-passengers/${passengerId}/seat`, { seatNumber });
  return data;
}

/**
 * Canonical M11 seat lock / unlock.
 */
export async function lockPassengerSeat(passengerId: string, locked: boolean): Promise<any> {
  const { data } = await patch(`/departure-passengers/${passengerId}/seat-lock`, { locked });
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
  primaryPassengerId?: string;
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

export interface ReplacePassengerGroupMembersPayload {
  memberIds: string[];
  primaryPassengerId: string;
}

export async function replacePassengerGroupMembers(
  groupId: string,
  payload: ReplacePassengerGroupMembersPayload,
): Promise<PassengerGroup> {
  const { data } = await put<PassengerGroup>(`/passenger-groups/${groupId}/members`, payload);
  return data;
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

export interface DepartureRoomSlotAssignment {
  id: string;
  passengerId: string;
  reservationId?: string | null;
  passengerName: string;
  isManual: boolean;
  locked: boolean;
  createdAt?: string;
}

export interface DepartureRoomSlot {
  id: string;
  departureId: string;
  hotelAllocationId: string;
  hotelId: string;
  roomType: string;
  slotNumber: number;
  displayLabel: string;
  capacity: number;
  actualHotelRoomNumber?: string | null;
  notes?: string | null;
  hotel?: {
    id: string;
    name: string;
    destination?: string | null;
    stars?: number | null;
  } | null;
  assignments: DepartureRoomSlotAssignment[];
}

export async function getDepartureRoomSlots(departureId: string): Promise<DepartureRoomSlot[]> {
  const { data } = await get<{ departureId: string; slots: DepartureRoomSlot[] }>(`/departures/${departureId}/room-slots`);
  return data.slots || [];
}

export async function assignPassengerToRoomSlot(slotId: string, passengerId: string) {
  const { data } = await post(`/room-slots/${slotId}/assign`, { passengerId });
  return data;
}

export async function unassignPassengerFromRoomSlot(assignmentId: string): Promise<void> {
  await del(`/room-slot-assignments/${assignmentId}`);
}

export async function moveRoomSlotAssignment(assignmentId: string, targetSlotId: string) {
  const { data } = await post(`/room-slot-assignments/${assignmentId}/move`, { targetSlotId });
  return data;
}

export async function setRoomSlotAssignmentLocked(assignmentId: string, locked: boolean): Promise<DepartureRoomSlotAssignment> {
  const { data } = await patch<DepartureRoomSlotAssignment>(`/room-slot-assignments/${assignmentId}/lock`, { locked });
  return data;
}

export async function updateRoomSlotPhysicalNumber(slotId: string, actualHotelRoomNumber: string | null): Promise<DepartureRoomSlot> {
  const { data } = await patch<DepartureRoomSlot>(`/room-slots/${slotId}`, { actualHotelRoomNumber });
  return data;
}

export interface RoomingProposalPassenger {
  passengerId: string;
  passengerName: string;
  slotId: string | null;
  slotLabel?: string;
  reason?: string;
  message?: string;
}

export interface RoomingProposalSummary {
  totalPassengers: number;
  fixedManualLocked: number;
  proposedNew: number;
  unresolved: number;
}

export interface RoomingProposalOutput {
  departureId: string;
  stateFingerprint: string;
  summary: RoomingProposalSummary;
  fixedAssignments: RoomingProposalPassenger[];
  replaceableAssignmentIds: string[];
  proposedAssignments: RoomingProposalPassenger[];
  unresolved: RoomingProposalPassenger[];
  warnings: string[];
}

export async function generateOperationalRoomingProposal(departureId: string): Promise<RoomingProposalOutput> {
  const { data } = await post<RoomingProposalOutput>(`/departures/${departureId}/rooming/proposal`, {});
  return data;
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

export async function generateRoomingProposal(departureId: string): Promise<RoomingProposal> {
  const r = await post<RoomingProposal>(`/departures/${departureId}/rooming/proposal`, {});
  return r.data;
}

export interface ApplyRoomingProposalInput {
  stateFingerprint: string;
  proposedAssignments: { passengerId: string; roomSlotId: string }[];
  replaceableAssignmentIds: string[];
}

export interface ApplyRoomingProposalResult {
  deletedCount: number;
  insertedCount: number;
}

export async function applyRoomingProposal(
  departureId: string,
  input: ApplyRoomingProposalInput,
): Promise<ApplyRoomingProposalResult> {
  const r = await post<ApplyRoomingProposalResult>(`/departures/${departureId}/rooming/apply`, input);
  return r.data;
}



export async function moveAccommodationAssignment(assignmentId: string, targetRoomId: string, bedLabel?: string | null): Promise<AccommodationAssignment> {
  const res = await post(`/accommodation/assignments/${assignmentId}/move`, { targetRoomId, bedLabel: bedLabel || null });
  return res.data;
}
