import { useState, useEffect, useRef } from 'react';
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

const ITEMS_PER_PAGE = 10;

export default function Documents() {
    const { success: showSuccess, error: showError } = useToast();
    const { user, loading: authLoading } = useApp();
    const { getParam, setParams } = useQueryParams();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalItems, setTotalItems] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const fetchDocuments = async (page = 1, search = '') => {
        setLoading(true);
        setError(null);
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
            setError(err.message || 'Failed to load documents');
            showError('Failed to load documents');
            setDocuments([]); // Prevent crash
            setTotalItems(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && !authLoading) {
            const page = parseInt(getParam('page', '1')) || 1;
            const q = getParam('q', '') || '';
            setCurrentPage(page);
            setSearchTerm(q);
            fetchDocuments(page, q);
        } else if (!authLoading) {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, authLoading]);

    useEffect(() => {
        if (user && !authLoading) {
            setParams({
                page: currentPage > 1 ? currentPage : null,
                q: searchTerm || null,
            });
        }
    }, [currentPage, searchTerm, user, authLoading, setParams]);

    const handleSearch = (value: string) => {
        setSearchTerm(value);
        setCurrentPage(1);
        fetchDocuments(1, value);
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        fetchDocuments(page, searchTerm);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            await uploadDocument(formData);
            showSuccess('Document uploaded successfully');
            fetchDocuments(1, searchTerm);
        } catch (err: any) {
            showError(err.message || 'Failed to upload document');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
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
        } catch (err: any) {
            showError('Failed to download document');
        }
    };

    const handleDelete = async (doc: Document) => {
        if (!confirm(`Are you sure you want to delete "${doc.name}"?`)) return;
        try {
            await deleteDocument(doc.id);
            showSuccess('Document deleted successfully');
            fetchDocuments(currentPage, searchTerm);
        } catch (err: any) {
            showError('Failed to delete document');
        }
    };

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const columns: Column<Document>[] = [
        {
            key: 'name',
            header: 'Name',
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
            header: 'Type',
            render: (val) => {
                const parts = (val as string).split('/');
                return parts[parts.length - 1].toUpperCase();
            }
        },
        {
            key: 'size',
            header: 'Size',
            render: (val) => formatSize(val as number)
        },
        {
            key: 'uploaded_by',
            header: 'Uploaded By',
            render: (_, doc) => (
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{doc.profiles?.full_name || 'System'}</span>
                    <span className="text-xs text-gray-500">{doc.profiles?.email || 'automated'}</span>
                </div>
            )
        },
        {
            key: 'created_at',
            header: 'Date',
            render: (val) => formatDate(val as string)
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (_, doc) => (
                <div className="flex gap-2 justify-end">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(doc)}
                        className="p-2"
                    >
                        <DownloadIcon className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(doc)}
                        className="p-2 text-red-600 hover:text-red-700"
                    >
                        <TrashBinIcon className="w-4 h-4" />
                    </Button>
                </div>
            )
        },
    ];

    if (!authLoading && !user) return <div className="p-6"><EmptyState title="Auth Required" description="Please sign in" /></div>;

    return (
        <>
            <PageMeta title="Documents | Travline" description="Manage and store important files and documents" />

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
            />

            <div className="mb-6">
                <PageBreadCrumb pageTitle="Documents" />
            </div>

            <PageToolbar
                title="Documents"
                description="Manage and store important files and documents"
                searchPlaceholder="Search documents..."
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
                        {uploading ? 'Uploading...' : 'Upload Document'}
                    </Button>
                }
            />

            {loading ? (
                <div className="flex items-center justify-center p-20">
                    <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : error ? (
                <div className="p-6">
                    <EmptyState
                        title="Failed to load documents"
                        description={error}
                        action={{ label: "Try Again", onClick: () => fetchDocuments(currentPage, searchTerm) }}
                    />
                </div>
            ) : (documents || []).length === 0 ? (
                <EmptyState
                    title="No documents found"
                    description={searchTerm ? "Try searching for something else" : "Get started by uploading your first document"}
                    action={!searchTerm ? { label: "Upload Document", onClick: handleUploadClick } : undefined}
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
