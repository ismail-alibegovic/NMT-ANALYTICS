/**
 * Business logic utilities shared across the application.
 */

/**
 * Safely converts any value to a number, defaulting to 0.
 */
export function normalizeMoney(value: any): number {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

/**
 * Calculates the outstanding amount (debt) for a reservation.
 */
export function calculateOutstandingAmount(total: any, paid: any): number {
    const t = normalizeMoney(total);
    const p = normalizeMoney(paid);

    const diff = t - p;
    // If the difference is negligible (less than 1 cent), consider it zero
    if (Math.abs(diff) < 0.01) {
        return 0;
    }
    return Math.max(diff, 0);
}

/**
 * Calculates the remaining amount (debt) for a reservation.
 * Legacy alias for calculateOutstandingAmount.
 */
export function calculateRemainingAmount(total: any, paid: any): number {
    return calculateOutstandingAmount(total, paid);
}

/**
 * Determines the occupancy status of a departure based on booked vs capacity.
 */
export enum OccupancyStatus {
    FULL = 'FULL',
    ALMOST_FULL = 'ALMOST FULL',
    FILLING = 'FILLING',
    AVAILABLE = 'AVAILABLE'
}

export interface OccupancyInfo {
    status: OccupancyStatus;
    level: 'error' | 'warning' | 'success' | 'neutral';
}

export function getDepartureStatus(booked: number, capacity: number): OccupancyInfo {
    if (capacity <= 0) return { status: OccupancyStatus.FULL, level: 'neutral' };

    const ratio = booked / capacity;

    if (booked >= capacity || ratio >= 1) {
        return { status: OccupancyStatus.FULL, level: 'error' };
    }

    if (ratio >= 0.8) {
        return { status: OccupancyStatus.ALMOST_FULL, level: 'error' };
    }

    if (ratio >= 0.5) {
        return { status: OccupancyStatus.FILLING, level: 'warning' };
    }

    return { status: OccupancyStatus.AVAILABLE, level: 'success' };
}

/**
 * Formats currency amounts consistently.
 */
export function formatCurrency(amount: number): string {
    // Use bs-BA for local formatting
    const formatter = new Intl.NumberFormat('bs-BA', {
        style: 'currency',
        currency: 'BAM',
    });

    return formatter.format(amount || 0);
}

/**
 * Formats dates consistently.
 */
export function formatDate(dateString: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('bs-BA');
}

/**
 * Payment status badge information
 */
export interface PaymentStatusBadge {
    text: string;
    color: 'success' | 'warning' | 'error' | 'light';
}

/**
 * Determines the payment status badge based on total and paid amounts.
 */
export function getPaymentStatusBadge(total: any, paid: any): PaymentStatusBadge {
    const totalAmount = normalizeMoney(total);
    const paidAmount = normalizeMoney(paid);

    // Fully paid (with small tolerance for floating point)
    if (paidAmount >= totalAmount && totalAmount > 0) {
        return { text: 'Potpuno plaćeno', color: 'success' };
    }

    // Partially paid
    if (paidAmount > 0) {
        return { text: 'Djelimično plaćeno', color: 'warning' };
    }

    // Unpaid
    return { text: 'Neplaćeno', color: 'error' };
}
