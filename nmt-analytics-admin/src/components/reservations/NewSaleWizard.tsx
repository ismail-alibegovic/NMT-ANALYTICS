import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { useToast } from "../../context/ToastContext";
import { getPackages, Package } from "../../api/packages";
import { getDepartures, getDepartureAccommodationOptions, Departure, DepartureCapabilities, type DepartureAccommodationOption } from "../../api/departures";
import { getCustomers, Customer } from "../../api/customers";
import { createReservation, type CreateReservationPassengerInput } from "../../api/reservations";
import { useT } from "../../lib/i18n/context";
import type { en } from "../../lib/i18n/en";
import { formatCurrency } from "../../utils/business";
import { getPackageServices, type PackageService } from "../../api/operations";
import type { TravelerRequirements } from "../../api/packages";

type WizardCopy = typeof en.newSaleWizard;
type ValidationNotice = { key: Extract<keyof WizardCopy, `error${string}`>; params?: Record<string, string | number> };
function fill(template: string, params: Record<string, string | number> = {}) {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, key: string) => String(params[key] ?? token));
}

type Step = "trip" | "travelers" | "accommodation" | "addons" | "payment" | "review";

function getSteps(hasAccommodation: boolean, hasOptionalAddons: boolean, w: WizardCopy): { key: Step; label: string }[] {
  const steps: { key: Step; label: string }[] = [
    { key: "trip", label: w.trip },
    { key: "travelers", label: w.travelersStep },
  ];
  if (hasAccommodation) {
    steps.push({ key: "accommodation", label: w.accommodation });
  }
  if (hasOptionalAddons) {
    steps.push({ key: "addons", label: w.addons });
  }
  steps.push({ key: "payment", label: w.paymentStep });
  steps.push({ key: "review", label: w.reviewStep });
  return steps;
}

type Variant = { id: string; name: string; priceModifier?: number; accommodation?: string };

interface PassengerEntry {
  full_name: string;
  id_document_type?: "passport" | "id_card" | "none";
  id_document_number?: string;
  id_document_expiry?: string;
  nationality?: string;
  date_of_birth?: string;
}

type PaymentPlan = "full" | "deposit" | "installments";

interface AccommodationLine {
  hotelAllocationId: string;
  roomCount: number;
  guestsExpected: number;
  notes: string;
  passengerIndexes: number[];
}

interface SelectedAddon {
  serviceId: string;
  quantity: number;
}

type ResolvedTravelerRequirements = Required<TravelerRequirements>;

const noTravelerDocumentsRequired: ResolvedTravelerRequirements = {
  travelScope: "unspecified",
  documentType: "none",
  allowFillLater: true,
  requireExpiry: false,
  requireNationality: false,
  requireDateOfBirth: false,
};

function buildAutomaticAccommodationLine(
  optionId: string,
  partySize: number,
  capacityPerRoom: number,
  passengerIndexes: number[] = Array.from({ length: partySize }, (_, index) => index),
): AccommodationLine {
  const safeCapacityPerRoom = Math.max(1, capacityPerRoom || 1);
  const normalizedPassengerIndexes = [...passengerIndexes].sort((a, b) => a - b);
  const guestsExpected = normalizedPassengerIndexes.length;
  return {
    hotelAllocationId: optionId,
    roomCount: Math.max(1, Math.ceil(guestsExpected / safeCapacityPerRoom)),
    guestsExpected,
    notes: "",
    passengerIndexes: normalizedPassengerIndexes,
  };
}

function getAccommodationInventoryMessage(
  w: WizardCopy,
  roomLabel: string | undefined,
  neededRooms: number,
  availableRooms: number,
) {
  return fill(w.errorInventory, { room: roomLabel || w.selectedRooms, needed: neededRooms, available: availableRooms });
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialPackageId?: string;
  initialDepartureId?: string;
}

