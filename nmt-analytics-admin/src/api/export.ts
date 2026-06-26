import { get } from './client';

/**
 * Trigger full data export download
 */
export async function downloadAllData(): Promise<void> {
    // We use the browser's download capability for files
    // But we use the configured client to construct the URL correctly
    // Actually, for file downloads via browser navigation (link click), we need the raw URL.
    // But we need the auth token!

    // Method 1: Use axios with blob (better for auth)
    try {
        const { data } = await get<Blob>('/export/all.zip', { responseType: 'blob' });

        // Create download link
        const url = window.URL.createObjectURL(new Blob([data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `nmt-export-${new Date().toISOString().split('T')[0]}.zip`);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
    } catch (error) {
        console.error('Export failed:', error);
        // Fallback? usually auth is needed, so direct link won't work if protected.
    }
}
