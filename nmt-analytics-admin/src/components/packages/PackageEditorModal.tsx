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
import {
  getPackageHotels,
  linkHotelToPackage,
  unlinkHotelFromPackage,
  updatePackageHotel,
  type PackageHotel,
  type PackageHotelCatalogHotel,
  type RoomOption,
} from "../../api/packageHotels";
import { createHotel, getHotels, type Hotel } from "../../api/operations";

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

type EditableRoomOption = {
  key: string;
  type: RoomOption["type"];
  label: string;
  net_price: number;
  sell_price: number;
  available: number;
};

type EditablePackageHotel = {
  key: string;
  id?: string;
  hotelId: string;
  hotel: PackageHotelCatalogHotel | null;
  roomOptions: EditableRoomOption[];
  priceModifier: number;
  sortOrder: number;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  initial?: Package;
  itineraryId?: string;
  initialValues?: { name?: string; destination?: string; currency?: string; maxParticipants?: number };
};

const roomTypeOptions: Array<{ value: RoomOption["type"]; labelKey: "single" | "double" | "triple" | "apartment" | "studio" | "suite" }> = [
  { value: "single", labelKey: "single" },
  { value: "double", labelKey: "double" },
  { value: "triple", labelKey: "triple" },
  { value: "apartment", labelKey: "apartment" },
  { value: "studio", labelKey: "studio" },
  { value: "suite", labelKey: "suite" },
];

function toEditableRoomOption(option: RoomOption, index: number): EditableRoomOption {
  return {
    key: `${option.type}-${option.label}-${index}`,
    type: option.type,
    label: option.label,
    net_price: Number(option.net_price || 0),
    sell_price: Number(option.sell_price || 0),
    available: Number(option.available || 0),
  };
}

function toEditablePackageHotel(link: PackageHotel): EditablePackageHotel {
  return {
    key: link.id,
    id: link.id,
    hotelId: link.hotelId,
    hotel: link.hotel ?? null,
    roomOptions: link.roomOptions.map(toEditableRoomOption),
    priceModifier: Number(link.priceModifier || 0),
    sortOrder: Number(link.sortOrder || 0),
  };
}

