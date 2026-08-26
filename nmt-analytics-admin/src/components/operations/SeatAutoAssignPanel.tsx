import { useState } from "react";
import { useT } from "../../lib/i18n/context";
import type { DeparturePassenger } from "../../api/departures";
import { autoAssignAll } from "../../api/seats";

interface Props {
  departureId: string;
  passengers: DeparturePassenger[];
  transportType: string;
  onRefresh: () => void;
}

export default function SeatAutoAssignPanel({ departureId, passengers, transportType, onRefresh }: Props) {
  const { t } = useT();
  const d = t.departure?.passengers || {} as any;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ assigned: number; preserved: number; unassigned: number } | null>(null);

  const unassignedCount = passengers.filter(p => {
    const s = p.seat_number ?? p.seat;
    return s == null || (typeof s === "string" && s === "");
  }).length;

  if (unassignedCount === 0) return null;

  const handleAutoAssign = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await autoAssignAll(departureId, transportType);
      setResult({ assigned: r.assigned, preserved: r.preserved, unassigned: r.unassigned });
      onRefresh();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {d.autoAssignAll || "Auto-assign remaining"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {unassignedCount} {d.unassigned || "unassigned"}
          </p>
        </div>
        <button
          onClick={handleAutoAssign}
          disabled={busy}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "..." : d.autoAssignAll || "Auto-assign"}
        </button>
      </div>
      {result && (
        <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
          <p>{(d.resultAssigned || "{count} assigned").replace("{count}", String(result.assigned))}</p>
          <p>{(d.resultPreserved || "{count} existing preserved").replace("{count}", String(result.preserved))}</p>
          {result.unassigned > 0 && (
            <p className="text-amber-600">{(d.remainingUnassigned || "{count} remaining").replace("{count}", String(result.unassigned))}</p>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
