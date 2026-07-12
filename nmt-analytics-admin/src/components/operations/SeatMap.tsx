import { useState, useMemo, useCallback } from "react";
import { updateExcursionPassenger } from "../../api/operations";
import type { DeparturePassenger } from "../../api/departures";

export interface SeatMapProps {
  /** Total seat capacity (departure.capacity or transport_capacity). */
  capacity: number;
  /** Passenger manifest from GET /departures/:id/passengers. */
  passengers: DeparturePassenger[];
  /** 'bus' renders a 2+aisle+2 grid; 'flight' renders a numeric list. */
  transportType: "bus" | "flight" | "none";
  /** When true, clicking a seat opens assign/clear actions. */
  editable?: boolean;
  /** Notify parent after a seat was successfully reassigned. */
  onSeatChanged?: (passengerId: string, newSeat: number | null) => void;
}

const PALETTE = {
  free: "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700",
  occupied: "bg-primary text-white border-primary",
  legroom: "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700",
} as const;

export default function SeatMap({
  capacity,
  passengers,
  transportType,
  editable = false,
  onSeatChanged,
}: SeatMapProps) {
  const [busy, setBusy] = useState(false);
  const [pendingPassengerId, setPendingPassengerId] = useState<string | null>(null);

  const seatMap = useMemo(() => {
    const map = new Map<number, DeparturePassenger>();
    for (const p of passengers) {
      const seatNum = Number(p.seat);
      if (Number.isFinite(seatNum) && seatNum > 0) map.set(seatNum, p);
    }
    return map;
  }, [passengers]);

  const totalSeats = Math.max(1, capacity || 1);

  const assignSeat = useCallback(
    async (seatNum: number) => {
      if (!editable || !pendingPassengerId) return;
      const existing = seatMap.get(seatNum);
      if (existing && existing.passengerId !== pendingPassengerId) {
        // Seat taken — cannot reassign without confirmation flow
        return;
      }
      setBusy(true);
      try {
        await updateExcursionPassenger(pendingPassengerId, { seatNumber: seatNum });
        onSeatChanged?.(pendingPassengerId, seatNum);
        setPendingPassengerId(null);
      } finally {
        setBusy(false);
      }
    },
    [editable, pendingPassengerId, seatMap, onSeatChanged],
  );

  const clearSeat = useCallback(
    async (passengerId: string) => {
      setBusy(true);
      try {
        await updateExcursionPassenger(passengerId, { seatNumber: 0 });
        onSeatChanged?.(passengerId, null);
      } finally {
        setBusy(false);
      }
    },
    [onSeatChanged],
  );

  if (transportType === "none" || capacity <= 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500">
        Nema transporta za ovaj polazak.
      </div>
    );
  }

  const occupiedCount = seatMap.size;
  const freeCount = totalSeats - occupiedCount;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {transportType === "bus" ? "Raspored sjedišta — autobus" : "Raspored sjedišta — let"}
          </h3>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{occupiedCount} zauzeto</span>
            <span>·</span>
            <span>{freeCount > 0 ? `${freeCount} slobodno` : "popunjeno"}</span>
          </div>
        </div>
        {editable && pendingPassengerId && (
          <button
            onClick={() => setPendingPassengerId(null)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Otkaži izbor
          </button>
        )}
      </div>

      {editable && (
        <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
          {pendingPassengerId
            ? "Kliknite na slobodno (svijetlo) sjedište da dodijelite putniku."
            : "Ispod rasporeda, kliknite „Dodijeli sjedište“ pored imena putnika da započnete."}
        </div>
      )}

      {transportType === "bus" ? (
        <BusLayout totalSeats={totalSeats} seatMap={seatMap} editable={editable} busy={busy} onAssign={assignSeat} />
      ) : (
        <FlightLayout totalSeats={totalSeats} seatMap={seatMap} editable={editable} busy={busy} onAssign={assignSeat} />
      )}

      {editable && (
        <div className="mt-5 border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Putnici bez sjedišta
          </h4>
          <div className="space-y-1.5">
            {passengers
              .filter((p) => !p.seat || Number(p.seat) <= 0)
              .map((p) => (
                <PassengerAssignRow
                  key={p.passengerId || p.reservationId + p.fullName}
                  passenger={p}
                  pending={pendingPassengerId === p.passengerId}
                  busy={busy}
                  onSelect={() => p.passengerId && setPendingPassengerId(p.passengerId)}
                  onClear={() => p.passengerId && clearSeat(p.passengerId)}
                />
              ))}
            {passengers.every((p) => p.seat && Number(p.seat) > 0) && (
              <div className="text-xs text-gray-400 dark:text-gray-500 py-2">
                Svi putnici imaju dodijeljeno sjedište.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BusLayout({
  totalSeats,
  seatMap,
  editable,
  busy,
  onAssign,
}: {
  totalSeats: number;
  seatMap: Map<number, DeparturePassenger>;
  editable: boolean;
  busy: boolean;
  onAssign: (seatNum: number) => void;
}) {
  const rows: number[] = [];
  for (let i = 1; i <= totalSeats; i += 4) rows.push(i);

  return (
    <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-4 overflow-x-auto">
      <div className="flex flex-col items-center gap-2 min-w-fit">
        {/* Driver */}
        <div className="flex items-center gap-1 mb-1">
          <div className="w-12 h-8 rounded-lg bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center text-xs font-medium">
            VOZAČ
          </div>
        </div>

        {/* Seats */}
        <div className="flex flex-col gap-2">
          {rows.map((rowStart) => {
            const seatNums = [rowStart, rowStart + 1, rowStart + 2, rowStart + 3].filter((n) => n <= totalSeats);
            const left = seatNums.slice(0, 2);
            const right = seatNums.slice(2, 4);
            const rowLabel = Math.ceil(rowStart / 4);
            return (
              <div key={rowStart} className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  {left.map((n) => (
                    <Seat key={n} num={n} passenger={seatMap.get(n)} editable={editable} busy={busy} onAssign={onAssign} />
                  ))}
                </div>
                {/* Aisle */}
                <div className="w-5 text-center text-[10px] text-gray-300 dark:text-gray-600 select-none">
                  {rowLabel}
                </div>
                <div className="flex gap-1.5">
                  {right.map((n) => (
                    <Seat key={n} num={n} passenger={seatMap.get(n)} editable={editable} busy={busy} onAssign={onAssign} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Back row */}
        <div className="mt-1 text-[10px] text-gray-300 dark:text-gray-600 select-none">
          ZADNJI RED
        </div>
      </div>
    </div>
  );
}

function FlightLayout({
  totalSeats,
  seatMap,
  editable,
  busy,
  onAssign,
}: {
  totalSeats: number;
  seatMap: Map<number, DeparturePassenger>;
  editable: boolean;
  busy: boolean;
  onAssign: (seatNum: number) => void;
}) {
  const rows: number[] = [];
  for (let i = 1; i <= totalSeats; i += 6) rows.push(i);

  return (
    <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-4 overflow-x-auto">
      <div className="flex flex-col items-center gap-2 min-w-fit">
        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Prednji dio aviona ↑</div>
        {rows.map((rowStart) => {
          const seatNums = [rowStart, rowStart+1, rowStart+2, rowStart+3, rowStart+4, rowStart+5].filter((n) => n <= totalSeats);
          const left = seatNums.slice(0, 3);
          const right = seatNums.slice(3, 6);
          return (
            <div key={rowStart} className="flex items-center gap-2">
              <div className="flex gap-1">
                {left.map((n) => (
                  <Seat key={n} num={n} passenger={seatMap.get(n)} editable={editable} busy={busy} onAssign={onAssign} />
                ))}
              </div>
              <div className="w-6 text-center text-[10px] text-gray-300 dark:text-gray-600 select-none">
                {String.fromCharCode(64 + Math.ceil(rowStart/6))}
              </div>
              <div className="flex gap-1">
                {right.map((n) => (
                  <Seat key={n} num={n} passenger={seatMap.get(n)} editable={editable} busy={busy} onAssign={onAssign} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Seat({
  num,
  passenger,
  editable,
  busy,
  onAssign,
}: {
  num: number;
  passenger?: DeparturePassenger;
  editable: boolean;
  busy: boolean;
  onAssign: (seatNum: number) => void;
}) {
  const occupied = Boolean(passenger);
  const disabled = busy || (occupied && !editable);
  return (
    <button
      onClick={() => editable && !occupied && onAssign(num)}
      disabled={disabled}
      title={passenger ? passenger.fullName : `Slobodno sjedište ${num}`}
      className={[
        "w-10 h-10 rounded-lg border text-xs font-medium flex items-center justify-center transition-all",
        occupied ? PALETTE.occupied : PALETTE.free,
        editable && !occupied ? "hover:border-primary hover:bg-primary/10 cursor-pointer" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {num}
    </button>
  );
}

function PassengerAssignRow({
  passenger,
  pending,
  busy,
  onSelect,
  onClear,
}: {
  passenger: DeparturePassenger;
  pending: boolean;
  busy: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {pending && <span className="size-2 rounded-full bg-amber-500 animate-pulse" />}
        <span className="text-sm text-gray-900 dark:text-white truncate">{passenger.fullName}</span>
        {passenger.seat && Number(passenger.seat) > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">sjedište {passenger.seat}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {passenger.seat && Number(passenger.seat) > 0 ? (
          <button
            onClick={onClear}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
          >
            Ukloni
          </button>
        ) : (
          <button
            onClick={onSelect}
            disabled={busy}
            className={[
              "text-xs px-2.5 py-1 rounded-md font-medium disabled:opacity-50",
              pending
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                : "bg-primary/10 text-primary hover:bg-primary/20",
            ].join(" ")}
          >
            {pending ? "Čeka sjedište…" : "Dodijeli sjedište"}
          </button>
        )}
      </div>
    </div>
  );
}
