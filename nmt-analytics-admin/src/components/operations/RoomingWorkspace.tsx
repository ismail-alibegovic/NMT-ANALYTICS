import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../lib/i18n/context";
import Button from "../ui/button/Button";
import Badge from "../ui/badge/Badge";
import type { DeparturePassenger, DepartureRoomSlot } from "../../api/departures";
import {
  assignPassengerToRoomSlot,
  getDepartureRoomSlots,
  moveRoomSlotAssignment,
  unassignPassengerFromRoomSlot,
} from "../../api/departures";

interface Props {
  departureId: string;
  passengers: DeparturePassenger[];
  orgId?: string;
}

type GroupStatus = "unassigned" | "together" | "split" | "partial";

type AssignTarget = {
  passengerId: string;
  passengerName: string;
  currentAssignmentId?: string | null;
};

export default function RoomingWorkspace({ departureId, passengers }: Props) {
  const { t } = useT();
  const rm = t.departures.rooming;
  const [slots, setSlots] = useState<DepartureRoomSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSlots(await getDepartureRoomSlots(departureId));
    } catch (err: any) {
      setError(err?.message || rm.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [departureId, rm.loadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const passengerById = useMemo(() => {
    const map = new Map<string, DeparturePassenger>();
    passengers.forEach((p) => {
      const id = p.passengerId || p.id;
      if (id) map.set(id, p);
    });
    return map;
  }, [passengers]);

  const assignmentByPassenger = useMemo(() => {
    const map = new Map<string, { assignmentId: string; slotId: string }>();
    slots.forEach((slot) => {
      slot.assignments.forEach((assignment) => {
        map.set(assignment.passengerId, { assignmentId: assignment.id, slotId: slot.id });
      });
    });
    return map;
  }, [slots]);

  const assignedPassengerIds = useMemo(() => new Set(assignmentByPassenger.keys()), [assignmentByPassenger]);
  const unassignedPassengers = useMemo(
    () => passengers.filter((p) => {
      const id = p.passengerId || p.id;
      return !!id && !assignedPassengerIds.has(id);
    }),
    [passengers, assignedPassengerIds],
  );

  const groupedSlots = useMemo(() => {
    const map = new Map<string, { hotelName: string; roomType: string; slots: DepartureRoomSlot[] }>();
    slots.forEach((slot) => {
      const key = `${slot.hotelId}:${slot.roomType}`;
      const existing = map.get(key);
      if (existing) existing.slots.push(slot);
      else map.set(key, {
        hotelName: slot.hotel?.name || rm.unknownHotel,
        roomType: slot.roomType,
        slots: [slot],
      });
    });
    return Array.from(map.values());
  }, [slots, rm.unknownHotel]);

  const groupStatuses = useMemo(() => {
    const groups = new Map<string, {
      name: string | null;
      color: string | null;
      members: DeparturePassenger[];
      status: GroupStatus;
    }>();

    passengers.forEach((p) => {
      if (!p.groupId) return;
      if (!groups.has(p.groupId)) {
        groups.set(p.groupId, { name: p.groupName || null, color: p.groupColor || null, members: [], status: "unassigned" });
      }
      groups.get(p.groupId)!.members.push(p);
    });

    groups.forEach((group) => {
      const assigned = group.members.filter((p) => {
        const id = p.passengerId || p.id;
        return !!id && assignedPassengerIds.has(id);
      });
      if (assigned.length === 0) group.status = "unassigned";
      else if (assigned.length < group.members.length) group.status = "partial";
      else {
        const roomIds = new Set(assigned.map((p) => assignmentByPassenger.get((p.passengerId || p.id)!)?.slotId));
        group.status = roomIds.size === 1 ? "together" : "split";
      }
    });

    return Array.from(groups.values());
  }, [passengers, assignedPassengerIds, assignmentByPassenger]);

  const totalCapacity = slots.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0);
  const totalOccupied = slots.reduce((sum, slot) => sum + slot.assignments.length, 0);

  const compatibleSlots = useMemo(() => {
    if (!assignTarget) return [];
    const passenger = passengerById.get(assignTarget.passengerId);
    return slots.map((slot) => {
      const occupied = slot.assignments.length;
      const isFull = occupied >= slot.capacity;
      const matchesRequirement = !passenger?.hotelAllocationId || (
        passenger.hotelAllocationId === slot.hotelAllocationId &&
        (!passenger.hotelId || passenger.hotelId === slot.hotelId)
      );
      return { slot, occupied, isFull, matchesRequirement };
    });
  }, [assignTarget, passengerById, slots]);

  async function assignToSlot(slotId: string) {
    if (!assignTarget) return;
    setSaving(true);
    setError(null);
    try {
      if (assignTarget.currentAssignmentId) {
        await moveRoomSlotAssignment(assignTarget.currentAssignmentId, slotId);
      } else {
        await assignPassengerToRoomSlot(slotId, assignTarget.passengerId);
      }
      setAssignTarget(null);
      await load();
    } catch (err: any) {
      setError(err?.message || rm.assignFailed);
    } finally {
      setSaving(false);
    }
  }

  async function unassign(assignmentId: string) {
    setSaving(true);
    setError(null);
    try {
      await unassignPassengerFromRoomSlot(assignmentId);
      await load();
    } catch (err: any) {
      setError(err?.message || rm.unassignFailed);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center p-12 text-gray-400">{rm.loading}</div>;
  }

  if (error && slots.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="font-medium text-gray-900 dark:text-white">{rm.unavailable}</p>
        <p className="mt-1 text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="font-medium text-gray-900 dark:text-white">{rm.noAccommodationConfigured}</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{rm.noAccommodationHint}</p>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric value={totalCapacity} label={rm.totalBeds} />
        <Metric value={totalOccupied} label={rm.assignedCount} />
        <Metric value={unassignedPassengers.length} label={rm.unassignedCount} />
        <Metric value={Math.max(0, totalCapacity - totalOccupied)} label={rm.remainingBeds} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              {rm.unassigned}
              <Badge color="warning" size="sm">{unassignedPassengers.length}</Badge>
            </h3>
            <div className="space-y-2">
              {unassignedPassengers.length === 0 ? (
                <p className="text-sm text-gray-400">{rm.allAssigned}</p>
              ) : unassignedPassengers.map((p) => {
                const id = p.passengerId || p.id || "";
                return (
                  <PassengerCard
                    key={id}
                    passenger={p}
                    actionLabel={rm.selectRoom}
                    onAction={() => setAssignTarget({ passengerId: id, passengerName: p.fullName })}
                  />
                );
              })}
            </div>
          </section>

          {groupStatuses.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">{rm.groups}</h4>
              <div className="space-y-1.5">
                {groupStatuses.map((group, index) => (
                  <div key={`${group.name}-${index}`} className="flex items-center gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-800">
                    <span className="size-2.5 rounded-full" style={{ background: group.color || "#9ca3af" }} />
                    <span className="font-medium text-gray-800 dark:text-gray-200">{group.name || `${rm.groupFallback} ${index + 1}`}</span>
                    <span className="text-gray-500">({group.members.length})</span>
                    <span className="ml-auto text-gray-500">{rm.groupStatus[group.status]}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4 xl:col-span-2">
          {groupedSlots.map((group) => (
            <section key={`${group.hotelName}-${group.roomType}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
                <h3 className="font-semibold text-gray-900 dark:text-white">{group.hotelName}</h3>
                <p className="text-xs font-medium uppercase text-gray-500">{group.roomType}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                {group.slots.map((slot) => {
                  const isFull = slot.assignments.length >= slot.capacity;
                  return (
                    <div key={slot.id} className={`rounded-xl border p-3 ${isFull ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/10" : "border-gray-200 dark:border-gray-800"}`}>
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{slot.displayLabel}</p>
                          <p className="text-xs text-gray-500">
                            {slot.actualHotelRoomNumber ? `${rm.room} ${slot.actualHotelRoomNumber} · ` : ""}
                            {slot.assignments.length}/{slot.capacity}
                          </p>
                        </div>
                        <Badge color={isFull ? "warning" : "success"} size="sm">
                          {Math.max(0, slot.capacity - slot.assignments.length)} {rm.free}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        {slot.assignments.length === 0 ? (
                          <p className="text-xs text-gray-400">{rm.noPassengers}</p>
                        ) : slot.assignments.map((assignment) => {
                          const passenger = passengerById.get(assignment.passengerId);
                          return (
                            <div key={assignment.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
                              <span className="size-2.5 rounded-full" style={{ background: passenger?.groupColor || "#9ca3af" }} />
                              <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{assignment.passengerName}</span>
                              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setAssignTarget({ passengerId: assignment.passengerId, passengerName: assignment.passengerName, currentAssignmentId: assignment.id })}>
                                {rm.move}
                              </button>
                              <button type="button" className="text-xs text-error-600 hover:underline" onClick={() => unassign(assignment.id)}>
                                {rm.unassign}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAssignTarget(null)}>
          <div className="mx-4 max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">{rm.selectRoomHint} {assignTarget.passengerName}</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setAssignTarget(null)}>×</button>
            </div>
            <div className="space-y-3 px-6 py-4">
              {compatibleSlots.map(({ slot, occupied, isFull, matchesRequirement }) => (
                <button
                  key={slot.id}
                  type="button"
                  disabled={saving || isFull || !matchesRequirement}
                  onClick={() => assignToSlot(slot.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    isFull || !matchesRequirement
                      ? "border-gray-200 opacity-50 dark:border-gray-800"
                      : "border-gray-200 hover:border-brand-300 dark:border-gray-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{slot.hotel?.name || rm.unknownHotel} · {slot.displayLabel}</p>
                      <p className="text-xs text-gray-500">{slot.roomType} · {occupied}/{slot.capacity}</p>
                    </div>
                    {!matchesRequirement ? <Badge color="warning" size="sm">{rm.incompatible}</Badge> : isFull ? <Badge color="warning" size="sm">{rm.full}</Badge> : <Badge color="success" size="sm">{rm.free}</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center dark:border-gray-800 dark:bg-gray-900">
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function PassengerCard({ passenger, actionLabel, onAction }: { passenger: DeparturePassenger; actionLabel: string; onAction: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <span className="size-3 shrink-0 rounded-full" style={{ background: passenger.groupColor || "#9ca3af" }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{passenger.fullName}</p>
          {passenger.groupName && <p className="text-xs text-gray-500">{passenger.groupName}</p>}
          {(passenger.hotelName || passenger.roomType) && (
            <p className="text-xs text-gray-500">{[passenger.hotelName, passenger.roomType].filter(Boolean).join(" · ")}</p>
          )}
          {passenger.accommodationNotes && <p className="text-xs text-gray-400">{passenger.accommodationNotes}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={onAction}>{actionLabel}</Button>
      </div>
    </div>
  );
}
