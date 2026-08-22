import { useState, useEffect, useMemo, useCallback } from "react";
import { useT } from "../../lib/i18n/context";
import Button from "../ui/button/Button";
import Badge from "../ui/badge/Badge";
import type { DeparturePassenger,
  AccommodationBuilding,
  AccommodationFloor,
  AccommodationAssignment } from "../../api/departures";
import {
  getAccommodationBuildings,
  assignPassengerToRoom,
  unassignPassengerFromRoom,
  generateRoomingProposal,
  applyRoomingProposal,
  type RoomingProposal,
  type RoomingProposalItem,
  type RoomingGroupSummary,
} from "../../api/departures";

interface Props {
  departureId: string;
  passengers: DeparturePassenger[];
  orgId?: string;
}

type GroupStatus = "unassigned" | "together" | "split" | "partial";

export default function RoomingWorkspace({ departureId, passengers }: Props) {
  const { t } = useT();
  const rm = t.departures.rooming;
  const [buildings, setBuildings] = useState<AccommodationBuilding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetchKey, setRefetchKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<RoomingProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [applying, setApplying] = useState(false);

  const handleGenerateProposal = async () => {
    setProposalLoading(true);
    setError(null);
    try {
      const p = await generateRoomingProposal(departureId);
      setProposal(p);
      setShowProposal(true);
    } catch (err: any) {
      setError(err?.message || rm.proposalFailed || 'Failed to generate proposal');
    } finally {
      setProposalLoading(false);
    }
  };

  const handleApplyProposal = async () => {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      await applyRoomingProposal(departureId, new Date().toISOString());
      setShowProposal(false);
      setProposal(null);
      setRefetchKey((k) => k + 1);
    } catch (err: any) {
      if (err?.message?.includes('stale') || err?.message?.includes('changed')) {
        setError(rm.proposalStale || 'State changed since proposal — please regenerate.');
        setProposal(null);
        setShowProposal(false);
      } else {
        setError(err?.message || rm.proposalApplyFailed || 'Failed to apply proposal');
      }
    } finally {
      setApplying(false);
    }
  };

  const fetchBuildings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAccommodationBuildings(departureId);
      setBuildings(data || []);
    } catch (err: any) {
      setError(err?.message || rm.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [departureId, refetchKey]);

  useEffect(() => { fetchBuildings(); }, [fetchBuildings]);

  // Derive assignment room IDs per passenger
  const passengerRoomMap = useMemo(() => {
    const map = new Map<string, string>();
    buildings.forEach((b) =>
      b.floors.forEach((f: AccommodationFloor) =>
        f.rooms.forEach((r) => {
          if (r.assignments) {
            r.assignments.forEach((a: AccommodationAssignment) => {
              if (a.passenger_id) map.set(a.passenger_id, r.id ?? "");
            });
          }
          if (r.beds) {
            r.beds.forEach((bed) => {
              if (bed.assignedPassengerId) map.set(bed.assignedPassengerId, r.id ?? "");
            });
          }
        })
      )
    );
    return map;
  }, [buildings]);

  const assignedPaxIds = useMemo(() => {
    const ids = new Set<string>();
    buildings.forEach((b) =>
      b.floors.forEach((f: AccommodationFloor) =>
        f.rooms.forEach((r) => {
          if (r.assignments) {
            r.assignments.forEach((a: AccommodationAssignment) => {
              if (a.passenger_id) ids.add(a.passenger_id);
            });
          }
          if (r.beds) {
            r.beds.forEach((bed) => {
              if (bed.assignedPassengerId) ids.add(bed.assignedPassengerId);
            });
          }
        })
      )
    );
    return ids;
  }, [buildings]);

  const unassignedPax = useMemo(
    () => passengers.filter((p) => !assignedPaxIds.has(p.passengerId ?? "")),
    [passengers, assignedPaxIds]
  );

  // Group rooming status
  const groupStatuses = useMemo(() => {
    const groups = new Map<string, {
      name: string | null; color: string | null;
      members: DeparturePassenger[];
      status: GroupStatus;
    }>();

    passengers.forEach((p) => {
      const gid = p.groupId;
      if (!gid) return;
      if (!groups.has(gid)) {
        groups.set(gid, { name: p.groupName ?? null, color: p.groupColor ?? null, members: [], status: "unassigned" });
      }
      groups.get(gid)!.members.push(p);
    });

    groups.forEach((g) => {
      const assigned = g.members.filter((m) => assignedPaxIds.has(m.passengerId ?? ""));
      if (assigned.length === 0) {
        g.status = "unassigned";
      } else if (assigned.length === g.members.length) {
        const roomIds = new Set(assigned.map((m) => passengerRoomMap.get(m.passengerId ?? "") ?? ""));
        g.status = roomIds.size === 1 ? "together" : "split";
      } else {
        g.status = "partial";
      }
    });

    return groups;
  }, [passengers, assignedPaxIds, passengerRoomMap]);

  const findAssignment = (passengerId: string): AccommodationAssignment | null => {
    for (const b of buildings) {
      for (const f of b.floors) {
        for (const r of f.rooms) {
          if (r.assignments) {
            for (const a of r.assignments) {
              if (a.passenger_id === passengerId) return a;
            }
          }
        }
      }
    }
    return null;
  };

  const handleAssign = async (passengerId: string, fullName: string, roomId: string, reservationId: string) => {
    try {
      await assignPassengerToRoom(roomId, passengerId, fullName, reservationId, null);
      setRefetchKey((k) => k + 1);
    } catch (err: any) {
      setError(err?.message || rm.assignFailed);
    }
  };

  const handleUnassign = async (passengerId: string) => {
    const a = findAssignment(passengerId);
    if (!a) return;
    try {
      await unassignPassengerFromRoom(a.id);
      setRefetchKey((k) => k + 1);
    } catch (err: any) {
      setError(err?.message || rm.unassignFailed);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12 text-gray-400">{rm.loading}</div>;
  }

  if (error && buildings.length === 0) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
        <div className="text-center text-gray-500">
          <span className="mx-auto mb-3 size-10 opacity-30" />
          <p className="font-medium">{rm.unavailable}</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (buildings.length === 0) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
        <div className="text-center text-gray-500">
          <span className="mx-auto mb-3 size-10 opacity-30" />
          <p className="font-medium">{rm.noBuildings}</p>
          <p className="text-sm mt-1">{rm.noBuildingsHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* LEFT — Unassigned + Group Status */}
      <div className="xl:col-span-1 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
            <span className="size-4" />
            {rm.unassigned}
            <Badge color="warning" size="sm">{unassignedPax.length}</Badge>
          </h3>
          {unassignedPax.length === 0 ? (
            <p className="text-sm text-gray-400">{rm.allAssigned}</p>
          ) : (
            <div className="space-y-2 max-h-[calc(50vh)] overflow-y-auto">
              {unassignedPax.map((p) => (
                <div
                  key={p.passengerId ?? p.id ?? Math.random()}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-3"
                >
                  <div
                    className="size-3 rounded-full shrink-0"
                    style={{ background: p.groupColor || "#9ca3af" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {p.fullName}
                    </p>
                    {p.groupName && (
                      <p className="text-xs text-gray-500">{p.groupName}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const firstRoom = buildings[0]?.floors[0]?.rooms[0];
                      if (firstRoom) {
                        handleAssign(
                          p.passengerId ?? p.id ?? "",
                          p.fullName,
                          firstRoom.id,
                          p.reservationId ?? ""
                        );
                      }
                    }}
                  >
                    {rm.assign}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group Rooming Status */}
        {groupStatuses.size > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{rm.groupStatus.unassigned} / {rm.groupStatus.together} / {rm.groupStatus.partial} / {rm.groupStatus.split}</h4>
            <div className="space-y-1.5">
              {Array.from(groupStatuses.values()).map((g, idx) => {
                const colorMap: Record<GroupStatus, string> = {
                  unassigned: "bg-gray-200 dark:bg-gray-700",
                  together: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
                  partial: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
                  split: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
                };
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${colorMap[g.status] || ""}`}
                  >
                    <div
                      className="size-2.5 rounded-full shrink-0"
                      style={{ background: g.color || "#9ca3af" }}
                    />
                    <span className="font-medium truncate">{g.name || `Grupa ${idx + 1}`}</span>
                    <span className="tabular-nums">({g.members.length})</span>
                    <span className="ml-auto opacity-75">{rm.groupStatus[g.status]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT — Accommodation */}
      <div className="xl:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="size-4" />
            {rm.accommodation}
          </h3>
          <Button size="sm" variant="outline" onClick={handleGenerateProposal} loading={proposalLoading}>
            {rm.autoRoom || 'Automatski rasporedi'}
          </Button>
        </div>
        <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
          {buildings.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden"
            >
              <div className="px-5 py-3 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                <h4 className="font-semibold text-gray-900 dark:text-white">{b.name}</h4>
                <p className="text-xs text-gray-500">
                  {b.type} · {b.floors?.length ?? 0} {(b.floors?.length ?? 0) !== 1 ? rm.floors : rm.floor}
                </p>
              </div>
              {b.floors?.map((f: AccommodationFloor) => (
                <div key={f.id} className="p-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">{rm.floorLabel} {f.floor_number}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {f.rooms?.map((r) => {
                      const capacity = r.capacity ?? 0;
                      const occupiedCount = r.assignments?.length ?? 0;
                      const isFull = capacity > 0 && occupiedCount >= capacity;
                      return (
                        <div
                          key={r.id}
                          className={`rounded-lg border p-3 ${
                            isFull
                              ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10"
                              : "border-gray-200 dark:border-gray-800"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {rm.room} {r.room_number}
                              </p>
                              <p className="text-xs text-gray-500">
                                {r.type ?? rm.room} · {occupiedCount}/{capacity}
                                {isFull && <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">{rm.full}</span>}
                              </p>
                            </div>
                            <Badge color={isFull ? "warning" : "success"} size="sm">
                              {capacity - occupiedCount} {rm.free}
                            </Badge>
                          </div>
                          {r.assignments && r.assignments.length > 0 ? (
                            <div className="space-y-1.5">
                              {r.assignments.map((a: AccommodationAssignment) => {
                                const pax = passengers.find((p) => p.passengerId === a.passenger_id);
                                return (
                                  <div
                                    key={a.id}
                                    className="flex items-center gap-2 rounded-md bg-gray-50 dark:bg-white/[0.04] px-2.5 py-1.5"
                                  >
                                    <div
                                      className="size-2.5 rounded-full shrink-0"
                                      style={{ background: pax?.groupColor || "#9ca3af" }}
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                                      {a.passenger_name}
                                    </span>
                                    {a.bed_label && (
                                      <span className="text-xs text-gray-400 font-mono">{a.bed_label}</span>
                                    )}
                                    <button
                                      onClick={() => handleUnassign(a.passenger_id!)}
                                      className="text-gray-400 hover:text-red-500 transition-colors"
                                      title={rm.unassign}
                                    >
                                      <span className="size-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">{rm.noPassengers}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* PROPOSAL MODAL */}
      {showProposal && proposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProposal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{rm.proposalTitle || 'Prijedlog rasporeda'}</h3>
              <button onClick={() => setShowProposal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {proposal.items && proposal.items.length > 0 ? (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    {proposal.placedCount != null && <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-center"><p className="text-2xl font-bold text-gray-900 dark:text-white">{proposal.placedCount}</p><p className="text-xs text-gray-500">{rm.placed || 'Raspoređeno'}</p></div>}
                    {proposal.unplacedCount != null && proposal.unplacedCount > 0 && <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-3 text-center"><p className="text-2xl font-bold text-amber-600">{proposal.unplacedCount}</p><p className="text-xs text-gray-500">{rm.unplaced || 'Nije raspoređeno'}</p></div>}
                    {proposal.groupsKeptTogether != null && <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-center"><p className="text-2xl font-bold text-green-600">{proposal.groupsKeptTogether}</p><p className="text-xs text-gray-500">{rm.groupsKeptTogether || 'Grupe zajedno'}</p></div>}
                    {proposal.groupsSplit != null && proposal.groupsSplit > 0 && <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-3 text-center"><p className="text-2xl font-bold text-amber-600">{proposal.groupsSplit}</p><p className="text-xs text-gray-500">{rm.groupsSplit || 'Grupe razdvojene'}</p></div>}
                  </div>
                  {/* Group summaries */}
                  {proposal.groups && proposal.groups.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500">{rm.groups || 'Grupe'}</p>
                      {proposal.groups.map((g: any, i: number) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
                          <div className="flex items-center gap-2">
                            {g.color && <span className="size-3 rounded-full" style={{ background: g.color }} />}
                            <span className="font-medium text-gray-900 dark:text-white">{g.name || g.id}</span>
                          </div>
                          <span className="text-xs text-gray-500">{(rm as any).groupStatus?.[g.status] || g.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Items */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500">{rm.passengers || 'Putnici'}</p>
                    {proposal.items.map((item: RoomingProposalItem, i: number) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-3 text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">{item.passenger_name}</span>
                        <span className="text-xs text-gray-500">{item.room ?? '—'}{item.bed_label ? ' · ' + item.bed_label : ''}</span>
                      </div>
                    ))}
                  </div>
                  {/* Warnings */}
                  {proposal.warnings && proposal.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">{rm.warnings || 'Upozorenja'}</p>
                      {proposal.warnings.map((w: any, i: number) => (
                        <p key={i} className="text-xs text-amber-600 dark:text-amber-300">{w.type ? w.type + ': ' : ''}{w.message}</p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">{rm.noProposal || 'Nema prijedloga'}</p>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowProposal(false)}>{rm.cancel || 'Otkaži'}</Button>
              {proposal.items && proposal.items.length > 0 && (
                <Button onClick={handleApplyProposal} loading={applying} disabled={applying}>{rm.apply || 'Primijeni'}</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
