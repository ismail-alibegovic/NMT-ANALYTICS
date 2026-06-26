import ApiClient from "../lib/apiClient";

interface Reservation {
  id: string;
  org_id: string;
  customer_name: string;
  customer_phone?: string;
  party_size: number;
  reservation_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  customer_id?: string;
  departure_id?: string;
  total_amount?: number;
  currency: string;
  source?: string;
  created_at: string;
  customers?: {
    id: string;
    full_name: string;
    phone: string;
    email?: string;
  };
  departures?: {
    id: string;
    depart_at: string;
    return_at: string;
    packages?: {
      id: string;
      name: string;
      destination: string;
    };
  };
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface GetReservationsParams {
  search?: string;
  from?: string;
  to?: string;
  status?: "pending" | "confirmed" | "cancelled" | "completed";
  departureId?: string;
  customerId?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export class ReservationsService {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getReservations(params: GetReservationsParams = {}): Promise<PaginatedResponse<Reservation>> {
    const { search, from, to, status, departureId, customerId, page = 1, pageSize = 20, orderBy = 'reservation_at', orderDir = 'desc' } = params;
    return this.client.get(`/api/reservations`, { search, from, to, status, departureId, customerId, page, pageSize, orderBy, orderDir });
  }

  public async getReservationById(id: string): Promise<Reservation> {
    return this.client.get(`/api/reservations/${id}`);
  }

  public async createReservation(reservation: {
    customerName: string;
    customerPhone?: string;
    partySize: number;
    reservationAt: string;
    status?: "pending" | "confirmed" | "cancelled";
    customerId?: string;
    departureId?: string;
    totalAmount?: number;
    currency?: string;
    source?: string;
    upsert?: boolean;
  }): Promise<Reservation> {
    return this.client.post(`/api/reservations`, reservation);
  }

  public async updateReservation(id: string, reservation: Partial<{
    status: "pending" | "confirmed" | "cancelled" | "completed";
    departureId?: string;
    customerId?: string;
    totalAmount?: number;
    reservationAt?: string;
    partySize?: number;
    customerName?: string;
    customerPhone?: string;
    currency?: string;
    source?: string;
  }>): Promise<Reservation> {
    return this.client.patch(`/api/reservations/${id}`, reservation);
  }

  public async updateReservationStatus(id: string, status: "pending" | "confirmed" | "cancelled" | "completed"): Promise<Reservation> {
    return this.client.patch(`/api/reservations/${id}/status`, { status });
  }

  public async deleteReservation(id: string): Promise<void> {
    return this.client.delete(`/api/reservations/${id}`);
  }

  public async downloadVoucher(id: string): Promise<Blob> {
    const response = await this.client.get(`/api/reservations/${id}/voucher.pdf`, { responseType: 'blob' });
    return response as Blob;
  }
}
