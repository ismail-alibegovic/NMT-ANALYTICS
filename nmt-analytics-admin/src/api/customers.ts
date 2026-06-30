import { get, post, patch, del } from './client';

export interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  notes?: string;
  created_at: string;
}

export interface CreateCustomerData {
  full_name: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
}

export interface UpdateCustomerData extends Partial<CreateCustomerData> {}

export interface CustomerFilters {
  search?: string;
  page?: number;
  limit?: number;
  status?: string;
  packageId?: string;
}

export interface CustomerListResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TimelineEvent {
  id: string;
  type: 'audit' | 'reservation';
  action: string;
  entity: string;
  details: any;
  createdAt: string;
}

export async function getCustomers(filters: CustomerFilters = {}): Promise<CustomerListResponse> {
  const params: Record<string, any> = {};
  if (filters.search) params.search = filters.search;
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.limit = filters.limit;
  if (filters.status) params.status = filters.status;
  if (filters.packageId) params.packageId = filters.packageId;

  const { data } = await get<CustomerListResponse>('/customers', { params });
  return data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await get<Customer>(`/customers/${id}`);
  return data;
}

export async function getCustomerTimeline(id: string): Promise<TimelineEvent[]> {
  const { data } = await get<TimelineEvent[]>(`/customers/${id}/timeline`);
  return data;
}

export async function createCustomer(customerData: CreateCustomerData): Promise<Customer> {
  const { data } = await post<Customer>('/customers', customerData);
  return data;
}

export async function updateCustomer(id: string, customerData: UpdateCustomerData): Promise<Customer> {
  const { data } = await patch<Customer>(`/customers/${id}`, customerData);
  return data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await del(`/customers/${id}`);
}
