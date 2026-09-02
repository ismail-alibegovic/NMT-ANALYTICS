import Label from "../form/Label";
import Select from "../form/Select";
import type { TravelerRequirements } from "../../api/packages";

type Props = {
  value: TravelerRequirements;
  onChange: (value: TravelerRequirements) => void;
  idPrefix?: string;
  lang?: "bs" | "en";
};

export const DEFAULT_TRAVELER_REQUIREMENTS: TravelerRequirements = {
  travelScope: "unspecified",
  documentType: "none",
  allowFillLater: true,
  requireExpiry: false,
  requireNationality: false,
  requireDateOfBirth: false,
};

const SCOPE_OPTIONS_BS = [
  { value: "unspecified", label: "Nije određeno" },
  { value: "domestic", label: "Domaće" },
  { value: "international", label: "Međunarodno" },
];

const SCOPE_OPTIONS_EN = [
  { value: "unspecified", label: "Unspecified" },
  { value: "domestic", label: "Domestic" },
  { value: "international", label: "International" },
];

const DOCUMENT_OPTIONS_BS = [
  { value: "none", label: "Nije potreban" },
  { value: "id_card", label: "Lična karta" },
  { value: "passport", label: "Pasoš" },
];

const DOCUMENT_OPTIONS_EN = [
  { value: "none", label: "Not required" },
  { value: "id_card", label: "ID Card" },
  { value: "passport", label: "Passport" },
];

export default function TravelerRequirementsFields({ value, onChange, idPrefix = "", lang = "bs" }: Props) {
  const resolved = { ...DEFAULT_TRAVELER_REQUIREMENTS, ...value };
  const travelScope = resolved.travelScope;
  const documentType = resolved.documentType;

  const scopeId = `${idPrefix}travel-scope`;
  const docId = `${idPrefix}document-type`;
  const scopeOptions = lang === "en" ? SCOPE_OPTIONS_EN : SCOPE_OPTIONS_BS;
  const documentOptions = lang === "en" ? DOCUMENT_OPTIONS_EN : DOCUMENT_OPTIONS_BS;

  function update(patch: Partial<TravelerRequirements>) {
    onChange({ ...DEFAULT_TRAVELER_REQUIREMENTS, ...value, ...patch });
  }

  function updateDocumentType(next: TravelerRequirements["documentType"]) {
    if (next === "none") {
      onChange({
        ...DEFAULT_TRAVELER_REQUIREMENTS,
        ...value,
        documentType: "none",
        requireExpiry: false,
        requireNationality: false,
        requireDateOfBirth: false,
      });
    } else {
      onChange({ ...DEFAULT_TRAVELER_REQUIREMENTS, ...value, documentType: next });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={scopeId}>{lang === "en" ? "Travel type" : "Vrsta putovanja"}</Label>
          <Select
            id={scopeId}
            value={travelScope}
            onChange={(v) => update({ travelScope: v as TravelerRequirements["travelScope"] })}
            options={scopeOptions}
          />
        </div>
        <div>
          <Label htmlFor={docId}>{lang === "en" ? "Travel document" : "Putni dokument"}</Label>
          <Select
            id={docId}
            value={documentType}
            onChange={(v) => updateDocumentType(v as TravelerRequirements["documentType"])}
            options={documentOptions}
          />
        </div>
      </div>

      {documentType !== "none" && (
        <div className="space-y-3 pt-1">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={resolved.allowFillLater}
              onChange={(e) => update({ allowFillLater: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {lang === "en" ? "Allow fill-in later" : "Dozvoli dopunu podataka kasnije"}
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={resolved.requireExpiry}
              onChange={(e) => update({ requireExpiry: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {lang === "en" ? "Require expiry date" : "Traži datum isteka"}
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={resolved.requireNationality}
              onChange={(e) => update({ requireNationality: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {lang === "en" ? "Require nationality" : "Traži državljanstvo"}
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600">
            <input
              type="checkbox"
              checked={resolved.requireDateOfBirth}
              onChange={(e) => update({ requireDateOfBirth: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {lang === "en" ? "Require date of birth" : "Traži datum rođenja"}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
