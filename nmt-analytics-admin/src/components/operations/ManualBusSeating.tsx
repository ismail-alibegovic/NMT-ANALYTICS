import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";
import {
  getDepartureVehicle,
  updateDepartureVehicle,
  assignPassengerSeat,
  lockPassengerSeat,
  type DepartureVehicleResponse,
  type VehicleSeat,
} from "../../api/departures";

interface Passenger {
  id: string;
  full_name: string;
  seat_number: number | null;
  seat_is_manual?: boolean;
  seat_locked?: boolean;
  group_name?: string | null;
  group_color?: string | null;
}

interface Props {
  departureId: string;
  passengers: any[];
  transportType?: string;
}

const ERROR_CODES = ["SEAT_LOCKED", "SEAT_CONFLICT", "SEAT_NOT_FOUND", "CAPACITY_TOO_LOW", "VEHICLE_CHANGE_CONFLICT"] as const;
type ServerErrorCode = (typeof ERROR_CODES)[number] | "INTERNAL_ERROR";

interface ServerError {
  code: ServerErrorCode;
  message: string;
}

function normalizePax(raw: any[]): Passenger[] {
  return raw.map((p) => ({
    id: String(p.id ?? p.passengerId ?? ""),
    full_name: String(p.full_name || p.fullName || p.name || ""),
    seat_number: p.seat_number != null ? Number(p.seat_number) : p.seatNumber != null ? Number(p.seatNumber) : null,
    seat_is_manual: !!p.seat_is_manual,
    seat_locked: !!p.seat_locked,
    group_name: p.group_name ?? p.groupName ?? null,
    group_color: p.group_color ?? p.groupColor ?? null,
  }));
}

function extractError(err: any): ServerError {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return { code: err.code as ServerErrorCode, message: err.message || err.code };
  }
  return { code: "INTERNAL_ERROR", message: err?.message || String(err) };
}

