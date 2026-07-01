import { useState, useEffect } from 'react';
import PageMeta from '../../components/common/PageMeta';
import { DataTable, Column, Pagination } from '../../components/ui/DataTable';
import { FormModal } from '../../components/ui/FormModal';
import ImportModal from '../../components/import/ImportModal';
import PageToolbar from '../../components/ui/PageToolbar';
import { FileIcon, BoxCubeIcon } from '../../icons';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/button/Button';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import { useQueryParams } from '../../hooks/useQueryParams';
import { useDataInvalidation } from '../../hooks/useDataInvalidation';
import {
  getPackages,
  createPackage,
  updatePackage,
  deletePackage,
  Package,
  PackageListResponse
} from '../../api/packages';

const ITEMS_PER_PAGE = 10;

export default function Packages() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { getParam, setParams } = useQueryParams();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchPackages = async (page = 1, search = '') => {
    setLoading(true);
    setError(null);
    try {
      const filters: any = { page, limit: ITEMS_PER_PAGE };
      if (search) filters.search = search;
      const response: PackageListResponse = await getPackages(filters);
      setPackages(response.data);
      setTotalItems(response.total);
      setCurrentPage(page);
    } catch (err: any) {
      setError(err.message || 'Failed to load packages');
      showError('Failed to load packages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) {
      const page = parseInt(getParam('page', '1'));
      const q = getParam('q', '');
      setCurrentPage(page);
      setSearchTerm(q);
      fetchPackages(page, q);
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
    fetchPackages(1, value);
  };

  useDataInvalidation('packages', () => {
    fetchPackages(currentPage, searchTerm);
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchPackages(page, searchTerm);
  };

  const handleCreate = () => {
    setEditingPackage(null);
    setModalOpen(true);
  };

  const handleEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setModalOpen(true);
  };

  const handleDelete = async (pkg: Package) => {
    if (!confirm(`Are you sure you want to delete "${pkg.name}"?`)) return;
    try {
      await deletePackage(pkg.id);
      showSuccess('Package deleted successfully');
      fetchPackages(currentPage, searchTerm);
    } catch {
      showError('Failed to delete package');
    }
  };

  const handleSubmit = async (data: any) => {
    setSubmitting(true);
    try {
      const payload = {
        ...data,
        price: Number(data.price),
        durationDays: data.durationDays ? Number(data.durationDays) : undefined,
        maxParticipants: data.maxParticipants ? Number(data.maxParticipants) : undefined,
      };

      if (editingPackage) {
        await updatePackage(editingPackage.id, payload);
        showSuccess('Package updated successfully');
      } else {
        await createPackage(payload);
        showSuccess('Package created successfully');
      }
      setModalOpen(false);
      fetchPackages(currentPage, searchTerm);
    } catch (err: any) {
      showError(editingPackage ? 'Failed to update package' : 'Failed to create package');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<Package>[] = [
    {
      key: 'name',
      header: 'Package',
      render: (_, pkg) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <BoxCubeIcon className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-gray-900 dark:text-white">{pkg.name}</span>
            <span className="text-xs text-gray-500">{pkg.destination}</span>
          </div>
        </div>
      )
    },
    {
      key: 'price',
      header: 'Price',
      render: (val, pkg) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {pkg.currency} {Number(val || 0).toLocaleString()}
        </span>
      )
    },
    {
      key: 'active',
      header: 'Status',
      render: (val) => (
        <Badge color={val ? 'success' : 'error'} variant="light" size="sm">
          {val ? 'Enabled' : 'Disabled'}
        </Badge>
      )
    },
    {
      key: 'actions', header: 'Actions', render: (_, pkg) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => handleEdit(pkg)} className="p-2">Edit</Button>
          <Button size="sm" variant="outline" onClick={() => handleDelete(pkg)} className="p-2 text-red-600 hover:text-red-700">Delete</Button>
        </div>
      )
    },
  ];

  const formFields = [
    { name: 'name', label: 'Package Name', type: 'text' as const, required: true },
    { name: 'destination', label: 'Destination', type: 'text' as const, required: true },
    { name: 'price', label: 'Price', type: 'number' as const, required: true },
    { name: 'currency', label: 'Currency', type: 'text' as const, required: true },
    { name: 'description', label: 'Description', type: 'textarea' as const },
    { name: 'durationDays', label: 'Duration (days)', type: 'number' as const },
    { name: 'maxParticipants', label: 'Max Participants', type: 'number' as const },
    { name: 'startDate', label: 'Start Date', type: 'date' as const },
    { name: 'endDate', label: 'End Date', type: 'date' as const },
    { name: 'active', label: 'Active', type: 'checkbox' as const },
  ];

  if (!authLoading && !user) return <div className="p-6"><EmptyState title="Auth Required" description="Please sign in" /></div>;

  return (
    <>
      <PageMeta title="Packages | Travline" description="Manage travel packages and destinations" />
      <PageToolbar
        title="Packages"
        description="Manage travel packages and destinations"
        searchPlaceholder="Search packages..."
        searchValue={searchTerm}
        onSearchChange={handleSearch}
        createButton={{ label: "Add Package", onClick: handleCreate }}
        actions={
          <Button
            variant="outline"
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-2"
          >
            <FileIcon className="w-4 h-4" />
            Import CSV
          </Button>
        }
      />

      <ImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        entity="packages"
        onSuccess={() => {
          setImportModalOpen(false);
          fetchPackages(currentPage, searchTerm);
        }}
      />

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="p-6">
          <EmptyState title="Failed to load packages" description={error} action={{ label: "Try Again", onClick: () => fetchPackages(currentPage, searchTerm) }} />
        </div>
      ) : packages.length === 0 ? (
        <EmptyState title="No packages found" description={searchTerm ? "Try searching for something else" : "Get started by adding your first package"} action={!searchTerm ? { label: "Add Package", onClick: handleCreate } : undefined} />
      ) : (
        <>
          <DataTable data={packages} columns={columns} />
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

      <FormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPackage ? 'Edit Package' : 'Add Package'}
        fields={formFields}
        onSubmit={handleSubmit}
        initialData={editingPackage ? {
          ...editingPackage,
          active: editingPackage.active
        } : { currency: 'BAM', active: true }}
        submitButtonText={editingPackage ? 'Update' : 'Create'}
        loading={submitting}
      />
    </>
  );
}
