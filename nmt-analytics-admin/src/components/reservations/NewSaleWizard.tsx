import { useEffect, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { useToast } from "../../context/ToastContext";
import { getPackages, Package } from "../../api/packages";
import { getDepartures, getDepartureAccommodationOptions, Departure, DepartureCapabilities, type DepartureAccommodationOption } from "../../api/departures";
import { getCustomers, Customer } from "../../api/customers";
import { createReservation } from "../../api/reservations";

type Step = "arrangement" | "details" | "accommodation" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "arrangement", label: "Aranžman" },
  { key: "details", label: "Klijent i Putnici" },
  { key: "accommodation", label: "Smještaj" },
  { key: "review", label: "Pregled i Plaćanje" },
];

type TransportRequest = "bus" | "flight" | "none";
type Variant = { id: string; name: string; priceModifier?: number; accommodation?: string };

interface PassengerEntry {
  full_name: string;
  id_document_type?: string;
  id_document_number?: string;
  date_of_birth?: string;
  nationality?: string;
}

interface AccommodationLine {
  hotelAllocationId: string;
  roomCount: number;
  guestsExpected: number;
  notes: string;
  passengerIndexes: number[];
}

type PaymentPlan = "full" | "deposit" | "installments";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialPackageId?: string;
  initialDepartureId?: string;
}

