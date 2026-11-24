import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import PageMeta from '../../components/common/PageMeta';
import { DataTable, Column, Pagination } from '../../components/ui/DataTable';
import PageBreadCrumb from '../../components/common/PageBreadCrumb';
import PageToolbar from '../../components/ui/PageToolbar';
import { FileIcon, DownloadIcon, TrashBinIcon, DocsIcon, PageIcon } from '../../icons';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/button/Button';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import { useQueryParams } from '../../hooks/useQueryParams';
import {
    getDocuments,
    uploadDocument,
    downloadDocument,
    deleteDocument,
    Document,
    DocumentListResponse
} from '../../api/documents';
import { formatDate } from '../../utils/business';
import { useT } from '../../lib/i18n';

const ITEMS_PER_PAGE = 10;
type UploadErrorKind = 'too_large' | 'failed' | null;

export default function Documents() {
    const { t, lang } = useT();
    const locale = lang === 'en' ? 'en-US' : 'bs-BA';
    const { success: showSuccess, error: showError } = useToast();
    const { user, loading: authLoading } = useApp();
    const { getParam, setParams } = useQueryParams();

    const showErrorRef = useRef(showError);
    showErrorRef.current = showError;
    const loadErrorTextRef = useRef(t.documents.loadError);
    loadErrorTextRef.current = t.documents.loadError;

    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [totalItems, setTotalItems] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [uploading, setUploading] = useState(false);
    const uploadLock = useRef(false);
    const [uploadDraft, setUploadDraft] = useState<File | null>(null);
    const [uploadErrorKind, setUploadErrorKind] = useState<UploadErrorKind>(null);
    const deleteLock = useRef(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const fetchDocuments = useCallback(async (page = 1, search = '') => {
        setLoading(true);
        setLoadError(false);
        try {
            const params: any = { page, limit: ITEMS_PER_PAGE };
            if (search) params.search = search;
            const response: DocumentListResponse = await getDocuments(params);

            // Defensive check
            if (response && Array.isArray(response.data)) {
                setDocuments(response.data);
                setTotalItems(response.total || 0);
            } else {
                setDocuments([]);
                setTotalItems(0);
            }
            setCurrentPage(page);
        } catch (err: any) {
            console.error('Fetch error:', err);
            setLoadError(true);
            showErrorRef.current(loadErrorTextRef.current);
            setDocuments([]);
            setTotalItems(0);
        } finally {
            setLoading(false);
        }
    }, []);

    const userId = user?.id;
    useEffect(() => {
        if (userId && !authLoading) {
            const page = parseInt(getParam('page', '1')) || 1;
            const q = getParam('q', '') || '';
            setCurrentPage(page);
            setSearchTerm(q);
            void fetchDocuments(page, q);
        } else if (!authLoading) {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, authLoading, fetchDocuments]);

    useEffect(() => {
        if (userId && !authLoading) {
            setParams({
                page: currentPage > 1 ? currentPage : null,
                q: searchTerm || null,
            });
        }
    }, [currentPage, searchTerm, userId, authLoading, setParams]);

    const handleSearch = (value: string) => {
        setSearchTerm(value);
        setCurrentPage(1);
        void fetchDocuments(1, value);
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        void fetchDocuments(page, searchTerm);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const saveUpload = async (file: File) => {
        if (uploadLock.current) return;
        setUploadDraft(file);
        setUploadErrorKind(null);
        if (file.size > 5 * 1024 * 1024) {
            setUploadErrorKind('too_large');
            return;
        }
        uploadLock.current = true;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            await uploadDocument(formData);
            showSuccess(t.documents.uploadSuccess);
            setUploadDraft(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            void fetchDocuments(1, searchTerm);
        } catch {
            setUploadErrorKind('failed');
        } finally {
            uploadLock.current = false;
            setUploading(false);
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) void saveUpload(file);
    };

    const handleDownload = async (doc: Document) => {
        try {
            const blob = await downloadDocument(doc.id);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch {
            showError(t.documents.downloadError);
        }
    };

    const handleDelete = async (doc: Document) => {
        if (deleteLock.current) return;
        if (!confirm(t.documents.deleteConfirm)) return;
        deleteLock.current = true;
        setDeletingId(doc.id);
        try {
            await deleteDocument(doc.id);
            showSuccess(t.documents.deleteSuccess);
            void fetchDocuments(currentPage, searchTerm);
        } catch {
            showError(t.documents.deleteError);
        } finally {
            deleteLock.current = false;
            setDeletingId(null);
        }
    };

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const uploadErrorText = uploadErrorKind === 'too_large'
        ? t.documents.fileTooLarge
        : uploadErrorKind === 'failed'
            ? t.documents.uploadError
            : null;

    const columns: Column<Document>[] = [
        {
            key: 'name',
            header: t.documents.name,
            render: (_val, doc) => {
                const isImage = doc.type.startsWith('image/');
                const isPDF = doc.type === 'application/pdf';
                const isText = doc.type === 'text/plain';

                let Icon = FileIcon;
                let iconColor = 'text-gray-400';

                if (isImage) iconColor = 'text-purple-500';
                else if (isPDF) {
                    Icon = DocsIcon;
                    iconColor = 'text-red-500';
                } else if (isText) {
                    Icon = PageIcon;
                    iconColor = 'text-blue-500';
                }

                return (
                    <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${iconColor}`} />
                        <span className="font-medium text-gray-900 dark:text-white" title={doc.name}>
                            {doc.name}
                        </span>
                    </div>
                );
            }
        },
        {
            key: 'type',
            header: t.documents.type,
            render: (val) => {
                const parts = String(val || '').split('/');
                return (parts[parts.length - 1] || '').toUpperCase();
            }
        },
        {
            key: 'size',
            header: t.documents.size,
            render: (val) => formatSize(val as number)
        },
        {
            key: 'uploaded_by',
            header: t.documents.uploadedBy,
            render: (_, doc) => (
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{doc.profiles?.full_name || t.documents.systemActor}</span>
                    <span className="text-xs text-gray-500">{doc.profiles?.email || t.documents.automatedActor}</span>
                </div>
            )
        },
        {
            key: 'created_at',
            header: t.documents.uploadedAt,
            render: (val) => formatDate(val as string, locale)
        },
        {
            key: 'actions',
            header: t.common.actions,
            render: (_, doc) => (
                <div className="flex gap-2 justify-end">
                    <Button
                        size="sm"
                        variant="outline"
                        title={`${t.common.download} ${doc.name}`}
                        aria-label={`${t.common.download} ${doc.name}`}
                        onClick={() => void handleDownload(doc)}
                        className="p-2"
                    >
                        <DownloadIcon className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        title={`${t.common.delete} ${doc.name}`}
                        aria-label={`${t.common.delete} ${doc.name}`}
                        disabled={deletingId === doc.id}
                        onClick={() => void handleDelete(doc)}
                        className="p-2 text-red-600 hover:text-red-700"
                    >
                        <TrashBinIcon className="w-4 h-4" />
                    </Button>
                </div>
            )
        },
    ];

    if (!authLoading && !user) {
        return <div className="p-6"><EmptyState title={t.documents.authRequiredTitle} description={t.documents.authRequiredDesc} /></div>;
    }

    return (
        <>
            <PageMeta title={`${t.documents.title} | Travline`} description={t.documents.pageDescription} />

            <input
                type="file"
                aria-label={t.documents.upload}
                disabled={uploading}
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
            />

            <div className="mb-6">
                <PageBreadCrumb pageTitle={t.documents.title} />
            </div>

            <PageToolbar
                title={t.documents.title}
                description={t.documents.description}
                searchPlaceholder={`${t.common.search}...`}
                searchValue={searchTerm}
                onSearchChange={handleSearch}
                actions={
                    <Button
                        variant="primary"
                        onClick={handleUploadClick}
                        disabled={uploading}
                        className="flex items-center gap-2"
                    >
                        {uploading ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <FileIcon className="w-4 h-4" />
                        )}
                        {uploading ? t.common.saving : t.documents.upload}
                    </Button>
                }
            />

            {uploadErrorText && (
                <div role="alert" className="mb-4 space-y-3 rounded-lg border border-error-200 p-4 text-sm text-error-600 dark:border-error-800 dark:text-error-400">
                    <p>{uploadErrorText}</p>
                    {uploadDraft && (
                        <>
                            <p className="break-words">{uploadDraft.name}</p>
                            <Button disabled={uploading || uploadDraft.size > 5 * 1024 * 1024} onClick={() => void saveUpload(uploadDraft)}>
                                {t.documents.retryUpload}
                            </Button>
                        </>
                    )}
                </div>
            )}

            <div className="mb-6 flex flex-col items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20 sm:flex-row sm:items-center">
                <DocsIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{t.documents.templatesBannerTitle}</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">{t.documents.templatesBannerDesc}</p>
                </div>
                <Link
                    to="/settings/pdf-templates"
                    className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                    {t.documents.openTemplates}
                </Link>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-20">
                    <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : loadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
                    <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">{t.documents.loadError}</p>
                    <Button type="button" variant="outline" onClick={() => void fetchDocuments(currentPage, searchTerm)}>
                        {t.documents.retry}
                    </Button>
                </div>
            ) : (documents || []).length === 0 ? (
                <EmptyState
                    title={t.documents.noDocuments}
                    description={searchTerm ? t.documents.searchEmptyDesc : t.documents.initialEmptyDesc}
                    action={!searchTerm ? { label: t.documents.upload, onClick: handleUploadClick } : undefined}
                />
            ) : (
                <>
                    <DataTable data={documents || []} columns={columns} />
                    {totalPages > 1 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={ITEMS_PER_PAGE}
                            onPageChange={handlePageChange}
                        />
                    )}
                </>
            )}
        </>
    );
}
