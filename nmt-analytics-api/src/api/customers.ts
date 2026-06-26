import ApiClient from "../lib/apiClient";

interface Customer {
  id: string;
  org_id: string;
  full_name: string;
  phone: string;
  email?: string;
  notes?: string;
  created_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface GetCustomersParams {
  search?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export class CustomersService {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getCustomers(params: GetCustomersParams = {}): Promise<PaginatedResponse<Customer>> {
    const { search, page = 1, pageSize = 20, orderBy = 'created_at', orderDir = 'desc' } = params;
    return this.client.get(`/api/customers`, { search, page, pageSize, orderBy, orderDir });
  }

  public async getCustomerById(id: string): Promise<Customer> {
    return this.client.get(`/api/customers/${id}`);
  }

  public async createCustomer(customer: {
    fullName: string;
    phone: string;
    email?: string;
    notes?: string;
    upsert?: boolean;
  }): Promise<Customer> {
    return this.client.post(`/api/customers`, customer);
  }

  public async updateCustomer(id: string, customer: Partial<{
    fullName: string;
    phone: string;
    email?: string;
    notes?: string;
  }>): Promise<Customer> {
    return this.client.patch(`/api/customers/${id}`, customer);
  }

  public async replaceCustomer(id: string, customer: {
    fullName: string;
    phone: string;
    email?: string;
    notes?: string;
  }): Promise<Customer> {
    return this.client.put(`/api/customers/${id}`, customer);
  }

  public async deleteCustomer(id: string): Promise<void> {
    return this.client.delete(`/api/customers/${id}`);
  }

  public async importCustomers(file: File, dryRun?: boolean): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (dryRun) formData.append('dryRun', 'true');

    return this.client.post('/api/import/customers', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  public async exportCustomers(params?: { search?: string; hasReservations?: boolean }): Promise<Blob> {
    const { search, hasReservations } = params || {};
    return this.client.get('/api/export/customers.csv', {
      search,
      hasReservations: hasReservations?.toString(),
      responseType: 'blob'
    }) as Promise<Blob>;
  }

  public async downloadCustomerTemplate(): Promise<Blob> {
    return this.client.get('/api/import/customers/template.csv', {
      responseType: 'blob'
    }) as Promise<Blob>;
  }
}
