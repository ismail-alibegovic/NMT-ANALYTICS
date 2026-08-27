import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import Select from "../form/Select";
import { useToast } from "../../context/ToastContext";
import { TrashBinIcon, PlusIcon } from "../../icons";
import { createPackage, updatePackage, Package, type PackageVariant } from "../../api/packages";

type TransportMode = "none" | "bus" | "flight";
type VariantTier = "standard" | "premium" | "deluxe" | "custom";

type Variant = {
  id?: string;
  name: string;
  tier: VariantTier;
  accommodation: "hotel" | "student" | "apartment" | "none";
  price: number;
  capacity: number;
};

const ACCOMMODATION_LABELS: Record<Variant["accommodation"], string> = {
  hotel: "Hotel",
  student: "Studentski smještaj",
  apartment: "Apartman",
  none: "Bez smještaja",
};

const TIER_LABELS: Record<VariantTier, string> = {
  standard: "Standard",
  premium: "Premium",
  deluxe: "Deluxe",
  custom: "Prilagođeno",
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Package;
  itineraryId?: string;
  initialValues?: { name?: string; destination?: string; currency?: string; maxParticipants?: number };
};

export default function PackageEditorModal({ isOpen, onClose, onSaved, initial, itineraryId, initialValues }: Props) {
  const { success, error } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [base_price, setBasePrice] = useState<number | "">("");
  const [currency, setCurrency] = useState("BAM");
  const [durationDays, setDurationDays] = useState<number | "">("");
  const [active, setActive] = useState(true);
  const [transport_mode, setTransportMode] = useState<TransportMode>("none");
  const [transport_capacity, setTransportCapacity] = useState<number | "">("");
  const [tripType, setTripType] = useState<string>("");
  const [variants, setVariants] = useState<Variant[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (initial) {
      setName(initial.name || "");
      setDestination(initial.destination || "");
      setDescription(initial.description || "");
      setBasePrice(initial.base_price ?? "");
      setCurrency(initial.currency || "BAM");
      setActive(initial.active ?? true);
      setDurationDays(initial.durationDays ?? "");
      setTransportMode(initial.transport_type || "none");
      setTripType(initial.tripType || "");
      setTransportCapacity(initial.transport_capacity ?? "");
      setVariants((initial.variants ?? []).map((variant: PackageVariant) => ({
        id: variant.id,
        name: variant.name || "",
        tier: "standard",
        accommodation: (variant.accommodation as Variant["accommodation"]) || "hotel",
        price: variant.price_delta ?? 0,
        capacity: 0,
      })));
    } else if (initialValues) {
      setName(initialValues.name || "");
      setDestination(initialValues.destination || "");
      setCurrency(initialValues.currency || "BAM");
      setDescription("");
      setBasePrice("");
      setActive(true);
      setDurationDays("");
      setTransportMode("none");
      setTripType("");
      setTransportCapacity("");
      setVariants([]);
    } else {
      setName("");
      setDestination("");
      setDescription("");
      setBasePrice("");
      setCurrency("BAM");
      setActive(true);
      setDurationDays("");
      setTransportMode("none");
      setTripType("");
      setTransportCapacity("");
      setVariants([]);
    }
    setSubmitting(false);
  }, [isOpen, initial, initialValues]);

  const dirty = useMemo(() => {
    if (!name.trim() || !destination.trim()) return true;
    if (transport_mode !== "none" && !Number.isFinite(Number(transport_capacity))) return false;
    return false;
  }, [name, destination, transport_mode, transport_capacity]);

  function addVariant() {
    setVariants([...variants, {
      name: "",
      tier: "standard",
      accommodation: "hotel",
      price: 0,
      capacity: 0,
    }]);
  }

  function updateVariant(i: number, patch: Partial<Variant>) {
    setVariants(variants.map((v, idx) => idx === i ? { ...v, ...patch } : v));
  }

  function removeVariant(i: number) {
    setVariants(variants.filter((_, idx) => idx !== i));
  }

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function submit() {
    if (submitting) return;
    if (!name.trim() || !destination.trim()) {
      error("Naziv i destinacija su obavezni.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        destination: destination.trim(),
        price: Number(base_price || 0),
        currency: currency || "BAM",
        active,
        description: description.trim() || null,
        durationDays: durationDays === "" ? null : Number(durationDays),
        maxParticipants: null,
        startDate: null,
        endDate: null,
        transport_mode,
        tripType: tripType || null,
        transport_capacity: transport_mode === "none" ? null : Number(transport_capacity || 0),
        variants: variants
          .filter(v => v.name.trim())
          .map(v => ({
            id: v.id,
            name: v.name.trim(),
            tier: v.tier,
            accommodation: v.accommodation,
            price: Number(v.price) || 0,
            capacity: Number(v.capacity) || 0,
          })),
      };
      if (initial?.id) {
        await updatePackage(initial.id, payload as any);
        success("Paket ažuriran.");
      } else {
        const createPayload: any = { ...payload };
        if (itineraryId) createPayload.itineraryId = itineraryId;
        await createPackage(createPayload);
        success("Paket kreiran.");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      error(e?.message ?? "Greška pri snimanju paketa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={initial ? "Uredi ponudu" : "Nova ponuda / paket"}
      className="max-w-3xl my-8 p-0 overflow-y-auto max-h-[90vh]"
    >
      <div className="p-6 space-y-5 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Naziv paketa *</Label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Paris City Break 7 dana" />
          </div>
          <div>
            <Label>Destinacija *</Label>
            <Input value={destination} onChange={(e: any) => setDestination(e.target.value)} placeholder="Pariz, Francuska" />
          </div>
          <div>
            <Label>bazna cijena (bez opcija)</Label>
            <Input type="number" value={base_price} onChange={(e: any) => setBasePrice(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" />
          </div>
          <div>
            <Label>Valuta</Label>
            <Select
              defaultValue={currency}
              onChange={setCurrency}
              options={[
                { value: "BAM", label: "BAM (KM)" },
                { value: "EUR", label: "EUR" },
                { value: "USD", label: "USD" },
                { value: "TRY", label: "TRY" },
              ]}
            />
          </div>
          <div>
            <Label>Vrsta putovanja</Label>
            <Select
              value={tripType}
              onChange={setTripType}
              options={[
                { value: "", label: "—" },
                { value: "beach", label: "More / Plaža" },
                { value: "city", label: "City break" },
                { value: "pilgrimage", label: "Hodočašće" },
                { value: "honeymoon", label: "Medeni mjesec" },
                { value: "ski", label: "Skijanje" },
                { value: "adventure", label: "Avantura" },
                { value: "cruise", label: "Krstarenje" },
                { value: "cultural", label: "Kulturno putovanje" },
                { value: "wellness", label: "Wellness / Spa" },
                { value: "other", label: "Ostalo" },
              ]}
            />
          </div>
          <div>
            <Label>Trajanje (dani)</Label>
            <Input type="number" value={durationDays} onChange={(e: any) => setDurationDays(e.target.value === "" ? "" : Number(e.target.value))} placeholder="7" />
          </div>
          <div>
            <Label>Aktivan</Label>
            <div className="flex items-center h-11">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="ml-3 text-gray-700 dark:text-gray-300">Paket je dostupan za prodaju</span>
            </div>
          </div>
        </div>

        <div>
          <Label>Opis</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            placeholder="Kratak opis putovanja, uključene usluge, itd."
          />
        </div>

        {/* Transport */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Prijevoz</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Kako putnici idu na destinaciju. Kapacitet se koristi kao maksimalna prodaja po polasku vezanom za ovaj paket.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Vrsta prijevoza</Label>
              <Select
                defaultValue={transport_mode}
                onChange={(v) => setTransportMode(v as TransportMode)}
                options={[
                  { value: "none", label: "Bez prijevoza (samo paket)" },
                  { value: "bus", label: "Autobus" },
                  { value: "flight", label: "Avion" },
                ]}
              />
            </div>
            <div>
              <Label>Kapacitet (mjesta)</Label>
              <Input
                type="number"
                value={transport_capacity}
                disabled={transport_mode === "none"}
                onChange={(e: any) => setTransportCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={transport_mode === "none" ? "—" : "npr. 50"}
              />
            </div>
          </div>
        </div>

        {/* Variants */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">Opcije paketa</h4>
            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
            >
              <PlusIcon className="size-4" /> Dodaj opciju
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Standard / Premium / Deluxe — tip hotela (ili studentski smještaj / apartman) + cijena + kapacitet. Agent bira jednu opciju prilikom prodaje.</p>

          {variants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-xs text-gray-400">
              još nema opcija. npr. "Standard — Hotel 3* — 1200 KM — 30 mjesta".
            </div>
          ) : (
            <div className="space-y-3">
              {variants.map((v, i) => (
                <div key={i} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-3">
                    <Label>Naziv</Label>
                    <Input value={v.name} onChange={(e: any) => updateVariant(i, { name: e.target.value })} placeholder="Standard" />
                  </div>
                  <div className="md:col-span-3">
                    <Label>Tier</Label>
                    <Select
                      defaultValue={v.tier}
                      onChange={(val) => updateVariant(i, { tier: val as VariantTier })}
                      options={(Object.keys(TIER_LABELS) as VariantTier[]).map(k => ({ value: k, label: TIER_LABELS[k] }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Smještaj</Label>
                    <Select
                      defaultValue={v.accommodation}
                      onChange={(val) => updateVariant(i, { accommodation: val as Variant["accommodation"] })}
                      options={(Object.keys(ACCOMMODATION_LABELS) as Variant["accommodation"][]).map(k => ({ value: k, label: ACCOMMODATION_LABELS[k] }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Cijena</Label>
                    <Input type="number" value={v.price} onChange={(e: any) => updateVariant(i, { price: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="md:col-span-1">
                    <Label>Cap.</Label>
                    <Input type="number" value={v.capacity} onChange={(e: any) => updateVariant(i, { capacity: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      aria-label="Ukloni opciju"
                    >
                      <TrashBinIcon className="size-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <Button variant="outline" size="md" onClick={handleClose} disabled={submitting}>Odustani</Button>
        <Button size="md" onClick={submit} disabled={submitting || dirty}>
          {submitting ? "Snimanje…" : (initial ? "Sačuvaj izmjene" : "Kreiraj paket")}
        </Button>
      </div>
    </Modal>
  );
}
