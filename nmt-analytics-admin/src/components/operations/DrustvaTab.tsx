import { useState, useCallback } from "react";
import { useT } from "../../lib/i18n/context";
import type { DeparturePassenger, PassengerGroup } from "../../api/departures";
import {
  createPassengerGroup,
  updatePassengerGroup,
  deletePassengerGroup,
  replacePassengerGroupMembers,
} from "../../api/departures";
import { computeGroupSeatingStatus } from "../../utils/seatGeometry";

const SEAT_PREFERENCES = [
  { value: "keep_together", key: "preferences.keep_together" as const },
  { value: "prefer_together", key: "preferences.prefer_together" as const },
  { value: "no_preference", key: "preferences.no_preference" as const },
];

const ACCOMMODATION_PREFERENCES = [
  { value: "same_room", key: "preferences.same_room" as const },
  { value: "adjacent_rooms", key: "preferences.adjacent_rooms" as const },
  { value: "same_floor", key: "preferences.same_floor" as const },
  { value: "nearby", key: "preferences.nearby" as const },
  { value: "no_preference", key: "preferences.no_preference" as const },
];

const COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

interface DrustvaTabProps {
  departureId: string;
  passengers: DeparturePassenger[];
  groups: PassengerGroup[];
  onRefresh: () => void;
}

