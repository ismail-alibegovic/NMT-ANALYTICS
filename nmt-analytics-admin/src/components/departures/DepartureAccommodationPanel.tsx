import { useState } from "react";
import type { DeparturePassenger } from "../../api/departures";
import { useT } from "../../lib/i18n/context";
import DepartureAccommodationAllotment from "./DepartureAccommodationAllotment";
import RoomingWorkspace from "../operations/RoomingWorkspace";

interface Props {
  departureId: string;
  passengers: DeparturePassenger[];
}

export default function DepartureAccommodationPanel({ departureId, passengers }: Props) {
  const { t } = useT();
  const [layer, setLayer] = useState<"inventory" | "rooming">("inventory");
  const tx = t.departure.accommodationAllotment;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-white/[0.03]">
        {[
          { key: "inventory" as const, label: tx.inventoryTab },
          { key: "rooming" as const, label: tx.roomingTab },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setLayer(item.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              layer === item.key
                ? "bg-brand-500 text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {layer === "inventory" ? (
        <DepartureAccommodationAllotment departureId={departureId} />
      ) : (
        <RoomingWorkspace departureId={departureId} passengers={passengers} />
      )}
    </div>
  );
}
