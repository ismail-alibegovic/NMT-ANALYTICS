import { get, post, patch, del } from './client';

export interface Contract {
  id: string;
  reservationId: string | null;
  contractNumber: string;
  contractDate: string;
  travelerName: string;
  travelerPhone: string | null;
  travelerEmail: string | null;
  packageDescription: string | null;
  departureDate: string | null;
  returnDate: string | null;
  partySize: number;
  totalAmount: number;
  currency: string;
  paymentTerms: string | null;
  cancellationPolicy: string | null;
  status: 'draft' | 'signed' | 'cancelled';
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractListResponse {
  data: Contract[];
  total: number;
  page: number;
  limit: number;
}

export interface ContractFilters {
  search?: string;
  status?: 'draft' | 'signed' | 'cancelled';
  page?: number;
  limit?: number;
}

export interface ContractCreateData {
  reservationId: string;
  travelerName?: string;
  travelerPhone?: string;
  travelerEmail?: string;
  packageDescription?: string;
  departureDate?: string;
  returnDate?: string;
  partySize?: number;
  totalAmount?: number;
  currency?: string;
  paymentTerms?: string;
  cancellationPolicy?: string;
}

export interface ContractUpdateData {
  travelerName?: string;
  travelerPhone?: string;
  travelerEmail?: string;
  packageDescription?: string;
  departureDate?: string;
  returnDate?: string;
  partySize?: number;
  totalAmount?: number;
  currency?: string;
  paymentTerms?: string;
  cancellationPolicy?: string;
  status?: 'draft' | 'signed' | 'cancelled';
  signedAt?: string | null;
}

export async function getContracts(filters: ContractFilters = {}): Promise<ContractListResponse> {
  const params: Record<string, any> = {
    page: filters.page,
    limit: filters.limit,
    search: filters.search,
    status: filters.status,
  };
  const { data } = await get<ContractListResponse>('/contracts', { params });
  return data;
}

export async function getContract(id: string): Promise<Contract> {
  const { data } = await get<Contract>(`/contracts/${id}`);
  return data;
}

export async function createContract(payload: ContractCreateData): Promise<Contract> {
  const { data } = await post<Contract>('/contracts', payload);
  return data;
}

export async function updateContract(id: string, payload: ContractUpdateData): Promise<Contract> {
  const { data } = await patch<Contract>(`/contracts/${id}`, payload);
  return data;
}

export async function deleteContract(id: string): Promise<void> {
  await del(`/contracts/${id}`);
}

export async function downloadContractPDF(id: string): Promise<Blob> {
  const api = (await import('../lib/apiClient')).default;
  const res = await api.get(`/contracts/${id}/pdf`, { responseType: 'blob' });
  return res.data as Blob;
}
