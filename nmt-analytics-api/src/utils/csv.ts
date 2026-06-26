/**
 * Safely escapes a value for CSV inclusion.
 * Handles quotes, commas, and newlines.
 */
export function escapeCSVValue(value: any): string {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);

    // If the value contains quotes, commas, or newlines, wrap it in double quotes 
    // and escape existing double quotes by doubling them.
    if (/[",\n\r]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

/**
 * Generates a CSV string from headers and data rows.
 */
export function generateCSV(headers: string[], rows: any[][]): string {
    const headerLine = headers.map(escapeCSVValue).join(',');
    const dataLines = rows.map(row => row.map(escapeCSVValue).join(','));

    return [headerLine, ...dataLines].join('\n');
}
