import { useState, useEffect, useRef, useId } from "react";
import { useT } from "../../lib/i18n";
import { bs } from "../../lib/i18n/bs";
import { en } from "../../lib/i18n/en";
import { toDateTimeInput, fromDateTimeInput } from "../../utils/dateTimeInput";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Select from "../form/Select";
import TravelerRequirementsFields from "../travelers/TravelerRequirementsFields";
import type { Departure } from "../../api/departures";
import type { Package, TravelerRequirements } from "../../api/packages";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  packages: Package[];
  editingDeparture: Departure | null;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  loading: boolean;
  travelerMode: "inherit" | "override";
  setTravelerMode: (mode: "inherit" | "override") => void;
  travelerReq: TravelerRequirements;
  setTravelerReq: (req: TravelerRequirements) => void;
};

export default function DepartureFormModal({
  isOpen, onClose, title, packages, editingDeparture,
  onSubmit, loading, travelerMode, setTravelerMode, travelerReq, setTravelerReq,
}: Props) {
  const { t, lang } = useT();
  const fallback = lang === "en" ? en : bs;
  const td = t?.departures ?? fallback.departures;
  const tc = { ...fallback.common, ...(t?.common ?? {}) };
  const formId = useId();
  const submitLock = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [capacity, setCapacity] = useState<number | "">("");
  const [booked, setBooked] = useState<number | "">("");
  const [status, setStatus] = useState("active");
  const [transportType, setTransportType] = useState("none");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSaveError(false);
    if (editingDeparture) {
      setPackageId(editingDeparture.package_id);
      setDepartAt(toDateTimeInput(editingDeparture.depart_at));
      setReturnAt(toDateTimeInput(editingDeparture.return_at));
      setCapacity(editingDeparture.capacity);
      setBooked(editingDeparture.booked);
      setStatus(editingDeparture.status);
      setTransportType(editingDeparture.transport_type ?? "none");
    } else {
      setPackageId("");
      setDepartAt("");
      setReturnAt("");
      setCapacity("");
      setBooked("");
      setStatus("active");
      setTransportType("none");
    }
  }, [isOpen, editingDeparture]);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitLock.current || loading || !e.currentTarget.checkValidity()) return;
    submitLock.current = true;
    setSaveError(false);
    setSubmitting(true);
    try {
      await onSubmit({
        packageId,
        departAt: editingDeparture?.depart_at && departAt === toDateTimeInput(editingDeparture.depart_at)
          ? new Date(editingDeparture.depart_at).toISOString() : fromDateTimeInput(departAt),
        returnAt: editingDeparture?.return_at && returnAt === toDateTimeInput(editingDeparture.return_at)
          ? new Date(editingDeparture.return_at).toISOString() : fromDateTimeInput(returnAt),
        capacity,
        status,
        booked,
        transport_type: transportType,
      });
    } catch {
      setSaveError(true);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const closeForm = () => { if (!submitLock.current && !loading) onClose(); };
  return (
    <Modal isOpen={isOpen} onClose={closeForm} className="max-w-2xl">
      <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h2>

        <fieldset disabled={submitting || loading} className="space-y-5">
        {/* Basic fields */}
        <div className="space-y-4">
          <div>
            <label htmlFor={`${formId}-package`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{td.package} <span className="text-error-500">*</span></label>
            <Select
              id={`${formId}-package`}
              required
              value={packageId}
              onChange={setPackageId}
              options={packages.map((p) => ({ value: p.id, label: `${p.name} - ${p.destination}` }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${formId}-depart`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{td.departureDate} <span className="text-error-500">*</span></label>
              <Input id={`${formId}-depart`} required type="datetime-local" value={departAt} onChange={(e: any) => setDepartAt(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${formId}-return`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{td.returnDate} <span className="text-error-500">*</span></label>
              <Input id={`${formId}-return`} required min={departAt || undefined} type="datetime-local" value={returnAt} onChange={(e: any) => setReturnAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={`${formId}-capacity`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{td.capacity} <span className="text-error-500">*</span></label>
              <Input id={`${formId}-capacity`} required min={1} type="number" value={capacity === "" ? "" : String(capacity)} onChange={(e: any) => setCapacity(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${formId}-booked`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{td.booked}</label>
              <Input id={`${formId}-booked`} min={0} max={capacity === "" ? undefined : capacity} type="number" value={booked === "" ? "" : String(booked)} onChange={(e: any) => setBooked(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div>
              <label htmlFor={`${formId}-status`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{td.status}</label>
              <Select
                id={`${formId}-status`}
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: td.active },
                  { value: "cancelled", label: td.cancelled },
                  { value: "completed", label: td.completed },
                ]}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${formId}-transport`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{td.transport}</label>
            <Select
              id={`${formId}-transport`}
              value={transportType}
              onChange={setTransportType}
              options={[
                { value: "none", label: td.transportNone },
                { value: "bus", label: td.transportBus },
                { value: "flight", label: td.transportFlight },
              ]}
            />
          </div>
        </div>

        {/* Traveler requirements section */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="mb-4">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">{td.travelerDataTitle}</h4>
            {selectedPackage && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {td.packageRules}{selectedPackage.travelerRequirements?.documentType != null ? (() => { const dt = selectedPackage.travelerRequirements.documentType; return ': ' + (dt === 'none' ? td.docNone : dt === 'passport' ? td.docPassport : dt === 'id_card' ? td.docIdCard : '—'); })() : `: ${td.automaticRules}`}
              </p>
            )}
          </div>

          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="travelerMode"
                value="inherit"
                checked={travelerMode === "inherit"}
                onChange={() => setTravelerMode("inherit")}
                className="h-4 w-4 text-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{td.usePackageRules}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="travelerMode"
                value="override"
                checked={travelerMode === "override"}
                onChange={() => setTravelerMode("override")}
                className="h-4 w-4 text-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{td.overrideForDeparture}</span>
            </label>
          </div>

          {travelerMode === "inherit" && selectedPackage?.travelerRequirements && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-xs text-gray-600 dark:text-gray-400">
              {td.usingPackageRulesPrefix} {selectedPackage.travelerRequirements.documentType === 'none' ? td.docNoneFull : selectedPackage.travelerRequirements.documentType === 'passport' ? td.docPassport : td.docIdCard}
            </div>
          )}

          {travelerMode === "override" && (
            <TravelerRequirementsFields value={travelerReq} onChange={setTravelerReq} />
          )}
        </div>

        {saveError && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
          {td.saveErrorPreserved}
        </p>}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={closeForm} disabled={submitting || loading}>
            {tc.cancel}
          </Button>
          <Button type="submit" disabled={submitting || loading}>
            {editingDeparture ? tc.save : tc.add}
          </Button>
        </div>
        </fieldset>
      </form>
    </Modal>
  );
}