export default function NewSaleWizard({ isOpen, onClose, onCreated, initialPackageId, initialDepartureId }: Props) {
  const { t, lang } = useT();
  const w: WizardCopy = t.newSaleWizard;
  const locale = lang === 'bs' ? 'bs-BA' : 'en-GB';
  const money = (amount: number, currency = packageCurrency) => formatCurrency(amount, currency, locale);
  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    if (!Number.isFinite(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0'), month = String(date.getMonth() + 1).padStart(2, '0');
    return lang === 'bs' ? `${day}.${month}.${date.getFullYear()}.` : `${day}/${month}/${date.getFullYear()}`;
  };
  const roomTypeLabel = (type?: string) => t.packages.editor.roomTypeLabels[type || ''] || w.room;
  const countForm = (count: number): 'One' | 'Few' | 'Many' => {
    if (lang !== 'bs') return count === 1 ? 'One' : 'Many';
    const last = count % 10, lastTwo = count % 100;
    if (last === 1 && lastTwo !== 11) return 'One';
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return 'Few';
    return 'Many';
  };
  const { success, error: showError } = useToast();

  const [step, setStep] = useState<Step>("trip");
  const [packages, setPackages] = useState<Package[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationNotice, setValidationNotice] = useState<ValidationNotice | null>(null);
  const validationMessage = validationNotice ? fill(w[validationNotice.key], {
    ...validationNotice.params,
    room: validationNotice.params?.room || (validationNotice.params?.roomType ? roomTypeLabel(String(validationNotice.params.roomType)) : w.selectedRooms),
  }) : '';
  const [recoveryReservationId, setRecoveryReservationId] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<'processing' | 'retry' | 'manual' | null>(null);
  const saleIdempotencyKeyRef = useRef<string>("");

  // Selections
  const [packageId, setPackageId] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [accommodationOptions, setAccommodationOptions] = useState<DepartureAccommodationOption[]>([]);
  const [accommodationResolved, setAccommodationResolved] = useState<"idle" | "loading" | "resolved" | "error">("idle");
  const [accommodationLines, setAccommodationLines] = useState<AccommodationLine[]>([]);
  const [packageServices, setPackageServices] = useState<PackageService[]>([]);
  const [packageServicesResolved, setPackageServicesResolved] = useState<"idle" | "loading" | "resolved" | "error">("idle");
  const packageServicesRequestId = useRef(0);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, SelectedAddon>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");

  // Passenger entries
  const [passengers, setPassengers] = useState<PassengerEntry[]>([]);
  const [createGroup, setCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");

  // Payment plan
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("full");
  const [depositPct, setDepositPct] = useState(50);
  const [installmentCount, setInstallmentCount] = useState(3);

  useEffect(() => {
    if (isOpen && !saleIdempotencyKeyRef.current) {
      saleIdempotencyKeyRef.current = crypto.randomUUID();
    }
    if (!isOpen) {
      saleIdempotencyKeyRef.current = "";
      setRecoveryReservationId(null);
      setRecoveryMode(null);
    }
  }, [isOpen]);

  const selectedPackage = packages.find((p) => p.id === packageId);
  const selectedDeparture = departures.find((d) => d.id === departureId);
  const capabilities: DepartureCapabilities | undefined = (selectedDeparture as any)?.capabilities;
  const travelerRequirements: ResolvedTravelerRequirements =
    selectedDeparture?.resolvedTravelerRequirements ||
    capabilities?.travelerRequirements ||
    noTravelerDocumentsRequired;
  const travelDocumentsRelevant = travelerRequirements.documentType !== "none";
  const documentNumberLabel = travelerRequirements.documentType === "id_card" ? w.idNumber : w.passportNumber;
  const documentNumberPlaceholder = travelerRequirements.documentType === "id_card" ? w.idNumber : w.passportNumber;

  const variants: Variant[] = Array.isArray(selectedPackage?.variants)
    ? (selectedPackage!.variants as unknown as Variant[])
    : [];
  const hasVariants = variants.length > 0;

  const selectedTransportType = (selectedDeparture as any)?.transport_type ?? selectedDeparture?.capabilities?.transportType ?? "none";
  const packageCurrency = selectedPackage?.currency || "BAM";

  const activeDepartures = departures.filter((d) => d.status === "active" && d.booked < d.capacity);

  const availableTransportTypes = Array.from(new Set(activeDepartures.map((d) => (d as any).transport_type ?? "none")));

  const hasAccommodation = accommodationResolved === "resolved" && accommodationOptions.length > 0;
  const optionalAddons = packageServices.filter((service) => service.isOptional === true);
  const selectedAddonItems = Object.values(selectedAddons)
    .map((selection) => {
      const service = optionalAddons.find((item) => item.id === selection.serviceId);
      return service ? { service, quantity: selection.quantity } : null;
    })
    .filter((item): item is { service: PackageService; quantity: number } => Boolean(item));
  const addOnsTotal = selectedAddonItems.reduce((sum, item) => sum + (item.service.unitPrice || 0) * item.quantity, 0);
  const hasOptionalAddons = packageServicesResolved === "resolved" && optionalAddons.length > 0;
  const steps = getSteps(hasAccommodation, hasOptionalAddons, w);
  const preAddonsStep: Step = hasAccommodation ? "accommodation" : "travelers";
  const shouldGatePackageServicesResolution = Boolean(packageId) && step === preAddonsStep;

  const accommodationLinesWithOption = accommodationLines.map((line) => ({
    line,
    option: accommodationOptions.find((item) => item.id === line.hotelAllocationId),
  }));
  const isStandardSingleAccommodationSelection =
    accommodationLines.length === 1 &&
    !!accommodationLines[0]?.hotelAllocationId;
  const accommodationTotal = accommodationLinesWithOption.reduce((sum, item) => sum + ((item.option?.unitSellPrice || 0) * item.line.roomCount), 0);
  const displayedTotal = (Number(totalAmount || 0) + accommodationTotal + addOnsTotal) || 0;
  const accommodationCoverage = accommodationLines.reduce((sum, line) => sum + line.guestsExpected, 0);
  const mappedPassengerIndexes = accommodationLines.flatMap((line) => line.passengerIndexes);
  const uniqueMappedPassengerIndexes = new Set(mappedPassengerIndexes);
  const accommodationPassengerMappingValid = mappedPassengerIndexes.length === uniqueMappedPassengerIndexes.size && uniqueMappedPassengerIndexes.size === partySize;

  function getAccommodationLineCapacity(line: AccommodationLine) {
    const option = accommodationOptions.find((item) => item.id === line.hotelAllocationId);
    return line.roomCount * Math.max(1, option?.capacityPerRoom || 1);
  }

  function getAccommodationLineValidation(line: AccommodationLine) {
    const option = accommodationOptions.find((item) => item.id === line.hotelAllocationId);
    const assignedCount = line.passengerIndexes.length;
    const lineCapacity = getAccommodationLineCapacity(line);
    const availableRooms = option?.availableRooms || 0;

    return {
      option,
      assignedCount,
      lineCapacity,
      hasOption: Boolean(option),
      roomCountValid: line.roomCount > 0 && line.roomCount <= availableRooms,
      guestsExpectedValid: line.guestsExpected > 0 && line.guestsExpected <= lineCapacity,
      passengerCountValid: assignedCount === line.guestsExpected,
    };
  }

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

  useEffect(() => {
    if (!isStandardSingleAccommodationSelection) return;

    setAccommodationLines((current) => {
      if (current.length !== 1 || !current[0]?.hotelAllocationId) return current;
      const option = accommodationOptions.find((item) => item.id === current[0].hotelAllocationId);
      if (!option) return current;

      const nextLine = buildAutomaticAccommodationLine(current[0].hotelAllocationId, partySize, option.capacityPerRoom || 1);
      const sameRoomCount = current[0].roomCount === nextLine.roomCount;
      const sameGuestsExpected = current[0].guestsExpected === nextLine.guestsExpected;
      const samePassengerIndexes =
        current[0].passengerIndexes.length === nextLine.passengerIndexes.length &&
        current[0].passengerIndexes.every((value, index) => value === nextLine.passengerIndexes[index]);

      if (sameRoomCount && sameGuestsExpected && samePassengerIndexes) return current;

      return [{ ...nextLine, notes: current[0].notes }];
    });
  }, [accommodationOptions, isStandardSingleAccommodationSelection, partySize]);

  useEffect(() => {
    setPassengers((prev) => prev.map((passenger) => {
      if (!travelDocumentsRelevant) {
        return { full_name: passenger.full_name };
      }
      const requiredDocumentType = travelerRequirements.documentType;
      if (passenger.id_document_type && passenger.id_document_type !== requiredDocumentType) {
        return {
          full_name: passenger.full_name,
          id_document_type: requiredDocumentType,
          id_document_number: "",
          id_document_expiry: "",
          nationality: "",
          date_of_birth: "",
        };
      }
      return {
        ...passenger,
        id_document_type: requiredDocumentType,
        ...(travelerRequirements.requireExpiry ? {} : { id_document_expiry: "" }),
        ...(travelerRequirements.requireNationality ? {} : { nationality: "" }),
        ...(travelerRequirements.requireDateOfBirth ? {} : { date_of_birth: "" }),
      };
    }));
  }, [
    travelDocumentsRelevant,
    travelerRequirements.documentType,
    travelerRequirements.requireExpiry,
    travelerRequirements.requireNationality,
    travelerRequirements.requireDateOfBirth,
  ]);

  function retryAccommodation() {
    if (!departureId) return;
    setAccommodationResolved("loading");
    getDepartureAccommodationOptions(departureId)
      .then((result) => {
        const options = result.items || [];
        setAccommodationOptions(options);
        setAccommodationLines((current) => current.filter((line) => options.some((item) => item.id === line.hotelAllocationId)));
        setAccommodationResolved("resolved");
      })
      .catch(() => {
        setAccommodationOptions([]);
        setAccommodationLines([]);
        setAccommodationResolved("error");
      });
  }

  function reset() {
    setStep("trip");
    setAccommodationResolved("idle");
    setPackageServicesResolved("idle");
    setPackageId(""); setDepartureId(""); setVariantId("");
    setAccommodationOptions([]); setAccommodationLines([]);
    setPackageServices([]); setSelectedAddons({});
    setCustomerSearch(""); setSelectedCustomerId(null);
    setCustomerName(""); setCustomerPhone(""); setCustomerEmail("");
    setPartySize(1); setTotalAmount(""); setNotes("");
    setPassengers([{ full_name: "" }]); setCreateGroup(false); setGroupName("");
    setPaymentPlan("full"); setDepositPct(50); setInstallmentCount(3);
    setValidationNotice(null);
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
      showError(w.errorPackages);
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

  const loadPackageServices = useCallback((nextPackageId: string) => {
    const requestId = packageServicesRequestId.current + 1;
    packageServicesRequestId.current = requestId;
    setPackageServices([]);
    setSelectedAddons({});
    setPackageServicesResolved("loading");

    getPackageServices(nextPackageId)
      .then((services) => {
        if (packageServicesRequestId.current !== requestId) return;
        setPackageServices(services);
        setPackageServicesResolved("resolved");
      })
      .catch(() => {
        if (packageServicesRequestId.current !== requestId) return;
        setPackageServices([]);
        setSelectedAddons({});
        setPackageServicesResolved("error");
      });
  }, []);

  // When package is selected, load its departures
  useEffect(() => {
    if (!packageId) {
      packageServicesRequestId.current += 1;
      setDepartures([]); setDepartureId("");
      setPackageServices([]);
      setPackageServicesResolved("idle");
      setSelectedAddons({});
      return;
    }
    setDepartureId("");
    loadPackageServices(packageId);
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
  }, [packageId, initialDepartureId, loadPackageServices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!departureId) {
      setAccommodationOptions([]);
      setAccommodationResolved("idle");
      return;
    }
    setAccommodationResolved("loading");
    getDepartureAccommodationOptions(departureId)
      .then((result) => {
        const options = result.items || [];
        setAccommodationOptions(options);
        setAccommodationLines((current) => current.filter((line) => options.some((item) => item.id === line.hotelAllocationId)));
        setAccommodationResolved("resolved");
      })
      .catch(() => {
        setAccommodationOptions([]);
        setAccommodationLines([]);
        setAccommodationResolved("error");
      });
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
      const alreadySelected = current.some((line) => line.hotelAllocationId === optionId);
      if (alreadySelected) return current;

      const option = accommodationOptions.find((item) => item.id === optionId);
      const automaticLine = buildAutomaticAccommodationLine(optionId, partySize, option?.capacityPerRoom || 1);

      const emptyIndex = current.findIndex((line) => !line.hotelAllocationId);
      if (emptyIndex >= 0) {
        const assignedPassengerIndexes = new Set(
          current.flatMap((line, index) => (index === emptyIndex ? [] : line.passengerIndexes)),
        );
        const unassignedPassengerIndexes = Array.from({ length: partySize }, (_, index) => index)
          .filter((index) => !assignedPassengerIndexes.has(index));
        return current.map((line, index) => index === emptyIndex
          ? {
            ...buildAutomaticAccommodationLine(
              optionId,
              partySize,
              option?.capacityPerRoom || 1,
              unassignedPassengerIndexes,
            ),
            notes: line.notes,
          }
          : line);
      }

      return [...current, automaticLine];
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
      const option = accommodationOptions.find((item) => item.id === line.hotelAllocationId);
      const lineCapacity = line.roomCount * Math.max(1, option?.capacityPerRoom || 1);
      const maxAssignable = Math.min(line.guestsExpected, lineCapacity);
      if (!exists && line.passengerIndexes.length >= maxAssignable) {
        return line;
      }
      return {
        ...line,
        passengerIndexes: exists
          ? line.passengerIndexes.filter((value) => value !== passengerIndex)
          : [...line.passengerIndexes, passengerIndex].sort((a, b) => a - b),
      };
    }));
  }

  function retryPackageServices() {
    if (!packageId) return;
    loadPackageServices(packageId);
  }

  function toggleAddon(serviceId: string) {
    if (!optionalAddons.some((service) => service.id === serviceId)) return;
    setSelectedAddons((current) => {
      if (current[serviceId]) {
        const next = { ...current };
        delete next[serviceId];
        return next;
      }
      return { ...current, [serviceId]: { serviceId, quantity: 1 } };
    });
  }

  function updateAddonQuantity(serviceId: string, quantity: number) {
    if (!selectedAddons[serviceId]) return;
    setSelectedAddons((current) => ({
      ...current,
      [serviceId]: { ...current[serviceId], quantity: Math.max(1, quantity || 1) },
    }));
  }

  function getTravelerDocumentStatus(passenger: PassengerEntry) {
    if (!travelDocumentsRelevant) return "not_required";
    const hasRequiredNumber = Boolean(passenger.id_document_number?.trim());
    const hasRequiredExpiry = !travelerRequirements.requireExpiry || Boolean(passenger.id_document_expiry);
    const hasRequiredNationality = !travelerRequirements.requireNationality || Boolean(passenger.nationality?.trim());
    const hasRequiredDateOfBirth = !travelerRequirements.requireDateOfBirth || Boolean(passenger.date_of_birth);
    return hasRequiredNumber && hasRequiredExpiry && hasRequiredNationality && hasRequiredDateOfBirth ? "ready" : "missing";
  }

  function getTravelerReadinessSummary() {
    if (!travelDocumentsRelevant) return "";
    const namedPassengers = passengers.filter((passenger) => passenger.full_name.trim());
    const ready = namedPassengers.filter((passenger) => getTravelerDocumentStatus(passenger) === "ready").length;
    const missing = Math.max(0, partySize - ready);
    const readyLabel = fill(w[`ready${countForm(ready)}`], { count: ready });
    if (missing === 0) return readyLabel;
    return fill(w.readyWithMissing, { ready: readyLabel, missing });
  }

  const stepIndex = steps.findIndex((s) => s.key === step);

  function getValidationMessage(): ValidationNotice | null {
    if (step === "trip") {
      if (!packageId) return { key: "errorPackageRequired" };
      if (!departureId) return { key: "errorDepartureRequired" };
      return null;
    }
    if (step === "travelers") {
      if (!customerName.trim()) return { key: "errorCustomerName" };
      if (!customerPhone.trim()) return { key: "errorPhone" };
      if (travelDocumentsRelevant) {
        const missingNameIndex = passengers.findIndex((passenger) => !passenger.full_name.trim());
        if (missingNameIndex >= 0) return { key: "errorPassengerName", params: { index: missingNameIndex + 1 } };
        if (!travelerRequirements.allowFillLater) {
          const missingDocumentIndex = passengers.findIndex((passenger) => getTravelerDocumentStatus(passenger) !== "ready");
          if (missingDocumentIndex >= 0) return { key: "errorDocument", params: { index: missingDocumentIndex + 1 } };
        }
      }
      if (accommodationResolved === "loading") return { key: "errorAccommodationLoading" };
      if (accommodationResolved === "error") return { key: "errorAccommodation" };
      if (shouldGatePackageServicesResolution && packageServicesResolved === "loading") return { key: "errorServicesLoading" };
      if (shouldGatePackageServicesResolution && packageServicesResolved === "error") return { key: "errorServices" };
      return null;
    }
    if (step === "accommodation") {
      if (accommodationLines.length > 0 && passengers.some((passenger) => !passenger.full_name.trim())) {
        return { key: "errorAllPassengerNames" };
      }
      if (shouldGatePackageServicesResolution && packageServicesResolved === "loading") return { key: "errorServicesLoading" };
      if (shouldGatePackageServicesResolution && packageServicesResolved === "error") return { key: "errorServices" };
      if (accommodationLines.length === 0) return null;
      const inventoryBlockedLine = accommodationLines.find((line) => {
        const validation = getAccommodationLineValidation(line);
        return validation.hasOption && !validation.roomCountValid;
      });
      if (inventoryBlockedLine) {
        const inventoryValidation = getAccommodationLineValidation(inventoryBlockedLine);
        return { key: "errorInventory", params: {
          room: inventoryValidation.option?.roomLabel || '', roomType: inventoryValidation.option?.roomType || '',
          needed: inventoryBlockedLine.roomCount, available: inventoryValidation.option?.availableRooms || 0,
        } };
      }
      if (accommodationCoverage !== partySize) return { key: "errorCoverage" };
      if (!accommodationPassengerMappingValid) return { key: "errorAssignment" };
      return null;
    }
    return null;
  }

  const canNext = (() => {
    if (step === "trip") return !!packageId && !!departureId;
    if (step === "travelers") {
      const travelerDocumentsValid =
        !travelDocumentsRelevant ||
        (passengers.every((passenger) => passenger.full_name.trim()) &&
          (travelerRequirements.allowFillLater || passengers.every((passenger) => getTravelerDocumentStatus(passenger) === "ready")));
      return !!customerName.trim() &&
        !!customerPhone.trim() &&
        travelerDocumentsValid &&
        accommodationResolved !== "loading" &&
        accommodationResolved !== "error" &&
        (!shouldGatePackageServicesResolution || packageServicesResolved === "resolved");
    }
    if (step === "accommodation") {
      if (shouldGatePackageServicesResolution && packageServicesResolved !== "resolved") return false;
      if (accommodationOptions.length === 0) return true;
      if (accommodationLines.length === 0) return true;
      if (passengers.some((passenger) => !passenger.full_name.trim())) return false;
      return accommodationCoverage === partySize &&
        accommodationPassengerMappingValid &&
        accommodationLines.every((line) => {
          const validation = getAccommodationLineValidation(line);
          return validation.hasOption &&
            validation.roomCountValid &&
            validation.guestsExpectedValid &&
            validation.passengerCountValid;
        });
    }
    return true;
  })();

  function next() {
    if (!canNext) return;
    setValidationNotice(null);
    setStep(steps[Math.min(stepIndex + 1, steps.length - 1)].key);
  }
  function back() {
    setValidationNotice(null);
    setStep(steps[Math.max(stepIndex - 1, 0)].key);
  }

  function handleNextAttempt() {
    const msg = getValidationMessage();
    if (msg) {
      setValidationNotice(msg);
    } else {
      setValidationNotice(null);
      next();
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const filledPassengers: CreateReservationPassengerInput[] = passengers
        .filter((p) => p.full_name.trim())
        .map((p) => {
          const base = { full_name: p.full_name.trim() };
          if (!travelDocumentsRelevant) return base;
          return {
            ...base,
            id_document_type: travelerRequirements.documentType,
            id_document_number: p.id_document_number?.trim() || undefined,
            id_document_expiry: travelerRequirements.requireExpiry ? p.id_document_expiry || undefined : undefined,
            nationality: travelerRequirements.requireNationality ? p.nationality?.trim() || undefined : undefined,
            date_of_birth: travelerRequirements.requireDateOfBirth ? p.date_of_birth || undefined : undefined,
          };
        });
      const baseTotal = totalAmount ? Number(totalAmount) : 0;
      const total = displayedTotal;
      const depositAmount = paymentPlan === "deposit" ? Math.round(total * (depositPct / 100)) : 0;
      const selectedAddonsPayload = selectedAddonItems.map(({ service, quantity }) => ({
        serviceId: service.id,
        quantity,
      }));
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
        // Preserve the existing stored snapshot contract; UI formatting is separate.
        departure_label: selectedDeparture
          ? `${new Date(selectedDeparture.depart_at).toLocaleDateString("bs-BA")} → ${new Date(selectedDeparture.return_at).toLocaleDateString("bs-BA")}`
          : undefined,
        variant_id: variantId || undefined,
        variant_name: variants.find((v) => v.id === variantId)?.name,
        transport_type: selectedTransportType,
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
        addons_total_at_booking: addOnsTotal,
        total_at_booking: total,
        passengers_snapshot: filledPassengers.map((p) => ({
          full_name: p.full_name,
          id_document_type: p.id_document_type,
          id_document_number: p.id_document_number,
          id_document_expiry: p.id_document_expiry,
          nationality: p.nationality,
          date_of_birth: p.date_of_birth,
        })),
      };

      const createdReservation = await createReservation({
        customerName,
        customerPhone,
        customerEmail: customerEmail || undefined,
        partySize,
        reservationAt: new Date().toISOString(),
        departureId: departureId || undefined,
        totalAmount: total || undefined,
        source: "agent",
        customerId: selectedCustomerId || undefined,
        upsert: true,
        status: "pending",
        notes: notes || undefined,
        hotelName: accommodationLinesWithOption[0]?.option?.hotel?.name || selectedPackage?.destination || undefined,
        roomType: accommodationLinesWithOption[0]?.option?.roomLabel || undefined,
        accommodationRequirements: normalizedAccommodationLines,
        selectedAddons: selectedAddonsPayload.length > 0 ? selectedAddonsPayload : undefined,
        options: bookingSnapshot,
        passengers: filledPassengers.length > 0 ? filledPassengers : undefined,
        create_passenger_group: createGroup && filledPassengers.length > 1,
        group_name: groupName || undefined,
        idempotencyKey: saleIdempotencyKeyRef.current,
        installmentCount: paymentPlan === "installments" ? installmentCount : undefined,
      });
      if (createdReservation.creationState === 'in_progress') {
        setRecoveryReservationId(createdReservation.id);
        setRecoveryMode('processing');
        showError(t.saleRecovery.processing);
        return;
      }
      if (createdReservation.recoveryRequired || createdReservation.creationState === "recovery_required") {
        setRecoveryReservationId(createdReservation.id);
        setRecoveryMode(createdReservation.retryable ? 'retry' : 'manual');
        showError(createdReservation.retryable ? t.saleRecovery.retry : t.saleRecovery.manual);
        return;
      }
      success(w.created);
      onCreated?.();
      onClose();
    } catch (e: any) {
      const reservationId = e?.details?.reservationId;
      if (reservationId) {
        setRecoveryReservationId(reservationId);
        const retryable = ['installments', 'completion'].includes(e?.details?.stage) && e?.code !== 'SALE_MANUAL_RECOVERY_REQUIRED';
        setRecoveryMode(retryable ? 'retry' : 'manual');
        showError(retryable ? t.saleRecovery.retry : t.saleRecovery.manual);
      } else if (e?.code === "IDEMPOTENCY_KEY_REQUIRED") {
        showError(w.errorStartSale);
      } else if (e?.code === "DEPARTURE_CAPACITY_EXCEEDED") {
        showError(w.errorCapacity);
      } else {
        showError(w.errorCreate);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl" title={w.title}>
      {/* Stepper */}
      <div className="px-6 pt-5">
        <ol className="flex items-center gap-2 text-xs flex-wrap">
          {steps.map((s, i) => {
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
                {i < steps.length - 1 && <span className="text-gray-300 dark:text-gray-700">→</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="p-6 pt-4">
        {loading && <p className="text-sm text-gray-500">{w.loading}</p>}

        {/* Step: Trip — Package + Departure */}
        {step === "trip" && (
          <div className="space-y-4">
            <div>
              <Label>{w.packageLabel}</Label>
              <p className="text-xs text-gray-500 -mt-1">{w.packageHint}</p>
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
                        {money(pkg.price ?? pkg.base_price ?? 0, pkg.currency ?? "BAM")}
                      </div>
                    </button>
                  );
                })}
                {packages.length === 0 && !loading && (
                  <p className="text-sm text-gray-500 col-span-2">{w.noPackages}</p>
                )}
              </div>
            </div>

            {packageId && (
              <div>
                <Label>{w.departureLabel}</Label>
                {activeDepartures.length === 1 && departureId === activeDepartures[0].id && (
                  <p className="text-xs text-green-600 -mt-0.5 mb-1">{w.autoDeparture}</p>
                )}
                {availableTransportTypes.length > 1 && (
                  <div className="flex items-center gap-2 mt-1 mb-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{w.availableTransport}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                      {availableTransportTypes.map((t) => transportBadge(w, t)).join(" · ")}
                    </span>
                  </div>
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
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 dark:text-white">
                            {formatDate(d.depart_at)} → {formatDate(d.return_at)}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              d.transport_type === "flight"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                                : d.transport_type === "bus"
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            }`}>
                              {transportBadge(w, d.transport_type)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-semibold ${
                            d.capacity - d.booked <= 5
                              ? "text-red-600 dark:text-red-400"
                              : d.capacity - d.booked <= 10
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {d.capacity - d.booked} {w.places}
                          </div>
                          <div className="text-xs text-gray-500">
                            {d.booked}/{d.capacity} {w.booked}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {activeDepartures.length === 0 && (
                    <p className="text-sm text-gray-500">{w.noDepartures}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Travelers — Client + Passengers + Options */}
        {step === "travelers" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {accommodationResolved === "loading" && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500">
                {w.errorAccommodationLoading}
              </div>
            )}
            {accommodationResolved === "error" && (
              <div className="rounded-xl border border-error-200 bg-error-50 dark:bg-error-500/10 dark:border-error-500/20 p-4 space-y-2">
                <p className="text-sm text-error-600 dark:text-error-400">{w.errorAccommodation}</p>
                <button type="button" onClick={retryAccommodation} className="text-sm font-medium text-brand-600 hover:text-brand-500">
                  {w.retryShort}
                </button>
              </div>
            )}
            {shouldGatePackageServicesResolution && packageServicesResolved === "loading" && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500">
                {w.errorServicesLoading}
              </div>
            )}
            {shouldGatePackageServicesResolution && packageServicesResolved === "error" && (
              <div className="rounded-xl border border-error-200 bg-error-50 dark:bg-error-500/10 dark:border-error-500/20 p-4 space-y-2">
                <p className="text-sm text-error-600 dark:text-error-400">{w.errorServices}</p>
                <button type="button" onClick={retryPackageServices} className="text-sm font-medium text-brand-600 hover:text-brand-500">
                  {w.retry}
                </button>
              </div>
            )}
            {/* Client section */}
            <div className="space-y-3">
              <div>
                <Label>{w.customerSearch}</Label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={w.customerSearchPlaceholder}
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
                  <p className="text-xs text-green-600 mt-1">{w.existingCustomer} {customerName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>{w.customerName}</Label>
                  <Input
                    type="text"
                    placeholder={w.customerNamePlaceholder}
                    value={customerName}
                    onChange={(e) => { setCustomerName(e.target.value); setSelectedCustomerId(null); }}
                  />
                </div>
                <div>
                  <Label>{w.phoneRequired}</Label>
                  <Input
                    type="tel"
                    placeholder="+387 61 234 567"
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(e.target.value); setSelectedCustomerId(null); }}
                  />
                </div>
              </div>
              <div>
                <Label>{w.email}</Label>
                <Input type="email" placeholder={w.customerEmailPlaceholder} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
            </div>

            <hr className="border-gray-100 dark:border-gray-800" />

            {/* Options (variants) */}
            {hasVariants && (
              <div className="space-y-3">
                <div>
                  <Label>{w.packageOption}</Label>
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
                            <div className="text-xs text-brand-600 mt-0.5">{v.priceModifier > 0 ? '+' : ''}{money(v.priceModifier)}</div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <hr className="border-gray-100 dark:border-gray-800" />

            {/* Passenger entries */}
            <div>
              <div className="flex items-center justify-between">
                <Label>{w.travelersOpen}{partySize})</Label>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{w.travelerCount}</span>
                  <Input type="number" min="1" max="50" value={String(partySize)} onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 !py-1.5 !text-xs" />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-1 mb-2">{w.bookingHolderHint}</p>
              {travelDocumentsRelevant && travelerRequirements.allowFillLater && (
                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                  {w.fillDocumentsLaterHint}
                </div>
              )}
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {passengers.map((p, i) => (
                  <div key={i} className="rounded-lg border border-gray-100 p-2 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-400 w-5">{i + 1}.</span>
                      <Input
                        type="text"
                        placeholder={fill(w.passengerPlaceholder, { index: i + 1 })}
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
                      {travelDocumentsRelevant && travelerRequirements.allowFillLater && getTravelerDocumentStatus(p) === "missing" && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {w.fillLater}
                        </span>
                      )}
                    </div>
                    {travelDocumentsRelevant && (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input
                          type="text"
                          aria-label={fill(w.documentForTraveler, { document: documentNumberLabel, index: i + 1 })}
                          placeholder={documentNumberPlaceholder}
                          value={p.id_document_number || ""}
                          onChange={(e) => {
                            setPassengers((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], id_document_number: e.target.value, id_document_type: travelerRequirements.documentType };
                              return next;
                            });
                          }}
                          className="!py-1.5 !text-sm"
                        />
                        {travelerRequirements.requireExpiry && (
                          <Input
                            type="date"
                            aria-label={fill(w.expiryForTraveler, { index: i + 1 })}
                            value={p.id_document_expiry || ""}
                            onChange={(e) => {
                              setPassengers((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], id_document_expiry: e.target.value, id_document_type: travelerRequirements.documentType };
                                return next;
                              });
                            }}
                            className="!py-1.5 !text-sm"
                          />
                        )}
                        {travelerRequirements.requireNationality && (
                          <Input
                            type="text"
                            aria-label={fill(w.nationalityForTraveler, { index: i + 1 })}
                            placeholder={w.nationality}
                            value={p.nationality || ""}
                            onChange={(e) => {
                              setPassengers((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], nationality: e.target.value, id_document_type: travelerRequirements.documentType };
                                return next;
                              });
                            }}
                            className="!py-1.5 !text-sm"
                          />
                        )}
                        {travelerRequirements.requireDateOfBirth && (
                          <Input
                            type="date"
                            aria-label={fill(w.birthForTraveler, { index: i + 1 })}
                            value={p.date_of_birth || ""}
                            onChange={(e) => {
                              setPassengers((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], date_of_birth: e.target.value, id_document_type: travelerRequirements.documentType };
                                return next;
                              });
                            }}
                            className="!py-1.5 !text-sm"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {passengers.length > 1 && (
                <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                  <input type="checkbox" checked={createGroup} onChange={(e) => setCreateGroup(e.target.checked)} className="rounded" />
                  {w.groupTogether}
                </label>
              )}
              {createGroup && (
                <Input
                  type="text"
                  placeholder={w.groupPlaceholder}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="mt-2 !py-1.5 !text-sm"
                />
              )}
            </div>
          </div>
        )}

        {/* Step: Accommodation (conditional) */}
        {step === "accommodation" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{w.accommodation}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {w.accommodationHint}
              </p>
            </div>

            {shouldGatePackageServicesResolution && packageServicesResolved === "loading" && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500">
                {w.errorServicesLoading}
              </div>
            )}

            {shouldGatePackageServicesResolution && packageServicesResolved === "error" && (
              <div className="rounded-xl border border-error-200 bg-error-50 dark:bg-error-500/10 dark:border-error-500/20 p-4 space-y-2">
                <p className="text-sm text-error-600 dark:text-error-400">{w.errorServices}</p>
                <button type="button" onClick={retryPackageServices} className="text-sm font-medium text-brand-600 hover:text-brand-500">
                  {w.retry}
                </button>
              </div>
            )}

            {accommodationResolved === "loading" && <p className="text-sm text-gray-500">{w.loadingAccommodation}</p>}

            {accommodationResolved === "error" && (
              <div className="rounded-xl border border-error-200 bg-error-50 dark:bg-error-500/10 dark:border-error-500/20 p-4 space-y-2">
                <p className="text-sm text-error-600 dark:text-error-400">{w.errorAccommodationShort}</p>
                <button type="button" onClick={retryAccommodation} className="text-sm font-medium text-brand-600 hover:text-brand-500">
                  {w.retry}
                </button>
              </div>
            )}

            {accommodationResolved === "resolved" && accommodationOptions.length === 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500">
                {w.noAccommodation}
              </div>
            )}

            {accommodationResolved === "resolved" && accommodationOptions.length > 0 && (
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
                          <p className="font-semibold text-gray-900 dark:text-white">{option.hotel?.name || w.hotel}</p>
                          <p className="text-sm text-gray-500">{option.roomLabel || roomTypeLabel(option.roomType)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {w.capacity} {option.capacityPerRoom} {w.availablePrefix} {option.availableRooms} {w.pricePrefix} {money(option.unitSellPrice)}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="rounded-full bg-brand-600 px-2 py-1 text-xs font-medium text-white dark:bg-brand-500">
                            {w.selected}
                          </span>
                        )}
                      </div>
                    </button>
                  )})}
                </div>

                {accommodationLines.map((line, index) => {
                  const validation = getAccommodationLineValidation(line);
                  const option = validation.option;
                  const lineCapacity = validation.lineCapacity;
                  const lineTotal = (option?.unitSellPrice || 0) * line.roomCount;
                  const isStandardSingleLine = isStandardSingleAccommodationSelection && index === 0;
                  return (
                    <div key={`line-${index}`} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900 dark:text-white">{w.accommodation} {index + 1}</h4>
                        <button type="button" className="text-xs font-medium text-red-600" onClick={() => removeAccommodationLine(index)}>
                          {w.remove}
                        </button>
                      </div>

                      {option && (
                        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm dark:bg-gray-900">
                          <span className="font-medium text-gray-900 dark:text-white">{option.hotel?.name || w.hotel}</span>
                          <span className="text-gray-500"> · {option.roomLabel || roomTypeLabel(option.roomType)} {w.availableLowerPrefix} {option.availableRooms}</span>
                        </div>
                      )}

                      {isStandardSingleLine ? (
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <Label>{w.travelers}</Label>
                            <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
                              {line.guestsExpected}
                            </div>
                          </div>
                          <div>
                            <Label>{w.roomsRequired}</Label>
                            <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
                              {line.roomCount}
                            </div>
                          </div>
                          <div>
                            <Label>{w.roomCapacity}</Label>
                            <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
                              {option?.capacityPerRoom || 1}
                            </div>
                          </div>
                          <div>
                            <Label>{w.roomsAvailable}</Label>
                            <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
                              {option?.availableRooms || 0}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label>{w.roomCount}</Label>
                            <Input
                              type="number"
                              min="1"
                              max={String(Math.max(1, option?.availableRooms || 1))}
                              value={String(line.roomCount)}
                              onChange={(e) => updateAccommodationLine(index, { roomCount: Math.max(1, parseInt(e.target.value) || 1) })}
                            />
                          </div>
                          <div>
                            <Label>{w.travelers}</Label>
                            <Input
                              type="number"
                              min="1"
                              max={String(partySize)}
                              value={String(line.guestsExpected)}
                              onChange={(e) => updateAccommodationLine(index, { guestsExpected: Math.max(1, parseInt(e.target.value) || 1) })}
                            />
                          </div>
                          <div>
                            <Label>{w.total}</Label>
                            <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
                              {money(lineTotal)}
                            </div>
                          </div>
                        </div>
                      )}

                      {isStandardSingleLine && (
                        <div>
                          <Label>{w.total}</Label>
                          <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-800">
                            {money(lineTotal)}
                          </div>
                        </div>
                      )}

                      {option && (
                        <p className="text-xs text-gray-500">
                          {w.lineCapacity} {lineCapacity} {w.expectedPrefix} {line.guestsExpected} {w.assignedPrefix} {validation.assignedCount}
                        </p>
                      )}
                      {option && !validation.roomCountValid && (
                        <p className="text-sm text-error-600">
                          {getAccommodationInventoryMessage(w, option.roomLabel || roomTypeLabel(option.roomType), line.roomCount, option.availableRooms || 0)}
                        </p>
                      )}
                      {option && !validation.guestsExpectedValid && (
                        <p className="text-sm text-error-600">{w.errorLineCapacity}</p>
                      )}
                      {option && !validation.passengerCountValid && (
                        <p className="text-sm text-error-600">
                          {fill(w.lineAssignment, { count: line.guestsExpected })}
                        </p>
                      )}

                      {!isStandardSingleLine && (
                        <div>
                          <Label>{w.assignedTravelers}</Label>
                          <div className="mt-2 grid grid-cols-1 gap-2">
                            {passengers.map((passenger, passengerIndex) => {
                              const assignedElsewhere = accommodationLines.some((otherLine, otherIndex) => otherIndex !== index && otherLine.passengerIndexes.includes(passengerIndex));
                              const selectedOnThisLine = line.passengerIndexes.includes(passengerIndex);
                              const lineFull = !selectedOnThisLine && validation.assignedCount >= Math.min(line.guestsExpected, lineCapacity);
                              return (
                                <label key={`line-${index}-passenger-${passengerIndex}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${(assignedElsewhere || lineFull) ? "opacity-50" : ""}`}>
                                  <input
                                    type="checkbox"
                                    checked={selectedOnThisLine}
                                    disabled={assignedElsewhere || lineFull}
                                    onChange={() => toggleAccommodationPassenger(index, passengerIndex)}
                                  />
                                  <span>{passenger.full_name.trim() || fill(w.passengerFallback, { index: passengerIndex + 1 })}</span>
                                  {assignedElsewhere ? <span className="ml-auto text-xs text-gray-500">{w.assignedElsewhere}</span> : null}
                                  {lineFull ? <span className="ml-auto text-xs text-gray-500">{w.lineFull}</span> : null}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div>
                        <Label>{w.accommodationNote}</Label>
                        <Input
                          type="text"
                          placeholder={w.accommodationNotePlaceholder}
                          value={line.notes}
                          onChange={(e) => updateAccommodationLine(index, { notes: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}

                <button type="button" className="text-sm font-medium text-brand-600 dark:text-brand-400" onClick={addAccommodationLine}>
                  {w.addAccommodation}
                </button>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{w.accommodationSummary}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {w.coveredTotal} {accommodationCoverage} / {partySize} {w.travelersLower}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {w.accommodationTotalLabel} {money(accommodationTotal)}
                  </div>
                  {!accommodationPassengerMappingValid && accommodationLines.length > 0 && (
                    <p className="text-sm text-error-600">{w.everyTravelerAssignment}</p>
                  )}
                  {accommodationCoverage !== partySize && accommodationLines.length > 0 && (
                    <p className="text-sm text-error-600">{w.allTravelersCovered}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Add-ons — Optional package services */}
        {step === "addons" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{w.addons}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {w.addonsHint}
              </p>
            </div>

            {packageServicesResolved === "loading" && <p className="text-sm text-gray-500">{w.loadingAddons}</p>}

            {packageServicesResolved === "error" && (
              <div className="rounded-xl border border-error-200 bg-error-50 dark:bg-error-500/10 dark:border-error-500/20 p-4 space-y-2">
                <p className="text-sm text-error-600 dark:text-error-400">{w.errorAddons}</p>
                <button type="button" onClick={retryPackageServices} className="text-sm font-medium text-brand-600 hover:text-brand-500">
                  {w.retry}
                </button>
              </div>
            )}

            {packageServicesResolved === "resolved" && optionalAddons.length > 0 && (
              <div className="space-y-3">
                {optionalAddons.map((service) => {
                  const selected = selectedAddons[service.id];
                  const quantity = selected?.quantity ?? 1;
                  const lineTotal = (service.unitPrice || 0) * quantity;
                  return (
                    <div
                      key={service.id}
                      className={`rounded-xl border p-4 transition ${
                        selected
                          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20 dark:border-brand-400 dark:bg-brand-500/10"
                          : "border-gray-200 dark:border-gray-800"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={Boolean(selected)}
                          onChange={() => toggleAddon(service.id)}
                          className="mt-1 rounded"
                          aria-label={fill(w.chooseProvider, { provider: service.providerName })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">{service.providerName}</p>
                              <p className="text-xs uppercase tracking-wide text-gray-500">{service.serviceType}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                                {money(service.unitPrice || 0, service.currency || "BAM")}
                              </p>
                              {selected ? <p className="text-xs text-gray-500">{w.total} {money(lineTotal, service.currency || "BAM")}</p> : null}
                            </div>
                          </div>
                          {service.description ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{service.description}</p> : null}
                          {selected && (
                            <div className="mt-3 flex items-center gap-2">
                              <Label className="!m-0">{w.quantity}</Label>
                              <Input
                                type="number"
                                min="1"
                                value={String(quantity)}
                                onChange={(event) => updateAddonQuantity(service.id, parseInt(event.target.value) || 1)}
                                className="w-24 !py-1.5 !text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{w.addonsTotal}</span>
                    <span className="font-semibold text-brand-600 dark:text-brand-400">{money(addOnsTotal)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Payment — Price + Payment Terms */}
        {step === "payment" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            

            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>{w.totalAmountOpen}{packageCurrency})</Label>
                <Input type="number" min="0" placeholder="0.00" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
              </div>
            </div>

            {(accommodationTotal > 0 || addOnsTotal > 0) && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{w.basePrice}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{money(Number(totalAmount || 0))}</span>
                </div>
                {accommodationTotal > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">{w.accommodation}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{money(accommodationTotal)}</span>
                  </div>
                )}
                {addOnsTotal > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">{w.addons}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{money(addOnsTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="font-medium text-gray-900 dark:text-white">{w.total}</span>
                  <span className="font-semibold text-brand-600 dark:text-brand-400">{money(displayedTotal)}</span>
                </div>
              </div>
            )}

            <div>
              <Label>{w.paymentPlan}</Label>
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
                    {plan === "full" ? w.fullPayment : plan === "deposit" ? w.depositBalance : w.installments}
                  </button>
                ))}
              </div>
              {paymentPlan === "deposit" && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="!m-0">{w.depositPercent}</Label>
                  <Input type="number" min="1" max="99" value={String(depositPct)} onChange={(e) => setDepositPct(Math.min(99, Math.max(1, parseInt(e.target.value) || 10)))} className="w-20 !py-1.5 !text-sm" />
                  <span className="text-xs text-gray-500">
                    = {money(Math.round(displayedTotal * (depositPct / 100)))}
                  </span>
                </div>
              )}
              {paymentPlan === "installments" && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="!m-0">{w.installmentCount}</Label>
                  <Input type="number" min="2" max="24" value={String(installmentCount)} onChange={(e) => setInstallmentCount(Math.min(24, Math.max(2, parseInt(e.target.value) || 2)))} className="w-20 !py-1.5 !text-sm" />
                  <span className="text-xs text-gray-500">
                    ≈ {money(displayedTotal ? Math.round(displayedTotal / installmentCount) : 0)} {w.perInstallment}
                  </span>
                </div>
              )}
            </div>

            <div>
              <Label>{w.note}</Label>
              <Input type="text" placeholder={w.notePlaceholder} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        {/* Step: Review — Read-only summary */}
        {step === "review" && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">{w.saleReview}</h3>
            <dl className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              <Row label={w.client} value={customerName} />
              <Row label={w.phone} value={customerPhone} />
              {customerEmail ? <Row label={w.email} value={customerEmail} /> : null}
              <Row label={w.package} value={selectedPackage?.name ?? "—"} />
              <Row label={w.departure} value={selectedDeparture ? `${formatDate(selectedDeparture.depart_at)} → ${formatDate(selectedDeparture.return_at)}` : "—"} />
              {variantId ? <Row label={w.option} value={variants.find((v) => v.id === variantId)?.name ?? "—"} /> : null}
              <Row label={w.transport} value={selectedTransportType === "flight" ? w.flight : selectedTransportType === "bus" ? w.bus : w.noTransport} />
              {travelDocumentsRelevant ? <Row label={w.travelDocuments} value={getTravelerReadinessSummary()} /> : null}
              <Row
                label={w.accommodation}
                value={accommodationLinesWithOption.length > 0
                  ? accommodationLinesWithOption.map(({ line, option }) => `${option?.hotel?.name || w.hotel} · ${option?.roomLabel || "—"} · ${fill(w[`rooms${countForm(line.roomCount)}`], { count: line.roomCount })}`).join(" | ")
                  : "—"}
              />
              <Row label={w.travelersLabel} value={`${partySize} ${passengers.filter((p) => p.full_name.trim()).length > 0 ? `(${passengers.filter((p) => p.full_name.trim()).map((p) => p.full_name).join(", ")})` : ""}`} />
              {createGroup ? <Row label={w.group} value={groupName || w.yes} /> : null}
              {accommodationLinesWithOption.length > 0 ? <Row label={w.accommodationTotal} value={money(accommodationTotal)} /> : null}
              {selectedAddonItems.length > 0 ? (
                <Row
                  label={w.addons}
                  value={selectedAddonItems
                    .map(({ service, quantity }) => `${service.providerName} × ${quantity} — ${money((service.unitPrice || 0) * quantity, service.currency || "BAM")}`)
                    .join(" | ")}
                />
              ) : null}
              {selectedAddonItems.length > 0 ? <Row label={w.addonsTotal} value={money(addOnsTotal)} /> : null}
              <Row label={w.total} value={money(displayedTotal)} />
              <Row label={w.payment} value={paymentPlan === "full" ? w.fullPayment : paymentPlan === "deposit" ? fill(w.depositSummary, { percent: depositPct }) : fill(w.installmentSummary, { count: installmentCount })} />
              {paymentPlan === "deposit" && (
                <Row label={w.depositAmount} value={money(Math.round(displayedTotal * (depositPct / 100)))} />
              )}
              {notes ? <Row label={w.note} value={notes} /> : null}
            </dl>
          </div>
        )}

        {/* Validation message */}
        {validationMessage && (
          <div role="alert" className="mt-3 rounded-lg border border-error-200 bg-error-50 dark:bg-error-500/10 dark:border-error-500/20 p-3">
            <p className="text-sm text-error-600 dark:text-error-400">{validationMessage}</p>
          </div>
        )}
        {recoveryReservationId && (
          <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 p-3 dark:border-warning-500/20 dark:bg-warning-500/10">
            <p className="text-sm text-warning-700 dark:text-warning-300">
              {recoveryMode === 'processing' ? t.saleRecovery.processing : recoveryMode === 'retry' ? t.saleRecovery.retry : t.saleRecovery.manual}
            </p>
            <a href={`/reservations/${recoveryReservationId}`} className="mt-2 inline-block text-sm font-medium text-brand-600 underline">{t.saleRecovery.open}</a>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between gap-3 pt-5 mt-5 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={back} disabled={stepIndex === 0}>
            {w.back}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              {w.cancel}
            </Button>
            {step !== "review" ? (
              <Button onClick={handleNextAttempt} disabled={loading}>
                {w.next}
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting || recoveryMode === 'manual'}>
                {submitting ? w.creating : w.confirm}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}


function transportBadge(w: WizardCopy, type?: string) {
  if (type === "flight") return w.flightBadge;
  if (type === "bus") return w.busBadge;
  return w.noTransport;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-2.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-white text-right">{value}</dd>
    </div>
  );
}
