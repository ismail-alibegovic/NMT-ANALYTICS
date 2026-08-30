import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import Select from "../form/Select";
import { useToast } from "../../context/ToastContext";
import { useT } from "../../lib/i18n/context";
import { TrashBinIcon, PlusIcon } from "../../icons";
import {
  createPackage,
  updatePackage,
  type Package,
  type PackageTransportType,
  type PackageVariant,
  type PackageVariantTier,
} from "../../api/packages";

type Variant = {
  id?: string;
  name: string;
  tier: PackageVariantTier;
  accommodation: "hotel" | "student" | "apartment" | "none";
  priceModifier: number;
  capacity: number;
  currency?: string | null;
  hotelName?: string | null;
  roomType?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  initial?: Package;
  itineraryId?: string;
  initialValues?: { name?: string; destination?: string; currency?: string; maxParticipants?: number };
};

export default function PackageEditorModal({ isOpen, onClose, onSaved, initial, itineraryId, initialValues }: Props) {
  const { success, error } = useToast();
  const { t, lang } = useT();
  const accommodationLabels: Record<Variant["accommodation"], string> = {
    hotel: lang === "bs" ? "Hotel" : "Hotel",
    student: lang === "bs" ? "Studentski smještaj" : "Student accommodation",
    apartment: lang === "bs" ? "Apartman" : "Apartment",
    none: lang === "bs" ? "Bez smještaja" : "No accommodation",
  };
  const tierLabels: Record<PackageVariantTier, string> = {
    standard: lang === "bs" ? "Standard" : "Standard",
    premium: lang === "bs" ? "Premium" : "Premium",
    deluxe: lang === "bs" ? "Deluxe" : "Deluxe",
    custom: lang === "bs" ? "Prilagođeno" : "Custom",
  };
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState<number | "">("");
  const [currency, setCurrency] = useState("BAM");
  const [durationDays, setDurationDays] = useState<number | "">("");
  const [active, setActive] = useState(true);
  const [transportType, setTransportType] = useState<PackageTransportType>("none");
  const [transportCapacity, setTransportCapacity] = useState<number | "">("");
  const [tripType, setTripType] = useState<string>("");
  const [variants, setVariants] = useState<Variant[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (initial) {
      setName(initial.name || "");
      setDestination(initial.destination || "");
      setDescription(initial.description || "");
      setBasePrice(initial.price ?? initial.base_price ?? "");
      setCurrency(initial.currency || "BAM");
      setActive(initial.active ?? true);
      setDurationDays(initial.durationDays ?? "");
      setTransportType(initial.transportType ?? initial.transport_type ?? "none");
      setTripType(initial.tripType ?? initial.trip_type ?? "");
      setTransportCapacity(initial.transportCapacity ?? initial.transport_capacity ?? "");
      setVariants((initial.variants ?? []).map((variant: PackageVariant) => ({
        id: variant.id,
        name: variant.name || "",
        tier: variant.tier ?? "standard",
        accommodation: (variant.accommodation as Variant["accommodation"]) || "hotel",
        priceModifier: variant.priceModifier ?? 0,
        capacity: variant.capacity ?? 0,
        currency: variant.currency ?? initial.currency ?? "BAM",
        hotelName: variant.hotelName ?? null,
        roomType: variant.roomType ?? null,
      })));
    } else if (initialValues) {
      setName(initialValues.name || "");
      setDestination(initialValues.destination || "");
      setCurrency(initialValues.currency || "BAM");
      setDescription("");
      setBasePrice("");
      setActive(true);
      setDurationDays("");
      setTransportType("none");
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
      setTransportType("none");
      setTripType("");
      setTransportCapacity("");
      setVariants([]);
    }
    setSubmitting(false);
  }, [isOpen, initial, initialValues]);

  const dirty = useMemo(() => {
    if (!name.trim() || !destination.trim()) return true;
    if (transportType !== "none" && !Number.isFinite(Number(transportCapacity))) return true;
    return false;
  }, [name, destination, transportType, transportCapacity]);

  function addVariant() {
    setVariants([...variants, {
      name: "",
      tier: "standard",
      accommodation: "hotel",
      priceModifier: 0,
      capacity: 0,
      currency,
      hotelName: null,
      roomType: null,
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
      error(t.packages.editor.requiredFields);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        destination: destination.trim(),
        price: Number(basePrice || 0),
        currency: currency || "BAM",
        active,
        description: description.trim() || null,
        durationDays: durationDays === "" ? null : Number(durationDays),
        maxParticipants: null,
        startDate: null,
        endDate: null,
        transportType,
        tripType: tripType || null,
        transportCapacity: transportType === "none" ? null : Number(transportCapacity || 0),
        variants: variants.map((v) => ({
          id: v.id,
          name: v.name.trim(),
          tier: v.tier,
          accommodation: v.accommodation,
          priceModifier: Number(v.priceModifier) || 0,
          capacity: Number(v.capacity) || 0,
          currency: v.currency ?? currency,
          hotelName: v.hotelName ?? null,
          roomType: v.roomType ?? null,
        })),
      };
      if (initial?.id) {
        await updatePackage(initial.id, payload);
        success(t.packages.editor.updated);
      } else {
        const createPayload = itineraryId ? { ...payload, itineraryId } : payload;
        await createPackage(createPayload);
        success(t.packages.editor.created);
      }
      await Promise.resolve(onSaved());
      onClose();
    } catch (e: any) {
      error(e?.message ?? t.packages.editor.saveError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={initial ? t.packages.editor.editTitle : t.packages.editor.createTitle}
      className="max-w-3xl my-8 p-0 overflow-y-auto max-h-[90vh]"
    >
      <div className="p-6 space-y-5 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>{t.packages.editor.nameLabel}</Label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder={t.packages.editor.namePlaceholder} />
          </div>
          <div>
            <Label>{t.packages.editor.destinationLabel}</Label>
            <Input value={destination} onChange={(e: any) => setDestination(e.target.value)} placeholder={t.packages.editor.destinationPlaceholder} />
          </div>
          <div>
            <Label>{t.packages.editor.basePriceLabel}</Label>
            <Input type="number" value={basePrice} onChange={(e: any) => setBasePrice(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0" />
          </div>
          <div>
            <Label>{t.packages.currency}</Label>
            <Select
              value={currency}
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
            <Label>{t.packages.tripType}</Label>
            <Select
              value={tripType}
              onChange={setTripType}
              options={[
                { value: "", label: "—" },
                { value: "beach", label: lang === "bs" ? "More / Plaža" : "Beach" },
                { value: "city", label: "City break" },
                { value: "pilgrimage", label: lang === "bs" ? "Hodočašće" : "Pilgrimage" },
                { value: "honeymoon", label: lang === "bs" ? "Medeni mjesec" : "Honeymoon" },
                { value: "ski", label: lang === "bs" ? "Skijanje" : "Ski" },
                { value: "adventure", label: lang === "bs" ? "Avantura" : "Adventure" },
                { value: "cruise", label: lang === "bs" ? "Krstarenje" : "Cruise" },
                { value: "cultural", label: lang === "bs" ? "Kulturno putovanje" : "Cultural trip" },
                { value: "wellness", label: "Wellness / Spa" },
                { value: "other", label: lang === "bs" ? "Ostalo" : "Other" },
              ]}
            />
          </div>
          <div>
            <Label>{t.packages.duration}</Label>
            <Input type="number" value={durationDays} onChange={(e: any) => setDurationDays(e.target.value === "" ? "" : Number(e.target.value))} placeholder="7" />
          </div>
          <div>
            <Label>{t.packages.isActive}</Label>
            <div className="flex items-center h-11">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="ml-3 text-gray-700 dark:text-gray-300">{t.packages.editor.activeHelp}</span>
            </div>
          </div>
        </div>

        <div>
          <Label>{t.packages.fieldDescription}</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            placeholder={t.packages.editor.descriptionPlaceholder}
          />
        </div>

        {/* Transport */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{t.packages.transportType}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t.packages.editor.transportHelp}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t.packages.editor.transportTypeLabel}</Label>
              <Select
                value={transportType}
                onChange={(v) => setTransportType(v as PackageTransportType)}
                options={[
                  { value: "none", label: t.packages.editor.transportNone },
                  { value: "bus", label: t.packages.editor.transportBus },
                  { value: "flight", label: t.packages.editor.transportFlight },
                ]}
              />
            </div>
            <div>
              <Label>{t.packages.capacity}</Label>
              <Input
                type="number"
                value={transportCapacity}
                disabled={transportType === "none"}
                onChange={(e: any) => setTransportCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={transportType === "none" ? "—" : t.packages.editor.transportCapacityPlaceholder}
              />
            </div>
          </div>
        </div>

        {/* Variants */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">{t.packages.editor.variantsTitle}</h4>
            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
            >
              <PlusIcon className="size-4" /> {t.packages.editor.addVariant}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t.packages.editor.variantsHelp}</p>

          {variants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-xs text-gray-400">
              {t.packages.editor.emptyVariants}
            </div>
          ) : (
            <div className="space-y-3">
              {variants.map((v, i) => (
                <div key={i} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-3">
                    <Label>{t.packages.name}</Label>
                    <Input value={v.name} onChange={(e: any) => updateVariant(i, { name: e.target.value })} placeholder={lang === "bs" ? "Standard" : "Standard"} />
                  </div>
                  <div className="md:col-span-3">
                    <Label>{t.packages.editor.variantTierLabel}</Label>
                    <Select
                      value={v.tier}
                      onChange={(val) => updateVariant(i, { tier: val as PackageVariantTier })}
                      options={(Object.keys(tierLabels) as PackageVariantTier[]).map(k => ({ value: k, label: tierLabels[k] }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t.packages.editor.variantAccommodationLabel}</Label>
                    <Select
                      value={v.accommodation}
                      onChange={(val) => updateVariant(i, { accommodation: val as Variant["accommodation"] })}
                      options={(Object.keys(accommodationLabels) as Variant["accommodation"][]).map(k => ({ value: k, label: accommodationLabels[k] }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t.packages.priceModifier}</Label>
                    <Input type="number" value={v.priceModifier} onChange={(e: any) => updateVariant(i, { priceModifier: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="md:col-span-1">
                    <Label>{t.packages.editor.variantCapacityLabel}</Label>
                    <Input type="number" value={v.capacity} onChange={(e: any) => updateVariant(i, { capacity: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      aria-label={t.packages.editor.removeVariant}
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
        <Button variant="outline" size="md" onClick={handleClose} disabled={submitting}>{t.common.cancel}</Button>
        <Button size="md" onClick={submit} disabled={submitting || dirty}>
          {submitting ? t.common.saving : (initial ? t.packages.editor.saveChanges : t.packages.editor.createAction)}
        </Button>
      </div>
    </Modal>
  );
}
