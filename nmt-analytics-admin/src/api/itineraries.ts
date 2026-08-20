import { get, post, patch, del } from './client';
import type { InquiryTripType } from './inquiries';
import type { ServiceCategory, ServiceUnit } from './suppliers';

export interface ItineraryItem { id: string; itineraryVersionId: string; dayNumber: number; sortOrder: number; startTime: string | null; title: string; description: string | null; location: string | null; category: ServiceCategory; supplierId: string | null; supplierServiceId: string | null; quantity: number; unit: ServiceUnit; netUnitPrice: number; currency: string; markupPercent: number; included: boolean; createdAt: string; updatedAt: string; }
export interface ItineraryVersion { id: string; itineraryId: string; versionNumber: number; name: string; summary: string | null; internalNotes: string | null; createdAt: string; items: ItineraryItem[]; }
export interface Itinerary { id: string; inquiryId: string | null; inquiry: { id: string; contactName: string } | null; title: string; tripType: InquiryTripType; status: 'draft' | 'active' | 'archived'; destination: string | null; travelStart: string | null; travelEnd: string | null; travelers: number; currency: string; currentVersion: number; assignedTo: string | null; versions: ItineraryVersion[]; createdAt: string; updatedAt: string; }
export type CreateItinerary = Pick<Itinerary, 'title' | 'tripType' | 'status' | 'travelers' | 'currency'> & Partial<Pick<Itinerary, 'inquiryId' | 'destination' | 'travelStart' | 'travelEnd'>>;
export type CreateItineraryItem = Pick<ItineraryItem, 'dayNumber' | 'sortOrder' | 'quantity' | 'included'> & Partial<Pick<ItineraryItem, 'startTime' | 'title' | 'description' | 'location' | 'category' | 'supplierServiceId' | 'unit' | 'netUnitPrice' | 'currency' | 'markupPercent'>>;

export async function getItineraries(search = '') { const { data } = await get<{ data: Itinerary[] }>('/itineraries', { params: search ? { search } : {} }); return data.data || []; }
export async function getItinerary(id: string) { const { data } = await get<Itinerary>(`/itineraries/${id}`); return data; }
export async function createItinerary(payload: CreateItinerary) { const { data } = await post<Itinerary>('/itineraries', payload); return data; }
export async function updateItinerary(id: string, payload: Partial<CreateItinerary>) { const { data } = await patch<Itinerary>(`/itineraries/${id}`, payload); return data; }
export async function createItineraryVersion(id: string, name?: string) { const { data } = await post<ItineraryVersion>(`/itineraries/${id}/versions`, { name }); return data; }
export async function createItineraryItem(id: string, payload: CreateItineraryItem) { const { data } = await post<ItineraryItem>(`/itineraries/${id}/items`, payload); return data; }
export async function deleteItineraryItem(id: string) { await del(`/itinerary-items/${id}`); }
