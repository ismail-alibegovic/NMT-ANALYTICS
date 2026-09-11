import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import EmptyState from "../components/ui/EmptyState";
import PageToolbar from "../components/ui/PageToolbar";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Modal } from "../components/ui/modal";
import PackageEditorModal from "../components/packages/PackageEditorModal";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { useT } from "../lib/i18n/context";
import {
  createPackageCostItem,
  deletePackageCostItem,
  getPackageById,
  getPackageCosting,
  updatePackageCostItem,
  type CreatePackageCostItem,
  type PackageCostCategory,
  type PackageCostItem,
  type PackageCostUnit,
  type PackageCosting,
  type PackageDetail,
  type PackageDetailDeparture,
  type PackageDetailService,
} from "../api/packages";
import { getSuppliers, type Supplier, type SupplierService } from "../api/suppliers";
import { canAccessFinances } from "../types/roles";

const formatCurrency = (amount?: number | null, currency = "BAM") =>
  new Intl.NumberFormat("bs-BA", { style: "currency", currency }).format(Number(amount || 0));

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("bs-BA", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const costCategories: PackageCostCategory[] = ["hotel", "transport", "flight", "tour", "insurance", "supplier", "extra_service", "other"];
const costUnits: PackageCostUnit[] = ["per_person", "per_room", "per_night", "per_vehicle", "per_group", "per_booking", "per_day", "per_hour", "fixed"];

const statusColor = (status?: string | null) => {
  switch (status) {
    case "active":
    case "confirmed":
    case "completed":
      return "success";
    case "pending":
      return "warning";
    case "cancelled":
      return "error";
    default:
      return "light";
  }
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0 dark:border-gray-800">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <div className="text-right text-sm font-medium text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useT();
  const { user, userContext, loading: authLoading } = useApp();
  const { error: showError } = useToast();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [costing, setCosting] = useState<PackageCosting | null>(null);
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingError, setCostingError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<PackageCostItem | null>(null);
  const [costSaving, setCostSaving] = useState(false);
  const [costForm, setCostForm] = useState({
    category: "other" as PackageCostCategory,
    label: "",
    supplierId: "",
    supplierServiceId: "",
    unit: "fixed" as PackageCostUnit,
    quantity: "1",
    unitCost: "0",
    notes: "",
  });
  const canViewCosting = canAccessFinances(userContext?.role);

  useEffect(() => {
    if (!id || !user || authLoading) return;
    (async () => {
      setLoading(true);
      try {
        const result = await getPackageById(id);
        setPkg(result);
      } catch (err: any) {
        setPkg(null);
        showError(err?.message || t.common.error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user, authLoading, showError, t.common.error]);

  const loadCosting = useCallback(async () => {
    if (!id || !canViewCosting) return;
    setCostingLoading(true);
    setCostingError(null);
    try {
      const [costingResult, supplierResult] = await Promise.all([
        getPackageCosting(id),
        getSuppliers({ status: "active" }),
      ]);
      setCosting(costingResult);
      setSuppliers(supplierResult);
    } catch (err: any) {
      setCosting(null);
      setCostingError(err?.message || t.packages.costing.loadError);
    } finally {
      setCostingLoading(false);
    }
  }, [id, canViewCosting, t.packages.costing.loadError]);

  useEffect(() => {
    if (!id || !user || authLoading || !canViewCosting) return;
    loadCosting();
  }, [id, user, authLoading, canViewCosting, loadCosting]);

  const serviceRows = useMemo(() => pkg?.package_services || [], [pkg]);
  const hotelRows = useMemo(() => pkg?.packageHotels || [], [pkg]);
  const departureRows = useMemo(() => pkg?.departures || [], [pkg]);
  const supplierServices = useMemo(() => suppliers.flatMap((supplier) => supplier.services.filter((service) => service.active).map((service) => ({ ...service, supplierName: supplier.name }))), [suppliers]);
  const historicalSupplierServiceOption = useMemo(() => {
    if (!editingCost?.supplierServiceId) return null;
    if (supplierServices.some((service) => service.id === editingCost.supplierServiceId)) return null;
    return {
      id: editingCost.supplierServiceId,
      label: `${editingCost.supplierName || t.packages.costing.supplierService} — ${editingCost.supplierServiceName || editingCost.supplierServiceId}`,
    };
  }, [editingCost, supplierServices, t.packages.costing.supplierService]);
  const selectedSupplierService = useMemo<SupplierService & { supplierName: string } | undefined>(
    () => supplierServices.find((service) => service.id === costForm.supplierServiceId),
    [supplierServices, costForm.supplierServiceId],
  );

  const resetCostForm = () => {
    setEditingCost(null);
    setCostForm({
      category: "other",
      label: "",
      supplierId: "",
      supplierServiceId: "",
      unit: "fixed",
      quantity: "1",
      unitCost: "0",
      notes: "",
    });
  };

  const openCreateCost = () => {
    resetCostForm();
    setCostModalOpen(true);
  };

  const openEditCost = (item: PackageCostItem) => {
    setEditingCost(item);
    setCostForm({
      category: item.category,
      label: item.label,
      supplierId: item.supplierId || "",
      supplierServiceId: item.supplierServiceId || "",
      unit: item.unit,
      quantity: String(item.quantity),
      unitCost: String(item.unitCost),
      notes: item.notes || "",
    });
    setCostModalOpen(true);
  };

  const handleSupplierServiceChange = (serviceId: string) => {
    const service = supplierServices.find((item) => item.id === serviceId);
    if (!service) {
      setCostForm((prev) => ({ ...prev, supplierServiceId: "", supplierId: "" }));
      return;
    }
    const mappedCategory: PackageCostCategory =
      service.category === "accommodation" ? "hotel" :
      service.category === "activity" ? "tour" :
      service.category === "transport" || service.category === "flight" || service.category === "insurance" ? service.category :
      "supplier";
    setCostForm((prev) => ({
      ...prev,
      supplierServiceId: service.id,
      supplierId: service.supplierId,
      label: service.name,
      category: mappedCategory,
      unit: service.unit,
      unitCost: String(service.netPrice),
    }));
  };

  const saveCostItem = async () => {
    if (!id || !pkg) return;
    const quantity = Number(costForm.quantity);
    const unitCost = Number(costForm.unitCost);
    if (!costForm.label.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      showError(t.packages.costing.validationError);
      return;
    }
    if (selectedSupplierService && selectedSupplierService.currency !== pkg.currency) {
      showError(t.packages.costing.currencyMismatch);
      return;
    }
    setCostSaving(true);
    try {
      const payload: CreatePackageCostItem = {
        category: costForm.category,
        label: costForm.label.trim(),
        supplierId: costForm.supplierId || null,
        supplierServiceId: costForm.supplierServiceId || null,
        unit: costForm.unit,
        quantity,
        unitCost,
        currency: pkg.currency || "BAM",
        notes: costForm.notes.trim() || null,
      };
      if (editingCost) await updatePackageCostItem(id, editingCost.id, payload);
      else await createPackageCostItem(id, payload);
      setCostModalOpen(false);
      resetCostForm();
      await loadCosting();
    } catch (err: any) {
      showError(err?.message || t.packages.costing.saveError);
    } finally {
      setCostSaving(false);
    }
  };

  const removeCostItem = async (item: PackageCostItem) => {
    if (!id) return;
    try {
      await deletePackageCostItem(id, item.id);
      await loadCosting();
    } catch (err: any) {
      showError(err?.message || t.packages.costing.deleteError);
    }
  };

  const serviceColumns: Column<PackageDetailService>[] = [
    { key: "service_type", header: t.packages.name, render: (_v, row) => <span className="font-medium text-gray-900 dark:text-white">{row.service_type || "—"}</span> },
    { key: "provider_name", header: t.packages.provider, render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.provider_name || "—"}</span> },
    { key: "quantity", header: t.packages.quantity, render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{value ?? "—"}</span> },
    { key: "unit_price", header: t.packages.basePrice, render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{formatCurrency(row.unit_price, row.currency || pkg?.currency || "BAM")}</span> },
    { key: "notes", header: t.payments.note, render: (value) => <span className="text-sm text-gray-500 dark:text-gray-400">{(value as string) || "—"}</span> },
  ];

  const departureColumns: Column<PackageDetailDeparture>[] = [
    {
      key: "depart_at",
      header: t.departures.title,
      render: (_v, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-white">{formatDate(row.depart_at)}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(row.return_at)}</span>
        </div>
      ),
    },
    {
      key: "transport_type",
      header: t.packages.transportType,
      render: (value) => <span className="text-sm text-gray-600 capitalize dark:text-gray-300">{(value as string) || "—"}</span>,
    },
    {
      key: "booked",
      header: t.packages.booked,
      render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.booked ?? 0} / {row.capacity ?? 0}</span>,
    },
    {
      key: "status",
      header: t.packages.status,
      render: (value) => <Badge color={statusColor(value as string)} size="sm">{((value as string) || "unknown").toUpperCase()}</Badge>,
    },
    {
      key: "actions",
      header: "",
      render: (_v, row) => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => navigate(`/departures/${row.id}`)}>
            {t.packages.openDeparture}
          </Button>
        </div>
      ),
    },
  ];

  if (!authLoading && !user) {
    return <div className="p-6"><EmptyState title="Auth Required" description="Please sign in" /></div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="p-6">
        <EmptyState
          title={t.packages.packageNotFound}
          description={t.packages.packageNotFoundDescription}
          action={{ label: t.packages.backToPackages, onClick: () => navigate("/packages") }}
        />
      </div>
    );
  }

  return (
    <>
      <PageMeta title={`${pkg.name} | Travline`} description={pkg.description || pkg.destination} />
      <PageToolbar
        title={pkg.name}
        description={pkg.destination}
        hideSearch
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/packages")}>{t.packages.backToPackages}</Button>
            <Button onClick={() => setEditorOpen(true)}>{t.packages.edit}</Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 md:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title={t.packages.overview}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={pkg.active ? "success" : "error"} size="sm">{pkg.active ? t.packages.active : t.packages.inactive}</Badge>
                {pkg.tripType && <Badge color="light" size="sm">{pkg.tripType}</Badge>}
                {pkg.transportType && <Badge color="light" size="sm">{pkg.transportType}</Badge>}
              </div>
              <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{pkg.description || t.packages.noDescription}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              {(pkg as any).itinerary_id && (
                <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-500/20 dark:bg-brand-500/[0.05]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t.packages.sourceItinerary || "Source itinerary"}</p>
                  <a href={`/itineraries/${(pkg as any).itinerary_id}`} className="mt-1 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                    {t.packages.viewItinerary || "View itinerary"} →
                  </a>
                </div>
              )}
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{t.packages.basePrice}</p>
                  <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(pkg.price ?? pkg.base_price, pkg.currency)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{t.packages.departures}</p>
                  <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{departureRows.length}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t.packages.pricingAndDefaults}>
            <InfoRow label={t.packages.basePrice} value={formatCurrency(pkg.price ?? pkg.base_price, pkg.currency)} />
            <InfoRow label={t.packages.currency} value={pkg.currency || "BAM"} />
            <InfoRow label={t.packages.duration} value={pkg.durationDays ?? "—"} />
            <InfoRow label={t.packages.maxParticipants} value={pkg.maxParticipants ?? "—"} />
            <InfoRow label={t.packages.tripType} value={pkg.tripType || "—"} />
            <InfoRow label={t.packages.transportType} value={pkg.transportType || "—"} />
            <InfoRow label={t.packages.createdAt} value={formatDate(pkg.created_at)} />
          </SectionCard>
        </div>

        <SectionCard title={t.packages.linkedServices}>
          {serviceRows.length === 0 ? (
            <EmptyState title={t.packages.noLinkedServices} description={t.packages.description} />
          ) : (
            <DataTable data={serviceRows} columns={serviceColumns} />
          )}
        </SectionCard>

        {canViewCosting ? (
          <SectionCard title={t.packages.costing.title}>
            {costingLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
              </div>
            ) : costingError ? (
              <EmptyState title={t.packages.costing.errorTitle} description={costingError} action={{ label: t.packages.costing.retry, onClick: loadCosting }} />
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{t.packages.costing.totalPackageCost}</p>
                    <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{formatCurrency(costing?.totalCost || 0, costing?.currency || pkg.currency)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{t.packages.costing.currency}</p>
                    <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{costing?.currency || pkg.currency || "BAM"}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{t.packages.costing.items}</p>
                    <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{costing?.costItems.length || 0}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t.packages.costing.costItems}</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.packages.costing.description}</p>
                  </div>
                  <Button onClick={openCreateCost}>{t.packages.costing.addItem}</Button>
                </div>

                {(costing?.categoryBreakdown.length || 0) > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {costing?.categoryBreakdown.map((item) => (
                      <Badge key={item.category} color="light" size="sm">
                        {t.packages.costing.categories[item.category as PackageCostCategory] || item.category}: {formatCurrency(item.amount, costing.currency)}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {!costing || costing.costItems.length === 0 ? (
                  <EmptyState title={t.packages.costing.emptyTitle} description={t.packages.costing.emptyDescription} action={{ label: t.packages.costing.addItem, onClick: openCreateCost }} />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {costing.costItems.map((item) => (
                        <div key={item.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.55fr))_auto] lg:items-center">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge color="light" size="sm">{t.packages.costing.categories[item.category]}</Badge>
                              <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.supplierServiceName || item.supplierName || t.packages.costing.manualCost}</p>
                          </div>
                          <InfoMini label={t.packages.costing.unit} value={t.packages.costing.units[item.unit]} />
                          <InfoMini label={t.packages.costing.quantity} value={item.quantity} />
                          <InfoMini label={t.packages.costing.unitCost} value={formatCurrency(item.unitCost, item.currency)} />
                          <InfoMini label={t.packages.costing.totalCost} value={formatCurrency(item.totalCost, item.currency)} />
                          <div className="flex gap-2 lg:justify-end">
                            <Button size="sm" variant="outline" onClick={() => openEditCost(item)}>{t.packages.costing.edit}</Button>
                            <Button size="sm" variant="outline" onClick={() => removeCostItem(item)}>{t.packages.costing.delete}</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        ) : null}

        <SectionCard title={t.packages.linkedHotels}>
          {hotelRows.length === 0 ? (
            <EmptyState
              title={t.packages.noLinkedHotels}
              description={t.packages.noLinkedHotelsDescription}
              action={{ label: t.packages.edit, onClick: () => setEditorOpen(true) }}
            />
          ) : (
            <div className="space-y-4">
              {hotelRows
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder || a.hotelId.localeCompare(b.hotelId))
                .map((hotelLink) => (
                  <div key={hotelLink.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{hotelLink.hotel?.name || "—"}</h3>
                          {hotelLink.hotel?.stars ? <Badge color="light" size="sm">{hotelLink.hotel.stars}★</Badge> : null}
                          <Badge color="light" size="sm">{t.packages.editor.sortOrderLabel}: {hotelLink.sortOrder}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hotelLink.hotel?.destination || t.packages.editor.noHotelDestination}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color="light" size="sm">{t.packages.priceModifier}: {formatCurrency(hotelLink.priceModifier, pkg.currency || "BAM")}</Badge>
                        {hotelLink.hotelId ? (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/operations/hotels?hotelId=${hotelLink.hotelId}`)}>
                            {t.packages.routeToHotel}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{t.packages.roomOptions}</p>
                      {hotelLink.roomOptions.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t.packages.noRoomOptions}</p>
                      ) : (
                        <div className="space-y-2">
                          {hotelLink.roomOptions.map((option, index) => (
                            <div key={`${hotelLink.id}-${option.type}-${option.label}-${index}`} className="grid gap-3 rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.03] md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.7fr))]">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">{option.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{t.packages.editor.roomTypeLabels[option.type as keyof typeof t.packages.editor.roomTypeLabels] || option.type}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{t.packages.editor.netPriceLabel}</p>
                                <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(option.net_price, pkg.currency || "BAM")}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{t.packages.editor.sellPriceLabel}</p>
                                <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(option.sell_price, pkg.currency || "BAM")}</p>
                              </div>
                              <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{t.packages.editor.availableLabel}</p>
                                <p className="font-medium text-gray-900 dark:text-white">{option.available}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t.packages.departures}>
          {departureRows.length === 0 ? (
            <EmptyState title={t.packages.departures} description={t.packages.noDeparturesYet} />
          ) : (
            <DataTable data={departureRows} columns={departureColumns} />
          )}
        </SectionCard>
      </div>

      <PackageEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          if (!id) return;
          const fresh = await getPackageById(id);
          setPkg(fresh);
        }}
        initial={pkg}
      />

      <Modal isOpen={costModalOpen} onClose={() => { if (!costSaving) setCostModalOpen(false); }} className="m-4 max-w-2xl" title={editingCost ? t.packages.costing.editItem : t.packages.costing.addItem}>
        <div className="space-y-4 p-6">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t.packages.costing.supplierService}</span>
            <select
              value={costForm.supplierServiceId}
              onChange={(event) => handleSupplierServiceChange(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="">{t.packages.costing.manualCost}</option>
              {historicalSupplierServiceOption && (
                <option value={historicalSupplierServiceOption.id}>
                  {historicalSupplierServiceOption.label}
                </option>
              )}
              {supplierServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.supplierName} — {service.name} ({formatCurrency(service.netPrice, service.currency)})
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.packages.costing.category}>
              <select value={costForm.category} onChange={(event) => setCostForm((prev) => ({ ...prev, category: event.target.value as PackageCostCategory }))} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                {costCategories.map((category) => <option key={category} value={category}>{t.packages.costing.categories[category]}</option>)}
              </select>
            </Field>
            <Field label={t.packages.costing.unit}>
              <select value={costForm.unit} onChange={(event) => setCostForm((prev) => ({ ...prev, unit: event.target.value as PackageCostUnit }))} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                {costUnits.map((unit) => <option key={unit} value={unit}>{t.packages.costing.units[unit]}</option>)}
              </select>
            </Field>
          </div>

          <Field label={t.packages.costing.label}>
            <input value={costForm.label} onChange={(event) => setCostForm((prev) => ({ ...prev, label: event.target.value }))} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.packages.costing.quantity}>
              <input type="number" min="0.01" step="0.01" value={costForm.quantity} onChange={(event) => setCostForm((prev) => ({ ...prev, quantity: event.target.value }))} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
            </Field>
            <Field label={t.packages.costing.unitCost}>
              <input type="number" min="0" step="0.01" value={costForm.unitCost} onChange={(event) => setCostForm((prev) => ({ ...prev, unitCost: event.target.value }))} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
            </Field>
          </div>

          <Field label={t.packages.costing.notes}>
            <textarea value={costForm.notes} onChange={(event) => setCostForm((prev) => ({ ...prev, notes: event.target.value }))} className="min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCostModalOpen(false)} disabled={costSaving}>{t.common.cancel}</Button>
            <Button onClick={saveCostItem} disabled={costSaving}>{costSaving ? t.common.saving : t.common.save}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function InfoMini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}