export default function NewSaleWizard({ isOpen, onClose, onCreated, initialPackageId, initialDepartureId }: Props) {
  const { success, error: showError } = useToast();

  const [step, setStep] = useState<Step>("arrangement");
  const [packages, setPackages] = useState<Package[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Selections
  const [packageId, setPackageId] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [transport, setTransport] = useState<TransportRequest>("none");
  const [accommodation, setAccommodation] = useState("");
  const [accommodationOptions, setAccommodationOptions] = useState<DepartureAccommodationOption[]>([]);
  const [accommodationLoading, setAccommodationLoading] = useState(false);
  const [accommodationLines, setAccommodationLines] = useState<AccommodationLine[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");

  // NEW: Passenger entries
  const [passengers, setPassengers] = useState<PassengerEntry[]>([]);
  const [createGroup, setCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");

  // NEW: Payment plan
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("full");
  const [depositPct, setDepositPct] = useState(50);
  const [installmentCount, setInstallmentCount] = useState(3);

  const selectedPackage = packages.find((p) => p.id === packageId);
  const selectedDeparture = departures.find((d) => d.id === departureId);
  const capabilities: DepartureCapabilities | undefined = (selectedDeparture as any)?.capabilities;

  const variants: Variant[] = Array.isArray(selectedPackage?.variants)
    ? (selectedPackage!.variants as unknown as Variant[])
    : [];
  const hasVariants = variants.length > 0;

  const activeDepartures = departures.filter((d) => d.status === "active" && d.booked < d.capacity);
  const accommodationLinesWithOption = accommodationLines.map((line) => ({
    line,
    option: accommodationOptions.find((item) => item.id === line.hotelAllocationId),
  }));
  const accommodationTotal = accommodationLinesWithOption.reduce((sum, item) => sum + ((item.option?.unitSellPrice || 0) * item.line.roomCount), 0);
  const accommodationCoverage = accommodationLines.reduce((sum, line) => sum + line.guestsExpected, 0);
  const mappedPassengerIndexes = accommodationLines.flatMap((line) => line.passengerIndexes);
  const uniqueMappedPassengerIndexes = new Set(mappedPassengerIndexes);
  const accommodationPassengerMappingValid = mappedPassengerIndexes.length === uniqueMappedPassengerIndexes.size && uniqueMappedPassengerIndexes.size === partySize;

  // Sync passenger count with party size
  useEffect(() => {
    setPassengers((prev) => {
      const diff = partySize - prev.length;
      if (diff > 0) {
        return [...prev, ...Array(diff).fill(null).map(() => ({ full_name: "" }))];
      }
      if (diff < 0) {
        return prev.slice(0, partySize);
      }
      return prev;
    });
  }, [partySize]);

  function reset() {
    setStep("arrangement");
    setPackageId(""); setDepartureId(""); setVariantId("");
    setTransport("none"); setAccommodation("");
    setAccommodationOptions([]); setAccommodationLines([]);
    setCustomerSearch(""); setSelectedCustomerId(null);
    setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
    setPartySize(1); setTotalAmount(""); setNotes("");
    setPassengers([]); setCreateGroup(false); setGroupName("");
    setPaymentPlan("full"); setDepositPct(50); setInstallmentCount(3);
    setShowAdvanced(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    reset();
    if (initialPackageId) setPackageId(initialPackageId);
    void loadPackages();
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function loadPackages() {
    setLoading(true);
    try {
      const resp = await getPackages({ limit: 200 });
      setPackages(resp.data ?? []);
    } catch {
      showError("Greška pri učitavanju paketa");
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      const resp = await getCustomers({ limit: 200 });
      setCustomers(resp.data ?? []);
    } catch {
      /* non-fatal */
    }
  }

  // When package is selected, load its departures
  useEffect(() => {
    if (!packageId) {
      setDepartures([]); setDepartureId("");
      return;
    }
    setDepartureId("");
    getDepartures({ packageId, limit: 200 })
      .then((r) => {
        const deps = r.data ?? [];
        setDepartures(deps);
        const active = deps.filter((d) => d.status === "active" && d.booked < d.capacity);
        const pkg = packages.find((p) => p.id === packageId);
        const pkgVariants = Array.isArray(pkg?.variants) ? pkg!.variants : [];
        if (initialDepartureId && active.some((departure) => departure.id === initialDepartureId)) {
          setDepartureId(initialDepartureId);
        } else if (active.length === 1 && pkgVariants.length === 0) {
          setDepartureId(active[0].id);
        }
      })
      .catch(() => setDepartures([]));
  }, [packageId, initialDepartureId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!departureId) {
      setAccommodationOptions([]);
      return;
    }
    setAccommodationLoading(true);
    getDepartureAccommodationOptions(departureId)
      .then((result) => {
        const options = result.items || [];
        setAccommodationOptions(options);
        setAccommodationLines((current) => current.filter((line) => options.some((item) => item.id === line.hotelAllocationId)));
      })
      .catch(() => {
        setAccommodationOptions([]);
        setAccommodationLines([]);
      })
      .finally(() => setAccommodationLoading(false));
  }, [departureId]);

  // Prefill price when package chosen
  useEffect(() => {
    if (selectedPackage && !totalAmount) {
      const base = selectedPackage.price ?? selectedPackage.base_price ?? 0;
      if (base) setTotalAmount(String(base));
    }
  }, [selectedPackage, totalAmount]);

  useEffect(() => {
    if (selectedPackage && variantId) {
      const v = variants.find((x) => x.id === variantId);
      if (v?.priceModifier) {
        const base = selectedPackage.price ?? selectedPackage.base_price ?? 0;
        setTotalAmount(String((base + v.priceModifier) * partySize));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId, partySize]);

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase();
    return !q || c.full_name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
  });

  function pickCustomer(c: Customer) {
    setSelectedCustomerId(c.id);
    setCustomerName(c.full_name);
    setCustomerPhone(c.phone);
    if (c.email) setCustomerEmail(c.email);
    setCustomerSearch("");
  }

  function addAccommodationLine() {
    setAccommodationLines((current) => [...current, {
      hotelAllocationId: "",
      roomCount: 1,
      guestsExpected: 1,
      notes: "",
      passengerIndexes: [],
    }]);
  }

  function selectAccommodationOption(optionId: string) {
    setAccommodationLines((current) => {
      const existingIndex = current.findIndex((line) => line.hotelAllocationId === optionId);
      if (existingIndex >= 0) return current;

      const emptyIndex = current.findIndex((line) => !line.hotelAllocationId);
      if (emptyIndex >= 0) {
        return current.map((line, index) => index === emptyIndex
          ? { ...line, hotelAllocationId: optionId, passengerIndexes: [] }
          : line);
      }

      return [...current, {
        hotelAllocationId: optionId,
        roomCount: 1,
        guestsExpected: 1,
        notes: "",
        passengerIndexes: [],
      }];
    });
  }

  function updateAccommodationLine(index: number, patch: Partial<AccommodationLine>) {
    setAccommodationLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function removeAccommodationLine(index: number) {
    setAccommodationLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function toggleAccommodationPassenger(lineIndex: number, passengerIndex: number) {
    setAccommodationLines((current) => current.map((line, index) => {
      if (index !== lineIndex) return {
        ...line,
        passengerIndexes: line.passengerIndexes.filter((value) => value !== passengerIndex),
      };
      const exists = line.passengerIndexes.includes(passengerIndex);
      return {
        ...line,
        passengerIndexes: exists
          ? line.passengerIndexes.filter((value) => value !== passengerIndex)
          : [...line.passengerIndexes, passengerIndex].sort((a, b) => a - b),
      };
    }));
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canNext = (() => {
    if (step === "arrangement") return !!packageId && !!departureId;
    if (step === "details") return !!customerName && !!customerPhone;
    if (step === "accommodation") {
      if (accommodationOptions.length === 0) return true;
      if (accommodationLines.length === 0) return true;
      return accommodationCoverage === partySize &&
        accommodationPassengerMappingValid &&
        accommodationLinesWithOption.every(({ line, option }) => !!option &&
          line.roomCount > 0 &&
          line.roomCount <= (option?.availableRooms || 0) &&
          line.guestsExpected > 0 &&
          line.guestsExpected <= line.roomCount * Math.max(1, option?.capacityPerRoom || 1));
    }
    return true;
  })();

  function next() {
    if (!canNext) return;
    setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key);
  }
  function back() {
    setStep(STEPS[Math.max(stepIndex - 1, 0)].key);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const filledPassengers = passengers.filter((p) => p.full_name.trim());
      const baseTotal = totalAmount ? Number(totalAmount) : 0;
      const total = baseTotal + accommodationTotal;
      const depositAmount = paymentPlan === "deposit" ? Math.round(total * (depositPct / 100)) : 0;
      const normalizedAccommodationLines = accommodationLinesWithOption
        .filter((item) => item.option)
        .map((item) => ({
          hotelAllocationId: item.line.hotelAllocationId,
          roomCount: item.line.roomCount,
          guestsExpected: item.line.guestsExpected,
          notes: item.line.notes || undefined,
          passengerIndexes: item.line.passengerIndexes,
        }));

      // Build structured booking snapshot
      const bookingSnapshot: any = {
        booking_snapshot_version: 1,
        package_id: packageId,
        package_name: selectedPackage?.name,
        departure_label: selectedDeparture
          ? `${new Date(selectedDeparture.depart_at).toLocaleDateString("bs-BA")} → ${new Date(selectedDeparture.return_at).toLocaleDateString("bs-BA")}`
          : undefined,
        variant_id: variantId || undefined,
        variant_name: variants.find((v) => v.id === variantId)?.name,
        transport_request: transport,
        accommodation: normalizedAccommodationLines.map((line) => {
          const option = accommodationOptions.find((item) => item.id === line.hotelAllocationId);
          return {
            hotel_allocation_id: option?.id,
            hotel_id: option?.hotelId,
            hotel_name: option?.hotel?.name,
            room_type: option?.roomType,
            room_label: option?.roomLabel,
            room_count: line.roomCount,
            guests_expected: line.guestsExpected,
            capacity_per_room: option?.capacityPerRoom,
            total_sell_price: (option?.unitSellPrice || 0) * line.roomCount,
            passenger_indexes: line.passengerIndexes,
            notes: line.notes || undefined,
          };
        }),
        payment_plan: paymentPlan,
        deposit_pct: paymentPlan === "deposit" ? depositPct : undefined,
        deposit_amount: depositAmount || undefined,
        installment_count: paymentPlan === "installments" ? installmentCount : undefined,
        base_total_at_booking: baseTotal,
        accommodation_total_at_booking: accommodationTotal,
        total_at_booking: total,
        passengers_snapshot: filledPassengers.map((p) => ({
          full_name: p.full_name,
          id_document_type: p.id_document_type,
          id_document_number: p.id_document_number,
        })),
      };

      await createReservation({
        customerName,
        customerPhone,
        customerEmail: customerEmail || undefined,
        partySize,
        reservationAt: new Date().toISOString(),
        departureId: departureId || undefined,
        totalAmount: total || undefined,
        source: "agent",
        customerId: selectedCustomerId || undefined,
        status: "pending",
        notes: notes || undefined,
        hotelName: accommodationLinesWithOption[0]?.option?.hotel?.name || selectedPackage?.destination || undefined,
        roomType: accommodationLinesWithOption[0]?.option?.roomLabel || accommodation || undefined,
        accommodationRequirements: normalizedAccommodationLines,
        options: bookingSnapshot,
        passengers: filledPassengers.length > 0 ? filledPassengers : undefined,
        create_passenger_group: createGroup && filledPassengers.length > 1,
        group_name: groupName || undefined,
      } as any);
      success("Rezervacija kreirana");
      onCreated?.();
      onClose();
    } catch (e: any) {
      showError(e?.message ?? "Greška pri kreiranju rezervacije");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl" title="Nova prodaja">
      {/* Stepper */}
      <div className="px-6 pt-5">
        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    active
                      ? "bg-brand-600 text-white"
                      : done
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                      : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                  }`}
                >
                  {done ? "\u2713" : i + 1}
                </span>
                <span className={active ? "font-medium text-gray-900 dark:text-white" : "text-gray-500"}>{s.label}</span>
                {i < STEPS.length - 1 && <span className="text-gray-300 dark:text-gray-700">→</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="p-6 pt-4">
        {loading && <p className="text-sm text-gray-500">Učitavanje...</p>}

        {/* Step 1: Arrangement + Departure */}
        {step === "arrangement" && (
          <div className="space-y-4">
            <div>
              <Label>Aranžman / Paket *</Label>
              <p className="text-xs text-gray-500 -mt-1">Odaberite ponudu, zatim izaberite termin.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto mt-2">
                {packages.map((pkg) => {
                  const active = pkg.id === packageId;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setPackageId(pkg.id)}
                      className={`text-left rounded-xl border p-3 transition-all ${
                        active
                          ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50 dark:bg-brand-500/10"
                          : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-900 dark:text-white">{pkg.name}</div>
                      <div className="text-xs text-gray-500">{pkg.destination}</div>
                      <div className="mt-1 text-sm font-semibold text-brand-600 dark:text-brand-400">
                        {pkg.price ?? pkg.base_price ?? 0} {pkg.currency ?? "BAM"}
                      </div>
                    </button>
                  );
                })}
                {packages.length === 0 && !loading && (
                  <p className="text-sm text-gray-500 col-span-2">Nema dostupnih paketa. Dodajte paket u Paketi sekciji.</p>
                )}
              </div>
            </div>

            {packageId && (
              <div>
                <Label>Termin / Polazak *</Label>
                {activeDepartures.length === 1 && departureId === activeDepartures[0].id && (
                  <p className="text-xs text-green-600 -mt-0.5 mb-1">✓ Automatski odabran jedini dostupni termin</p>
                )}
                <div className="space-y-2 max-h-[160px] overflow-y-auto">
                  {activeDepartures.map((d) => {
                    const active = d.id === departureId;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDepartureId(d.id)}
                        className={`w-full flex items-center justify-between text-left rounded-xl border p-3 transition ${
                          active
                            ? "border-brand-500 ring-2 ring-brand-500/20"
                            : "border-gray-200 hover:border-gray-300 dark:border-gray-800"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-sm text-gray-900 dark:text-white">
                            {new Date(d.depart_at).toLocaleDateString("bs-BA")} → {new Date(d.return_at).toLocaleDateString("bs-BA")}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {d.transport_type === "flight" ? "Avion" : d.transport_type === "bus" ? "Autobus" : "Bez prijevoza"}
                          </div>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          d.booked / d.capacity >= 0.8
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20"
                        }`}>
                          {d.booked}/{d.capacity}
                        </span>
                      </button>
                    );
                  })}
                  {activeDepartures.length === 0 && (
                    <p className="text-sm text-gray-500">Nema aktivnih termina za ovaj paket.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Client + Passengers + Options */}
        {step === "details" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {/* Client section */}
            <div className="space-y-3">
              <div>
                <Label>Pretraga postojećeg klijenta</Label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Upiši ime ili telefon..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      if (!e.target.value) setSelectedCustomerId(null);
                    }}
                  />
                  {customerSearch && filteredCustomers.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.slice(0, 10).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                          onClick={() => pickCustomer(c)}
                        >
                          <div className="font-medium">{c.full_name}</div>
                          <div className="text-xs text-gray-500">{c.phone}{c.email ? ` • ${c.email}` : ""}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedCustomerId && (
                  <p className="text-xs text-green-600 mt-1">✓ Odabran postojeći: {customerName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Ime i prezime klijenta *</Label>
                  <Input
                    type="text"
                    placeholder="Npr. Ahmed Hodžić"
                    value={customerName}
                    onChange={(e) => { setCustomerName(e.target.value); setSelectedCustomerId(null); }}
                  />
                </div>
                <div>
                  <Label>Telefon *</Label>
                  <Input
                    type="tel"
                    placeholder="+387 61 234 567"
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(e.target.value); setSelectedCustomerId(null); }}
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" placeholder="klijent@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
            </div>

            <hr className="border-gray-100 dark:border-gray-800" />

            {/* Options (variants, transport, accommodation) */}
            {(hasVariants || showAdvanced) && (
              <div className="space-y-3">
                {hasVariants && (
                  <div>
                    <Label>Opcija paketa</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                      {variants.map((v) => {
                        const active = v.id === variantId;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setVariantId(active ? "" : v.id)}
                            className={`text-left rounded-xl border p-3 transition ${
                              active ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-50 dark:bg-brand-500/10" : "border-gray-200 dark:border-gray-800"
                            }`}
                          >
                            <div className="font-medium text-sm text-gray-900 dark:text-white">{v.name}</div>
                            {v.priceModifier ? (
                              <div className="text-xs text-brand-600 mt-0.5">+{v.priceModifier} BAM</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {showAdvanced && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Prijevoz</Label>
                      <select
                        value={transport}
                        onChange={(e) => setTransport(e.target.value as TransportRequest)}
                        className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="none">Bez prijevoza</option>
                        <option value="bus">Autobus</option>
                        <option value="flight">Avion</option>
                      </select>
                    </div>
                    <div>
                      <Label>Tip smještaja</Label>
                      <select
                        value={accommodation}
                        onChange={(e) => setAccommodation(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="">— Nepotrebno —</option>
                        <option value="hotel">Hotel</option>
                        <option value="student">Studentski smještaj</option>
                        <option value="apartment">Apartman</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!hasVariants && !showAdvanced && (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >
                + Prikaži prijevoz i smještaj
              </button>
            )}

            <hr className="border-gray-100 dark:border-gray-800" />

            {/* Passenger entries */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Putnici ({partySize})</Label>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Broj putnika:</span>
                  <Input type="number" min="1" max="50" value={String(partySize)} onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 !py-1.5 !text-xs" />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-1 mb-2">Klijent/booking holder može biti i jedan od putnika.</p>
              <div className="space-y-2 max-h-[180px] overflow-y-auto">
                {passengers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                    <span className="text-xs font-medium text-gray-400 w-5">{i + 1}.</span>
                    <Input
                      type="text"
                      placeholder={`Putnik ${i + 1} - puno ime`}
                      value={p.full_name}
                      onChange={(e) => {
                        setPassengers((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], full_name: e.target.value };
                          return next;
                        });
                      }}
                      className="flex-1 !py-1.5 !text-sm"
                    />
                    {capabilities?.hasFlight && (
                      <>
                        <Input
                          type="text"
                          placeholder="Pas. br."
                          value={p.id_document_number || ""}
                          onChange={(e) => {
                            setPassengers((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], id_document_number: e.target.value, id_document_type: "passport" };
                              return next;
                            });
                          }}
                          className="w-28 !py-1.5 !text-sm"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
              {passengers.length > 1 && (
                <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                  <input type="checkbox" checked={createGroup} onChange={(e) => setCreateGroup(e.target.checked)} className="rounded" />
                  Putnici putuju zajedno (grupa)
                </label>
              )}
              {createGroup && (
                <Input
                  type="text"
                  placeholder="Naziv grupe (opcionalno)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="mt-2 !py-1.5 !text-sm"
                />
              )}
            </div>

            <hr className="border-gray-100 dark:border-gray-800" />

            {/* Price + Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Ukupan iznos (BAM)</Label>
                <Input type="number" min="0" placeholder="0.00" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
              </div>
              <div>
                <Label>Napomena</Label>
                <Input type="text" placeholder="Npr. pomaže pri ulazu u avion..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Accommodation */}
        {step === "accommodation" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Smještaj</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Odaberite hotel i tip sobe iz kapaciteta konkretnog polaska. Broj sobe se dodjeljuje kasnije u rasporedu soba.
              </p>
            </div>

            {accommodationLoading && <p className="text-sm text-gray-500">Učitavanje smještaja...</p>}

            {!accommodationLoading && accommodationOptions.length === 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500">
                Ovaj polazak nema konfigurisan hotelski smještaj. Rezervacija se može nastaviti bez smještaja.
              </div>
            )}

            {accommodationOptions.length > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  {accommodationOptions.map((option) => {
                    const isSelected = accommodationLines.some((line) => line.hotelAllocationId === option.id);
                    return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectAccommodationOption(option.id)}
                      className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        isSelected
                          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:border-brand-400 dark:bg-brand-500/10"
                          : "border-gray-200 dark:border-gray-800"
                      }`}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{option.hotel?.name || "Hotel"}</p>
                          <p className="text-sm text-gray-500">{option.roomLabel || option.roomType}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Kapacitet {option.capacityPerRoom} · Slobodno {option.availableRooms} · Cijena {option.unitSellPrice} BAM
                          </p>
                        </div>
                        {isSelected && (
                          <span className="rounded-full bg-brand-600 px-2 py-1 text-xs font-medium text-white dark:bg-brand-500">
                            Odabrano
                          </span>
                        )}
                      </div>
                    </button>
                  )})}
                </div>

                {accommodationLines.map((line, index) => {
                  const option = accommodationOptions.find((item) => item.id === line.hotelAllocationId);
                  const lineCapacity = (option?.capacityPerRoom || 0) * line.roomCount;
                  const lineTotal = (option?.unitSellPrice || 0) * line.roomCount;
                  return (
                    <div key={`line-${index}`} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900 dark:text-white">Smještaj {index + 1}</h4>
                        <button type="button" className="text-xs font-medium text-red-600" onClick={() => removeAccommodationLine(index)}>
                          Ukloni
                        </button>
                      </div>

                      <div>
                        <Label>Allotment</Label>
                        <select
                          value={line.hotelAllocationId}
                          onChange={(e) => updateAccommodationLine(index, { hotelAllocationId: e.target.value, passengerIndexes: [] })}
                          className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                        >
                          <option value="">-- Odaberi smještaj --</option>
                          {accommodationOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {(option.hotel?.name || "Hotel")} · {option.roomLabel} · slobodno {option.availableRooms}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <Label>Broj soba</Label>
                          <Input
                            type="number"
                            min="1"
                            max={String(Math.max(1, option?.availableRooms || 1))}
                            value={String(line.roomCount)}
                            onChange={(e) => updateAccommodationLine(index, { roomCount: Math.max(1, parseInt(e.target.value) || 1) })}
                          />
                        </div>
                        <div>
                          <Label>Putnika</Label>
                          <Input
                            type="number"
                            min="1"
                            max={String(partySize)}
                            value={String(line.guestsExpected)}
                            onChange={(e) => updateAccommodationLine(index, { guestsExpected: Math.max(1, parseInt(e.target.value) || 1) })}
                          />
                        </div>
                        <div>
                          <Label>Ukupno</Label>
                          <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
                            {lineTotal} BAM
                          </div>
                        </div>
                      </div>

                      {option && (
                        <p className="text-xs text-gray-500">
                          Kapacitet linije: {lineCapacity} · Pokriveno: {line.guestsExpected}
                        </p>
                      )}
                      {option && line.roomCount > option.availableRooms && (
                        <p className="text-sm text-error-600">Nema dovoljno slobodnih soba za odabranu količinu.</p>
                      )}
                      {option && line.guestsExpected > lineCapacity && (
                        <p className="text-sm text-error-600">Ova linija prelazi kapacitet odabranog tipa sobe.</p>
                      )}

                      <div>
                        <Label>Dodijeljeni putnici</Label>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {passengers.map((passenger, passengerIndex) => {
                            const assignedElsewhere = accommodationLines.some((otherLine, otherIndex) => otherIndex !== index && otherLine.passengerIndexes.includes(passengerIndex));
                            return (
                              <label key={`line-${index}-passenger-${passengerIndex}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${assignedElsewhere ? "opacity-50" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={line.passengerIndexes.includes(passengerIndex)}
                                  disabled={assignedElsewhere}
                                  onChange={() => toggleAccommodationPassenger(index, passengerIndex)}
                                />
                                <span>{passenger.full_name.trim() || `Putnik ${passengerIndex + 1}`}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <Label>Napomena za smještaj</Label>
                        <Input
                          type="text"
                          placeholder="Npr. sobe blizu jedna drugoj, prizemlje..."
                          value={line.notes}
                          onChange={(e) => updateAccommodationLine(index, { notes: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}

                <button type="button" className="text-sm font-medium text-brand-600 dark:text-brand-400" onClick={addAccommodationLine}>
                  + Dodaj još smještaja
                </button>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Sažetak smještaja</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Ukupno pokriveno: {accommodationCoverage} / {partySize} putnika
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Ukupno smještaj: {accommodationTotal} BAM
                  </div>
                  {!accommodationPassengerMappingValid && accommodationLines.length > 0 && (
                    <p className="text-sm text-error-600">Svaki putnik mora biti dodijeljen tačno jednoj liniji smještaja.</p>
                  )}
                  {accommodationCoverage !== partySize && accommodationLines.length > 0 && (
                    <p className="text-sm text-error-600">Smještaj mora pokriti sve putnike u rezervaciji.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review + Payment */}
        {step === "review" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">Pregled prodaje</h3>
            <dl className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              <Row label="Klijent" value={customerName} />
              <Row label="Telefon" value={customerPhone} />
              {customerEmail ? <Row label="Email" value={customerEmail} /> : null}
              <Row label="Aranžman" value={selectedPackage?.name ?? "—"} />
              <Row label="Termin" value={selectedDeparture ? `${new Date(selectedDeparture.depart_at).toLocaleDateString("bs-BA")} → ${new Date(selectedDeparture.return_at).toLocaleDateString("bs-BA")}` : "—"} />
              {variantId ? <Row label="Opcija" value={variants.find((v) => v.id === variantId)?.name ?? "—"} /> : null}
              {(showAdvanced || hasVariants) && (
                <>
                  <Row label="Prijevoz" value={transport === "flight" ? "Avion" : transport === "bus" ? "Autobus" : "Bez prijevoza"} />
                </>
              )}
              <Row
                label="Smještaj"
                value={accommodationLinesWithOption.length > 0
                  ? accommodationLinesWithOption.map(({ line, option }) => `${option?.hotel?.name || "Hotel"} · ${option?.roomLabel || "—"} · ${line.roomCount} soba`).join(" | ")
                  : "—"}
              />
              <Row label="Putnici" value={`${partySize} ${passengers.filter((p) => p.full_name.trim()).length > 0 ? `(${passengers.filter((p) => p.full_name.trim()).map((p) => p.full_name).join(", ")})` : ""}`} />
              {createGroup ? <Row label="Grupa" value={groupName || "Da"} /> : null}
              {accommodationLinesWithOption.length > 0 ? <Row label="Smještaj ukupno" value={`${accommodationTotal} BAM`} /> : null}
              <Row label="Ukupno" value={`${(Number(totalAmount || 0) + accommodationTotal) || "0"} BAM`} />
              {notes ? <Row label="Napomena" value={notes} /> : null}
            </dl>

            {/* Payment plan */}
            <div>
              <Label>Način plaćanja</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {(["full", "deposit", "installments"] as PaymentPlan[]).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setPaymentPlan(plan)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      paymentPlan === plan
                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                        : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {plan === "full" ? "Puna uplata" : plan === "deposit" ? "Depozit + ostatak" : "Rate"}
                  </button>
                ))}
              </div>
              {paymentPlan === "deposit" && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="!m-0">Depozit %</Label>
                  <Input type="number" min="1" max="99" value={String(depositPct)} onChange={(e) => setDepositPct(Math.min(99, Math.max(1, parseInt(e.target.value) || 10)))} className="w-20 !py-1.5 !text-sm" />
                  <span className="text-xs text-gray-500">
                    = {Math.round((totalAmount ? Number(totalAmount) : 0) * (depositPct / 100))} BAM
                  </span>
                </div>
              )}
              {paymentPlan === "installments" && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="!m-0">Broj rata</Label>
                  <Input type="number" min="2" max="24" value={String(installmentCount)} onChange={(e) => setInstallmentCount(Math.min(24, Math.max(2, parseInt(e.target.value) || 2)))} className="w-20 !py-1.5 !text-sm" />
                  <span className="text-xs text-gray-500">
                    ≈ {totalAmount ? Math.round(Number(totalAmount) / installmentCount) : 0} BAM / rata
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between gap-3 pt-5 mt-5 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={back} disabled={stepIndex === 0}>
            Nazad
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Odustani
            </Button>
            {step !== "review" ? (
              <Button onClick={next} disabled={!canNext || loading}>
                Dalje
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Kreiranje..." : "Potvrdi prodaju"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-2.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-white text-right">{value}</dd>
    </div>
  );
}
