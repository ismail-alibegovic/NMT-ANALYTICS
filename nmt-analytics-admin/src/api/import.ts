import { post } from '../lib/apiClient';

export interface ImportOptions {
    mode: 'insert' | 'upsert';
    matchKey?: string;
    columnMap: Record<string, string>;
}

export interface ImportResults {
    total: number;
    importedCount?: number;
    validCount?: number;
    invalidCount: number;
    invalidRows: any[];
    preview?: any[];
}

export interface ImportResponse {
    success: boolean;
    dryRun?: boolean;
    results: ImportResults;
}

/**
 * Universal import function
 */
export async function importData(
    entity: string,
    file: File,
    options: ImportOptions,
    dryRun = false
): Promise<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('options', JSON.stringify(options));

    const { data } = await post<ImportResponse>(`/import/${entity}?dryRun=${dryRun}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return data;
}