export default function DrustvaTab({ departureId, passengers, groups, onRefresh }: DrustvaTabProps) {
  const { t } = useT();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; group?: PassengerGroup } | null>(null);
  const [_membersModal, _setMembersModal] = useState<PassengerGroup | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PassengerGroup | null>(null);

  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(COLORS[0]);
  const [formPrimary, setFormPrimary] = useState<string | null>(null);
  const [formSeatPref, setFormSeatPref] = useState("");
  const [formAccommPref, setFormAccommPref] = useState("");
  const [formMemberIds, setFormMemberIds] = useState<string[]>([]);
  const [formLocked, setFormLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const passengerById = useCallback(() => {
    const map = new Map<string, DeparturePassenger>();
    for (const passenger of passengers) {
      if (passenger.id) map.set(passenger.id, passenger);
      if (passenger.passengerId) map.set(passenger.passengerId, passenger);
    }
    return map;
  }, [passengers]);

  const renderSeatStatusBadge = useCallback((status: ReturnType<typeof computeGroupSeatingStatus>) => {
    const variants: Record<string, string> = {
      together: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
      partial: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
      split: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
      unassigned: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    };
    const labels: Record<string, string> = {
      together: "Zajedno",
      partial: "Djelomično",
      split: "Razdvojeni",
      unassigned: "Neraspoređeni",
    };
    return (
      <span className={`rounded-md px-2 py-1 text-xs font-medium ${variants[status.status] || variants.unassigned}`}>
        {labels[status.status] || status.status}
      </span>
    );
  }, []);

  
  const occupiedByOtherGroup = useCallback(
    (groupId: string) => {
      const ids = new Set<string>();
      for (const g of groups) {
        if (g.id === groupId) continue;
        for (const m of g.members || []) {
          ids.add(m.passenger_id);
        }
      }
      return ids;
    },
    [groups],
  );

  const seatingStatus = useCallback(
    (group: PassengerGroup) => {
      const totalMembers = (group.members || []).length;
      if (totalMembers < 2) return null;
      const occupiedSeatNumbers = (group.members || [])
        .map((m) => passengerById().get(m.passenger_id)?.seat)
        .map((seat) => typeof seat === "number" ? seat : typeof seat === "string" ? parseInt(seat, 10) : null)
        .filter((seat): seat is number => seat !== null && seat > 0);
      const transportType = occupiedSeatNumbers.some((seat) => seat > 4) ? "flight" : "bus";
      const status = computeGroupSeatingStatus(occupiedSeatNumbers, transportType, totalMembers);
      return status;
    },
    [passengers, passengerById],
  );

  const openCreate = () => {
    setFormName("");
    setFormColor(COLORS[0]);
    setFormPrimary(null);
    setFormSeatPref("");
    setFormAccommPref("");
    setFormMemberIds([]);
    setFormLocked(false);
    setError("");
    setModal({ mode: "create" });
  };

  const resolvePrimaryPassenger = (memberIds: string[]) => {
    if (formPrimary && memberIds.includes(formPrimary)) return formPrimary;
    return memberIds[0] || null;
  };

  const setMembersAndPrimary = (nextMemberIds: string[]) => {
    setFormMemberIds(nextMemberIds);
    setFormPrimary((current) => {
      if (current && nextMemberIds.includes(current)) return current;
      return nextMemberIds[0] || null;
    });
  };

  const openEdit = (group: PassengerGroup) => {
    setFormName(group.name || "");
    setFormColor(group.color || COLORS[0]);
    setFormPrimary(group.primary_passenger_id || null);
    setFormSeatPref(group.seating_preference || "");
    setFormAccommPref(group.accommodation_preference || "");
    setFormMemberIds((group.members || []).map((m) => m.passenger_id));
    setFormLocked(group.locked ?? false);
    setError("");
    setModal({ mode: "edit", group });
  };

  const closeModal = () => {
    setModal(null);
    setError("");
  };

  const handleSave = async () => {
    if (!modal) return;
    setSaving(true);
    setError("");
    try {
      if (modal.mode === "create") {
        const primaryPassengerId = resolvePrimaryPassenger(formMemberIds);
        if (!primaryPassengerId) {
          setError(String(t.departure.drustva.errorPrimaryInvalid));
          return;
        }
        await createPassengerGroup(departureId, {
          name: formName || undefined,
          notes: null,
          seatingPreference: formSeatPref || undefined,
          accommodationPreference: formAccommPref || undefined,
          memberIds: formMemberIds,
          primaryPassengerId,
        });
      } else if (modal.group) {
        await updatePassengerGroup(modal.group.id, {
          name: formName || undefined,
          color: formColor || undefined,
          seatingPreference: formSeatPref || undefined,
          accommodationPreference: formAccommPref || undefined,
          locked: formLocked,
        });

        if (!formLocked) {
          const primaryPassengerId = resolvePrimaryPassenger(formMemberIds);
          if (!primaryPassengerId) {
            setError(String(t.departure.drustva.errorPrimaryInvalid));
            return;
          }
          await replacePassengerGroupMembers(modal.group.id, {
            memberIds: formMemberIds,
            primaryPassengerId,
          });
        }
      }
      closeModal();
      onRefresh();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.toLowerCase?.() || err?.message?.toLowerCase?.() || "";
      if (msg.includes("duplicate") || msg.includes("already") || msg.includes("another group")) {
        setError(String(t.departure.drustva.errorDuplicate));
      } else if (msg.includes("cross") || msg.includes("departure")) {
        setError(String(t.departure.drustva.errorCrossDeparture));
      } else if (msg.includes("primary")) {
        setError(String(t.departure.drustva.errorPrimaryInvalid));
      } else if (modal?.mode === "edit") {
        setError(String(t.departure.drustva.errorMembersSave));
      } else {
        setError(String(t.departure.drustva.errorGeneric));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: PassengerGroup) => {
    if (group.locked) return;
    try {
      await deletePassengerGroup(group.id);
      setDeleteConfirm(null);
      onRefresh();
    } catch {
      setError(String(t.departure.drustva.errorGeneric));
    }
  };

  const emptyState = (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
      <p className="text-gray-900 dark:text-white font-medium">{String(t.departure.drustva.noGroups)}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{String(t.departure.drustva.noGroupsDesc)}</p>
      <button
        onClick={openCreate}
        className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600"
      >
        + {String(t.departure.drustva.newGroup)}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        emptyState
      ) : (
        <>
          <div className="flex justify-end">
            <button
              onClick={openCreate}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600"
            >
              + {String(t.departure.drustva.newGroup)}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((group) => {
              const members = group.members || [];
              const seatStatus = seatingStatus(group);
              const primary = group.primary_passenger_id ? passengerById().get(group.primary_passenger_id) : null;

              return (
                <div
                  key={group.id}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
                >
                  <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <span
                        className="size-4 rounded-full shrink-0"
                        style={{ backgroundColor: group.color || COLORS[0] }}
                      />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {group.name || String(t.departure.drustva.groupName)}
                      </span>
                      {group.locked && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                          {String(t.departure.drustva.locked)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {seatStatus && renderSeatStatusBadge(seatStatus)}
                      <button
                        onClick={() => openEdit(group)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                        title={String(t.departure.drustva.editGroup)}
                      >
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          if (!group.locked) setDeleteConfirm(group);
                        }}
                        disabled={group.locked}
                        className={`p-1.5 rounded-lg ${
                          group.locked
                            ? "cursor-not-allowed text-gray-300 dark:text-gray-700"
                            : "text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        }`}
                        title={String(group.locked ? t.departure.drustva.unlockBeforeDelete : t.departure.drustva.deleteGroup)}
                      >
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="px-5 py-3">
                    {primary && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <span className="font-medium text-gray-600 dark:text-gray-300">{String(t.departure.drustva.primaryPassenger)}:</span>{" "}
                        {primary.fullName || "—"}
                      </p>
                    )}
                    {group.seating_preference && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span className="font-medium text-gray-600 dark:text-gray-300">{String(t.departure.drustva.seatPreference)}:</span>{" "}
                        {String(t.departure.drustva.preferences[group.seating_preference as keyof typeof t.departure.drustva.preferences] || group.seating_preference)}
                      </p>
                    )}
                    {group.accommodation_preference && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        <span className="font-medium text-gray-600 dark:text-gray-300">{String(t.departure.drustva.accommodationPreference)}:</span>{" "}
                        {String(t.departure.drustva.preferences[group.accommodation_preference as keyof typeof t.departure.drustva.preferences] || group.accommodation_preference)}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {members.map((m) => {
                        const p = passengerById().get(m.passenger_id);
                        if (!p) return null;
                        const isPrimary = m.is_primary || m.passenger_id === group.primary_passenger_id;
                        return (
                          <span
                            key={m.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md ${
                              isPrimary
                                ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400 font-medium"
                                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            }`}
                          >
                            {p.fullName || m.passenger_id.slice(0, 8)}
                            {p.seat_number && (
                              <span className="text-gray-400">S{p.seat_number}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeModal}>
          <div
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {modal.mode === "create"
                  ? String(t.departure.drustva.newGroup)
                  : String(t.departure.drustva.editGroup)}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {String(t.departure.drustva.groupName)}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={String(t.departure.drustva.groupNamePlaceholder)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {String(t.departure.drustva.color)}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`size-8 rounded-full border-2 transition-all ${
                        formColor === c ? "border-gray-900 dark:border-white scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {modal.mode === "edit" && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <span>{String(t.departure.drustva.lockState)}</span>
                    <select
                      value={formLocked ? "locked" : "unlocked"}
                      onChange={(e) => setFormLocked(e.target.value === "locked")}
                      className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    >
                      <option value="unlocked">{String(t.departure.drustva.unlocked)}</option>
                      <option value="locked">{String(t.departure.drustva.locked)}</option>
                    </select>
                  </label>
                  {formLocked && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      {String(t.departure.drustva.lockedMembersHelp)}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {String(t.departure.drustva.primaryPassenger)}
                </label>
                <select
                  aria-label={String(t.departure.drustva.primaryPassenger)}
                  value={formPrimary || ""}
                  onChange={(e) => setFormPrimary(e.target.value || null)}
                  disabled={modal?.mode === "edit" && formLocked}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">{String(t.departure.drustva.selectPrimary)}</option>
                  {formMemberIds.map((pid) => {
                    const p = passengerById().get(pid);
                    if (!p) return null;
                    return (
                      <option key={pid} value={pid}>
                        {p.fullName || pid.slice(0, 8)}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {String(t.departure.drustva.seatPreference)}
                </label>
                <select
                  value={formSeatPref}
                  onChange={(e) => setFormSeatPref(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">—</option>
                  {SEAT_PREFERENCES.map((sp) => (
                    <option key={sp.value} value={sp.value}>
                      {String(t.departure.drustva[sp.key])}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {String(t.departure.drustva.accommodationPreference)}
                </label>
                <select
                  value={formAccommPref}
                  onChange={(e) => setFormAccommPref(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">—</option>
                  {ACCOMMODATION_PREFERENCES.map((ap) => (
                    <option key={ap.value} value={ap.value}>
                      {String(t.departure.drustva[ap.key])}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {String(t.departure.drustva.members)}
                </label>
                {passengers.length === 0 ? (
                  <p className="text-xs text-gray-400">{String(t.departure.drustva.noAvailablePassengers)}</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                    {passengers.map((p) => {
                      if (!p.id) return null;
                      const isOtherGroup = occupiedByOtherGroup(modal.group?.id || "").has(p.id);
                      const membersLocked = modal.mode === "edit" && formLocked;
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                            isOtherGroup || membersLocked ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={formMemberIds.includes(p.id)}
                            disabled={isOtherGroup || membersLocked}
                            onChange={() => {
                              if (membersLocked) return;
                              const nextMemberIds = formMemberIds.includes(p.id!)
                                ? formMemberIds.filter((x) => x !== p.id)
                                : [...formMemberIds, p.id!];
                              setMembersAndPrimary(nextMemberIds);
                            }}
                            className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                          />
                          <span className="flex-1">
                            {p.fullName || p.id.slice(0, 8)}
                          </span>
                          {isOtherGroup && (
                            <span className="text-xs text-gray-400">{String(t.departure.drustva.locked)}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {String(t.departure.drustva.cancel)}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || formMemberIds.length === 0}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? "..." : String(t.departure.drustva.save)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{String(t.departure.drustva.confirmDeleteTitle)}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{String(t.departure.drustva.confirmDeleteDesc)}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {String(t.departure.drustva.cancel)}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                {String(t.departure.drustva.deleteGroup)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
