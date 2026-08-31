import { get, post, put, patch, del } from './client';

export interface Reservation {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  departureId: string;
  departureName: string;
  packageId: string;
  packageName: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  remainingAmount: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'refunded';
  currency: string;
  participants: number;
  partySize?: number;
  bookingDate: string;
  reservationAt?: string;
  notes?: string;
  options?: Record<string, any>;
  source?: string;
  createdAt: string;
  updatedAt: string;
  accommodationRequirements?: ReservationAccommodationRequirement[];
}

export interface ReservationAccommodationRequirement {
  id: string;
  reservationId: string;
  departureId: string;
  hotelAllocationId: string;
  hotelId: string;
  roomType: string;
  roomLabel: string;
  roomCount: number;
  guestsExpected: number;
  capacityPerRoom: number;
  unitSellPrice: number;
  unitNetPrice: number;
  totalSellPrice: number;
  notes?: string | null;
  passengerIds?: string[];
  hotel?: {
    id: string;
    name: string;
    destination?: string | null;
    stars?: number | null;
  } | null;
}

export interface ReservationAccommodationRequirementInput {
  hotelAllocationId: string;
  roomCount: number;
  guestsExpected: number;
  notes?: string | null;
  passengerIds?: string[];
  passengerIndexes?: number[];
}

export interface CreateReservationData {
  customerName: string;
  customerPhone: string;
  partySize: number;
  /** ISO date string. Defaults to now if omitted on the backend. */
  reservationAt?: string;
  departureId?: string;
  customerId?: string;
  totalAmount?: number;
  currency?: string;
  status?: 'pending' | 'confirmed' | 'cancelled';
  source?: 'phone' | 'agent' | 'walk-in' | 'web' | 'other';
  // --- Nova Prodaja wizard selections (handled by backend, persisted to reservations.*) ---
  options?: Record<string, any>;
  notes?: string | null;
  hotelName?: string | null;
  roomType?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  tourGuide?: string | null;
  excursionIds?: string[];
  assignedTo?: string | null;
  upsert?: boolean;
  accommodationRequirements?: ReservationAccommodationRequirementInput[];
}

export interface UpdateReservationData {
  status?: Reservation['status'];
  customerName?: string;
  customerPhone?: string;
  partySize?: number;
  reservationAt?: string;
  departureId?: string;
  totalAmount?: number;
  paidAmount?: number;
  currency?: string;
  notes?: string;
  source?: string;
}

export interface ReservationFilters {
  assignedOnly?: boolean;
  customerId?: string;
  departureId?: string;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface ReservationListResponse {
  data: Reservation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getReservations(filters: ReservationFilters = {}): Promise<ReservationListResponse> {
  const params: Record<string, any> = {};
  if (filters.customerId) {
    params.customerId = filters.customerId;
  }
  if (filters.departureId) {
    params.departureId = filters.departureId;
  }
  if (filters.search) {
    params.search = filters.search;
  }
  if (filters.status) {
    params.status = filters.status;
  }
  if (filters.dateFrom) {
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    params.dateTo = filters.dateTo;
  }
  if (filters.page !== undefined) {
    params.page = filters.page;
  }
  if (filters.assignedOnly) {
    params.assignedOnly = 'true';
  }
  if (filters.limit !== undefined) {
    params.pageSize = filters.limit; // Map limit to pageSize for backend compatibility
  }

  const { data } = await get<ReservationListResponse>("/reservations", { params });
  return data;
}

export async function getReservation(id: string): Promise<Reservation> {
  const { data } = await get<Reservation>(`/reservations/${id}`);
  return data;
}

export async function createReservation(reservationData: CreateReservationData): Promise<Reservation> {
  const { data } = await post<Reservation>('/reservations', reservationData);
  return data;
}

export async function getReservationAccommodation(id: string): Promise<ReservationAccommodationRequirement[]> {
  const { data } = await get<{ accommodationRequirements: ReservationAccommodationRequirement[] }>(`/reservations/${id}/accommodation`);
  return data.accommodationRequirements || [];
}

export async function updateReservationAccommodation(
  id: string,
  accommodationRequirements: ReservationAccommodationRequirementInput[],
): Promise<ReservationAccommodationRequirement[]> {
  const { data } = await put<{ accommodationRequirements: ReservationAccommodationRequirement[] }>(
    `/reservations/${id}/accommodation`,
    { accommodationRequirements },
  );
  return data.accommodationRequirements || [];
}

export async function deleteReservationAccommodation(id: string): Promise<void> {
  await del(`/reservations/${id}/accommodation`);
}

export async function updateReservation(id: string, reservationData: UpdateReservationData): Promise<Reservation> {
  const { data } = await patch<Reservation>(`/reservations/${id}`, reservationData);
  return data;
}

export async function deleteReservation(id: string): Promise<void> {
  await del(`/reservations/${id}`);
}

export async function updateReservationStatus(id: string, status: Reservation['status']): Promise<Reservation> {
  const { data } = await patch<Reservation>(`/reservations/${id}/status`, { status });
  return data;
}

export interface BatchStatusResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface BatchStatusResponse {
  results: BatchStatusResult[];
  summary: { total: number; succeeded: number; failed: number };
}

export async function batchUpdateStatus(ids: string[], status: Reservation['status']): Promise<BatchStatusResponse> {
  const { data } = await post<BatchStatusResponse>('/reservations/batch/status', { ids, status });
  return data;
}

export async function downloadVoucher(id: string): Promise<Blob> {
  const { data } = await get(`/reservations/${id}/voucher.pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function downloadInvoice(id: string): Promise<Blob> {
  const { data } = await get(`/reservations/${id}/invoice.pdf`, {
    responseType: 'blob',
  });
  return data;
}

export async function generateDocument(templateKey: string, entityType: string, entityId: string): Promise<Blob> {
  const { data } = await post('/documents/generate', {
    templateKey,
    entityType,
    entityId,
  }, {
    responseType: 'blob',
  });
  return data;
}


export interface ReservationPassenger {
  id: string;
  reservation_id: string;
  departure_id: string;
  org_id: string;
  full_name: string;
  id_document?: string;
  birth_date?: string;
  nationality?: string;
  created_at: string;
}

export interface ReservationInstallment {
  id: string;
  reservation_id: string;
  installment_number: number;
  amount: number;
  due_date?: string;
  status: string;
  created_at: string;
}

export function formatReservationCurrency(amount: number, currency: string = 'BAM') {
  return new Intl.NumberFormat('bs-BA', { style: 'currency', currency }).format(amount || 0);
}

export function formatReservationDate(dateStr?: string) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('bs-BA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function reservationPaymentStatusBadge(reservation: Reservation) {
  const paid = Number(reservation.paidAmount ?? 0);
  const total = Number(reservation.totalAmount ?? 0);
  if (paid >= total && total > 0) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
}
