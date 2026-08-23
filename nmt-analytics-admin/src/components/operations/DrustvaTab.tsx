import { useMemo } from "react";
import { useT } from "../../lib/i18n/context";
import type { DeparturePassenger } from "../../api/departures";

interface Group {
  id: string;
  name: string;
  color: string | null;
  primary_passenger_name: string | null;
  notes: string | null;
  seating_preference: string | null;
  accommodation_preference: string | null;
  locked: boolean;
}

interface GroupMember {
  id: string;
  group_id: string;
  passenger_id: string;
}

interface Props {
  passengers: DeparturePassenger[];
  groups: Group[];
  groupMembers: GroupMember[];
}

type GroupStatus = "unassigned" | "together" | "split" | "partial";

function computeGroupStatus(
  groupId: string,
  groupMembers: GroupMember[],
  passengers: DeparturePassenger[]
): GroupStatus {
  const memberIds = groupMembers
    .filter((gm) => gm.group_id === groupId)
    .map((gm) => gm.passenger_id);
  if (memberIds.length === 0) return "unassigned";

  const assignedSeatCount = passengers.filter(
    (p) => memberIds.includes(p.id) && p.seatNumber != null
  ).length;

  if (assignedSeatCount === 0) return "unassigned";
  if (assignedSeatCount < memberIds.length) return "partial";

  const seatNumbers = passengers
    .filter((p) => memberIds.includes(p.id) && p.seatNumber != null)
    .map((p) => p.seatNumber!);

  const uniqueSeats = new Set(seatNumbers);
  if (uniqueSeats.size === 1) return "together";
  return "split";
}

export default function DrustvaTab({ passengers, groups, groupMembers }: Props) {
  const { t } = useT();
  const rm = t("departures.rooming");

  const statusLabel: Record<GroupStatus, string> = {
    unassigned: rm?.groupStatus?.unassigned || "Unassigned",
    partial: rm?.groupStatus?.partial || "Partial",
    together: rm?.groupStatus?.together || "Together",
    split: rm?.groupStatus?.split || "Split",
  };

  const statusColor: Record<GroupStatus, string> = {
    unassigned: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    together: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    split: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  };

  const groupStatuses = useMemo(() => {
    const map = new Map<string, GroupStatus>();
    for (const g of groups) {
      map.set(g.id, computeGroupStatus(g.id, groupMembers, passengers));
    }
    return map;
  }, [groups, groupMembers, passengers]);

  const membersByGroup = useMemo(() => {
    const map = new Map<string, DeparturePassenger[]>();
    for (const g of groups) {
      const ids = groupMembers
        .filter((gm) => gm.group_id === g.id)
        .map((gm) => gm.passenger_id);
      map.set(
        g.id,
        passengers.filter((p) => ids.includes(p.id))
      );
    }
    return map;
  }, [groups, groupMembers, passengers]);

  const groupLabel = t("departures")?.drustvaTabTitle || "Društva";
  const memberLabel = t("departures")?.members || "članova";
  const seatLabel = t("departures")?.seat || "Sjedište";
  const noSeatLabel = t("departures")?.noSeat || "—";

  if (groups.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm">{t("departures")?.noGroups || "Nema društava za ovaj polazak."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const status = groupStatuses.get(g.id) || "unassigned";
        const members = membersByGroup.get(g.id) || [];
        const groupColor = g.color || "#6b7280";

        return (
          <div
            key={g.id}
            className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800">
              <span
                className="size-3 rounded-full shrink-0"
                style={{ backgroundColor: groupColor }}
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {g.name}
                </h4>
                {g.primary_passenger_name && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {g.primary_passenger_name}
                  </p>
                )}
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${statusColor[status]}`}
              >
                {statusLabel[status]}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {members.length} {memberLabel}
              </span>
            </div>

            {/* Members */}
            <div className="px-5 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {members.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm"
                  >
                    <span className="flex-1 truncate text-gray-800 dark:text-gray-200">
                      {p.fullName}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {p.seatNumber != null ? `${seatLabel} ${p.seatNumber}` : noSeatLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            {g.notes && (
              <div className="px-5 pb-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">{g.notes}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
