import { get } from './client';

/**
 * Trigger full data export download
 */
export async function downloadAllData(): Promise<void> {
    try {
        const blob = await get<Blob>('/export/all.zip', { responseType: 'blob' });

        const url = window.URL.createObjectURL(blob.data);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `travline-export-${new Date().toISOString().split('T')[0]}.zip`);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
        throw error;
    }
}
