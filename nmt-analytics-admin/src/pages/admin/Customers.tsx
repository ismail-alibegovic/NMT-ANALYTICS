import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import PageMeta from '../../components/common/PageMeta';
import { DataTable, Column, Pagination } from '../../components/ui/DataTable';
import { FormModal } from '../../components/ui/FormModal';
import ImportModal from '../../components/import/ImportModal';
import PageToolbar from '../../components/ui/PageToolbar';
import { FileIcon, UserCircleIcon } from '../../icons';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/button/Button';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/AppContext';
import { useQueryParams } from '../../hooks/useQueryParams';
import { useDataInvalidation } from '../../hooks/useDataInvalidation';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  Customer
} from '../../api/customers';
import { getPackages, Package } from '../../api/packages';

const ITEMS_PER_PAGE = 10;

export default function Customers() {
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { getParam, setParams } = useQueryParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [packageFilter, setPackageFilter] = useState<string>('');

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchCustomers = async (page = 1, search = '', pkgId = '') => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCustomers({ page, limit: ITEMS_PER_PAGE, search: search || undefined, packageId: pkgId || undefined });
      setCustomers(response.data || []);
      setTotalItems(response.total || 0);
      setCurrentPage(page);
    } catch (err: any) {
      setError(err.message || 'Failed to load customers');
      showError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const fetchPackagesList = async () => {
    try {
      const res = await getPackages({ limit: 200 });
      setPackages(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchPackagesList();
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      const page = parseInt(getParam('page', '1'));
      const q = getParam('q', '');
      const pkg = getParam('package', '');
      setCurrentPage(page);
      setSearchTerm(q);
      setPackageFilter(pkg);
      fetchCustomers(page, q, pkg);
    } else if (!authLoading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    if (!authLoading && user) {
      setParams({
        page: currentPage > 1 ? currentPage : null,
        q: searchTerm || null,
        package: packageFilter || null,
      });
    }
  }, [currentPage, searchTerm, packageFilter, setParams, authLoading, user]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    fetchCustomers(1, value, packageFilter);
  };

  useDataInvalidation('customers', () => {
    fetchCustomers(currentPage, searchTerm, packageFilter);
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchCustomers(page, searchTerm, packageFilter);
  };

  const handleCreate = () => {
    setEditingCustomer(null);
    setModalOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setModalOpen(true);
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Are you sure you want to delete ${customer.full_name}?`)) return;
    try {
      await deleteCustomer(customer.id);
      showSuccess('Customer deleted successfully');
      fetchCustomers(currentPage, searchTerm, packageFilter);
    } catch {
      showError('Failed to delete customer');
    }
  };

  const handleSubmit = async (data: any) => {
    console.log('Submitting customer data:', data);
    setSubmitting(true);
    try {
      // Ensure empty strings are treated as null/undefined if desired, or let backend handle it
      const payload = {
        ...data,
        email: data.email || undefined,
        phone: data.phone || undefined
      };

      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, payload);
        showSuccess('Customer updated successfully');
      } else {
        await createCustomer(payload);
        showSuccess('Customer created successfully');
      }
      setModalOpen(false);
      fetchCustomers(currentPage, searchTerm, packageFilter);
    } catch (err: any) {
      console.error('Customer submission error:', err);
      // Use backend error message if available
      const errorMessage = err.message || (editingCustomer ? 'Failed to update customer' : 'Failed to create customer');

      if (err.status === 409) {
        showError('Customer with this phone already exists');
      } else {
        showError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'lead': return 'info';
      case 'archived': return 'warning';
      default: return 'light';
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: 'fullName',
      header: 'Customer',
      render: (_, customer) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <UserCircleIcon className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-gray-900 dark:text-white">
              {customer.full_name || '-'}
            </span>
            <span className="text-xs text-gray-500">{customer.email || 'No email'}</span>
          </div>
        </div>
      )
    },
    { key: 'phone', header: 'Phone' },
    {
      key: 'status',
      header: 'Status',
      render: (val) => (
        <Badge color={getStatusColor(val as string)} variant="light" size="sm">
          {(val as string)?.charAt(0).toUpperCase() + (val as string)?.slice(1)}
        </Badge>
      )
    },
    {
      key: 'actions', header: 'Actions', render: (_, customer) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => navigate(`/customers/${customer.id}`)} className="p-2">View</Button>
          <Button size="sm" variant="outline" onClick={() => handleEdit(customer)} className="p-2">Edit</Button>
          <Button size="sm" variant="outline" onClick={() => handleDelete(customer)} className="p-2 text-red-600 hover:text-red-700">Delete</Button>
        </div>
      )
    },
  ];

  const formFields = [
    { name: 'full_name', label: 'Full Name', type: 'text' as const, required: true },
    { name: 'email', label: 'Email', type: 'email' as const },
    { name: 'phone', label: 'Phone', type: 'tel' as const },
    {
      name: 'status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Lead', value: 'lead' },
        { label: 'Archived', value: 'archived' }
      ],
      required: true
    },
    { name: 'notes', label: 'Notes', type: 'text' as const },
  ];

  if (!authLoading && !user) return <div className="p-6"><EmptyState title="Auth Required" description="Please sign in" /></div>;

  return (
    <>
      <PageMeta title="Customers | Travline" description="Manage your customer database" />
      <PageToolbar
        title="Customers"
        description="Manage your customer database"
        searchPlaceholder="Search customers..."
        searchValue={searchTerm}
        onSearchChange={handleSearch}
        createButton={{ label: "Add Customer", onClick: handleCreate }}
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
        entity="customers"
        onSuccess={() => {
          setImportModalOpen(false);
          fetchCustomers(currentPage, searchTerm, packageFilter);
        }}
      />

      {/* Filter by package */}
      <div className="mb-6">
        <div className="w-full sm:w-64">
          <select
            value={packageFilter}
            onChange={(e) => {
              setPackageFilter(e.target.value);
              setCurrentPage(1);
              fetchCustomers(1, searchTerm, e.target.value);
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
          >
            <option value="">Svi klijenti (svi aranžmani)</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>{pkg.name} - {pkg.destination}</option>
            ))}
          </select>
        </div>
        {packageFilter && (
          <p className="text-xs text-gray-500 mt-2">
            Prikazani su klijenti koji imaju rezervaciju za odabrani aranžman.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <div className="p-6">
          <EmptyState title="Failed to load customers" description={error} action={{ label: "Try Again", onClick: () => fetchCustomers(currentPage, searchTerm, packageFilter) }} />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState title="No customers found" description={searchTerm ? "Try searching for something else" : "Get started by adding your first customer"} action={!searchTerm ? { label: "Add Customer", onClick: handleCreate } : undefined} />
      ) : (
        <>
          <DataTable data={customers} columns={columns} />
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
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        fields={formFields}
        onSubmit={handleSubmit}
        initialData={editingCustomer ? {
          full_name: editingCustomer.full_name,
          email: editingCustomer.email,
          phone: editingCustomer.phone,
          status: editingCustomer.status || 'active',
          notes: editingCustomer.notes || '',
        } : { status: 'active' }}
        submitButtonText={editingCustomer ? 'Update' : 'Create'}
        loading={submitting}
      />
    </>
  );
}
