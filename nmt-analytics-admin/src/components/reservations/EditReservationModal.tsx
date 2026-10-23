import { formatCurrency } from "../../utils/business";
import { useT } from "../../lib/i18n/context";
import { useEffect, useMemo, useState, useRef, useId } from "react";
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

interface PurchasedAddonSnapshot {
  service_id: string;
  service_type?: string | null;
  provider_name?: string | null;
  description?: string | null;
  unit_price: number;
  currency: string;
  quantity: number;
  line_total: number;
}

export default function EditReservationModal({
  isOpen,
  onClose,
  onSuccess,
  reservationId,
}: EditReservationModalProps) {
  const { success: showSuccess, error: showError } = useToast();

  const { t, lang } = useT();
  const w = t.reservationEditor;
  const formId = useId();
  const loadErrorCopy = useRef(w.errorLoad);
  useEffect(() => { loadErrorCopy.current = w.errorLoad; }, [w.errorLoad]);
  const fill = (template: string, params: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (token, key: string) => String(params[key] ?? token));
  const money = (amount: number, currency = reservationCurrency) => formatCurrency(amount, currency, lang === 'bs' ? 'bs-BA' : 'en-GB');
  const dateLabel = (value: string) => {
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    if (!Number.isFinite(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0'), month = String(date.getMonth() + 1).padStart(2, '0');
    return lang === 'bs' ? `${day}.${month}.${date.getFullYear()}.` : `${day}/${month}/${date.getFullYear()}`;
  };
  const [quotationId,setQuotationId]=useState<string|null>(null);
  const [reservationCurrency,setReservationCurrency]=useState("BAM");
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
  const [accommodationError, setAccommodationError] = useState<'errorReservationAccommodation' | 'errorDepartureAccommodation' | null>(null);
  const [accommodationLines, setAccommodationLines] = useState<AccommodationLineDraft[]>([]);
  const [purchasedAddons, setPurchasedAddons] = useState<PurchasedAddonSnapshot[]>([]);
  const [purchasedAddonsTotal, setPurchasedAddonsTotal] = useState(0);

  const statusOptions = [
    { value: "pending", label: w.pending },
    { value: "confirmed", label: w.confirmed },
    { value: "cancelled", label: w.cancelled },
    { value: "completed", label: w.completed },
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
    setPurchasedAddons([]);
    setPurchasedAddonsTotal(0);

    getReservation(reservationId)
      .then(async (res) => {
        setQuotationId(res.quotationId || null);
        setReservationCurrency(res.currency);
        setCustomerName(res.customerName);
        setCustomerPhone(res.customerPhone || "");
        setPartySize(res.participants || res.partySize || 1);
        setTotalAmount(String(res.totalAmount || 0));
        setStatus(res.status);
        const addonSnapshot = Array.isArray(res.options?.selected_addons)
          ? res.options.selected_addons
          : [];
        setPurchasedAddons(addonSnapshot.map((addon: any) => ({
          service_id: String(addon.service_id || ""),
          service_type: addon.service_type || null,
          provider_name: addon.provider_name || null,
          description: addon.description || null,
          unit_price: Number(addon.unit_price || 0),
          currency: addon.currency || res.currency || "BAM",
          quantity: Math.max(1, Number(addon.quantity || 1)),
          line_total: Number(addon.line_total || 0),
        })));
        setPurchasedAddonsTotal(Number(res.options?.addons_total_at_booking || 0));

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
          setAccommodationError("errorReservationAccommodation");
        }
      })
      .catch(() => showError(loadErrorCopy.current))
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
      .catch(() => {
        setAccommodationOptions([]);
        setReservationPassengers([]);
        setAccommodationError("errorDepartureAccommodation");
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
      showError(w.nameRequired);
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
        showError(w.invalidLines);
        return;
      }
      if (accommodationCoverage !== partySize) {
        showError(w.coverageRequired);
        return;
      }
      if (!passengerMappingValid) {
        showError(w.assignmentRequired);
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
        totalAmount: quotationId ? undefined : totalAmount ? Number(totalAmount) : undefined,
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

      showSuccess(w.saved);
      onSuccess();
      onClose();
    } catch {
      showError(w.errorUpdate);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl" title={w.title}>
      <div className="p-6 pt-4 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center p-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`${formId}-fullName`}>{w.fullName}</Label>
                <Input id={`${formId}-fullName`} type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor={`${formId}-phone`}>{w.phone}</Label>
                <Input id={`${formId}-phone`} type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`${formId}-package`}>{w.package}</Label>
                <select id={`${formId}-package`} value={packageId} onChange={(e) => setPackageId(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                  <option value="">{w.noChange}</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.name} - {pkg.destination}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor={`${formId}-departure`}>{w.departure}</Label>
                <select id={`${formId}-departure`} value={departureId} onChange={(e) => setDepartureId(e.target.value)} disabled={!packageId} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 disabled:opacity-50">
                  <option value="">{w.noDeparture}</option>
                  {departures.filter((d) => d.status === "active").map((d) => (
                    <option key={d.id} value={d.id}>{dateLabel(d.depart_at)} ({d.booked}/{d.capacity})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor={`${formId}-partySize`}>{w.partySize}</Label>
                <Input id={`${formId}-partySize`} type="number" min="1" value={String(partySize)} onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div>
                <Label htmlFor={`${formId}-amount`}>{quotationId ? `${t.quotations.sellTotal} (${reservationCurrency})` : fill(w.amount, { currency: reservationCurrency })}</Label>
                {quotationId && <p className="mb-2 text-sm text-gray-500">{t.quotations.bookingTermsLocked}</p>}
                <Input id={`${formId}-amount`} type="number" min="0" disabled={!!quotationId} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
              </div>
              <div>
                <Label htmlFor={`${formId}-status`}>{w.status}</Label>
                <Select id={`${formId}-status`} options={statusOptions} placeholder={w.selectStatus} defaultValue={status} onChange={(value) => setStatus(value)} />
              </div>
            </div>

            {departureId && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{w.accommodation}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{w.accommodationHint}</p>
                  </div>
                </div>

                {accommodationLoading && <p className="text-sm text-gray-500">{w.loadingAccommodation}</p>}
                {accommodationError && <p className="text-sm text-red-600">{w[accommodationError]}</p>}
                {!accommodationLoading && accommodationOptions.length === 0 && !accommodationError && (
                  <p className="text-sm text-gray-500">{w.noAccommodation}</p>
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
                            <h5 className="font-medium text-gray-900 dark:text-white">{w.accommodation} {index + 1}</h5>
                            <button type="button" className="text-xs font-medium text-red-600" onClick={() => removeAccommodationLine(index)}>{w.remove}</button>
                          </div>

                          <select
                            aria-label={fill(w.lineTitle, { number: index + 1 })}
                            value={line.hotelAllocationId}
                            onChange={(e) => updateAccommodationLine(index, { hotelAllocationId: e.target.value, passengerIds: [] })}
                            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                          >
                            <option value="">{w.noAccommodationLine}</option>
                            {accommodationOptions.map((accommodationOption) => (
                              <option key={accommodationOption.id} value={accommodationOption.id}>
                                {fill(w.roomOption, { hotel: accommodationOption.hotel?.name || w.hotel, room: accommodationOption.roomLabel || "—", count: accommodationOption.availableRooms })}
                              </option>
                            ))}
                          </select>

                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label htmlFor={`${formId}-roomCount-${index}`}>{w.roomCount}</Label>
                              <Input id={`${formId}-roomCount-${index}`} type="number" min="1" max={String(Math.max(1, maxRooms))} value={String(line.roomCount)} onChange={(e) => updateAccommodationLine(index, { roomCount: Math.max(1, parseInt(e.target.value) || 1) })} />
                              <p className="mt-1 text-xs text-gray-500">{w.available} {maxRooms}</p>
                            </div>
                            <div>
                              <Label htmlFor={`${formId}-travelers-${index}`}>{w.travelers}</Label>
                              <Input id={`${formId}-travelers-${index}`} type="number" min="1" max={String(partySize)} value={String(line.guestsExpected)} onChange={(e) => updateAccommodationLine(index, { guestsExpected: Math.max(1, parseInt(e.target.value) || 1) })} />
                              <p className="mt-1 text-xs text-gray-500">{w.capacity} {capacity}</p>
                            </div>
                            <div>
                              <Label>{w.accommodationPrice}</Label>
                              <div className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
                                {money((option?.unitSellPrice || 0) * line.roomCount)}
                              </div>
                            </div>
                          </div>

                          <div>
                            <Label>{w.assignedTravelers}</Label>
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
                            <Label htmlFor={`${formId}-note-${index}`}>{w.accommodationNote}</Label>
                            <textarea id={`${formId}-note-${index}`}
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
                      {w.addAccommodation}
                    </button>

                    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                      <p className="text-sm text-gray-700 dark:text-gray-200">{w.covered} {accommodationCoverage} / {partySize}</p>
                      {!passengerMappingValid && accommodationLines.length > 0 && (
                        <p className="mt-1 text-sm text-red-600">{w.assignmentHint}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {purchasedAddons.length > 0 && (
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{w.addons}</h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{w.snapshotHint}</p>
                <div className="mt-3 space-y-2">
                  {purchasedAddons.map((addon) => (
                    <div key={addon.service_id} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{addon.provider_name || addon.service_type || w.addon}</p>
                        {addon.description ? <p className="text-xs text-gray-500 dark:text-gray-400">{addon.description}</p> : null}
                        <p className="text-xs text-gray-500 dark:text-gray-400">{addon.quantity} × {money(addon.unit_price, addon.currency)}</p>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">{money(addon.line_total, addon.currency)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{w.addonsTotal}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{money(purchasedAddonsTotal)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button variant="outline" onClick={onClose} disabled={submitting}>{w.cancel}</Button>
              <Button onClick={handleSubmit} disabled={submitting || loading}>
                {submitting ? w.saving : w.save}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
