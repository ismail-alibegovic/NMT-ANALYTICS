import Label from "../form/Label";
import Select from "../form/Select";
import type { TravelerRequirements } from "../../api/packages";

type Props = {
  value: TravelerRequirements;
  onChange: (value: TravelerRequirements) => void;
  idPrefix?: string;
};

export const DEFAULT_TRAVELER_REQUIREMENTS: TravelerRequirements = {
  travelScope: "unspecified",
  documentType: "none",
  allowFillLater: true,
  requireExpiry: false,
  requireNationality: false,
  requireDateOfBirth: false,
};

const SCOPE_OPTIONS = [
  { value: "unspecified", label: "Nije određeno" },
  { value: "domestic", label: "Domaće" },
  { value: "international", label: "Međunarodno" },
];

const DOCUMENT_OPTIONS = [
  { value: "none", label: "Nije potreban" },
  { value: "id_card", label: "Lična karta" },
  { value: "passport", label: "Pasoš" },
];

export default function TravelerRequirementsFields({ value, onChange, idPrefix = "" }: Props) {
  const travelScope = value.travelScope ?? "unspecified";
  const documentType = value.documentType ?? "none";

  const scopeId = `${idPrefix}travel-scope`;
  const docId = `${idPrefix}document-type`;

  function update(patch: Partial<TravelerRequirements>) {
    onChange({ ...value, ...patch });
  }

  function updateDocumentType(next: TravelerRequirements["documentType"]) {
    if (next === "none") {
      onChange({
        ...value,
        documentType: "none",
        requireExpiry: false,
        requireNationality: false,
        requireDateOfBirth: false,
      });
    } else {
      onChange({ ...value, documentType: next });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={scopeId}>Vrsta putovanja</Label>
          <Select
            id={scopeId}
            value={travelScope}
            onChange={(v) => update({ travelScope: v as TravelerRequirements["travelScope"] })}
            options={SCOPE_OPTIONS}
          />
        </div>
        <div>
          <Label htmlFor={docId}>Putni dokument</Label>
          <Select
            id={docId}
            value={documentType}
            onChange={(v) => updateDocumentType(v as TravelerRequirements["documentType"])}
            options={DOCUMENT_OPTIONS}
          />
        </div>
      </div>

      {documentType !== "none" && (
        <div className="space-y-3 pt-1">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={!!value.allowFillLater}
              onChange={(e) => update({ allowFillLater: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Dozvoli dopunu podataka kasnije
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={!!value.requireExpiry}
              onChange={(e) => update({ requireExpiry: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Traži datum isteka</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={!!value.requireNationality}
              onChange={(e) => update({ requireNationality: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Traži državljanstvo</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={!!value.requireDateOfBirth}
              onChange={(e) => update({ requireDateOfBirth: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Traži datum rođenja</span>
          </label>
        </div>
      )}
    </div>
  );
}
