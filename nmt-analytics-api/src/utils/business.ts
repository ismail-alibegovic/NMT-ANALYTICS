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
