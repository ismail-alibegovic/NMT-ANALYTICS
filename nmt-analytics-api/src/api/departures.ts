import ApiClient from "../lib/apiClient";

interface Departure {
  id: string;
  org_id: string;
  package_id: string;
  depart_at: string;
  return_at: string;
  capacity: number;
  booked: number;
  status: string;
  created_at: string;
  packages?: {
    id: string;
    name: string;
    destination: string;
    base_price: number;
    currency: string;
  };
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface GetDeparturesParams {
  from?: string;
  to?: string;
  packageId?: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export class DeparturesService {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async getDepartures(params: GetDeparturesParams = {}): Promise<PaginatedResponse<Departure>> {
    const { from, to, packageId, page = 1, pageSize = 20, orderBy = 'depart_at', orderDir = 'desc' } = params;
    return this.client.get(`/api/departures`, { from, to, packageId, page, pageSize, orderBy, orderDir });
  }

  public async getDepartureById(id: string): Promise<Departure> {
    return this.client.get(`/api/departures/${id}`);
  }

  public async createDeparture(departure: {
    packageId: string;
    departAt: string;
    returnAt: string;
    capacity: number;
    status?: string;
    upsert?: boolean;
  }): Promise<Departure> {
    return this.client.post(`/api/departures`, departure);
  }

  public async updateDeparture(id: string, departure: Partial<{
    packageId: string;
    departAt: string;
    returnAt: string;
    capacity: number;
    status: string;
  }>): Promise<Departure> {
    return this.client.patch(`/api/departures/${id}`, departure);
  }

  public async replaceDeparture(id: string, departure: {
    packageId: string;
    departAt: string;
    returnAt: string;
    capacity: number;
    status?: string;
  }): Promise<Departure> {
    return this.client.put(`/api/departures/${id}`, departure);
  }

  public async deleteDeparture(id: string): Promise<void> {
    return this.client.delete(`/api/departures/${id}`);
  }
}
