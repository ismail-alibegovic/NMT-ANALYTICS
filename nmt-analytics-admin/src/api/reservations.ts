import { get, post, patch, del } from './client';

export interface Reservation {
  id: string;
  customerId: string;
  customerName: string;
  departureId: string;
  departureName: string;
  packageId: string;
  packageName: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  totalAmount: number;
  paidAmount: number;
  balanceDue: number; // DB-calculated: total_amount - paid_amount (can be negative for overpayment)
  remainingAmount: number; // Legacy field for backward compatibility
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'refunded'; // DB-calculated payment status
  currency: string;
  participants: number;
  bookingDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReservationData {
  customerId: string;
  departureId: string;
  participants: number;
  notes?: string;
}

export interface UpdateReservationData {
  status?: Reservation['status'];
  paidAmount?: number;
  notes?: string;
}

export interface ReservationFilters {
  assignedOnly?: boolean;
  customerId?: string;
  departureId?: string;
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
