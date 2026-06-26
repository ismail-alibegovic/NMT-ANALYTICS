import { useState, useRef } from 'react';
import Papa from 'papaparse';
import Button from '../ui/button/Button';
import { post } from '../../lib/apiClient';

interface ImportModalProps {
    entity: 'customers' | 'packages' | 'departures' | 'reservations' | 'transactions';
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface ImportResult {
    total: number;
    importedCount: number;
    invalidCount: number;
    invalidRows: Array<{ row: number; errors: any }>;
}

export default function ImportModal({ entity, isOpen, onClose, onSuccess }: ImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setError(null);
        setResult(null);

        // Parse CSV for preview
        Papa.parse(selectedFile, {
            header: true,
            preview: 5,
            complete: (results) => {
                setHeaders(results.meta.fields || []);
                setPreview(results.data);
            },
            error: (err) => {
                setError(`Failed to parse file: ${err.message}`);
            }
        });
    };

    const handleImport = async () => {
        if (!file) return;

        setImporting(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('mode', 'insert');

            const response = await post<ImportResult>(`/import/${entity}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setResult(response.data);
            if (response.data.importedCount > 0) {
                onSuccess();
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    const handleDownloadTemplate = async () => {
        try {
            const response = await fetch(`/api/import/${entity}/template.csv`);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${entity}_template.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError('Failed to download template');
        }
    };

    const reset = () => {
        setFile(null);
        setPreview([]);
        setHeaders([]);
        setResult(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Import {entity.charAt(0).toUpperCase() + entity.slice(1)}
                    </h2>
                </div>

                <div className="p-6 space-y-6">
                    {/* Template Download */}
                    <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                Need a template?
                            </p>
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                Download a sample CSV with the correct column format
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadTemplate}
                        >
                            Download Template
                        </Button>
                    </div>

                    {/* File Upload */}
                    {!result && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Select CSV File
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx"
                                onChange={handleFileSelect}
                                className="block w-full text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 focus:outline-none"
                            />
                        </div>
                    )}

                    {/* Preview */}
                    {preview.length > 0 && !result && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Preview (first 5 rows)
                            </h3>
                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            {headers.map((header, idx) => (
                                                <th
                                                    key={idx}
                                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                                                >
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                        {preview.map((row, idx) => (
                                            <tr key={idx}>
                                                {headers.map((header, colIdx) => (
                                                    <td
                                                        key={colIdx}
                                                        className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
                                                    >
                                                        {row[header]}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <p className="text-sm text-blue-600 dark:text-blue-400">Total Rows</p>
                                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                                        {result.total}
                                    </p>
                                </div>
                                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                    <p className="text-sm text-green-600 dark:text-green-400">Imported</p>
                                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                                        {result.importedCount}
                                    </p>
                                </div>
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                    <p className="text-sm text-red-600 dark:text-red-400">Failed</p>
                                    <p className="text-2xl font-bold text-red-900 dark:text-red-100">
                                        {result.invalidCount}
                                    </p>
                                </div>
                            </div>

                            {result.invalidRows.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Errors
                                    </h3>
                                    <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                        {result.invalidRows.map((err, idx) => (
                                            <div
                                                key={idx}
                                                className="p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                                            >
                                                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                                                    Row {err.row}
                                                </p>
                                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                                    {JSON.stringify(err.errors)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                    {result ? (
                        <>
                            <Button variant="outline" onClick={reset}>
                                Import Another
                            </Button>
                            <Button onClick={onClose}>
                                Close
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={!file || importing}
                            >
                                {importing ? 'Importing...' : 'Import'}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
