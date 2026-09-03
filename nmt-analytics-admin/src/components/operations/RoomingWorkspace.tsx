import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../lib/i18n/context";
import Button from "../ui/button/Button";
import Badge from "../ui/badge/Badge";
import type { DeparturePassenger, DepartureRoomSlot } from "../../api/departures";
import type { RoomingProposalOutput } from "../../api/departures";
import {
  assignPassengerToRoomSlot,
  generateOperationalRoomingProposal,
  getDepartureRoomSlots,
  moveRoomSlotAssignment,
  setRoomSlotAssignmentLocked,
  unassignPassengerFromRoomSlot,
  updateRoomSlotPhysicalNumber,
  applyRoomingProposal,
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
  const rm = t?.departures?.rooming ?? {
    loading: 'Loading accommodation…',
    unavailable: 'Accommodation data unavailable',
    unassigned: 'Unassigned passengers',
    allAssigned: 'All passengers assigned.',
    unassign: 'Unassign',
    accommodation: 'Accommodation',
    groups: 'Groups',
    room: 'Room',
    full: 'Full',
    free: 'free',
    incompatible: 'Not compatible',
    unknownHotel: 'Hotel',
    groupFallback: 'Group',
    noPassengers: 'No passengers assigned',
    assignFailed: 'Assign failed',
    unassignFailed: 'Unassign failed',
    loadFailed: 'Failed to load accommodation data',
    groupStatus: {
      unassigned: 'Unassigned',
      partial: 'Partial',
      together: 'Together',
      split: 'Split',
    },
    selectRoom: 'Select Room',
    selectRoomHint: 'Select a room for',
    move: 'Move',
    totalBeds: 'Total Beds',
    assignedCount: 'Assigned',
    unassignedCount: 'Unassigned',
    remainingBeds: 'Remaining',
    noAccommodationConfigured: 'Accommodation Not Configured',
    noAccommodationHint: 'Accommodation is part of this departure, but rooms are not yet configured.',
    locked: 'Locked',
    lock: 'Lock',
    unlock: 'Unlock',
    lockedMutationHint: 'Unlock the assignment before changing it.',
    lockFailed: 'Lock update failed',
    hotelRoomNumber: 'Hotel room number',
    setNumber: 'Set number',
    roomNumberNotAssigned: 'Room number not assigned',
    saveRoomNumber: 'Save',
    clearRoomNumber: 'Clear',
    roomNumberUpdateFailed: 'Room number update failed',
    proposalFailed: 'Rooming proposal generation failed',
    generateProposal: 'Generate Rooming Proposal',
    proposalGenerating: 'Generating…',
    proposalTitle: 'Rooming proposal',
    proposalReadOnly: 'Review proposal — no room assignments have been changed.',
    clearProposal: 'Close preview',
    proposalTotal: 'Total passengers',
    proposalPreserved: 'Preserved (manual/locked)',
    proposalProposed: 'Proposed',
    proposalUnresolved: 'Unresolved',
    proposalNewAssignments: 'Proposed assignments',
    proposalToSlot: 'Room',
    proposalUnresolvedPassengers: 'Unresolved passengers',
    applyProposal: 'Apply Proposal',
    applyProposalBs: 'Primijeni prijedlog',
    applying: 'Applying…',
    applySuccess: (count: number) => `${count} assignments applied.`,
    applySuccessBs: (count: number) => `${count} rasporeda primijenjeno.`,
    staleProposal: 'Proposal is stale. Generate a new proposal.',
    staleProposalBs: 'Prijedlog više nije aktuelan. Generišite novi.',
    applyFailed: 'Apply failed',
  };
  const [slots, setSlots] = useState<DepartureRoomSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<RoomingProposalOutput | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [roomNumberDrafts, setRoomNumberDrafts] = useState<Record<string, string>>({});
  const [editingRoomNumberSlotId, setEditingRoomNumberSlotId] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);

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

  const clearProposal = useCallback(() => {
    setProposal(null);
    setProposalError(null);
  }, []);

  async function generateProposal() {
    setProposalLoading(true);
    setProposalError(null);
    try {
      const result = await generateOperationalRoomingProposal(departureId);
      setProposal(result);
    } catch (err: any) {
      setProposal(null);
      setProposalError(err?.message || rm.proposalFailed);
    } finally {
      setProposalLoading(false);
    }
  }

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
        (!passenger.hotelId || passenger.hotelId === slot.hotelId) &&
        (!passenger.roomType || passenger.roomType.toLowerCase() === slot.roomType.toLowerCase())
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
      clearProposal();
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
      clearProposal();
      await load();
    } catch (err: any) {
      setError(err?.message || rm.unassignFailed);
    } finally {
      setSaving(false);
    }
  }

  async function setAssignmentLock(assignmentId: string, locked: boolean) {
    setSavingAssignmentId(assignmentId);
    setError(null);
    try {
      await setRoomSlotAssignmentLocked(assignmentId, locked);
      clearProposal();
      await load();
    } catch (err: any) {
      setError(err?.message || rm.lockFailed);
    } finally {
      setSavingAssignmentId(null);
    }
  }

  async function savePhysicalRoomNumber(slotId: string) {
    setSaving(true);
    setError(null);
    try {
      const draft = roomNumberDrafts[slotId] ?? "";
      await updateRoomSlotPhysicalNumber(slotId, draft.trim() || null);
      setEditingRoomNumberSlotId(null);
      await load();
    } catch (err: any) {
      setError(err?.message || rm.roomNumberUpdateFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleApply() {
    if (!proposal) return;
    setApplyLoading(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const result = await applyRoomingProposal(departureId, {
        stateFingerprint: proposal.stateFingerprint,
        proposedAssignments: proposal.proposedAssignments.map((pa: any) => ({
          passengerId: pa.passengerId,
          roomSlotId: pa.slotId,
        })),
        replaceableAssignmentIds: proposal.replaceableAssignmentIds,
      });
      setApplyResult(rm.applySuccess(result.insertedCount));
      clearProposal();
      await load();
    } catch (err: any) {
      if (
        (err as any)?.message?.includes("STALE_PROPOSAL") ||
        (err as any)?.status === 409
      ) {
        setApplyError((err as any)?.message || rm.staleProposal);
        clearProposal();
      } else {
        setApplyError((err as any)?.message || rm.applyFailed);
      }
    } finally {
      setApplyLoading(false);
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

            {!proposal && (
        <div className="flex items-center gap-3">
          <Button
            onClick={generateProposal}
            disabled={proposalLoading}
          >
            {proposalLoading ? rm.proposalGenerating : rm.generateProposal}
          </Button>
          {proposalError && (
            <p className="text-sm text-error-600 dark:text-error-400">{proposalError}</p>
          )}
        </div>
      )}

      {proposal && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-500/30 dark:bg-blue-500/8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">{rm.proposalTitle}</h3>
              <p className="mt-1 text-xs text-blue-600/80 dark:text-blue-300/80">{rm.proposalReadOnly}</p>
            </div>
            <div className="flex items-center gap-2">
              {proposal.proposedAssignments.length > 0 && (
                <Button
                  onClick={handleApply}
                  disabled={applyLoading}
                  size="sm"
                >
                  {applyLoading ? rm.applying : rm.applyProposal}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={clearProposal}
                size="sm"
              >
                {rm.clearProposal}
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white/60 p-2 dark:bg-white/5">
              <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{proposal.summary.totalPassengers}</div>
              <div className="text-gray-500">{rm.proposalTotal}</div>
            </div>
            <div className="rounded-lg bg-white/60 p-2 dark:bg-white/5">
              <div className="text-lg font-semibold text-green-700 dark:text-green-400">{proposal.summary.fixedManualLocked}</div>
              <div className="text-gray-500">{rm.proposalPreserved}</div>
            </div>
            <div className="rounded-lg bg-white/60 p-2 dark:bg-white/5">
              <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">{proposal.summary.proposedNew}</div>
              <div className="text-gray-500">{rm.proposalProposed}</div>
            </div>
            <div className="rounded-lg bg-white/60 p-2 dark:bg-white/5">
              <div className="text-lg font-semibold text-amber-700 dark:text-amber-400">{proposal.summary.unresolved}</div>
              <div className="text-gray-500">{rm.proposalUnresolved}</div>
            </div>
          </div>

          {proposal.warnings.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-500/20 dark:bg-amber-500/8">
              {proposal.warnings.map((w: string, i: number) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">⚠ {w}</p>
              ))}
            </div>
          )}

          {proposal.proposedAssignments.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{rm.proposalNewAssignments}</p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {proposal.proposedAssignments.map((pa: any) => (
                  <div key={pa.passengerId} className="flex items-center justify-between rounded bg-white/60 px-2 py-1 text-xs dark:bg-white/5">
                    <span className="text-gray-800 dark:text-gray-200">{pa.passengerName}</span>
                    <span className="text-gray-500">{rm.proposalToSlot}: {pa.slotLabel ?? pa.slotId?.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {proposal.unresolved.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{rm.proposalUnresolvedPassengers}</p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {proposal.unresolved.map((up: any) => (
                  <div key={up.passengerId} className="flex items-center justify-between rounded bg-white/60 px-2 py-1 text-xs dark:bg-white/5">
                    <span className="text-gray-800 dark:text-gray-200">{up.passengerName}</span>
                    <span className="text-amber-600 dark:text-amber-400">{up.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

          {applyLoading && <p className="text-sm text-gray-500 mt-1">{rm.applying}</p>}
          {applyError && <p className="text-sm text-error-600 mt-1">{applyError}</p>}
          {applyResult && <p className="text-sm text-green-600 mt-1">{applyResult}</p>}

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
                            {slot.assignments.length}/{slot.capacity}
                          </p>
                        </div>
                        <Badge color={isFull ? "warning" : "success"} size="sm">
                          {Math.max(0, slot.capacity - slot.assignments.length)} {rm.free}
                        </Badge>
                      </div>
                      <div className="mb-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{rm.hotelRoomNumber}</p>
                            {editingRoomNumberSlotId === slot.id ? (
                              <input
                                aria-label={rm.hotelRoomNumber}
                                value={roomNumberDrafts[slot.id] ?? slot.actualHotelRoomNumber ?? ""}
                                onChange={(event) => setRoomNumberDrafts((current) => ({ ...current, [slot.id]: event.target.value }))}
                                maxLength={100}
                                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                              />
                            ) : (
                              <p className="truncate text-sm text-gray-700 dark:text-gray-300">
                                {slot.actualHotelRoomNumber || rm.roomNumberNotAssigned}
                              </p>
                            )}
                          </div>
                          {editingRoomNumberSlotId === slot.id ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <button type="button" disabled={saving} className="text-xs text-brand-600 hover:underline disabled:opacity-50" onClick={() => savePhysicalRoomNumber(slot.id)}>
                                {rm.saveRoomNumber}
                              </button>
                              <button type="button" disabled={saving} className="text-xs text-gray-500 hover:underline disabled:opacity-50" onClick={() => setRoomNumberDrafts((current) => ({ ...current, [slot.id]: "" }))}>
                                {rm.clearRoomNumber}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="shrink-0 text-xs text-brand-600 hover:underline"
                              onClick={() => {
                                setRoomNumberDrafts((current) => ({ ...current, [slot.id]: slot.actualHotelRoomNumber || "" }));
                                setEditingRoomNumberSlotId(slot.id);
                              }}
                            >
                              {rm.setNumber}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {slot.assignments.length === 0 ? (
                          <p className="text-xs text-gray-400">{rm.noPassengers}</p>
                        ) : slot.assignments.map((assignment) => {
                          const passenger = passengerById.get(assignment.passengerId);
                          const assignmentSaving = savingAssignmentId === assignment.id;
                          return (
                            <div key={assignment.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
                              <span className="size-2.5 rounded-full" style={{ background: passenger?.groupColor || "#9ca3af" }} />
                              <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{assignment.passengerName}</span>
                              {assignment.locked && <Badge color="warning" size="sm">{rm.locked}</Badge>}
                              {assignment.locked ? (
                                <>
                                  <span className="text-xs text-gray-500" title={rm.lockedMutationHint}>{rm.lockedMutationHint}</span>
                                  <button type="button" disabled={assignmentSaving} className="text-xs text-brand-600 hover:underline disabled:opacity-50" onClick={() => setAssignmentLock(assignment.id, false)}>
                                    {rm.unlock}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setAssignTarget({ passengerId: assignment.passengerId, passengerName: assignment.passengerName, currentAssignmentId: assignment.id })}>
                                    {rm.move}
                                  </button>
                                  <button type="button" className="text-xs text-error-600 hover:underline" onClick={() => unassign(assignment.id)}>
                                    {rm.unassign}
                                  </button>
                                  <button type="button" disabled={assignmentSaving} className="text-xs text-gray-600 hover:underline disabled:opacity-50 dark:text-gray-300" onClick={() => setAssignmentLock(assignment.id, true)}>
                                    {rm.lock}
                                  </button>
                                </>
                              )}
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
