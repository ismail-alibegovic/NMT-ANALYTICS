import { useEffect, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { useToast } from "../../context/ToastContext";
import { getPackages, Package } from "../../api/packages";
import { getDepartures, Departure } from "../../api/departures";
import { getCustomers, Customer } from "../../api/customers";
import { createReservation } from "../../api/reservations";

type Step = "arrangement" | "details" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "arrangement", label: "Aranžman" },
  { key: "details", label: "Detalji" },
  { key: "review", label: "Pregled" },
];

type TransportRequest = "bus" | "flight" | "none";
type Variant = { id: string; name: string; priceModifier?: number; accommodation?: string };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function NewSaleWizard({ isOpen, onClose, onCreated }: Props) {
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
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");

  const selectedPackage = packages.find((p) => p.id === packageId);
  const selectedDeparture = departures.find((d) => d.id === departureId);

  const variants: Variant[] = Array.isArray(selectedPackage?.variants)
    ? (selectedPackage!.variants as unknown as Variant[])
    : [];
  const hasVariants = variants.length > 0;

  const activeDepartures = departures.filter((d) => d.status === "active" && d.booked < d.capacity);

  function reset() {
    setStep("arrangement");
    setPackageId(""); setDepartureId(""); setVariantId("");
    setTransport("none"); setAccommodation("");
    setCustomerSearch(""); setSelectedCustomerId(null);
    setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
    setPartySize(1); setTotalAmount(""); setNotes("");
    setShowAdvanced(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    reset();
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
        // Express mode: auto-select if exactly 1 active departure and no variants
        const active = deps.filter((d) => d.status === "active" && d.booked < d.capacity);
        const pkg = packages.find((p) => p.id === packageId);
        const pkgVariants = Array.isArray(pkg?.variants) ? pkg!.variants : [];
        if (active.length === 1 && pkgVariants.length === 0) {
          setDepartureId(active[0].id);
        }
      })
      .catch(() => setDepartures([]));
  }, [packageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill price when package chosen
  useEffect(() => {
    if (selectedPackage && !totalAmount) {
      const base = selectedPackage.price ?? selectedPackage.base_price ?? 0;
      if (base) setTotalAmount(String(base));
    }
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

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canNext = (() => {
    if (step === "arrangement") return !!packageId && !!departureId;
    if (step === "details") return !!customerName && !!customerPhone;
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
      await createReservation({
        customerName,
        customerPhone,
        partySize,
        reservationAt: new Date().toISOString(),
        departureId: departureId || undefined,
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        source: "agent",
        customerId: selectedCustomerId || undefined,
        status: "pending",
        notes: notes || undefined,
        hotelName: selectedPackage?.destination || undefined,
        roomType: accommodation || undefined,
        options: {
          package_id: packageId,
          package_name: selectedPackage?.name,
          departure_label: selectedDeparture
            ? `${new Date(selectedDeparture.depart_at).toLocaleDateString("bs-BA")}`
            : undefined,
          variant_id: variantId || undefined,
          variant_name: variants.find((v) => v.id === variantId)?.name,
          transport_request: transport,
          accommodation,
        },
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
      {/* Stepper — 3 steps */}
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
                  {done ? "✓" : i + 1}
                </span>
                <span className={active ? "font-medium text-gray-900 dark:text-white" : "text-gray-500"}>{s.label}</span>
                {i < STEPS.length - 1 && <span className="text-gray-300 dark:text-gray-700">→</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="p-6 pt-4">
        {loading && <p className="text-sm text-gray-500">Učitavanje... </p>}

        {/* Step 1: Arrangement + Departure (combined) */}
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

            {/* Departures appear inline when package selected */}
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

        {/* Step 2: Details — variants + transport + client (combined) */}
        {step === "details" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {/* Variants + transport (only if variants exist or advanced toggled) */}
            {(hasVariants || showAdvanced) && (
              <div className="space-y-3 pb-4 border-b border-gray-100 dark:border-gray-800">
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

            {/* Advanced toggle (only if no variants) */}
            {!hasVariants && !showAdvanced && (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >
                + Prikaži prijevoz i smještaj
              </button>
            )}

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
                  <Label>Ime i prezime *</Label>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Osoba</Label>
                  <Input type="number" min="1" value={String(partySize)} onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
                <div className="col-span-2">
                  <Label>Ukupan iznos (BAM)</Label>
                  <Input type="number" min="0" placeholder="0.00" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Napomena</Label>
                <Input type="text" placeholder="Npr. pomaže pri ulazu u avion..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === "review" && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Pregled prodaje</h3>
            <dl className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              <Row label="Klijent" value={customerName} />
              <Row label="Telefon" value={customerPhone} />
              {customerEmail ? <Row label="Email" value={customerEmail} /> : null}
              <Row label="Aranžman" value={selectedPackage?.name ?? "—"} />
              <Row label="Termin" value={selectedDeparture ? `${new Date(selectedDeparture.depart_at).toLocaleDateString("bs-BA")} → ${new Date(selectedDeparture.return_at).toLocaleDateString("bs-BA")}` : "—"} />
              {variantId ? <Row label="Opcija" value={variants.find((v) => v.id === variantId)?.name ?? "—"} /> : null}
              {showAdvanced || hasVariants ? <>
                <Row label="Prijevoz" value={transport === "flight" ? "Avion" : transport === "bus" ? "Autobus" : "Bez prijevoza"} />
                <Row label="Smještaj" value={accommodation || "—"} />
              </> : null}
              <Row label="Osobe" value={String(partySize)} />
              <Row label="Ukupno" value={`${totalAmount || "0"} BAM`} />
              {notes ? <Row label="Napomena" value={notes} /> : null}
            </dl>
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
