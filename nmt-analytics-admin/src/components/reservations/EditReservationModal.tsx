import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import Select from "../form/Select";
import { useToast } from "../../context/ToastContext";
import { getPackages, Package } from "../../api/packages";
import {
  getDepartureAccommodationOptions,
  getDeparturePassengers,
  getDepartures,
  Departure,
  DepartureAccommodationOption,
  DeparturePassenger,
} from "../../api/departures";
import {
  deleteReservationAccommodation,
  getReservation,
  getReservationAccommodation,
  updateReservation,
  updateReservationAccommodation,
  Reservation,
} from "../../api/reservations";

interface EditReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  reservationId: string | null;
}

interface AccommodationLineDraft {
  hotelAllocationId: string;
  roomCount: number;
  guestsExpected: number;
  notes: string;
  passengerIds: string[];
}

export default function EditReservationModal({
  isOpen,
  onClose,
  onSuccess,
  reservationId,
}: EditReservationModalProps) {
  const { success: showSuccess, error: showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [reservationPassengers, setReservationPassengers] = useState<DeparturePassenger[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [packageId, setPackageId] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [totalAmount, setTotalAmount] = useState("");
  const [status, setStatus] = useState<string>("pending");
  const [accommodationOptions, setAccommodationOptions] = useState<DepartureAccommodationOption[]>([]);
  const [accommodationLoading, setAccommodationLoading] = useState(false);
  const [accommodationError, setAccommodationError] = useState<string | null>(null);
  const [accommodationLines, setAccommodationLines] = useState<AccommodationLineDraft[]>([]);

  const statusOptions = [
    { value: "pending", label: "Na čekanju" },
    { value: "confirmed", label: "Potvrđeno" },
    { value: "cancelled", label: "Otkazano" },
    { value: "completed", label: "Završeno" },
  ];

  const accommodationCoverage = accommodationLines.reduce((sum, line) => sum + line.guestsExpected, 0);
  const mappedPassengerIds = accommodationLines.flatMap((line) => line.passengerIds);
  const passengerMappingValid = mappedPassengerIds.length === new Set(mappedPassengerIds).size && (
    reservationPassengers.length === 0 || new Set(mappedPassengerIds).size === reservationPassengers.length
  );

  const lineState = useMemo(() => accommodationLines.map((line) => {
    const option = accommodationOptions.find((item) => item.id === line.hotelAllocationId);
    const baseline = line.hotelAllocationId
      ? accommodationLines.filter((current) => current.hotelAllocationId === line.hotelAllocationId).reduce((sum, current) => sum + current.roomCount, 0) - line.roomCount
      : 0;
    const maxRooms = option ? option.availableRooms + baseline : 0;
    const capacity = (option?.capacityPerRoom || 0) * line.roomCount;
    return { line, option, maxRooms, capacity };
  }), [accommodationLines, accommodationOptions]);

  useEffect(() => {
    if (isOpen) {
      getPackages({ limit: 200 }).then((res) => setPackages(res.data)).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !reservationId) return;
    setLoading(true);
    setAccommodationOptions([]);
    setAccommodationLines([]);
    setReservationPassengers([]);
    setAccommodationError(null);

    getReservation(reservationId)
      .then(async (res) => {
        setCustomerName(res.customerName);
        setCustomerPhone(res.customerPhone || "");
        setPartySize(res.participants || res.partySize || 1);
        setTotalAmount(String(res.totalAmount || 0));
        setStatus(res.status);

        if (res.departureId) {
          setDepartureId(res.departureId);
          try {
            const depRes = await getDepartures({ limit: 500 });
            const dep = depRes.data.find((d) => d.id === res.departureId);
            if (dep) {
              setPackageId(dep.package_id);
              const pkgDeps = await getDepartures({ packageId: dep.package_id, limit: 200 });
              setDepartures(pkgDeps.data);
            }
            const manifest = await getDeparturePassengers(res.departureId);
            setReservationPassengers((manifest.manifest || []).filter((passenger) => passenger.reservationId === res.id && !!passenger.passengerId));
          } catch {
            setReservationPassengers([]);
          }
        }

        try {
          const requirements = await getReservationAccommodation(reservationId);
          setAccommodationLines(requirements.map((requirement) => ({
            hotelAllocationId: requirement.hotelAllocationId,
            roomCount: requirement.roomCount || 1,
            guestsExpected: requirement.guestsExpected || 1,
            notes: requirement.notes || "",
            passengerIds: requirement.passengerIds || [],
          })));
        } catch {
          setAccommodationError("Smještaj za rezervaciju nije moguće učitati");
        }
      })
      .catch(() => showError("Failed to load reservation"))
      .finally(() => setLoading(false));
  }, [isOpen, reservationId, showError]);

  useEffect(() => {
    if (!packageId) {
      setDepartures([]);
      setDepartureId("");
      return;
    }
    getDepartures({ packageId, limit: 200 })
      .then((res) => setDepartures(res.data))
      .catch(() => {});
  }, [packageId]);

  useEffect(() => {
    if (!isOpen || !departureId) {
      setAccommodationOptions([]);
      setAccommodationError(null);
      setReservationPassengers([]);
      return;
    }
    setAccommodationLoading(true);
    Promise.all([
      getDepartureAccommodationOptions(departureId, reservationId || undefined),
      getDeparturePassengers(departureId),
    ])
      .then(([optionsRes, manifest]) => {
        setAccommodationOptions(optionsRes.items || []);
        setReservationPassengers((manifest.manifest || []).filter((passenger) => passenger.reservationId === reservationId && !!passenger.passengerId));
        setAccommodationError(null);
      })
      .catch((err) => {
        setAccommodationOptions([]);
        setReservationPassengers([]);
        setAccommodationError(err?.message || "Smještaj za polazak nije moguće učitati");
      })
      .finally(() => setAccommodationLoading(false));
  }, [isOpen, departureId, reservationId]);

  function addAccommodationLine() {
    setAccommodationLines((current) => [...current, {
      hotelAllocationId: "",
      roomCount: 1,
      guestsExpected: 1,
      notes: "",
      passengerIds: [],
    }]);
  }

  function updateAccommodationLine(index: number, patch: Partial<AccommodationLineDraft>) {
    setAccommodationLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function removeAccommodationLine(index: number) {
    setAccommodationLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function togglePassenger(lineIndex: number, passengerId: string) {
    setAccommodationLines((current) => current.map((line, index) => {
      if (index !== lineIndex) return {
        ...line,
        passengerIds: line.passengerIds.filter((id) => id !== passengerId),
      };
      const exists = line.passengerIds.includes(passengerId);
      return {
        ...line,
        passengerIds: exists
          ? line.passengerIds.filter((id) => id !== passengerId)
          : [...line.passengerIds, passengerId],
      };
    }));
  }

  const handleSubmit = async () => {
    if (!reservationId) return;
    if (!customerName) {
      showError("Ime klijenta je obavezno");
      return;
    }
    if (accommodationLines.length > 0) {
      const lineError = lineState.some(({ line, option, maxRooms, capacity }) => (
        !option ||
        line.roomCount < 1 ||
        line.roomCount > maxRooms ||
        line.guestsExpected < 1 ||
        line.guestsExpected > capacity
      ));
      if (lineError) {
        showError("Smještajne linije nisu validne");
        return;
      }
      if (accommodationCoverage !== partySize) {
        showError("Smještaj mora pokriti sve putnike u rezervaciji");
        return;
      }
      if (!passengerMappingValid) {
        showError("Svaki putnik mora biti dodijeljen tačno jednoj liniji smještaja");
        return;
      }
    }

    setSubmitting(true);
    try {
      await updateReservation(reservationId, {
        customerName,
        customerPhone: customerPhone || undefined,
        partySize,
        departureId: departureId || undefined,
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        status: status as Reservation["status"],
      });

      if (accommodationLines.length > 0) {
        await updateReservationAccommodation(reservationId, accommodationLines.map((line) => ({
          hotelAllocationId: line.hotelAllocationId,
          roomCount: line.roomCount,
          guestsExpected: line.guestsExpected,
          notes: line.notes || undefined,
          passengerIds: line.passengerIds,
        })));
      } else {
        await deleteReservationAccommodation(reservationId);
      }

      showSuccess("Rezervacija ažurirana");
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err?.message || "Greška pri ažuriranju");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl" title="Uredi rezervaciju">
      <div className="p-6 pt-4 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center p-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ime i prezime</Label>
                <Input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Aranžman</Label>
                <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                  <option value="">-- Bez promjene --</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.name} - {pkg.destination}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Polazak</Label>
                <select value={departureId} onChange={(e) => setDepartureId(e.target.value)} disabled={!packageId} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50">
                  <option value="">-- Bez polaska --</option>
                  {departures.filter((d) => d.status === "active").map((d) => (
                    <option key={d.id} value={d.id}>{new Date(d.depart_at).toLocaleDateString("bs-BA")} ({d.booked}/{d.capacity})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Broj osoba</Label>
                <Input type="number" min="1" value={String(partySize)} onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div>
                <Label>Iznos (BAM)</Label>
                <Input type="number" min="0" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select options={statusOptions} placeholder="Odaberite status" defaultValue={status} onChange={(value) => setStatus(value)} />
              </div>
            </div>

            {departureId && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Smještaj</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Uredite kompletan skup smještajnih linija za ovu rezervaciju.</p>
                  </div>
                </div>

                {accommodationLoading && <p className="text-sm text-gray-500">Učitavanje smještaja...</p>}
                {accommodationError && <p className="text-sm text-red-600">{accommodationError}</p>}
                {!accommodationLoading && accommodationOptions.length === 0 && !accommodationError && (
                  <p className="text-sm text-gray-500">Ovaj polazak nema konfigurisan hotelski allotment.</p>
                )}

                {accommodationOptions.length > 0 && (
                  <div className="space-y-3">
                    {accommodationLines.map((line, index) => {
                      const option = lineState[index]?.option;
                      const maxRooms = lineState[index]?.maxRooms || 0;
                      const capacity = lineState[index]?.capacity || 0;
                      return (
                        <div key={`edit-line-${index}`} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="font-medium text-gray-900 dark:text-white">Smještaj {index + 1}</h5>
                            <button type="button" className="text-xs font-medium text-red-600" onClick={() => removeAccommodationLine(index)}>Ukloni</button>
                          </div>

                          <select
                            value={line.hotelAllocationId}
                            onChange={(e) => updateAccommodationLine(index, { hotelAllocationId: e.target.value, passengerIds: [] })}
                            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                          >
                            <option value="">-- Bez smještaja --</option>
                            {accommodationOptions.map((accommodationOption) => (
                              <option key={accommodationOption.id} value={accommodationOption.id}>
                                {accommodationOption.hotel?.name || "Hotel"} · {accommodationOption.roomLabel} · dostupno {accommodationOption.availableRooms}
                              </option>
                            ))}
                          </select>

                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label>Broj soba</Label>
                              <Input type="number" min="1" max={String(Math.max(1, maxRooms))} value={String(line.roomCount)} onChange={(e) => updateAccommodationLine(index, { roomCount: Math.max(1, parseInt(e.target.value) || 1) })} />
                              <p className="mt-1 text-xs text-gray-500">Dostupno: {maxRooms}</p>
                            </div>
                            <div>
                              <Label>Putnika</Label>
                              <Input type="number" min="1" max={String(partySize)} value={String(line.guestsExpected)} onChange={(e) => updateAccommodationLine(index, { guestsExpected: Math.max(1, parseInt(e.target.value) || 1) })} />
                              <p className="mt-1 text-xs text-gray-500">Kapacitet: {capacity}</p>
                            </div>
                            <div>
                              <Label>Cijena smještaja</Label>
                              <div className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
                                {(option?.unitSellPrice || 0) * line.roomCount} BAM
                              </div>
                            </div>
                          </div>

                          <div>
                            <Label>Dodijeljeni putnici</Label>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {reservationPassengers.map((passenger) => {
                                const passengerId = passenger.passengerId || passenger.id || "";
                                const assignedElsewhere = accommodationLines.some((otherLine, otherIndex) => otherIndex !== index && otherLine.passengerIds.includes(passengerId));
                                return (
                                  <label key={`${index}-${passengerId}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${assignedElsewhere ? "opacity-50" : ""}`}>
                                    <input
                                      type="checkbox"
                                      checked={line.passengerIds.includes(passengerId)}
                                      disabled={assignedElsewhere}
                                      onChange={() => togglePassenger(index, passengerId)}
                                    />
                                    <span>{passenger.fullName}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <Label>Napomena za smještaj</Label>
                            <textarea
                              value={line.notes}
                              onChange={(e) => updateAccommodationLine(index, { notes: e.target.value })}
                              rows={2}
                              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                            />
                          </div>
                        </div>
                      );
                    })}

                    <button type="button" className="text-sm font-medium text-brand-600" onClick={addAccommodationLine}>
                      + Dodaj još smještaja
                    </button>

                    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-sm text-gray-700 dark:text-gray-200">Ukupno pokriveno: {accommodationCoverage} / {partySize}</p>
                      {!passengerMappingValid && accommodationLines.length > 0 && (
                        <p className="mt-1 text-sm text-red-600">Svaki putnik mora biti dodijeljen tačno jednoj liniji smještaja.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button variant="outline" onClick={onClose} disabled={submitting}>Odustani</Button>
              <Button onClick={handleSubmit} disabled={submitting || loading}>
                {submitting ? "Spremanje..." : "Spremi izmjene"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
