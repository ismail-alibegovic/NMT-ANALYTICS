import { get, post, del } from './client';

export interface Document {
    id: string;
    org_id: string;
    name: string;
    type: string;
    size: number;
    uploaded_by: string;
    entity_type?: string;
    entity_id?: string;
    created_at: string;
    profiles?: {
        full_name: string;
        email: string;
    };
}

export interface DocumentListResponse {
    data: Document[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/**
 * Fetch list of documents for the organization
 */
export async function getDocuments(params: { page?: number; limit?: number; search?: string } = {}) {
    const { data } = await get<DocumentListResponse>('/documents', { params });
    return data;
}

/**
 * Upload a document
 */
export async function uploadDocument(formData: FormData) {
    const { data } = await post<Document>('/documents/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return data;
}

/**
 * Download a document
 */
export async function downloadDocument(id: string) {
    const { data } = await get(`/documents/${id}/download`, {
        responseType: 'blob',
    });
    return data as Blob;
}

/**
 * Delete a document
 */
export async function deleteDocument(id: string) {
    await del(`/documents/${id}`);
}
