import { get, post, del } from './client';

export interface Receipt {
  id: string;
  reservationId: string | null;
  contractId: string | null;
  receiptNumber: string;
  receiptType: 'advance' | 'final' | 'refund';
  amount: number;
  currency: string;
  paymentMethod: 'cash' | 'card' | 'bank' | null;
  linkedReceiptId: string | null;
  fiscalData: Record<string, any>;
  issuedAt: string;
  issuedBy: string | null;
  createdAt: string;
  travelerName: string | null;
  contractNumber: string | null;
}

export interface ReceiptListResponse {
  data: Receipt[];
  total: number;
  page: number;
  limit: number;
}

export interface ReceiptFilters {
  search?: string;
  type?: 'advance' | 'final' | 'refund';
  page?: number;
  limit?: number;
}

export interface ReceiptCreateData {
  reservationId: string;
  receiptType: 'advance' | 'final' | 'refund';
  amount: number;
  currency?: string;
  paymentMethod?: 'cash' | 'card' | 'bank';
  contractId?: string;
  linkedReceiptId?: string;
  fiscalData?: Record<string, any>;
}

export interface RefundData {
  amount: number;
  paymentMethod?: 'cash' | 'card' | 'bank';
}

export async function getReceipts(filters: ReceiptFilters = {}): Promise<ReceiptListResponse> {
  const params: Record<string, any> = {
    page: filters.page,
    limit: filters.limit,
    search: filters.search,
    type: filters.type,
  };
  const { data } = await get<ReceiptListResponse>('/receipts', { params });
  return data;
}

export async function createReceipt(payload: ReceiptCreateData): Promise<Receipt> {
  const { data } = await post<Receipt>('/receipts', payload);
  return data;
}

export async function deleteReceipt(id: string): Promise<void> {
  await del(`/receipts/${id}`);
}

export async function refundReceipt(id: string, payload: RefundData): Promise<Receipt> {
  const { data } = await post<Receipt>(`/receipts/${id}/refund`, payload);
  return data;
}

export async function downloadReceiptPDF(id: string): Promise<Blob> {
  const api = (await import('../lib/apiClient')).default;
  const res = await api.get(`/receipts/${id}/pdf`, { responseType: 'blob' });
  return res.data as Blob;
}
