import ApiClient from "../lib/apiClient";

interface Package {
  id: string;
  org_id: string;
  name: string;
  destination: string;
  base_price: number;
  currency: string;
  is_active: boolean;
  description?: string;
  duration_days?: number;
  max_participants?: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface GetPackagesParams {
  search?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export class PackagesService {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getPackages(params: GetPackagesParams = {}): Promise<PaginatedResponse<Package>> {
    const { search, page = 1, pageSize = 20, orderBy = 'created_at', orderDir = 'desc' } = params;
    return this.client.get(`/api/packages`, { search, page, pageSize, orderBy, orderDir });
  }

  public async getPackageById(id: string): Promise<Package> {
    return this.client.get(`/api/packages/${id}`);
  }

  public async createPackage(pkg: {
    name: string;
    destination: string;
    basePrice: number;
    currency?: string;
    isActive?: boolean;
    description?: string;
    durationDays?: number;
    maxParticipants?: number;
    startDate?: string;
    endDate?: string;
    upsert?: boolean;
  }): Promise<Package> {
    return this.client.post(`/api/packages`, pkg);
  }

  public async updatePackage(id: string, pkg: Partial<{
    name: string;
    destination: string;
    basePrice: number;
    currency?: string;
    isActive?: boolean;
    description?: string;
    durationDays?: number;
    maxParticipants?: number;
    startDate?: string;
    endDate?: string;
  }>): Promise<Package> {
    return this.client.patch(`/api/packages/${id}`, pkg);
  }

  public async replacePackage(id: string, pkg: {
    name: string;
    destination: string;
    basePrice: number;
    currency?: string;
    isActive?: boolean;
    description?: string;
    durationDays?: number;
    maxParticipants?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<Package> {
    return this.client.put(`/api/packages/${id}`, pkg);
  }

  public async deletePackage(id: string): Promise<void> {
    return this.client.delete(`/api/packages/${id}`);
  }

  public async importPackages(file: File, dryRun?: boolean): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (dryRun) formData.append('dryRun', 'true');

    return this.client.post('/api/import/packages', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  public async exportPackages(params?: { search?: string; isActive?: boolean; hasDepartures?: boolean }): Promise<Blob> {
    const { search, isActive, hasDepartures } = params || {};
    return this.client.get('/api/export/packages.csv', {
      search,
      isActive: isActive?.toString(),
      hasDepartures: hasDepartures?.toString(),
      responseType: 'blob'
    }) as Promise<Blob>;
  }

  public async downloadPackageTemplate(): Promise<Blob> {
    return this.client.get('/api/import/packages/template.csv', {
      responseType: 'blob'
    }) as Promise<Blob>;
  }
}