export default function ManualBusSeating({ departureId, passengers, transportType }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const bs = t.departure.busSeating ?? ({} as Record<string, string>);

  const [vehicle, setVehicle] = useState<DepartureVehicleResponse["vehicle"] | null>(null);
  const [seats, setSeats] = useState<VehicleSeat[]>([]);
  const [manifestPax, setManifestPax] = useState<Passenger[]>(() => normalizePax(passengers));
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);

  const [vehicleLabel, setVehicleLabel] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [capacity, setCapacity] = useState<number>(0);

  const [selectedPassengerId, setSelectedPassengerId] = useState<string | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const unassignedPax = useMemo(() => manifestPax.filter((p) => p.seat_number === null), [manifestPax]);
  const assignedCount = manifestPax.filter((p) => p.seat_number !== null).length;

  const loadVehicle = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    try {
      const res = await getDepartureVehicle(departureId);
      setVehicle(res.vehicle);
      setSeats(res.seats);
      if (res.vehicle) {
        setVehicleLabel(res.vehicle.vehicle_label);
        setRegistrationNumber(res.vehicle.registration_number ?? "");
        setCapacity(res.vehicle.capacity);
      }
    } catch (err) {
      setServerError({ code: "INTERNAL_ERROR", message: bs.vehicleSaveFailed || "Greška pri učitavanju vozila" });
    } finally {
      setLoading(false);
    }
  }, [departureId, bs]);

  const reloadManifest = useCallback(async () => {
    try {
      const mod = await import("../../api/departures");
      const fn = (mod as any).getDeparturePassengers;
      if (typeof fn !== "function") return;
      const fresh = await fn(departureId);
      const list = Array.isArray(fresh) ? fresh : fresh?.manifest || [];
      setManifestPax(normalizePax(list));
    } catch {
      /* keep existing state on manifest reload failure */
    }
  }, [departureId]);

  useEffect(() => {
    void loadVehicle();
  }, [loadVehicle]);

  useEffect(() => {
    setManifestPax(normalizePax(passengers));
  }, [passengers]);

  const seatToPassenger = useMemo(() => {
    const map = new Map<number, Passenger>();
    for (const p of manifestPax) {
      if (p.seat_number !== null) map.set(p.seat_number, p);
    }
    return map;
  }, [manifestPax]);

  const rows = useMemo(() => {
    if (!Array.isArray(seats) || seats.length === 0) return [];
    const byRow = new Map<number, VehicleSeat[]>();
    for (const s of seats) {
      const arr = byRow.get(s.row_number) || [];
      arr.push(s);
      byRow.set(s.row_number, arr);
    }
    return Array.from(byRow.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, rowSeats]) => rowSeats.sort((a, b) => a.column_index - b.column_index));
  }, [seats]);

  const selectedPassenger = useMemo(
    () => manifestPax.find((p) => p.id === selectedPassengerId) || null,
    [manifestPax, selectedPassengerId]
  );

  const isSeatTaken = (seatNumber: number) => seatToPassenger.has(seatNumber);
  const getOccupant = (seatNumber: number) => seatToPassenger.get(seatNumber) || null;

  // ── ASSIGN: unassigned passenger + free seat ──
  async function handleAssign() {
    if (!selectedPassengerId || selectedSeat === null) return;
    if (isSeatTaken(selectedSeat)) return;
    setMutating(true);
    setServerError(null);
    try {
      await assignPassengerSeat(selectedPassengerId, selectedSeat);
      setSelectedPassengerId(null);
      setSelectedSeat(null);
      await Promise.all([loadVehicle(), reloadManifest()]);
    } catch (err) {
      const { code, message } = extractError(err);
      setServerError({ code, message });
      toast.error(message);
    } finally {
      setMutating(false);
    }
  }

  // ── MOVE: assigned unlocked passenger + free seat ──
  async function handleMove() {
    if (!selectedPassengerId || selectedSeat === null) return;
    if (isSeatTaken(selectedSeat)) return;
    if (!selectedPassenger || selectedPassenger.seat_locked) return;
    setMutating(true);
    setServerError(null);
    try {
      await assignPassengerSeat(selectedPassengerId, selectedSeat);
      setSelectedPassengerId(null);
      setSelectedSeat(null);
      await Promise.all([loadVehicle(), reloadManifest()]);
    } catch (err) {
      const { code, message } = extractError(err);
      setServerError({ code, message });
      toast.error(message);
    } finally {
      setMutating(false);
    }
  }

  // ── UNASSIGN ──
  async function handleUnassign() {
    if (!selectedPassengerId) return;
    const p = manifestPax.find((x) => x.id === selectedPassengerId);
    if (!p || p.seat_locked) return;
    setMutating(true);
    setServerError(null);
    try {
      await assignPassengerSeat(selectedPassengerId, null);
      setSelectedPassengerId(null);
      setSelectedSeat(null);
      await Promise.all([loadVehicle(), reloadManifest()]);
    } catch (err) {
      const { code, message } = extractError(err);
      setServerError({ code, message });
      toast.error(message);
    } finally {
      setMutating(false);
    }
  }

  // ── LOCK / UNLOCK ──
  async function handleToggleLock() {
    if (!selectedPassengerId) return;
    const p = manifestPax.find((x) => x.id === selectedPassengerId);
    if (!p) return;
    const newLocked = !p.seat_locked;
    setMutating(true);
    setServerError(null);
    try {
      await lockPassengerSeat(selectedPassengerId, newLocked);
      await reloadManifest();
    } catch (err) {
      const { code, message } = extractError(err);
      setServerError({ code, message });
      toast.error(message);
    } finally {
      setMutating(false);
    }
  }

  // ── VEHICLE CREATE / SAVE ──
  async function handleSaveVehicle() {
    if (capacity < 1) return;
    setSavingVehicle(true);
    setServerError(null);
    try {
      const res = await updateDepartureVehicle(departureId, {
        vehicleLabel: vehicleLabel || undefined,
        registrationNumber: registrationNumber || null,
        capacity,
      });
      setVehicle(res.vehicle);
      setSeats(res.seats);
      await reloadManifest();
    } catch (err) {
      const { code, message } = extractError(err);
      setServerError({ code, message });
      toast.error(message);
    } finally {
      setSavingVehicle(false);
    }
  }

  function handleSeatClick(seat: VehicleSeat) {
    if (!seat.is_active || mutating) return;

    const occupant = getOccupant(seat.seat_number);

    if (selectedPassengerId && !occupant) {
      setSelectedSeat(seat.seat_number);
      return;
    }

    if (occupant) {
      if (selectedPassengerId === occupant.id) {
        setSelectedPassengerId(null);
        setSelectedSeat(null);
        return;
      }
      setSelectedPassengerId(occupant.id);
      return;
    }

    setSelectedPassengerId(null);
    setSelectedSeat(seat.seat_number);
  }

  function handleUnassignedClick(paxId: string) {
    setSelectedPassengerId(paxId);
    setSelectedSeat(null);
  }

  // ── EARLY RETURNS (after all hooks) ──
  if (transportType && transportType !== "bus") return null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        {bs.loading || "Loading..."}
      </div>
    );
  }

  // ── NO VEHICLE: render configuration form even when vehicle is null ──
  if (!vehicle || seats.length === 0) {
    return (
      <div className="space-y-6">
        {serverError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <span className="font-medium">{serverError.code}:</span> {serverError.message}
          </div>
        )}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
            {bs.configureVehicle || "Configure Vehicle"}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="vlabel" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{bs.vehicleLabel || "Vehicle label"}</label>
              <input
                id="vlabel"
                type="text"
                value={vehicleLabel}
                onChange={(e) => setVehicleLabel(e.target.value)}
                placeholder={bs.vehicleLabelPlaceholder || "e.g. Mercedes Sprinter"}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="vreg" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{bs.registrationNumber || "Registration number"}</label>
              <input
                id="vreg"
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder={bs.registrationPlaceholder || "e.g. T1234AB"}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="vcap" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{bs.capacity || "Capacity"}</label>
              <input
                id="vcap"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveVehicle}
              disabled={savingVehicle || capacity < 1}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {savingVehicle ? bs.savingVehicle || "Saving..." : bs.saveVehicle || "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canAssign = selectedPassengerId && selectedSeat !== null && !isSeatTaken(selectedSeat) && !mutating && selectedPassenger && selectedPassenger.seat_number === null;
  const canMove = selectedPassengerId && selectedSeat !== null && !isSeatTaken(selectedSeat) && !mutating && selectedPassenger && selectedPassenger.seat_number !== null && !selectedPassenger.seat_locked;
  const canUnassign = selectedPassengerId && selectedPassenger && selectedPassenger.seat_number !== null && !selectedPassenger.seat_locked && !mutating;
  const canLock = selectedPassengerId && selectedPassenger && selectedPassenger.seat_number !== null && !selectedPassenger.seat_locked && !mutating;
  const canUnlock = selectedPassengerId && selectedPassenger && selectedPassenger.seat_locked && !mutating;

  return (
    <div className="space-y-6">
      {/* SERVER ERROR */}
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <span className="font-medium">{serverError.code}:</span> {serverError.message}
        </div>
      )}

      {/* VEHICLE HEADER */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{vehicle.vehicle_label}</h3>
            {vehicle.registration_number && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{vehicle.registration_number}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-gray-400">{bs.capacity || "Capacity"}</span>
              <span className="font-medium text-gray-900 dark:text-white">{vehicle.capacity}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-gray-400">{bs.assignedPassengers || "Assigned"}</span>
              <span className="font-medium text-gray-900 dark:text-white">{assignedCount}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-gray-400">{bs.unassignedPassengers || "Unassigned"}</span>
              <span className="font-medium text-gray-900 dark:text-white">{unassignedPax.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* SEAT MAP */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{bs.title || "Bus Seating"}</h3>
            {mutating && <span className="text-xs text-gray-500 dark:text-gray-400">{bs.savingVehicle || "Updating..."}</span>}
          </div>

          <div className="space-y-1.5">
            {rows.map((row, rowIdx) => {
              const leftSeats = row.filter((s) => s.side === "left");
              const rightSeats = row.filter((s) => s.side === "right");

              const renderSeatBtn = (seat: VehicleSeat) => {
                const occupant = getOccupant(seat.seat_number);
                const isSelected = selectedSeat === seat.seat_number || (!!occupant && selectedPassengerId === occupant.id);
                const isActive = seat.is_active;
                const isLocked = occupant?.seat_locked;

                if (!isActive) {
                  return (
                    <button
                      key={seat.id}
                      disabled
                      className="size-10 rounded-lg border border-gray-200 bg-gray-100 text-gray-300 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-600 cursor-not-allowed"
                    >
                      {seat.seat_label}
                    </button>
                  );
                }

                if (occupant) {
                  return (
                    <button
                      key={seat.id}
                      onClick={() => handleSeatClick(seat)}
                      className={`size-10 rounded-lg border text-xs font-medium transition-colors ${
                        isSelected
                          ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                          : isLocked
                            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      }`}
                      title={`${occupant.full_name}${isLocked ? ` (${bs.lockedBadge || "Locked"})` : occupant.seat_is_manual ? ` (${bs.manualBadge || "Manual"})` : ""}`}
                    >
                      {seat.seat_label}
                    </button>
                  );
                }

                return (
                  <button
                    key={seat.id}
                    onClick={() => handleSeatClick(seat)}
                    className={`size-10 rounded-lg border text-xs font-medium transition-colors ${
                      isSelected
                        ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                    }`}
                    title={bs.free || "Free"}
                  >
                    {seat.seat_label}
                  </button>
                );
              };

              return (
                <div key={rowIdx} className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1">
                    {leftSeats.map(renderSeatBtn)}
                  </div>
                  {leftSeats.length > 0 && rightSeats.length > 0 && <div className="mx-3" />}
                  <div className="flex items-center gap-1">
                    {rightSeats.map(renderSeatBtn)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* LEGEND */}
          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" /> {bs.legend?.free || "Free"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800" /> {bs.legend?.occupied || "Occupied"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border border-brand-500 bg-brand-500/10" /> {bs.legend?.selected || "Selected"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" /> {bs.legend?.locked || "Locked"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800/40" /> {bs.inactive || "Inactive"}
            </span>
          </div>
        </div>

        {/* PASSENGER PANEL */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t.departure.passengers || "Passengers"}</h3>

          {/* SELECTED PASSENGER ACTIONS */}
          {selectedPassenger && (
            <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-900/40 dark:bg-brand-950/20">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedPassenger.full_name}</p>
                  {selectedPassenger.seat_number !== null && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {bs.seat || "Seat"} {selectedPassenger.seat_number}
                      {selectedPassenger.seat_locked ? ` (${bs.lockedBadge || "Locked"})` : selectedPassenger.seat_is_manual ? ` (${bs.manualBadge || "Manual"})` : ""}
                    </p>
                  )}
                  {selectedPassenger.group_name && (
                    <span
                      className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: (selectedPassenger.group_color || "#e5e7eb") + "22",
                        color: selectedPassenger.group_color || "#374151",
                        border: `1px solid ${selectedPassenger.group_color || "#e5e7eb"}44`,
                      }}
                    >
                      {selectedPassenger.group_name}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {canAssign && (
                  <button
                    onClick={handleAssign}
                    disabled={mutating}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {bs.assign || "Assign"} {bs.seat || "Seat"} {selectedSeat}
                  </button>
                )}

                {canMove && (
                  <button
                    onClick={handleMove}
                    disabled={mutating}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {bs.move || "Move"}
                  </button>
                )}

                {canUnassign && (
                  <button
                    onClick={handleUnassign}
                    disabled={mutating}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {bs.unassign || "Unassign"}
                  </button>
                )}

                {canLock && (
                  <button
                    onClick={handleToggleLock}
                    disabled={mutating}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    {bs.lock || "Lock"}
                  </button>
                )}

                {canUnlock && (
                  <button
                    onClick={handleToggleLock}
                    disabled={mutating}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  >
                    {bs.unlock || "Unlock"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* SELECTED FREE SEAT HINT */}
          {!selectedPassenger && selectedSeat !== null && (
            <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-900/40 dark:bg-brand-950/20">
              <p className="text-xs text-gray-700 dark:text-gray-300">
                {bs.seat || "Seat"} {selectedSeat} {bs.selected || "Selected"} — {bs.selectPassenger || "select an unassigned passenger to assign"}.
              </p>
            </div>
          )}

          {/* UNASSIGNED LIST */}
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {bs.unassignedPassengers || "Unassigned"}
            </h4>
            {unassignedPax.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                {bs.allAssigned || "Svi putnici imaju dodijeljeno sjedište."}
              </p>
            ) : (
              <div className="space-y-1">
                {unassignedPax.map((p) => {
                  const isSelected = selectedPassengerId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleUnassignedClick(p.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        isSelected
                          ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                      }`}
                    >
                      <span className="font-medium">{p.full_name}</span>
                      {p.group_name && (
                        <span
                          className="ml-2 inline-block rounded-full px-1.5 py-0.5"
                          style={{
                            backgroundColor: (p.group_color || "#e5e7eb") + "22",
                            color: p.group_color || "#374151",
                          }}
                        >
                          {p.group_name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* VEHICLE CONFIGURATION (only when vehicle exists) */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{bs.configureVehicle || "Configure Vehicle"}</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="v-label" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{bs.vehicleLabel || "Vehicle label"}</label>
            <input
              id="v-label"
              type="text"
              value={vehicleLabel}
              onChange={(e) => setVehicleLabel(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="v-reg" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{bs.registrationNumber || "Registration number"}</label>
            <input
              id="v-reg"
              type="text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor="v-cap" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{bs.capacity || "Capacity"}</label>
            <input
              id="v-cap"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveVehicle}
            disabled={savingVehicle || capacity < 1}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {savingVehicle ? bs.savingVehicle || "Saving..." : bs.saveVehicle || "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
