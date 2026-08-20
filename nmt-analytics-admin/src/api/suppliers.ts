import { get, post, patch } from './client';

export type SupplierCategory = 'accommodation' | 'transport' | 'airline' | 'guide' | 'activity' | 'restaurant' | 'insurance' | 'visa' | 'ticket' | 'venue' | 'equipment' | 'other';
export type ServiceCategory = 'accommodation' | 'transport' | 'flight' | 'guide' | 'activity' | 'meal' | 'insurance' | 'visa' | 'ticket' | 'venue' | 'equipment' | 'other';
export type ServiceUnit = 'per_person' | 'per_room' | 'per_night' | 'per_vehicle' | 'per_group' | 'per_booking' | 'per_day' | 'per_hour' | 'fixed';

export interface SupplierService {
  id: string; supplierId: string; name: string; category: ServiceCategory; unit: ServiceUnit;
  netPrice: number; currency: string; taxRate: number; defaultMarkup: number;
  validFrom: string | null; validTo: string | null; minQuantity: number | null; maxQuantity: number | null;
  active: boolean; notes: string | null; createdAt: string; updatedAt: string;
}

export interface Supplier {
  id: string; name: string; category: SupplierCategory; status: 'active' | 'inactive';
  country: string | null; city: string | null; address: string | null; taxId: string | null;
  contactName: string | null; email: string | null; phone: string | null; website: string | null;
  defaultCurrency: string; paymentTerms: string | null; notes: string | null;
  services: SupplierService[]; createdAt: string; updatedAt: string;
}

export type CreateSupplier = Pick<Supplier, 'name' | 'category' | 'status' | 'defaultCurrency'> & Partial<Pick<Supplier, 'country' | 'city' | 'address' | 'taxId' | 'contactName' | 'email' | 'phone' | 'website' | 'paymentTerms' | 'notes'>>;
export type CreateSupplierService = Pick<SupplierService, 'name' | 'category' | 'unit' | 'netPrice' | 'currency' | 'taxRate' | 'defaultMarkup' | 'active'> & Partial<Pick<SupplierService, 'validFrom' | 'validTo' | 'minQuantity' | 'maxQuantity' | 'notes'>>;

export async function getSuppliers(filters: { search?: string; category?: string; status?: string } = {}): Promise<Supplier[]> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const { data } = await get<{ data: Supplier[] }>('/suppliers', { params });
  return data.data || [];
}

export async function createSupplier(payload: CreateSupplier): Promise<Supplier> {
  const { data } = await post<Supplier>('/suppliers', payload);
  return data;
}

export async function updateSupplier(id: string, payload: Partial<CreateSupplier>): Promise<Supplier> {
  const { data } = await patch<Supplier>(`/suppliers/${id}`, payload);
  return data;
}

export async function createSupplierService(supplierId: string, payload: CreateSupplierService): Promise<SupplierService> {
  const { data } = await post<SupplierService>(`/suppliers/${supplierId}/services`, payload);
  return data;
}
