import { get, post, patch, del } from './client';

export interface QuotationItem {
  id: string; dayNumber: number; sortOrder: number; startTime: string | null;
  title: string; description: string | null; location: string | null;
  category: string; supplierId: string | null; supplierServiceId: string | null;
  quantity: number; unit: string; netUnitPrice: number; currency: string;
  markupPercent: number; included: boolean;
  netLineTotal: number; sellLineTotal: number;
}

export interface QuotationBookingContext {
  source?: 'itinerary' | 'standalone';
  itineraryId?: string; itineraryVersionId?: string; versionNumber?: number;
  itineraryTitle?: string; tripType?: string; destination?: string | null;
  travelStart?: string | null; travelEnd?: string | null; travelers?: number;
  currency?: string; inquiryId?: string | null; contactName?: string | null;
  phone?: string | null; email?: string | null;
}

export interface QuotationBookingDeparture { id:string; packageName:string; departAt:string; returnAt:string; capacity:number; }
export interface QuotationBooking { id:string; status:string; creation_state:string; }
export interface Quotation {
  id: string;
  itineraryId: string | null;
  itineraryVersionId: string | null;
  itinerary?: { id: string; title: string; currentVersion: number } | null;
  version?: { versionNumber: number; name: string } | null;
  title: string; reference: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  clientNotes: string | null; internalNotes: string | null;
  validUntil: string | null;
  markupStrategy: 'uniform' | 'per_item'; globalMarkupPercent: number;
  sellTotal: number; netTotal: number; marginTotal: number; currency: string;
  booking?: QuotationBooking | null;
  bookingContext?: QuotationBookingContext;
  commercialLocked?: boolean;
  sentAt: string | null; acceptedAt: string | null; rejectedAt: string | null;
  assignedTo: string | null; createdAt: string; updatedAt: string;
  items: QuotationItem[];
}

export type CreateQuotation = {
  title: string;
  itineraryId?: string | null;
  itineraryVersionId?: string | null;
  items?: CreateQuotationItem[];
  clientNotes?: string | null;
  internalNotes?: string | null;
  validUntil?: string | null;
  markupStrategy?: 'uniform' | 'per_item';
  globalMarkupPercent?: number;
  currency?: string;
};

export type CreateQuotationItem = {
  title: string;
  description?: string | null;
  location?: string | null;
  category?: string;
  quantity?: number;
  unit?: string;
  netUnitPrice?: number;
  markupPercent?: number;
  currency?: string;
  included?: boolean;
  dayNumber?: number;
  sortOrder?: number;
  startTime?: string | null;
  supplierId?: string | null;
  supplierServiceId?: string | null;
};

export async function getQuotations(params?: { status?: string; itineraryId?: string; search?: string }) {
  const { data } = await get<{ data: Quotation[] }>('/quotations', { params: params || {} });
  return data.data || [];
}

export async function getQuotation(id: string) { const { data } = await get<Quotation>(`/quotations/${id}`); return data; }

export async function createQuotation(payload: CreateQuotation) { const { data } = await post<Quotation>('/quotations', payload); return data; }

export async function updateQuotation(id: string, payload: Partial<Pick<Quotation, 'title' | 'status' | 'clientNotes' | 'internalNotes' | 'validUntil' | 'assignedTo'>>) {
  const { data } = await patch<Quotation>(`/quotations/${id}`, payload); return data;
}

export async function addQuotationItem(quotationId: string, payload: CreateQuotationItem) {
  const { data } = await post<QuotationItem>(`/quotations/${quotationId}/items`, payload);
  return data;
}

export async function editQuotationItem(quotationId: string, itemId: string, payload: CreateQuotationItem) {
  const { data } = await patch<QuotationItem>(`/quotations/${quotationId}/items/${itemId}`, payload);
  return data;
}

export async function deleteQuotationItem(quotationId: string, itemId: string) {
  await del(`/quotations/${quotationId}/items/${itemId}`);
}

export function quotationPdfUrl(id: string) { return `/api/quotations/${id}/pdf`; }

export async function getQuotationBookingOptions(id:string){
  const {data}=await get<{departures:QuotationBookingDeparture[]}>(`/quotations/${id}/booking-options`);
  return data.departures;
}
export async function bookQuotation(id:string,payload:{departureId:string;customerName:string;customerPhone:string;customerEmail?:string|null;passengers:{full_name:string}[]}){
  const {data}=await post<{created:boolean;reservation:{id:string;status:string}}>(`/quotations/${id}/booking`,payload);
  return data;
}
