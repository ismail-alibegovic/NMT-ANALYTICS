import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import EmptyState from "../components/ui/EmptyState";
import PageToolbar from "../components/ui/PageToolbar";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { DataTable, type Column } from "../components/ui/DataTable";
import PackageEditorModal from "../components/packages/PackageEditorModal";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { useT } from "../lib/i18n/context";
import { getPackageById, type PackageDetail, type PackageDetailDeparture, type PackageDetailHotel, type PackageDetailService } from "../api/packages";

const formatCurrency = (amount?: number | null, currency = "BAM") =>
  new Intl.NumberFormat("bs-BA", { style: "currency", currency }).format(Number(amount || 0));

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("bs-BA", { year: "numeric", month: "2-digit", day: "2-digit" });
};

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
  const { user, loading: authLoading } = useApp();
  const { error: showError } = useToast();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!id || !user || authLoading) return;
    (async () => {
      setLoading(true);
      try {
        const result = await getPackageById(id);
        setPkg({
          ...result,
          price: result.price ?? result.base_price ?? 0,
          active: result.active ?? result.is_active ?? true,
        });
      } catch (err: any) {
        setPkg(null);
        showError(err?.message || t.common.error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user, authLoading, showError, t.common.error]);

  const serviceRows = useMemo(() => pkg?.package_services || [], [pkg]);
  const hotelRows = useMemo(() => pkg?.hotels || [], [pkg]);
  const departureRows = useMemo(() => pkg?.departures || [], [pkg]);

  const serviceColumns: Column<PackageDetailService>[] = [
    { key: "service_type", header: t.packages.name, render: (_v, row) => <span className="font-medium text-gray-900 dark:text-white">{row.service_type || "—"}</span> },
    { key: "provider_name", header: t.packages.provider, render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.provider_name || "—"}</span> },
    { key: "quantity", header: t.packages.quantity, render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{value ?? "—"}</span> },
    { key: "unit_price", header: t.packages.basePrice, render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{formatCurrency(row.unit_price, row.currency || pkg?.currency || "BAM")}</span> },
    { key: "notes", header: t.payments.note, render: (value) => <span className="text-sm text-gray-500 dark:text-gray-400">{(value as string) || "—"}</span> },
  ];

  const hotelColumns: Column<PackageDetailHotel>[] = [
    {
      key: "hotel_name",
      header: t.packages.hotel,
      render: (_v, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-white">{row.hotel_name || row.hotels?.name || "—"}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{row.room_type || "—"}</span>
        </div>
      ),
    },
    {
      key: "check_in",
      header: t.operations.hotels.checkIn || "Check-in",
      render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{formatDate(row.check_in)}</span>,
    },
    {
      key: "check_out",
      header: t.operations.hotels.checkOut || "Check-out",
      render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{formatDate(row.check_out)}</span>,
    },
    {
      key: "rooms_reserved",
      header: t.operations.hotels.roomsReserved || "Rooms",
      render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{value ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (_v, row) => row.hotel_id ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => navigate(`/operations/hotels?hotelId=${row.hotel_id}`)}>
            {t.packages.routeToHotel}
          </Button>
        </div>
      ) : null,
    },
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
                {pkg.transport_type && <Badge color="light" size="sm">{pkg.transport_type}</Badge>}
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
            <InfoRow label={t.packages.transportType} value={pkg.transport_type || "—"} />
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

        <SectionCard title={t.packages.linkedHotels}>
          {hotelRows.length === 0 ? (
            <EmptyState title={t.packages.noLinkedHotels} description={t.packages.description} />
          ) : (
            <DataTable data={hotelRows} columns={hotelColumns} />
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
          setEditorOpen(false);
          if (!id) return;
          const fresh = await getPackageById(id);
          setPkg({
            ...fresh,
            price: fresh.price ?? fresh.base_price ?? 0,
            active: fresh.active ?? fresh.is_active ?? true,
          });
        }}
        initial={pkg}
      />
    </>
  );
}
