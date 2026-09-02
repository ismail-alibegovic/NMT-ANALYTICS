import { resolveTravelerRequirements, type ResolvedTravelerRequirements } from '../lib/travelerRequirements';

/**
 * Business logic utilities shared across the API.
 * Standardized with the Admin UI.
 */

/**
 * Calculates the remaining amount (debt) for a reservation.
 * Standardizes the "paid in full" check to handle small float precision issues.
 */
export function calculateRemainingAmount(total: number, paid: number): number {
    const diff = Number(total || 0) - Number(paid || 0);
    // If the difference is negligible (less than 1 cent), consider it zero
    if (Math.abs(diff) < 0.01) {
        return 0;
    }
    return Math.max(diff, 0);
}

/**
 * Departure occupancy status levels
 */
export enum OccupancyStatus {
    FULL = 'FULL',
    ALMOST_FULL = 'ALMOST FULL',
    FILLING = 'FILLING',
    AVAILABLE = 'AVAILABLE'
}

/**
 * Determines the occupancy status of a departure.
 */
export function getDepartureStatus(booked: number, capacity: number): OccupancyStatus {
    if (capacity <= 0) return OccupancyStatus.FULL;

    const ratio = booked / capacity;

    if (booked >= capacity || ratio >= 1) {
        return OccupancyStatus.FULL;
    }

    if (ratio >= 0.8) {
        return OccupancyStatus.ALMOST_FULL;
    }

    if (ratio >= 0.5) {
        return OccupancyStatus.FILLING;
    }

    return OccupancyStatus.AVAILABLE;
}

/**
 * Safely converts a value to a number, returning 0 for invalid values.
 * Prevents NaN from appearing in responses.
 */
export function safeNumber(value: any): number {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

/**
 * Formats a date string to ISO format, returning null for invalid dates.
 * Prevents "Invalid Date" from appearing in responses.
 */
export function safeDate(dateString: any): string | null {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Departure operational capabilities resolved from the departure row
 * plus its joined package context. Used to drive conditional UI (tabs,
 * warnings, controls) and to constrain operational workflows to the
 * transport type, accommodation, and document rules that actually apply.
 */
export interface DepartureCapabilities {
  transportType: 'bus' | 'flight' | 'none';
  hasBusTransport: boolean;
  hasFlight: boolean;
  hasManagedSeatLayout: boolean;
  hasAccommodation: boolean;
  /** Travel-document readiness applies to this departure (flight OR explicit flag). */
  needTravelDocuments: boolean;
  travelerRequirements: ResolvedTravelerRequirements;
  /** Raw opt-in flag from the departures row. */
  documentReadinessRequired: boolean;
  /** Flight departure has a linked flight configured. null for non-flight departures. */
  flightConfigured: boolean | null;
}

/**
 * Resolve departure capabilities from a departure row (with joined packages).
 *
 * - departure-level transport_type overrides package-level transport_type.
 * - hasAccommodation is true when the package has hotel-type services or
 *   package_hotels links.
 * - hasManagedSeatLayout is true only for bus transport (flight seat maps
 *   are visual reference only; airline seat assignments are not managed).
 */
export function resolveDepartureCapabilities(
  departure: {
    transport_type?: string | null;
    package_id?: string | null;
    document_readiness_required?: boolean | null;
    flight_id?: string | null;
    traveler_requirements?: unknown;
  },
  pkg?: { transport_type?: string | null; trip_type?: string | null; destination?: string | null; traveler_requirements?: unknown } | null,
  packageHasAccommodation = false,
): DepartureCapabilities {
  const effectiveTransportType =
    (departure.transport_type && departure.transport_type !== 'none'
      ? departure.transport_type
      : pkg?.transport_type && pkg.transport_type !== 'none'
        ? pkg.transport_type
        : 'none') as 'bus' | 'flight' | 'none';

  const isBus = effectiveTransportType === 'bus';
  const isFlight = effectiveTransportType === 'flight';
  const documentReadinessRequired = departure.document_readiness_required === true;
  const travelerRequirements = resolveTravelerRequirements({
    packageTravelerRequirements: pkg?.traveler_requirements,
    departureTravelerRequirements: departure.traveler_requirements,
    effectiveTransportType,
    documentReadinessRequired,
  });

  return {
    transportType: isBus ? 'bus' : isFlight ? 'flight' : 'none',
    hasBusTransport: isBus,
    hasFlight: isFlight,
    hasManagedSeatLayout: isBus,
    hasAccommodation: packageHasAccommodation,
    needTravelDocuments: travelerRequirements.documentType !== 'none',
    travelerRequirements,
    documentReadinessRequired,
    flightConfigured: isFlight ? departure.flight_id != null : null,
  };
}
