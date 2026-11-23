import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDepartureAccommodationAllotments,
  updateDepartureAccommodationAllotment,
  type DepartureAccommodationAllotment as Allotment,
} from "../../api/departures";
import { useT } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";
import Button from "../ui/button/Button";
import EmptyState from "../ui/EmptyState";
import Input from "../form/input/InputField";

interface Props {
  departureId: string;
}

type HotelGroup = {
  hotelId: string;
  hotelName: string;
  destination?: string | null;
  items: Allotment[];
};

const MAX_ALLOTMENT_ROOMS = 1000;

export default function DepartureAccommodationAllotment({ departureId }: Props) {
  const { t, lang } = useT();
  const { success, error: showError } = useToast();
  const tx = useMemo(
    () => ({
      loading: "Loading accommodation inventory…",
      loadFailed: "Failed to load departure accommodation.",
      emptyTitle: "No accommodation inventory",
      emptyDescription: "This departure does not have package accommodation materialized yet.",
      unknownHotel: "Hotel",
      templateRooms: "Package/template",
      departureRooms: "This departure",
      capacity: "Person capacity",
      allocated: "Reserved",
      available: "Available",
      pricing: "Net / Sell",
      save: "Save",
      saving: "Saving…",
      saveSuccess: "Accommodation inventory updated",
      saveFailed: "Failed to update accommodation inventory",
      invalidRooms: "Room count must be a whole number between 0 and 1000",
      retry: "Retry",
      roomSlotOccupied: "Cannot reduce room count because one of the removed room slots is already occupied.",
      belowReserved: "Room count cannot be lower than the number of already reserved rooms.",
      migrationPending: "Accommodation inventory updates require a service update.",
      ...(t?.departure?.accommodationAllotment ?? {}),
    }),
    [t?.departure?.accommodationAllotment],
  );

  const locale = lang === "en" ? "en-GB" : "bs-BA";
  const formatMoney = (amount: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

  const [items, setItems] = useState<Allotment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingLock = useRef(false);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    try {
      const result = await getDepartureAccommodationAllotments(departureId);
      if (version !== loadVersion.current) return;
      const rows = result.items || [];
      setItems(rows);
      setDrafts(Object.fromEntries(rows.map((item) => [item.id, String(item.departureRooms)])));
    } catch {
      if (version !== loadVersion.current) return;
      setLoadFailed(true);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [departureId]);

  useEffect(() => {
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [load]);

  const groups = useMemo<HotelGroup[]>(() => {
    const map = new Map<string, HotelGroup>();
    for (const item of items) {
      const hotelId = item.hotelId;
      const existing = map.get(hotelId);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(hotelId, {
          hotelId,
          hotelName: item.hotel?.name || tx.unknownHotel,
          destination: item.hotel?.destination || null,
          items: [item],
        });
      }
    }
    return Array.from(map.values());
  }, [items, tx.unknownHotel]);

  const mapSaveError = (err: any): string => {
    const code = err?.response?.data?.code || err?.code;
    if (code === "ROOM_SLOT_OCCUPIED") return tx.roomSlotOccupied;
    if (code === "ALLOTMENT_BELOW_RESERVED") return tx.belowReserved;
    if (code === "MIGRATION_PENDING") return tx.migrationPending;
    if (code === "VALIDATION_ERROR") return tx.invalidRooms;
    const status = err?.response?.status ?? err?.status;
    if (typeof status === "number" && status >= 500) return tx.saveFailed;
    return err?.response?.data?.message || err?.message || tx.saveFailed;
  };

  const parseDraft = (raw: string | undefined): number | null => {
    if (raw === undefined || raw.trim() === "") return null;
    if (!/^\d+$/.test(raw.trim())) return null;
    const parsed = Number(raw.trim());
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_ALLOTMENT_ROOMS) return null;
    return parsed;
  };

  const saveItem = async (item: Allotment) => {
    if (savingLock.current) return;
    const nextValue = parseDraft(drafts[item.id]);
    if (nextValue === null) {
      setError(tx.invalidRooms);
      return;
    }

    savingLock.current = true;
    setSavingId(item.id);
    setError(null);
    try {
      const updated = await updateDepartureAccommodationAllotment(departureId, item.id, nextValue);
      setItems((current) => current.map((candidate) => (candidate.id === item.id ? updated : candidate)));
      setDrafts((current) => ({ ...current, [item.id]: String(updated.departureRooms) }));
      success(tx.saveSuccess);
    } catch (err: any) {
      const message = mapSaveError(err);
      setError(message);
      showError(message);
    } finally {
      savingLock.current = false;
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        {tx.loading}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
        <p role="alert" className="mb-3">{tx.loadFailed}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          {tx.retry}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <EmptyState title={tx.emptyTitle} description={tx.emptyDescription} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.hotelId} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{group.hotelName}</h2>
            {group.destination && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{group.destination}</p>}
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {group.items.map((item) => {
              const rawDraft = drafts[item.id] ?? String(item.departureRooms);
              const parsedDraft = parseDraft(rawDraft);
              const displayCount = parsedDraft ?? item.departureRooms;
              const capacity = displayCount * item.capacityPerRoom;
              const available = Math.max(0, displayCount - item.allocated);
              const inputId = `allotment-rooms-${item.id}`;
              const isSaving = savingId === item.id;
              return (
                <div key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,0.8fr))_auto] lg:items-center">
                  <div>
                    <p className="font-medium text-gray-950 dark:text-white">{item.roomLabel || item.roomType}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {item.checkIn} - {item.checkOut}
                    </p>
                  </div>

                  <Metric label={tx.templateRooms} value={item.templateRooms} />
                  <div>
                    <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                      {tx.departureRooms}
                    </label>
                    <Input
                      id={inputId}
                      type="number"
                      min="0"
                      max={String(MAX_ALLOTMENT_ROOMS)}
                      step={1}
                      disabled={isSaving}
                      value={rawDraft}
                      onChange={(event: any) => {
                        setDrafts((current) => ({ ...current, [item.id]: event.target.value }));
                        setError(null);
                      }}
                      className="h-9"
                    />
                  </div>
                  <Metric label={tx.capacity} value={capacity} />
                  <Metric label={tx.allocated} value={item.allocated} />
                  <Metric label={tx.available} value={available} />
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{tx.pricing}</p>
                    <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">
                      {formatMoney(item.netPrice)} / {formatMoney(item.sellPrice)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveItem(item)}
                    disabled={isSaving || parsedDraft === null || parsedDraft === item.departureRooms}
                    className="justify-center"
                  >
                    {isSaving ? tx.saving : tx.save}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