function roomOptionsPayload(roomOptions: EditableRoomOption[]): RoomOption[] {
  return roomOptions.map((option) => ({
    type: option.type,
    label: option.label.trim(),
    net_price: Number(option.net_price || 0),
    sell_price: Number(option.sell_price || 0),
    available: Number(option.available || 0),
  }));
}

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
  const [catalogHotels, setCatalogHotels] = useState<Hotel[]>([]);
  const [linkedHotels, setLinkedHotels] = useState<EditablePackageHotel[]>([]);
  const [persistedLinks, setPersistedLinks] = useState<PackageHotel[]>([]);
  const [accommodationLoading, setAccommodationLoading] = useState(false);
  const [accommodationError, setAccommodationError] = useState<string | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [createdPackageId, setCreatedPackageId] = useState<string | null>(null);
  const [createHotelOpen, setCreateHotelOpen] = useState(false);
  const [creatingHotel, setCreatingHotel] = useState(false);
  const [newHotelName, setNewHotelName] = useState("");
  const [newHotelDestination, setNewHotelDestination] = useState("");
  const [newHotelAddress, setNewHotelAddress] = useState("");
  const [newHotelContact, setNewHotelContact] = useState("");
  const [newHotelEmail, setNewHotelEmail] = useState("");
  const [newHotelWebsite, setNewHotelWebsite] = useState("");
  const [newHotelDescription, setNewHotelDescription] = useState("");
  const [newHotelAmenities, setNewHotelAmenities] = useState("");
  const [newHotelStars, setNewHotelStars] = useState<string>("");
  const [newHotelTotalRooms, setNewHotelTotalRooms] = useState<number | "">(10);

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
    setSelectedHotelId("");
    setAccommodationError(null);
    setLinkedHotels([]);
    setPersistedLinks([]);
    setCatalogHotels([]);
    setCreatedPackageId(null);
    setCreateHotelOpen(false);
    resetNewHotelForm();
  }, [isOpen, initial, initialValues]);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;

    (async () => {
      setAccommodationLoading(true);
      setAccommodationError(null);
      try {
        const hotelCatalog = await getHotels();
        if (!alive) return;
        setCatalogHotels(hotelCatalog);
      } catch (err: any) {
        if (!alive) return;
        setCatalogHotels([]);
        setAccommodationError(err?.message || t.packages.editor.accommodationLoadError);
      } finally {
        if (alive) setAccommodationLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, t.packages.editor.accommodationLoadError]);

  useEffect(() => {
    if (!isOpen || !initial?.id) return;
    let alive = true;

    (async () => {
      setAccommodationLoading(true);
      setAccommodationError(null);
      try {
        const packageHotelLinks = await getPackageHotels(initial.id!);
        if (!alive) return;
        setPersistedLinks(packageHotelLinks);
        setLinkedHotels(packageHotelLinks.map(toEditablePackageHotel));
      } catch (err: any) {
        if (!alive) return;
        setPersistedLinks([]);
        setLinkedHotels([]);
        setAccommodationError(err?.message || t.packages.editor.accommodationLoadError);
      } finally {
        if (alive) setAccommodationLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, initial?.id, t.packages.editor.accommodationLoadError]);

  const dirty = useMemo(() => {
    if (!name.trim() || !destination.trim()) return true;
    if (transportType !== "none" && !Number.isFinite(Number(transportCapacity))) return true;
    return false;
  }, [name, destination, transportType, transportCapacity]);

  const availableHotels = useMemo(
    () => catalogHotels.filter((hotel) => !linkedHotels.some((link) => link.hotelId === hotel.id)),
    [catalogHotels, linkedHotels],
  );

  function resetNewHotelForm() {
    setNewHotelName("");
    setNewHotelDestination("");
    setNewHotelAddress("");
    setNewHotelContact("");
    setNewHotelEmail("");
    setNewHotelWebsite("");
    setNewHotelDescription("");
    setNewHotelAmenities("");
    setNewHotelStars("");
    setNewHotelTotalRooms(10);
  }

  function toCatalogHotel(hotel: Hotel | PackageHotelCatalogHotel): PackageHotelCatalogHotel {
    return {
      id: hotel.id,
      name: hotel.name,
      destination: hotel.destination,
      stars: hotel.stars ?? null,
    };
  }

  function appendLinkedHotel(hotel: PackageHotelCatalogHotel) {
    if (linkedHotels.some((link) => link.hotelId === hotel.id)) {
      error(t.packages.editor.duplicateHotel);
      return;
    }

    const nextSortOrder = linkedHotels.length === 0
      ? 0
      : Math.max(...linkedHotels.map((link) => Number(link.sortOrder || 0))) + 1;

    setLinkedHotels((current) => [
      ...current,
      {
        key: `new-${hotel.id}`,
        hotelId: hotel.id,
        hotel,
        roomOptions: [],
        priceModifier: 0,
        sortOrder: nextSortOrder,
      },
    ]);
  }

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

  function addLinkedHotel() {
    if (!selectedHotelId) {
      error(t.packages.editor.hotelRequired);
      return;
    }
    if (linkedHotels.some((link) => link.hotelId === selectedHotelId)) {
      error(t.packages.editor.duplicateHotel);
      return;
    }
    const hotel = catalogHotels.find((item) => item.id === selectedHotelId);
    if (!hotel) {
      error(t.packages.editor.hotelNotFound);
      return;
    }

    appendLinkedHotel(toCatalogHotel(hotel));
    setSelectedHotelId("");
  }

  async function handleCreateHotelInline() {
    if (creatingHotel) return;
    if (!newHotelName.trim() || !newHotelDestination.trim()) {
      error(t.packages.editor.newHotelRequiredFields);
      return;
    }

    const totalRooms = newHotelTotalRooms === "" ? 10 : Number(newHotelTotalRooms);
    if (!Number.isInteger(totalRooms) || totalRooms <= 0) {
      error(t.packages.editor.newHotelInvalidTotalRooms);
      return;
    }

    setCreatingHotel(true);
    try {
      const hotel = await createHotel({
        name: newHotelName.trim(),
        destination: newHotelDestination.trim(),
        address: newHotelAddress.trim() || undefined,
        contact: newHotelContact.trim() || undefined,
        totalRooms,
        stars: newHotelStars ? Number(newHotelStars) : null,
        description: newHotelDescription.trim() || undefined,
        amenities: newHotelAmenities
          ? newHotelAmenities.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined,
        email: newHotelEmail.trim() || undefined,
        website: newHotelWebsite.trim() || undefined,
      });
      const createdHotel = toCatalogHotel(hotel);
      setCatalogHotels((current) => current.some((item) => item.id === createdHotel.id) ? current : [...current, hotel]);
      appendLinkedHotel(createdHotel);
      setSelectedHotelId("");
      setCreateHotelOpen(false);
      resetNewHotelForm();
      success(t.packages.editor.newHotelCreated);
    } catch (e: any) {
      const message = e?.message ?? t.packages.editor.newHotelCreateFailed;
      setAccommodationError(message);
      error(message);
    } finally {
      setCreatingHotel(false);
    }
  }

  function updateLinkedHotel(key: string, patch: Partial<EditablePackageHotel>) {
    setLinkedHotels((current) => current.map((link) => link.key === key ? { ...link, ...patch } : link));
  }

  function removeLinkedHotel(key: string) {
    setLinkedHotels((current) => current.filter((link) => link.key !== key));
  }

  function addRoomOption(linkKey: string) {
    updateLinkedHotel(linkKey, {
      roomOptions: [
        ...(linkedHotels.find((link) => link.key === linkKey)?.roomOptions || []),
        {
          key: `${linkKey}-room-${Date.now()}`,
          type: "double",
          label: "",
          net_price: 0,
          sell_price: 0,
          available: 0,
        },
      ],
    });
  }

  function updateRoomOption(linkKey: string, roomKey: string, patch: Partial<EditableRoomOption>) {
    setLinkedHotels((current) => current.map((link) => {
      if (link.key !== linkKey) return link;
      return {
        ...link,
        roomOptions: link.roomOptions.map((roomOption) => roomOption.key === roomKey ? { ...roomOption, ...patch } : roomOption),
      };
    }));
  }

  function removeRoomOption(linkKey: string, roomKey: string) {
    setLinkedHotels((current) => current.map((link) => {
      if (link.key !== linkKey) return link;
      return {
        ...link,
        roomOptions: link.roomOptions.filter((roomOption) => roomOption.key !== roomKey),
      };
    }));
  }

  function validateAccommodation(): boolean {
    const hotelIds = new Set<string>();
    for (const link of linkedHotels) {
      if (!link.hotelId) {
        error(t.packages.editor.hotelRequired);
        return false;
      }
      if (hotelIds.has(link.hotelId)) {
        error(t.packages.editor.duplicateHotel);
        return false;
      }
      hotelIds.add(link.hotelId);

      if (!Number.isFinite(Number(link.priceModifier)) || Number(link.priceModifier) < 0) {
        error(t.packages.editor.invalidPriceModifier);
        return false;
      }
      if (!Number.isInteger(Number(link.sortOrder)) || Number(link.sortOrder) < 0) {
        error(t.packages.editor.invalidSortOrder);
        return false;
      }

      for (const option of link.roomOptions) {
        if (!option.label.trim()) {
          error(t.packages.editor.roomOptionLabelRequired);
          return false;
        }
        if (!Number.isFinite(Number(option.net_price)) || Number(option.net_price) < 0) {
          error(t.packages.editor.invalidRoomOptionPrice);
          return false;
        }
        if (!Number.isFinite(Number(option.sell_price)) || Number(option.sell_price) < 0) {
          error(t.packages.editor.invalidRoomOptionPrice);
          return false;
        }
        if (!Number.isInteger(Number(option.available)) || Number(option.available) < 0) {
          error(t.packages.editor.invalidRoomOptionAvailability);
          return false;
        }
      }
    }

    return true;
  }

  async function savePackageHotels(packageId: string) {
    const persistedIds = new Set(linkedHotels.map((link) => link.id).filter(Boolean));
    const linksToDelete = persistedLinks.filter((link) => !persistedIds.has(link.id));

    for (const link of linksToDelete) {
      await unlinkHotelFromPackage(link.id);
    }

    for (const link of [...linkedHotels].sort((a, b) => a.sortOrder - b.sortOrder || a.hotelId.localeCompare(b.hotelId))) {
      const payload = {
        hotelId: link.hotelId,
        roomOptions: roomOptionsPayload(link.roomOptions),
        priceModifier: Number(link.priceModifier || 0),
        sortOrder: Number(link.sortOrder || 0),
      };

      if (link.id) {
        await updatePackageHotel(link.id, payload);
      } else {
        await linkHotelToPackage(packageId, payload);
      }
    }

    const freshLinks = await getPackageHotels(packageId);
    setPersistedLinks(freshLinks);
    setLinkedHotels(freshLinks.map(toEditablePackageHotel));
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
    if (!validateAccommodation()) {
      return;
    }

    setSubmitting(true);
    setAccommodationError(null);
    try {
      const createMode = !initial?.id;
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

      let packageId = initial?.id ?? createdPackageId ?? null;
      let createdThisSession = false;

      if (initial?.id) {
        await updatePackage(initial.id, payload);
        packageId = initial.id;
      } else if (createdPackageId) {
        await updatePackage(createdPackageId, payload);
        packageId = createdPackageId;
      } else {
        const createdPackage = await createPackage(itineraryId ? { ...payload, itineraryId } : payload);
        packageId = createdPackage.id;
        createdThisSession = true;
        setCreatedPackageId(createdPackage.id);
      }

      if (packageId && (linkedHotels.length > 0 || persistedLinks.length > 0)) {
        try {
          await savePackageHotels(packageId);
        } catch (e: any) {
          if (createMode && (createdThisSession || createdPackageId)) {
            const detail = e?.message ?? t.packages.editor.saveError;
            const message = `${t.packages.editor.accommodationPersistenceFailed} ${detail}`.trim();
            setAccommodationError(message);
            error(message);
            return;
          }
          throw e;
        }
      }

      success(createMode ? t.packages.editor.created : t.packages.editor.updated);
      await Promise.resolve(onSaved());
      onClose();
    } catch (e: any) {
      const message = e?.message ?? t.packages.editor.saveError;
      setAccommodationError(message);
      error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={initial ? t.packages.editor.editTitle : t.packages.editor.createTitle}
      className="max-w-5xl my-8 p-0 overflow-y-auto max-h-[90vh]"
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

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white">{t.packages.editor.accommodationTitle}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.packages.editor.accommodationHelp}</p>
            </div>
          </div>

          {accommodationLoading ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
              {t.common.loading}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                <div>
                  <Label>{t.packages.editor.selectHotelLabel}</Label>
                  <Select
                    value={selectedHotelId}
                    onChange={setSelectedHotelId}
                    options={[
                      { value: "", label: t.packages.editor.selectHotelPlaceholder },
                      ...availableHotels.map((hotel) => ({
                        value: hotel.id,
                        label: `${hotel.name}${hotel.destination ? ` — ${hotel.destination}` : ""}`,
                      })),
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <Button type="button" onClick={addLinkedHotel} disabled={!selectedHotelId}>
                    {t.packages.editor.attachHotel}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setCreateHotelOpen(true)}>
                    {t.packages.editor.createHotel}
                  </Button>
                </div>
              </div>

              {accommodationError ? (
                <div className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-500/10 dark:text-error-400">
                  {accommodationError}
                </div>
              ) : null}

              {linkedHotels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-xs text-gray-400">
                  {t.packages.editor.emptyAccommodation}
                </div>
              ) : (
                <div className="space-y-4">
                  {linkedHotels
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.hotelId.localeCompare(b.hotelId))
                    .map((link) => (
                      <div key={link.key} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-gray-900 dark:text-white">{link.hotel?.name || t.packages.editor.hotelFallback}</h5>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {link.hotel?.destination || t.packages.editor.noHotelDestination}
                              {link.hotel?.stars ? ` • ${link.hotel.stars}★` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLinkedHotel(link.key)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                            aria-label={t.packages.editor.removeHotel}
    >
                            <TrashBinIcon className="size-5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>{t.packages.priceModifier}</Label>
                            <Input
                              type="number"
                              value={link.priceModifier}
                              onChange={(e: any) => updateLinkedHotel(link.key, { priceModifier: Number(e.target.value) || 0 })}
                            />
                          </div>
                          <div>
                            <Label>{t.packages.editor.sortOrderLabel}</Label>
                            <Input
                              type="number"
                              value={link.sortOrder}
                              onChange={(e: any) => updateLinkedHotel(link.key, { sortOrder: Number(e.target.value) || 0 })}
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h6 className="text-sm font-semibold text-gray-900 dark:text-white">{t.packages.roomOptions}</h6>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{t.packages.editor.roomOptionsHelp}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => addRoomOption(link.key)}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
                            >
                              <PlusIcon className="size-4" /> {t.packages.editor.addRoomOption}
                            </button>
                          </div>

                          {link.roomOptions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center text-xs text-gray-400">
                              {t.packages.editor.emptyRoomOptions}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {link.roomOptions.map((option) => (
                                <div key={option.key} className="rounded-lg bg-gray-50 dark:bg-white/[0.03] p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                                  <div className="lg:col-span-2">
                                    <Label>{t.packages.editor.roomOptionTypeLabel}</Label>
                                    <Select
                                      value={option.type}
                                      onChange={(value) => updateRoomOption(link.key, option.key, { type: value as RoomOption["type"] })}
                                      options={roomTypeOptions.map((roomType) => ({
                                        value: roomType.value,
                                        label: t.packages.editor.roomTypeLabels[roomType.labelKey],
                                      }))}
                                    />
                                  </div>
                                  <div className="lg:col-span-3">
                                    <Label>{t.packages.editor.roomOptionLabelLabel}</Label>
                                    <Input
                                      value={option.label}
                                      onChange={(e: any) => updateRoomOption(link.key, option.key, { label: e.target.value })}
                                      placeholder={t.packages.editor.roomOptionLabelPlaceholder}
                                    />
                                  </div>
                                  <div className="lg:col-span-2">
                                    <Label>{t.packages.editor.netPriceLabel}</Label>
                                    <Input
                                      type="number"
                                      value={option.net_price}
                                      onChange={(e: any) => updateRoomOption(link.key, option.key, { net_price: Number(e.target.value) || 0 })}
                                    />
                                  </div>
                                  <div className="lg:col-span-2">
                                    <Label>{t.packages.editor.sellPriceLabel}</Label>
                                    <Input
                                      type="number"
                                      value={option.sell_price}
                                      onChange={(e: any) => updateRoomOption(link.key, option.key, { sell_price: Number(e.target.value) || 0 })}
                                    />
                                  </div>
                                  <div className="lg:col-span-2">
                                    <Label>{t.packages.editor.availableLabel}</Label>
                                    <Input
                                      type="number"
                                      value={option.available}
                                      onChange={(e: any) => updateRoomOption(link.key, option.key, { available: Number(e.target.value) || 0 })}
                                    />
                                  </div>
                                  <div className="lg:col-span-1 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => removeRoomOption(link.key, option.key)}
                                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                                      aria-label={t.packages.editor.removeRoomOption}
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
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h4 className="text-base font-semibold text-gray-900 dark:text-white">{t.packages.editor.variantsTitle}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.packages.editor.variantsBoundaryHelp}</p>
            </div>
            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
            >
              <PlusIcon className="size-4" /> {t.packages.editor.addVariant}
            </button>
          </div>

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
                      options={(Object.keys(tierLabels) as PackageVariantTier[]).map((k) => ({ value: k, label: tierLabels[k] }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{t.packages.editor.variantAccommodationLabel}</Label>
                    <Select
                      value={v.accommodation}
                      onChange={(val) => updateVariant(i, { accommodation: val as Variant["accommodation"] })}
                      options={(Object.keys(accommodationLabels) as Variant["accommodation"][]).map((k) => ({ value: k, label: accommodationLabels[k] }))}
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

      <Modal
        isOpen={createHotelOpen}
        onClose={() => {
          if (creatingHotel) return;
          setCreateHotelOpen(false);
          resetNewHotelForm();
        }}
        title={t.packages.editor.createHotelTitle}
        className="m-4 max-w-2xl"
      >
        <div className="grid max-h-[75vh] gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <div>
            <Label>{t.packages.editor.newHotelNameLabel}</Label>
            <Input value={newHotelName} onChange={(e: any) => setNewHotelName(e.target.value)} placeholder={t.packages.editor.newHotelNamePlaceholder} />
          </div>
          <div>
            <Label>{t.packages.editor.newHotelDestinationLabel}</Label>
            <Input value={newHotelDestination} onChange={(e: any) => setNewHotelDestination(e.target.value)} placeholder={t.packages.editor.newHotelDestinationPlaceholder} />
          </div>
          <div>
            <Label>{t.packages.editor.newHotelStarsLabel}</Label>
            <Select
              value={newHotelStars}
              onChange={setNewHotelStars}
              options={[
                { value: "", label: t.packages.editor.newHotelNoStars },
                { value: "1", label: "★ 1" },
                { value: "2", label: "★★ 2" },
                { value: "3", label: "★★★ 3" },
                { value: "4", label: "★★★★ 4" },
                { value: "5", label: "★★★★★ 5" },
              ]}
            />
          </div>
          <div>
            <Label>{t.packages.editor.newHotelTotalRoomsLabel}</Label>
            <Input
              type="number"
              value={newHotelTotalRooms}
              onChange={(e: any) => setNewHotelTotalRooms(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="10"
            />
          </div>
          <div>
            <Label>{t.packages.editor.newHotelAddressLabel}</Label>
            <Input value={newHotelAddress} onChange={(e: any) => setNewHotelAddress(e.target.value)} />
          </div>
          <div>
            <Label>{t.packages.editor.newHotelContactLabel}</Label>
            <Input value={newHotelContact} onChange={(e: any) => setNewHotelContact(e.target.value)} />
          </div>
          <div>
            <Label>{t.packages.editor.newHotelEmailLabel}</Label>
            <Input type="email" value={newHotelEmail} onChange={(e: any) => setNewHotelEmail(e.target.value)} />
          </div>
          <div>
            <Label>{t.packages.editor.newHotelWebsiteLabel}</Label>
            <Input type="url" value={newHotelWebsite} onChange={(e: any) => setNewHotelWebsite(e.target.value)} placeholder="https://example.com" />
          </div>
          <div className="sm:col-span-2">
            <Label>{t.packages.editor.newHotelAmenitiesLabel}</Label>
            <Input value={newHotelAmenities} onChange={(e: any) => setNewHotelAmenities(e.target.value)} placeholder={t.packages.editor.newHotelAmenitiesPlaceholder} />
          </div>
          <div className="sm:col-span-2">
            <Label>{t.packages.editor.newHotelDescriptionLabel}</Label>
            <textarea
              value={newHotelDescription}
              onChange={(e) => setNewHotelDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 sm:col-span-2 dark:border-gray-800">
            <Button
              variant="outline"
              onClick={() => {
                setCreateHotelOpen(false);
                resetNewHotelForm();
              }}
              disabled={creatingHotel}
            >
              {t.common.cancel}
            </Button>
            <Button onClick={() => void handleCreateHotelInline()} disabled={creatingHotel}>
              {creatingHotel ? t.common.saving : t.packages.editor.createHotelAction}
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
