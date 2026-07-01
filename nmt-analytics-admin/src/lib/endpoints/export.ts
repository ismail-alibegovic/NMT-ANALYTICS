/**
 * Export all data as ZIP
 * Note: This creates a download link directly since it's a file download
 */
export function downloadAllData(): void {
  const baseURL = import.meta.env.VITE_API_URL || '/api';
  const link = document.createElement('a');
  link.href = `${baseURL}/export/all.zip`;
  link.download = `travline-export-${new Date().toISOString().split('T')[0]}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
