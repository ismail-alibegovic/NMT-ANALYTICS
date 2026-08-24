import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import PageToolbar from "../components/ui/PageToolbar";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import { DataTable, type Column } from "../components/ui/DataTable";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { useT } from "../lib/i18n/context";
import { getHotels, getHotelRooms, type Hotel, type HotelAllocation, type HotelRoom } from "../api/operations";
import { getHotelPackages, type HotelPackage } from "../api/packageHotels";
import { getDepartures, type Departure } from "../api/departures";

const formatCurrency = (amount?: number | null, currency = "BAM") =>
  new Intl.NumberFormat("bs-BA", { style: "currency", currency }).format(Number(amount || 0));

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("bs-BA", { year: "numeric", month: "2-digit", day: "2-digit" });
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

type AllocationRow = HotelAllocation & {
  departure?: Departure | null;
};

export default function HotelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useT();
  const { user, loading: authLoading } = useApp();
  const { error: showError } = useToast();
  const tr = t.operations.hotels;

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [hotelPackages, setHotelPackages] = useState<HotelPackage[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user || authLoading) return;
    (async () => {
      setLoading(true);
      try {
        const [hotels, roomRows, packageRows, departureRows] = await Promise.all([
          getHotels(),
          getHotelRooms(id).catch(() => []),
          getHotelPackages(id).catch(() => []),
          getDepartures({ limit: 200 }).then((r) => r.data || []).catch(() => []),
        ]);
        const target = hotels.find((item) => item.id === id) || null;
        setHotel(target);
        setRooms(roomRows);
        setHotelPackages(packageRows);
        setDepartures(departureRows);
      } catch (err: any) {
        showError(err?.message || t.common.error);
        setHotel(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user, authLoading, showError, t.common.error]);

  const allocationRows = useMemo<AllocationRow[]>(() => {
    const allocations = hotel?.allocations || [];
    return allocations.map((allocation) => ({
      ...allocation,
      departure: departures.find((dep) => dep.id === allocation.departureId) || null,
    }));
  }, [hotel, departures]);

  const roomColumns: Column<HotelRoom>[] = [
    { key: "roomType", header: tr.roomTypes, render: (value) => <span className="font-medium text-gray-900 dark:text-white">{value as string}</span> },
    { key: "capacity", header: tr.capacity, render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{value as number}</span> },
    { key: "basePrice", header: tr.price, render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{formatCurrency(row.basePrice, row.currency)}</span> },
    { key: "available", header: tr.available, render: (_v, row) => <Badge color={row.available > 0 ? "success" : "light"} size="sm">{row.available}/{row.total}</Badge> },
  ];

  const packageColumns: Column<HotelPackage>[] = [
    {
      key: "package",
      header: t.packages.title,
      render: (_v, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-white">{row.package?.name || "—"}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{row.package?.destination || "—"}</span>
        </div>
      ),
    },
    {
      key: "roomOptions",
      header: tr.roomTypes,
      render: (_v, row) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.roomOptions?.length || 0}</span>,
    },
    {
      key: "priceModifier",
      header: t.packages.basePrice,
      render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{Number(value || 0)}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (_v, row) => row.packageId ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => navigate(`/packages/${row.packageId}`)}>{tr.openPackage}</Button>
        </div>
      ) : null,
    },
  ];

  const allocationColumns: Column<AllocationRow>[] = [
    {
      key: "departure",
      header: t.departures.title,
      render: (_v, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-white">{row.departure?.packageName || "—"}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{row.departure?.depart_at ? formatDate(row.departure.depart_at) : "—"}</span>
        </div>
      ),
    },
    { key: "roomType", header: tr.type, render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{value as string}</span> },
    { key: "roomsReserved", header: tr.roomsReserved, render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{value as number}</span> },
    { key: "checkIn", header: tr.checkIn, render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{formatDate(value as string)}</span> },
    { key: "checkOut", header: tr.checkOut, render: (value) => <span className="text-sm text-gray-600 dark:text-gray-300">{formatDate(value as string)}</span> },
    {
      key: "actions",
      header: "",
      render: (_v, row) => row.departureId ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => navigate(`/departures/${row.departureId}`)}>{tr.openDeparture}</Button>
        </div>
      ) : null,
    },
  ];

  if (!authLoading && !user) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="p-6">
        <EmptyState
          title={tr.hotelNotFound}
          description={tr.hotelNotFoundDescription}
          action={{ label: tr.backToHotels, onClick: () => navigate("/operations/hotels") }}
        />
      </div>
    );
  }

  return (
    <>
      <PageMeta title={`${hotel.name} | Travline`} description={hotel.description || hotel.destination} />
      <PageToolbar
        title={hotel.name}
        description={hotel.destination}
        hideSearch
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/operations/hotels")}>{tr.backToHotels}</Button>
            <Button variant="outline" onClick={() => navigate(`/operations/hotels?hotelId=${hotel.id}`)}>{tr.manageRooms}</Button>
            <Button onClick={() => navigate("/operations/hotels")}>{tr.openHotelsWorkspace}</Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 md:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title={tr.overview}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {hotel.stars ? <Badge color="light" size="sm">{`${hotel.stars}★`}</Badge> : null}
                <Badge color="light" size="sm">{tr.totalRooms}: {hotel.totalRooms}</Badge>
                <Badge color="light" size="sm">{tr.allocations}: {allocationRows.length}</Badge>
              </div>
              <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{hotel.description || "—"}</p>
              <div className="flex flex-wrap gap-2">
                {(hotel.amenities || []).length > 0 ? (
                  hotel.amenities!.map((item) => <Badge key={item} color="light" size="sm">{item}</Badge>)
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">{tr.noAmenities}</span>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={tr.contact}>
            <InfoRow label={tr.destination} value={hotel.destination || "—"} />
            <InfoRow label={tr.address} value={hotel.address || "—"} />
            <InfoRow label={tr.contact} value={hotel.contact || "—"} />
            <InfoRow label={tr.email} value={hotel.email || "—"} />
            <InfoRow label={tr.website} value={hotel.website || "—"} />
            <InfoRow label={tr.stars} value={hotel.stars ? `${hotel.stars}★` : "—"} />
          </SectionCard>
        </div>

        <SectionCard title={tr.roomInventory}>
          {rooms.length === 0 ? (
            <EmptyState title={tr.noRooms} description={tr.description} />
          ) : (
            <DataTable data={rooms} columns={roomColumns} />
          )}
        </SectionCard>

        <SectionCard title={tr.linkedPackages}>
          {hotelPackages.length === 0 ? (
            <EmptyState title={tr.linkedPackages} description={tr.noPackagesUsingHotel} />
          ) : (
            <DataTable data={hotelPackages} columns={packageColumns} />
          )}
        </SectionCard>

        <SectionCard title={tr.linkedDepartures}>
          {allocationRows.length === 0 ? (
            <EmptyState title={tr.linkedDepartures} description={tr.noDeparturesUsingHotel} />
          ) : (
            <DataTable data={allocationRows} columns={allocationColumns} />
          )}
        </SectionCard>
      </div>
    </>
  );
}
