import { useState, useEffect, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import { DataTable, Column, Pagination } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/badge/Badge";
import { useToast } from "../../context/ToastContext";
import { formatDate, getDepartureStatus } from "../../utils/business";
import Button from "../../components/ui/button/Button";
import { FormModal } from "../../components/ui/FormModal";
import ImportModal from "../../components/import/ImportModal";
import { FileIcon, TableIcon, CalenderIcon } from "../../icons";
import DepartureCalendarView from "../../components/departures/DepartureCalendarView";
import {
  getDepartures,
  createDeparture,
  updateDeparture,
  deleteDeparture,
  Departure,
  DepartureFilters,
} from "../../api/departures";
import { getPackages, Package } from "../../api/packages";

const ITEMS_PER_PAGE = 10;

type ViewMode = "table" | "calendar";

const STATUS_LABELS: Record<string, string> = {
  active: "Aktivan",
  cancelled: "Otkazan",
  completed: "Završen",
};

export default function Departures() {
  const { error: showError, success: showSuccess } = useToast();
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeparture, setEditingDeparture] = useState<Departure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filter states
  const [packageId, setPackageId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchPackages = async () => {
    try {
      const response = await getPackages({ limit: 100 });
      setPackages(response.data);
    } catch (err) {
      console.error('Failed to fetch packages:', err);
    }
  };

  const fetchDepartures = useCallback(async (page = 1, mode?: ViewMode) => {
    setLoading(true);
    const activeMode = mode || viewMode;
    try {
      const filters: DepartureFilters = {
        page,
        limit: activeMode === "calendar" ? 500 : ITEMS_PER_PAGE,
        packageId: packageId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
      };

      const response = await getDepartures(filters);
      setDepartures(response.data);
      setTotalItems(response.total);
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Failed to fetch departures:', err);
      showError('Failed to load departures');
    } finally {
      setLoading(false);
    }
  }, [packageId, dateFrom, dateTo, statusFilter, searchQuery, showError, viewMode]);

  useEffect(() => {
    fetchPackages();
  }, []);

  useEffect(() => {
    fetchDepartures(1);
  }, [fetchDepartures]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    fetchDepartures(1, mode);
  };

  const handlePageChange = (page: number) => {
    fetchDepartures(page);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "completed":
        return "info";
      case "cancelled":
        return "error";
      default:
        return "light";
    }
  };

  const handleCreate = () => {
    setEditingDeparture(null);
    setModalOpen(true);
  };

  const handleEdit = (dep: Departure) => {
    setEditingDeparture(dep);
    setModalOpen(true);
  };

  const handleDelete = async (dep: Departure) => {
    if (!confirm(`Jeste li sigurni da želite obrisati polazak za "${dep.packageName}"?`)) return;
    try {
      await deleteDeparture(dep.id);
      showSuccess('Polazak obrisan');
      fetchDepartures(currentPage);
    } catch {
      showError('Brisanje polaska nije uspjelo');
    }
  };

  const handleQuickBooked = async (dep: Departure, delta: number) => {
    const newBooked = Math.max(0, Math.min(dep.booked + delta, dep.capacity));
    if (newBooked === dep.booked) return;
    try {
      await updateDeparture(dep.id, { booked: newBooked });
      showSuccess(`Zauzetost ažurirana: ${dep.booked} → ${newBooked}`);
      fetchDepartures(currentPage);
    } catch {
      showError('Greška pri ažuriranju zauzetosti');
    }
  };

  const handleSubmit = async (data: any) => {
    setSubmitting(true);
    try {
      if (editingDeparture) {
        await updateDeparture(editingDeparture.id, {
          packageId: data.packageId,
          departAt: data.departAt,
          returnAt: data.returnAt,
          capacity: Number(data.capacity),
          status: data.status,
          booked: Number(data.booked),
        });
      } else {
        await createDeparture({
          packageId: data.packageId,
          departAt: data.departAt,
          returnAt: data.returnAt,
          capacity: Number(data.capacity),
          status: data.status || 'active',
          booked: Number(data.booked),
        });
      }
      setModalOpen(false);
      fetchDepartures(currentPage);
    } catch (err: any) {
      showError(err?.message || 'Greška pri čuvanju polaska');
    } finally {
      setSubmitting(false);
    }
  };

  const formFields = [
    {
      name: 'packageId',
      label: 'Paket',
      type: 'select' as const,
      required: true,
      options: packages.map(p => ({ value: p.id, label: `${p.name} - ${p.destination}` })),
    },
    { name: 'departAt', label: 'Polazak', type: 'datetime-local' as const, required: true },
    { name: 'returnAt', label: 'Povratak', type: 'datetime-local' as const, required: true },
    { name: 'capacity', label: 'Kapacitet (broj mjesta)', type: 'number' as const, required: true },
    { name: 'booked', label: 'Trenutno zauzeto', type: 'number' as const },
    {
      name: 'status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'active', label: 'Aktivan' },
        { value: 'cancelled', label: 'Otkazan' },
        { value: 'completed', label: 'Završen' },
      ],
    },
  ];

  const columns: Column<Departure>[] = [
    {
      key: 'packageName',
      header: 'Paket',
      render: (_, departure) => (
        <div className="min-w-[160px]">
          <div className="font-medium text-gray-900 dark:text-white">{departure.packageName}</div>
          <div className="text-gray-500 dark:text-gray-400 text-xs">{departure.destination}</div>
        </div>
      )
    },
    {
      key: 'depart_at',
      header: 'Polazak',
      render: (val) => (
        <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
          {formatDate(val as string)}
        </span>
      )
    },
    {
      key: 'return_at',
      header: 'Povratak',
      render: (val) => (
        <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
          {formatDate(val as string)}
        </span>
      )
    },
    {
      key: 'capacity',
      header: 'Popunjenost',
      render: (_, departure) => {
        const capacityInfo = getDepartureStatus(departure.booked, departure.capacity);
        const occupancy = departure.capacity > 0
          ? Math.min(Math.max(departure.booked / departure.capacity, 0), 1)
          : 0;
        const barColor = occupancy >= 0.8
          ? 'bg-red-500'
          : occupancy >= 0.5
            ? 'bg-amber-500'
            : 'bg-emerald-500';
        return (
          <div className="w-full min-w-[200px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {departure.booked} / {departure.capacity}
              </span>
              <Badge size="sm" color={capacityInfo.level as any} variant="light">
                {capacityInfo.status === 'FULL' ? 'PUN' :
                 capacityInfo.status === 'ALMOST FULL' ? 'SKORO PUN' :
                 capacityInfo.status === 'FILLING' ? 'POPUNJAVA SE' : 'DOSTUPAN'}
              </Badge>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${occupancy * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <button
                onClick={() => handleQuickBooked(departure, -1)}
                disabled={departure.booked <= 0}
                className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold"
                title="Smanji zauzetost"
              >−</button>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mx-1">
                {Math.round(occupancy * 100)}%
              </span>
              <button
                onClick={() => handleQuickBooked(departure, +1)}
                disabled={departure.booked >= departure.capacity}
                className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold"
                title="Povećaj zauzetost"
              >+</button>
            </div>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      render: (val) => (
        <Badge size="sm" color={getStatusBadgeColor(val as string)} variant="light">
          {STATUS_LABELS[val as string] || (val as string)}
        </Badge>
      )
    },
    {
      key: 'actions',
      header: '',
      render: (_, dep) => (
        <div className="flex gap-1.5 justify-end">
          <Button size="sm" variant="outline" onClick={() => handleEdit(dep)} className="px-2.5 py-1 text-xs">
            Uredi
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleDelete(dep)} className="px-2.5 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
            Obriši
          </Button>
        </div>
      )
    },
  ];

  return (
    <>
      <PageMeta title="Polasci | Travline" description="Upravljanje polascima i kapacitetima" />
      <PageToolbar
        title="Polasci"
        description="Upravljanje polascima, kapacitetima i terminima"
        searchValue={searchQuery}
        onSearchChange={(query) => setSearchQuery(query)}
        searchPlaceholder="Traži polaske..."
        createButton={{ label: "Dodaj polazak", onClick: handleCreate }}
        actions={
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2"
          >
            <FileIcon className="w-4 h-4" />
            Import CSV
          </Button>
        }
      />

      {/* View Toggle + Filters Row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => handleViewChange("table")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === "table"
                ? "bg-brand-500 text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            <TableIcon className="w-4 h-4" />
            Tabela
          </button>
          <button
            onClick={() => handleViewChange("calendar")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === "calendar"
                ? "bg-brand-500 text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            <CalenderIcon className="w-4 h-4" />
            Kalendar
          </button>
        </div>
      </div>

      {viewMode === "table" && (
        <>
          {/* Filters */}
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white dark:bg-white/[0.03] p-4 rounded-xl border border-gray-200 dark:border-white/[0.05]">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Paket</label>
              <select
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
              >
                <option value="">Svi paketi</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
              >
                <option value="">Svi statusi</option>
                <option value="active">Aktivan</option>
                <option value="completed">Završen</option>
                <option value="cancelled">Otkazan</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Od</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Do</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-20">
              <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : departures.length === 0 ? (
            <EmptyState
              title="Nema polazaka"
              description="Nije pronađen nijedan polazak za odabrane filtere."
              action={(packageId || dateFrom || dateTo || statusFilter) ? { label: "Očisti filtere", onClick: () => { setPackageId(""); setDateFrom(""); setDateTo(""); setStatusFilter(""); } } : undefined}
            />
          ) : (
            <>
              <DataTable data={departures} columns={columns} />
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
      )}

      {viewMode === "calendar" && (
        <DepartureCalendarView departures={departures} loading={loading} />
      )}

      <ImportModal
        entity="departures"
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          setIsImportOpen(false);
          fetchDepartures(currentPage);
        }}
      />

      <FormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDeparture ? 'Uredi polazak' : 'Dodaj polazak'}
        fields={formFields}
        onSubmit={handleSubmit}
        initialData={editingDeparture ? {
          packageId: editingDeparture.package_id,
          departAt: editingDeparture.depart_at?.slice(0, 16) || '',
          returnAt: editingDeparture.return_at?.slice(0, 16) || '',
          capacity: editingDeparture.capacity,
          status: editingDeparture.status,
          booked: editingDeparture.booked,
        } : { status: 'active' }}
        submitButtonText={editingDeparture ? 'Sačuvaj' : 'Dodaj'}
        loading={submitting}
      />
    </>
  );
}
