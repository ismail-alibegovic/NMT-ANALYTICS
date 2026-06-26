import ApiClient from "../lib/apiClient";

interface Document {
  id: string;
  org_id: string;
  template_id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, any>;
  created_at: string;
}

interface VoucherGenerationRequest {
  reservationId: string;
}

interface VoucherGenerationResponse {
  documentId: string;
  html: string;
  data: Record<string, any>;
}

export class DocumentsService {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  public async generateVoucher(request: VoucherGenerationRequest): Promise<VoucherGenerationResponse> {
    return this.client.post('/api/documents/voucher', request);
  }

  public async downloadDocument(documentId: string): Promise<Blob> {
    const response = await this.client.get(`/api/documents/${documentId}/download`, { responseType: 'blob' });
    return response as Blob;
  }
}
