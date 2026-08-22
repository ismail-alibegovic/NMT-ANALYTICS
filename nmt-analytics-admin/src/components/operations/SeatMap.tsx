import { useState, useMemo, useCallback } from "react";
import { updatePassengerSeat } from "../../api/departures";
import type { DeparturePassenger } from "../../api/departures";

export interface SeatMapProps {
  capacity: number;
  passengers: DeparturePassenger[];
  transportType: "bus" | "flight" | "none";
  editable?: boolean;
  onSeatChanged?: (passengerId: string, newSeat: number | null) => void;
}


const PALETTE = {
  free: "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700",
  occupied: "bg-primary text-white border-primary",
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
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);

  const totalSeats = Math.max(capacity, passengers.length);

  const seatMap = useMemo(() => {
    const map = new Map<number, DeparturePassenger>();
    for (const p of passengers) {
      const s = typeof p.seat === "number" ? p.seat : typeof p.seat === "string" ? parseInt(p.seat, 10) : null;
      if (s && s > 0 && s <= totalSeats) {
        map.set(s, p);
      }
    }
    return map;
  }, [passengers, totalSeats]);

  const unassigned = useMemo(() => {
    const assignedIds = new Set<string>();
    for (const [, p] of seatMap) {
      if (p.passengerId) assignedIds.add(p.passengerId);
    }
    return passengers.filter((p) => !p.passengerId || !assignedIds.has(p.passengerId));
  }, [passengers, seatMap]);

  const groupMap = useMemo(() => {
    const map = new Map<string, DeparturePassenger[]>();
    for (const p of passengers) {
      const gid = p.groupId;
      if (gid) {
        if (!map.has(gid)) map.set(gid, []);
        map.get(gid)!.push(p);
      }
    }
    return map;
  }, [passengers]);

  const unassignedGroups = useMemo(() => {
    const groups: { id: string; name: string; color: string; members: DeparturePassenger[] }[] = [];
    const seen = new Set<string>();
    for (const p of unassigned) {
      const gid = p.groupId;
      if (gid && !seen.has(gid)) {
        seen.add(gid);
        const members = groupMap.get(gid) || [p];
        groups.push({
          id: gid,
          name: p.groupName || gid,
          color: p.groupColor || "",
          members,
        });
      }
    }
    return groups;
  }, [unassigned, groupMap]);

  const soloUnassigned = useMemo(
    () => unassigned.filter((p) => !p.groupId),
    [unassigned]
  );

  const assignSeat = useCallback(
    async (passengerId: string, seatNum: number) => {
      setBusy(true);
      try {
        await updatePassengerSeat(passengerId, seatNum);
        onSeatChanged?.(passengerId, seatNum);
        setPendingPassengerId(null);
      } catch (e) {
        console.error("Failed to assign seat:", e);
      } finally {
        setBusy(false);
      }
    },
    [onSeatChanged]
  );

  const clearSeat = useCallback(
    async (passengerId: string) => {
      setBusy(true);
      try {
        await updatePassengerSeat(passengerId, null);
        onSeatChanged?.(passengerId, null);
      } catch (e) {
        console.error("Failed to clear seat:", e);
      } finally {
        setBusy(false);
      }
    },
    [onSeatChanged]
  );

  if (!capacity || capacity <= 0 || transportType === "none") {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">
        Seat map not available for this transport type.
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1">
        {transportType === "bus" ? (
          <BusLayout
            totalSeats={totalSeats}
            seatMap={seatMap}
            editable={editable}
            busy={busy}
            onAssign={(num) => {
              if (pendingPassengerId) assignSeat(pendingPassengerId, num);
            }}
            highlightedGroupId={highlightedGroupId}
            onHighlightGroup={setHighlightedGroupId}
          />
        ) : (
          <FlightLayout
            totalSeats={totalSeats}
            seatMap={seatMap}
            editable={editable}
            busy={busy}
            onAssign={(num) => {
              if (pendingPassengerId) assignSeat(pendingPassengerId, num);
            }}
            highlightedGroupId={highlightedGroupId}
            onHighlightGroup={setHighlightedGroupId}
          />
        )}
      </div>

      {editable && (
        <div className="lg:w-72 flex-shrink-0">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Unassigned passengers
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              {unassigned.length} passenger{unassigned.length !== 1 ? "s" : ""}
            </p>

            {unassignedGroups.map((group) => (
              <div key={group.id} className="mb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    {group.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {group.members.length} members
                  </span>
                </div>
                {group.members.map((p) => (
                  <PassengerAssignRow
                    key={p.passengerId || p.fullName}
                    passenger={p}
                    pending={pendingPassengerId === p.passengerId}
                    busy={busy}
                    onSelect={() =>
                      setPendingPassengerId(
                        pendingPassengerId === p.passengerId ? null : p.passengerId || null
                      )
                    }
                    onClear={p.passengerId ? () => clearSeat(p.passengerId!) : () => {}}
                  />
                ))}
              </div>
            ))}

            {soloUnassigned.map((p) => (
              <PassengerAssignRow
                key={p.passengerId || p.fullName}
                passenger={p}
                pending={pendingPassengerId === p.passengerId}
                busy={busy}
                onSelect={() =>
                  setPendingPassengerId(
                    pendingPassengerId === p.passengerId ? null : p.passengerId || null
                  )
                }
                onClear={p.passengerId ? () => clearSeat(p.passengerId!) : () => {}}
              />
            ))}

            {unassigned.length === 0 && (
              <p className="text-xs text-gray-400 italic">All passengers assigned</p>
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
  highlightedGroupId,
  onHighlightGroup,
}: {
  totalSeats: number;
  seatMap: Map<number, DeparturePassenger>;
  editable: boolean;
  busy: boolean;
  onAssign: (seatNum: number) => void;
  highlightedGroupId: string | null;
  onHighlightGroup: (gid: string | null) => void;
}) {
  const rows = Math.ceil(totalSeats / 4);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-xs text-gray-400 select-none font-medium tracking-wide uppercase">
        Front / Driver
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: rows }, (_, ri) => {
          const rowLabel = ri + 1;
          const base = ri * 4;
          const seatNums = [base + 1, base + 2, base + 3, base + 4].filter(
            (n) => n <= totalSeats
          );
          const left = seatNums.slice(0, 2);
          const right = seatNums.slice(2, 4);

          return (
            <div key={ri} className="flex items-center gap-2">
              <div className="w-6 text-center text-[10px] text-gray-300 dark:text-gray-600 select-none">
                {rowLabel}
              </div>
              <div className="flex gap-1.5">
                {left.map((n) => (
                  <Seat
                    key={n}
                    num={n}
                    passenger={seatMap.get(n)}
                    editable={editable}
                    busy={busy}
                    onAssign={onAssign}
                    highlightedGroupId={highlightedGroupId}
                    onHighlightGroup={onHighlightGroup}
                  />
                ))}
              </div>
              <div className="w-3" />
              <div className="flex gap-1.5">
                {right.map((n) => (
                  <Seat
                    key={n}
                    num={n}
                    passenger={seatMap.get(n)}
                    editable={editable}
                    busy={busy}
                    onAssign={onAssign}
                    highlightedGroupId={highlightedGroupId}
                    onHighlightGroup={onHighlightGroup}
                  />
                ))}
              </div>
              <div className="w-6 text-center text-[10px] text-gray-300 dark:text-gray-600 select-none">
                {String.fromCharCode(64 + rowLabel)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-gray-400 select-none font-medium tracking-wide uppercase">
        Back
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
  highlightedGroupId,
  onHighlightGroup,
}: {
  totalSeats: number;
  seatMap: Map<number, DeparturePassenger>;
  editable: boolean;
  busy: boolean;
  onAssign: (seatNum: number) => void;
  highlightedGroupId: string | null;
  onHighlightGroup: (gid: string | null) => void;
}) {
  const rows = Math.ceil(totalSeats / 6);

  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: rows }, (_, ri) => {
        const rowLabel = ri + 1;
        const base = ri * 6;
        const seatNums = [base + 1, base + 2, base + 3, base + 4, base + 5, base + 6].filter(
          (n) => n <= totalSeats
        );
        const left = seatNums.slice(0, 3);
        const right = seatNums.slice(3, 6);

        return (
          <div key={ri} className="flex items-center gap-2">
            <div className="w-8 text-center text-xs text-gray-400 select-none">{rowLabel}</div>
            <div className="flex gap-1.5">
              {left.map((n) => (
                <Seat
                  key={n}
                  num={n}
                  passenger={seatMap.get(n)}
                  editable={editable}
                  busy={busy}
                  onAssign={onAssign}
                  highlightedGroupId={highlightedGroupId}
                  onHighlightGroup={onHighlightGroup}
                />
              ))}
            </div>
            <div className="w-4" />
            <div className="flex gap-1.5">
              {right.map((n) => (
                <Seat
                  key={n}
                  num={n}
                  passenger={seatMap.get(n)}
                  editable={editable}
                  busy={busy}
                  onAssign={onAssign}
                  highlightedGroupId={highlightedGroupId}
                  onHighlightGroup={onHighlightGroup}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Seat({
  num,
  passenger,
  editable,
  busy,
  onAssign,
  highlightedGroupId,
  onHighlightGroup,
}: {
  num: number;
  passenger?: DeparturePassenger;
  editable: boolean;
  busy: boolean;
  onAssign: (seatNum: number) => void;
  highlightedGroupId: string | null;
  onHighlightGroup: (gid: string | null) => void;
}) {
  const occupied = Boolean(passenger);
  const disabled = busy || (occupied && !editable);

  const groupId = passenger?.groupId || null;
  const isHighlighted = highlightedGroupId && groupId === highlightedGroupId;
  const otherHighlighted = highlightedGroupId && groupId && groupId !== highlightedGroupId;

  const baseClass =
    "w-10 h-10 rounded-lg border text-xs font-medium flex items-center justify-center transition-all relative";

  let colorClass = PALETTE.free;
  if (occupied && passenger) {
    if (passenger.groupColor) {
      colorClass = `${passenger.groupColor} text-white border-transparent`;
      if (otherHighlighted) colorClass += " opacity-30";
      if (isHighlighted) colorClass += " ring-2 ring-white shadow-lg scale-110 z-10";
    } else {
      colorClass =
        "bg-white text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600";
    }
  }

  const tooltip = passenger
    ? [
        passenger.fullName,
        passenger.groupName ? `Group: ${passenger.groupName}` : null,
        passenger.groupSize ? `Group members: ${passenger.groupSize}` : null,
        passenger.reservationId ? `Booking: ${passenger.reservationId.slice(0, 8)}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : `Slobodno sjedište ${num}`;

  return (
    <button
      onClick={() => {
        if (editable && !occupied) onAssign(num);
        if (groupId) onHighlightGroup(isHighlighted ? null : groupId);
      }}
      onMouseEnter={() => groupId && onHighlightGroup(groupId)}
      onMouseLeave={() => onHighlightGroup(null)}
      disabled={disabled}
      title={tooltip}
      className={[
        baseClass,
        colorClass,
        editable && !occupied ? "hover:border-primary hover:bg-primary/10 cursor-pointer" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        occupied ? "cursor-pointer" : "",
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
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
          {passenger.fullName}
        </p>
      </div>
      {pending ? (
        <span className="text-xs text-amber-600">Seat pending…</span>
      ) : (
        <button
          onClick={onSelect}
          disabled={busy}
          className="text-xs px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-primary hover:text-white transition-colors"
        >
          Assign seat
        </button>
      )}
    </div>
  );
}
