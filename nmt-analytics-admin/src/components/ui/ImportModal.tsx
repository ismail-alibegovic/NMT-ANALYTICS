import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { importData, ImportResponse, getImportHeaders } from '../../api/import';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../lib/i18n/context';
import { Modal } from './modal';
import Button from './button/Button';

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
    const { t } = useT();
    const m = t.legacyImportModal;
    const entityLabel = (t.fileImport as Record<string, string>)[entity] || entity;

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
                    showError(m.xlsxHeadersError);
                }
            }).catch(() => {
                showError(m.xlsxParseError);
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
        } catch {
            showError(m.previewError);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setLoading(true);
        try {
            await importData(entity, file, { mode: 'upsert', columnMap: mapping }, false);
            showSuccess(m.importSuccess);
            onSuccess?.();
            onClose();
            reset();
        } catch {
            showError(m.importError);
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
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!loading) onClose(); }}
            className="max-w-2xl"
            title={m.title.replace('{entity}', entityLabel)}
            closeLabel={m.close}
        >
                {/* Content */}
                <div className="p-6">
                    {step === 'upload' && (
                        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${isDragActive ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-500/10' : 'border-gray-300 dark:border-gray-700 hover:border-brand-400'}`}>
                            <input {...getInputProps()} />
                            <div className="mb-4 flex justify-center">
                                <div className="w-16 h-16 bg-brand-50 dark:bg-brand-500/10 rounded-full flex items-center justify-center text-brand-500">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                                {isDragActive ? m.dropHere : m.clickOrDrag}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {m.supportsFormats}
                            </p>
                        </div>
                    )}

                    {step === 'map' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                {m.mapInstructions}
                            </p>
                            <div className="space-y-3">
                                {headers.map(header => (
                                    <div key={header} className="flex items-center gap-4">
                                        <div className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{header}</span>
                                        </div>
                                        <div className="text-gray-400">→</div>
                                        <select
                                            className="flex-1 h-10 px-3 py-2 bg-transparent rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 transition-all"
                                            value={mapping[header] || ''}
                                            onChange={(e) => handleMappingChange(header, e.target.value)}
                                        >
                                            <option value="">{m.ignoreColumn}</option>
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
                                <div className="p-4 bg-brand-50 dark:bg-brand-500/10 rounded-lg border border-brand-200 dark:border-brand-800/40 text-center">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">{m.totalRows}</p>
                                    <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{importResult.results.total}</p>
                                </div>
                                <div className="p-4 bg-green-500/5 rounded-lg border border-green-500/20 text-center">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">{m.valid}</p>
                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.results.validCount}</p>
                                </div>
                                <div className="p-4 bg-red-500/5 rounded-lg border border-red-500/20 text-center">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">{m.invalid}</p>
                                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.results.invalidCount}</p>
                                </div>
                            </div>

                            {importResult.results.invalidRows.length > 0 && (
                                <div className="bg-red-500/10 p-4 rounded-lg">
                                    <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-2">{m.errorsHeading}</p>
                                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                                        {importResult.results.invalidRows.slice(0, 10).map((err, idx) => (
                                            <li key={idx}>{m.rowLabel.replace('{row}', String(err.row))} {JSON.stringify(err.errors || err.error)}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {importResult.results.preview && (
                                <div>
                                    <p className="text-sm font-bold mb-2 text-gray-900 dark:text-white">{m.previewHeading}</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-gray-100 dark:bg-gray-800">
                                                    {Object.keys(importResult.results.preview[0] || {}).map(k => (
                                                        <th key={k} className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 text-left font-semibold">{k}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importResult.results.preview.slice(0, 5).map((row, i) => (
                                                    <tr key={i}>
                                                        {Object.values(row).map((v: any, j) => (
                                                            <td key={j} className="px-2 py-1.5 border border-gray-200 dark:border-gray-700">{String(v)}</td>
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
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={step === 'upload' ? onClose : step === 'map' ? () => setStep('upload') : () => setStep('map')}
                        disabled={loading}
                    >
                        {step === 'upload' ? m.cancel : m.back}
                    </Button>

                    <div className="flex gap-3">
                        {step === 'map' && (
                            <Button
                                type="button"
                                onClick={handlePreview}
                                disabled={loading}
                            >
                                {m.preview}
                            </Button>
                        )}
                        {step === 'preview' && (
                            <Button
                                type="button"
                                onClick={handleImport}
                                disabled={loading || (importResult?.results.validCount === 0)}
                            >
                                {m.importRows.replace('{count}', String(importResult?.results.validCount ?? 0))}
                            </Button>
                        )}
                    </div>
                </div>
        </Modal>
    );
};

export default ImportModal;
