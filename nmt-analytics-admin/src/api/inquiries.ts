import { get, post, patch } from './client';

export type InquiryStage = 'new' | 'qualified' | 'proposal' | 'follow_up' | 'won' | 'lost';
export type InquiryTripType = 'scheduled_group' | 'tailor_made' | 'accommodation_only' | 'flight_only' | 'corporate' | 'pilgrimage' | 'excursion' | 'transfer' | 'other';

export interface Inquiry {
  id: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  tripType: InquiryTripType;
  stage: InquiryStage;
  source: string;
  destination: string | null;
  travelStart: string | null;
  travelEnd: string | null;
  travelers: number;
  budget: number | null;
  currency: string;
  assignedTo: string | null;
  nextActionAt: string | null;
  notes: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateInquiry = Pick<Inquiry, 'contactName' | 'tripType' | 'source' | 'travelers' | 'currency'> & Partial<Pick<Inquiry, 'phone' | 'email' | 'destination' | 'travelStart' | 'travelEnd' | 'budget' | 'nextActionAt' | 'notes'>>;

export async function getInquiries(search = ''): Promise<Inquiry[]> {
  const { data } = await get<{ data: Inquiry[] }>('/inquiries', { params: search ? { search } : {} });
  return data.data || [];
}

export async function createInquiry(payload: CreateInquiry): Promise<Inquiry> {
  const { data } = await post<Inquiry>('/inquiries', payload);
  return data;
}

export async function updateInquiry(id: string, payload: Partial<Inquiry>): Promise<Inquiry> {
  const { data } = await patch<Inquiry>(`/inquiries/${id}`, payload);
  return data;
}
