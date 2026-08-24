import { get } from "./client";

export type CommunicationChannel = "email" | "sms";
export type CommunicationStatus = "sent" | "failed" | "skipped";

export interface CommunicationHistoryItem {
  id: string;
  org_id: string;
  channel: CommunicationChannel;
  recipient: string;
  subject: string | null;
  body_preview: string | null;
  status: CommunicationStatus;
  error_message: string | null;
  related_departure_id: string | null;
  related_reservation_id: string | null;
  created_at: string;
  sent_at: string | null;
  departures?: {
    id: string;
    depart_at: string | null;
    packages?: {
      id: string;
      name: string;
    } | null;
  } | null;
  reservations?: {
    id: string;
    customer_name: string | null;
  } | null;
}

export interface CommunicationHistoryFilters {
  page?: number;
  limit?: number;
  channel?: CommunicationChannel | "";
  status?: CommunicationStatus | "";
  related_departure_id?: string;
  related_reservation_id?: string;
}

export interface CommunicationHistoryResponse {
  data: CommunicationHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getCommunicationHistory(
  filters: CommunicationHistoryFilters = {},
): Promise<CommunicationHistoryResponse> {
  const params: Record<string, string | number> = {};

  if (filters.page !== undefined) params.page = filters.page;
  if (filters.limit !== undefined) params.limit = filters.limit;
  if (filters.channel) params.channel = filters.channel;
  if (filters.status) params.status = filters.status;
  if (filters.related_departure_id) params.related_departure_id = filters.related_departure_id;
  if (filters.related_reservation_id) params.related_reservation_id = filters.related_reservation_id;

  const { data } = await get<CommunicationHistoryResponse>("/communication-history", { params });
  return data;
}
