import { useCallback, useEffect, useMemo, useState } from "react";
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

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("bs-BA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);

export default function DepartureAccommodationAllotment({ departureId }: Props) {
  const { t } = useT();
  const { success, error: showError } = useToast();
  const tx = t?.departure?.accommodationAllotment ?? {
    loading: 'Loading accommodation inventory…',
    loadFailed: 'Failed to load departure accommodation.',
    emptyTitle: 'No accommodation inventory',
    emptyDescription: 'This departure does not have package accommodation materialized yet.',
    unknownHotel: 'Hotel',
    templateRooms: 'Package/template',
    departureRooms: 'This departure',
    capacity: 'Person capacity',
    allocated: 'Reserved',
    available: 'Available',
    pricing: 'Net / Sell',
    save: 'Save',
    saving: 'Saving…',
    saveSuccess: 'Accommodation inventory updated',
    saveFailed: 'Failed to update accommodation inventory',
    invalidRooms: 'Room count must be zero or greater',
  };
  const [items, setItems] = useState<Allotment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDepartureAccommodationAllotments(departureId);
      setItems(result.items || []);
      setDrafts(Object.fromEntries((result.items || []).map((item) => [item.id, item.departureRooms])));
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || tx.loadFailed;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [departureId, tx.loadFailed]);

  useEffect(() => {
    load();
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

  const saveItem = async (item: Allotment) => {
    const nextValue = Number(drafts[item.id] ?? 0);
    if (!Number.isInteger(nextValue) || nextValue < 0) {
      setError(tx.invalidRooms);
      return;
    }

    setSavingId(item.id);
    setError(null);
    try {
      const updated = await updateDepartureAccommodationAllotment(departureId, item.id, nextValue);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
      setDrafts((current) => ({ ...current, [item.id]: updated.departureRooms }));
      success(tx.saveSuccess);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || tx.saveFailed;
      setError(message);
      showError(message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">{tx.loading}</div>;
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-2xl border border-error-200 bg-error-50 p-6 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
        {error}
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
        <div className="rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
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
              const draft = Number(drafts[item.id] ?? 0);
              const capacity = draft * item.capacityPerRoom;
              const available = Math.max(0, draft - item.allocated);
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
                    <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{tx.departureRooms}</p>
                    <Input
                      type="number"
                      min="0"
                      value={draft}
                      onChange={(event: any) => setDrafts((current) => ({ ...current, [item.id]: Number(event.target.value) || 0 }))}
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
                    onClick={() => saveItem(item)}
                    disabled={savingId === item.id || draft === item.departureRooms}
                    className="justify-center"
                  >
                    {savingId === item.id ? tx.saving : tx.save}
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
