import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { importData, ImportResponse, getImportHeaders } from '../../api/import';
import { useToast } from '../../context/ToastContext';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    entity: string;
    fields: { key: string; label: string; required?: boolean }[];
    onSuccess?: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, entity, fields, onSuccess }) => {
    const [file, setFile] = useState<File | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload');
    const [loading, setLoading] = useState(false);
    const [importResult, setImportResult] = useState<ImportResponse | null>(null);
    const { success: showSuccess, error: showError } = useToast();

    const autoMap = (csvHeaders: string[]) => {
        const newMapping: Record<string, string> = {};
        csvHeaders.forEach(header => {
            const match = fields.find(f =>
                f.label.toLowerCase() === header.toLowerCase() ||
                f.key.toLowerCase() === header.toLowerCase()
            );
            if (match) {
                newMapping[header] = match.key;
            }
        });
        setMapping(newMapping);
    };

    const onDrop = (acceptedFiles: File[]) => {
        const selectedFile = acceptedFiles[0];
        if (!selectedFile) return;

        setFile(selectedFile);

        // Parse headers
        if (selectedFile.name.endsWith('.csv')) {
            Papa.parse(selectedFile, {
                header: true,
                preview: 1,
                complete: (results) => {
                    if (results.meta.fields) {
                        setHeaders(results.meta.fields);
                        autoMap(results.meta.fields);
                        setStep('map');
                    }
                },
            });
        } else {
            // Use API to extract headers for XLSX files
            getImportHeaders(entity, selectedFile).then((result: any) => {
                if (result.headers) {
                    setHeaders(result.headers);
                    autoMap(result.headers);
                    setStep("map");
                } else {
                    showError("Failed to read XLSX headers");
                }
            }).catch((err: any) => {
                showError(err.message || "Failed to parse XLSX file");
            });
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        },
        multiple: false,
    });

    if (!isOpen) return null;

    const handleMappingChange = (csvHeader: string, dbField: string) => {
        setMapping(prev => ({ ...prev, [csvHeader]: dbField }));
    };

    const handlePreview = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const res = await importData(entity, file, { mode: 'upsert', columnMap: mapping }, true);
            setImportResult(res);
            setStep('preview');
        } catch (err: any) {
            showError(err.message || 'Failed to preview data');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setLoading(true);
        try {
            await importData(entity, file, { mode: 'upsert', columnMap: mapping }, false);
            showSuccess('Data imported successfully');
            onSuccess?.();
            onClose();
            reset();
        } catch (err: any) {
            showError(err.message || 'Failed to import data');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setFile(null);
        setHeaders([]);
        setMapping({});
        setStep('upload');
        setImportResult(null);
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-boxdark w-full max-w-2xl rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-stroke dark:border-strokedark flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-black dark:text-white">
                        Import {entity.charAt(0).toUpperCase() + entity.slice(1)}
                    </h3>
                    <button onClick={onClose} className="text-body hover:text-primary transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {step === 'upload' && (
                        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${isDragActive ? 'border-primary bg-primary/10' : 'border-stroke dark:border-strokedark hover:border-primary/50'}`}>
                            <input {...getInputProps()} />
                            <div className="mb-4 flex justify-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-lg font-medium text-black dark:text-white mb-1">
                                {isDragActive ? 'Drop file here' : 'Click or drag file to upload'}
                            </p>
                            <p className="text-sm text-body">
                                Supports CSV and XLSX files
                            </p>
                        </div>
                    )}

                    {step === 'map' && (
                        <div className="space-y-4">
                            <p className="text-sm text-body mb-4">
                                Map the columns from your file to the database fields.
                            </p>
                            <div className="space-y-3">
                                {headers.map(header => (
                                    <div key={header} className="flex items-center gap-4">
                                        <div className="flex-1 px-4 py-2 bg-gray-50 dark:bg-meta-4 rounded border border-stroke dark:border-strokedark">
                                            <span className="text-sm font-medium">{header}</span>
                                        </div>
                                        <div className="text-body">→</div>
                                        <select
                                            className="flex-1 px-4 py-2 bg-transparent rounded border border-stroke dark:border-strokedark focus:border-primary outline-none transition-all"
                                            value={mapping[header] || ''}
                                            onChange={(e) => handleMappingChange(header, e.target.value)}
                                        >
                                            <option value="">Ignore column</option>
                                            {fields.map(f => (
                                                <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'preview' && importResult && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 text-center">
                                    <p className="text-xs text-body uppercase font-bold mb-1">Total Rows</p>
                                    <p className="text-2xl font-bold text-primary">{importResult.results.total}</p>
                                </div>
                                <div className="p-4 bg-green-500/5 rounded-lg border border-green-500/20 text-center">
                                    <p className="text-xs text-body uppercase font-bold mb-1">Valid</p>
                                    <p className="text-2xl font-bold text-green-500">{importResult.results.validCount}</p>
                                </div>
                                <div className="p-4 bg-red-500/5 rounded-lg border border-red-500/20 text-center">
                                    <p className="text-xs text-body uppercase font-bold mb-1">Invalid</p>
                                    <p className="text-2xl font-bold text-red-500">{importResult.results.invalidCount}</p>
                                </div>
                            </div>

                            {importResult.results.invalidRows.length > 0 && (
                                <div className="bg-red-500/10 p-4 rounded-lg">
                                    <p className="text-sm font-bold text-red-500 mb-2">Errors (First 10):</p>
                                    <ul className="text-xs text-red-600 space-y-1">
                                        {importResult.results.invalidRows.slice(0, 10).map((err, idx) => (
                                            <li key={idx}>Row {err.row}: {JSON.stringify(err.errors || err.error)}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {importResult.results.preview && (
                                <div>
                                    <p className="text-sm font-bold mb-2">Preview (First 5):</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-gray-100 dark:bg-meta-4">
                                                    {Object.keys(importResult.results.preview[0] || {}).map(k => (
                                                        <th key={k} className="px-2 py-1 border border-stroke dark:border-strokedark text-left">{k}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importResult.results.preview.slice(0, 5).map((row, i) => (
                                                    <tr key={i}>
                                                        {Object.values(row).map((v: any, j) => (
                                                            <td key={j} className="px-2 py-1 border border-stroke dark:border-strokedark">{String(v)}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-stroke dark:border-strokedark bg-gray-50 dark:bg-meta-4 flex justify-between">
                    <button
                        onClick={step === 'upload' ? onClose : step === 'map' ? () => setStep('upload') : () => setStep('map')}
                        className="px-6 py-2 border border-stroke dark:border-strokedark rounded-lg hover:bg-white dark:hover:bg-boxdark transition-all"
                        disabled={loading}
                    >
                        {step === 'upload' ? 'Cancel' : 'Back'}
                    </button>

                    <div className="flex gap-3">
                        {step === 'map' && (
                            <button
                                onClick={handlePreview}
                                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2"
                                disabled={loading}
                            >
                                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                Preview
                            </button>
                        )}
                        {step === 'preview' && (
                            <button
                                onClick={handleImport}
                                className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-2"
                                disabled={loading || (importResult?.results.validCount === 0)}
                            >
                                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                Import {importResult?.results.validCount} Rows
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
