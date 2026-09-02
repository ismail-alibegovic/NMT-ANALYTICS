/**
 * Travel-document readiness — single source of truth for passenger document status.
 *
 * Relevance rule:
 *   needTravelDocuments is derived from resolved package/departure traveler requirements.
 *
 * When documents are NOT required, every passenger resolves to "not_required" and
 * no warnings are derived from empty document fields.
 *
 * Dates are compared as calendar-day keys (YYYY-MM-DD) resolved in the agency's
 * travel timezone so a departure timestamp never shifts the boundary day.
 */

export type DocumentReadinessStatus =
  | "not_required"
  | "ready"
  | "missing"
  | "expired_before_departure"
  | "expired_before_return";

/** Agency operating timezone for travel-date boundaries. */
export const TRAVEL_TIMEZONE = "Europe/Sarajevo";

/**
 * Convert a timestamp or DATE string to a YYYY-MM-DD calendar-day key in the
 * travel timezone. Date-only values pass through untouched; invalid input
 * returns null.
 */
export function toTravelDateKey(
  value: string | null | undefined,
  timeZone: string = TRAVEL_TIMEZONE,
): string | null {
  if (!value || typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function hasText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export interface PassengerDocumentInput {
  id_document_type?: string | null;
  id_document_number?: string | null;
  id_document_expiry?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
}

export interface ReadinessDepartureContext {
  needTravelDocuments: boolean;
  travelerRequirements?: {
    documentType: 'none' | 'id_card' | 'passport';
    requireExpiry: boolean;
    requireNationality: boolean;
    requireDateOfBirth: boolean;
  };
  /** YYYY-MM-DD travel-date key of depart_at */
  departDateKey: string | null;
  /** YYYY-MM-DD travel-date key of return_at (null when the trip has none) */
  returnDateKey?: string | null;
}

/**
 * Derive one passenger's document readiness status. Pure function — reads only
 * the canonical passenger fields; never mutates anything.
 */
export function computePassengerDocumentReadiness(
  passenger: PassengerDocumentInput,
  ctx: ReadinessDepartureContext,
): DocumentReadinessStatus {
  const requirements = ctx.travelerRequirements;
  if (!ctx.needTravelDocuments || requirements?.documentType === "none") return "not_required";

  if (!hasText(passenger.id_document_type)) return "missing";
  if (passenger.id_document_type === "none") return "missing";
  if (requirements?.documentType && passenger.id_document_type !== requirements.documentType) return "missing";
  if (!hasText(passenger.id_document_number)) return "missing";
  if (requirements?.requireNationality && !hasText(passenger.nationality)) return "missing";
  if (requirements?.requireDateOfBirth && !hasText(passenger.date_of_birth)) return "missing";

  const expiryKey = toTravelDateKey(passenger.id_document_expiry);
  const requireExpiry = requirements?.requireExpiry ?? true;
  if (!requireExpiry) return "ready";
  if (!expiryKey) return "missing";

  // Expired before departure: expiry day strictly before the departure day.
  if (ctx.departDateKey && expiryKey < ctx.departDateKey) {
    return "expired_before_departure";
  }

  // Expired before return: expiry covers departure but ends before the return day.
  if (
    ctx.departDateKey &&
    ctx.returnDateKey &&
    ctx.returnDateKey > ctx.departDateKey &&
    expiryKey < ctx.returnDateKey
  ) {
    return "expired_before_return";
  }

  // Expiry covers the whole travel window (expiry == return date counts as ready).
  return "ready";
}

export interface DocumentReadinessSummary {
  required: boolean;
  totalRelevant: number;
  ready: number;
  missing: number;
  expiredBeforeDeparture: number;
  expiredBeforeReturn: number;
  missingPassengerIds: string[];
  expiredBeforeDeparturePassengerIds: string[];
  expiredBeforeReturnPassengerIds: string[];
}

/**
 * Aggregate per-passenger readiness entries ([passengerId, status]) into a
 * departure-level summary with categorized canonical passenger IDs.
 */
export function summarizeDocumentReadiness(
  needTravelDocuments: boolean,
  entries: ReadonlyArray<readonly [string, DocumentReadinessStatus]>,
): DocumentReadinessSummary {
  const summary: DocumentReadinessSummary = {
    required: needTravelDocuments,
    totalRelevant: entries.length,
    ready: 0,
    missing: 0,
    expiredBeforeDeparture: 0,
    expiredBeforeReturn: 0,
    missingPassengerIds: [],
    expiredBeforeDeparturePassengerIds: [],
    expiredBeforeReturnPassengerIds: [],
  };

  if (!needTravelDocuments) return summary;

  for (const [passengerId, status] of entries) {
    switch (status) {
      case "ready":
        summary.ready += 1;
        break;
      case "missing":
        summary.missing += 1;
        summary.missingPassengerIds.push(passengerId);
        break;
      case "expired_before_departure":
        summary.expiredBeforeDeparture += 1;
        summary.expiredBeforeDeparturePassengerIds.push(passengerId);
        break;
      case "expired_before_return":
        summary.expiredBeforeReturn += 1;
        summary.expiredBeforeReturnPassengerIds.push(passengerId);
        break;
      case "not_required":
        break;
    }
  }

  return summary;
}
