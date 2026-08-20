import { get, post, patch } from './client';

export interface QuotationItem {
  id: string; dayNumber: number; sortOrder: number; startTime: string | null;
  title: string; description: string | null; location: string | null;
  category: string; supplierId: string | null; supplierServiceId: string | null;
  quantity: number; unit: string; netUnitPrice: number; currency: string;
  markupPercent: number; included: boolean;
  netLineTotal: number; sellLineTotal: number;
}
export interface Quotation {
  id: string; itineraryId: string; itineraryVersionId: string;
  title: string; reference: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  clientNotes: string | null; internalNotes: string | null;
  validUntil: string | null;
  markupStrategy: 'uniform' | 'per_item'; globalMarkupPercent: number;
  sellTotal: number; netTotal: number; marginTotal: number; currency: string;
  sentAt: string | null; acceptedAt: string | null; rejectedAt: string | null;
  assignedTo: string | null; createdAt: string; updatedAt: string;
  items: QuotationItem[];
}
export type CreateQuotation = Omit<Quotation, 'id' | 'reference' | 'status' | 'sellTotal' | 'netTotal' | 'marginTotal' | 'sentAt' | 'acceptedAt' | 'rejectedAt' | 'assignedTo' | 'createdAt' | 'updatedAt' | 'items'>;

export async function getQuotations(params?: { status?: string; itineraryId?: string; search?: string }) {
  const { data } = await get<{ data: Quotation[] }>('/quotations', { params: params || {} });
  return data.data || [];
}
export async function getQuotation(id: string) { const { data } = await get<Quotation>(`/quotations/${id}`); return data; }
export async function createQuotation(payload: CreateQuotation) { const { data } = await post<Quotation>('/quotations', payload); return data; }
export async function updateQuotation(id: string, payload: Partial<Pick<Quotation, 'title' | 'status' | 'clientNotes' | 'internalNotes' | 'validUntil' | 'assignedTo'>>) {
  const { data } = await patch<Quotation>(`/quotations/${id}`, payload); return data;
}
export function quotationPdfUrl(id: string) { return `/api/quotations/${id}/pdf`; }
