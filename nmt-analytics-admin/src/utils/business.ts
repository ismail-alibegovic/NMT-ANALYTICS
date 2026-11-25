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

export function calculateRemainingFromSuccessfulPayments(
    total: any,
    payments: Array<{ amount: any; status: string }>
): number {
    const paid = payments
        .filter((payment) => payment.status === 'succeeded')
        .reduce((sum, payment) => sum + normalizeMoney(payment.amount), 0);

    return calculateRemainingAmount(total, paid);
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
export function formatCurrency(amount: number | null | undefined, currency = 'BAM', locale?: string): string {
    const formatter = new Intl.NumberFormat(locale || 'bs-BA', {
        style: 'currency',
        currency,
    });

    // Some Chromium builds advertise bs-BA but ship root CLDR number data.
    // Only explicit locale callers opt into this compatibility path; legacy
    // callers keep their existing default. Use the same decimal/group pattern
    // and explicit currency codes when a Bosnian symbol is unavailable.
    if (locale === 'bs-BA' && new Intl.NumberFormat(locale).formatToParts(1.5)
        .find(part => part.type === 'decimal')?.value !== ',') {
        const symbols: Record<string, string> = { BAM: 'KM', EUR: '€' };
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency, currencyDisplay: 'code' })
            .formatToParts(amount || 0)
            .map(part => part.type === 'currency' ? (symbols[part.value] || part.value) : part.value)
            .join('');
    }
    return formatter.format(amount || 0);
}

export const BS_MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'] as const;

const isBosnianLocale = (locale?: string) => !locale || locale.toLowerCase().startsWith('bs');

/**
 * Formats dates consistently and avoids Chrome V8 missing bs-BA ICU data (`2026 M11 25`).
 */
export function formatDate(dateString: string | Date | null | undefined, locale?: string): string {
    if (!dateString) return '-';
    const d = dateString instanceof Date ? dateString : new Date(dateString);
    if (Number.isNaN(d.getTime())) return '-';
    if (isBosnianLocale(locale)) {
        return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`;
    }
    return d.toLocaleDateString(locale);
}

/**
 * Formats date and time consistently without Chrome V8 missing bs-BA ICU data.
 */
export function formatDateTime(dateString: string | Date | null | undefined, locale?: string): string {
    if (!dateString) return '-';
    const d = dateString instanceof Date ? dateString : new Date(dateString);
    if (Number.isNaN(d.getTime())) return '-';
    if (isBosnianLocale(locale)) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}. ${hh}:${mm}`;
    }
    return d.toLocaleString(locale);
}

/**
 * Formats short day + month labels consistently for charts and compact lists.
 */
export function formatShortMonthDay(dateString: string | Date | null | undefined, locale?: string): string {
    if (!dateString) return '-';
    const d = dateString instanceof Date ? dateString : new Date(dateString);
    if (Number.isNaN(d.getTime())) return '-';
    if (isBosnianLocale(locale)) {
        return `${d.getDate()}. ${BS_MONTHS_SHORT[d.getMonth()]}`;
    }
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/**
 * Payment status badge information
 */
export interface PaymentStatusBadge {
    text: string;
    color: 'success' | 'warning' | 'error' | 'light';
}


/** Canonical payment status colors — shared by all components */
export const PAYMENT_STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'light' | 'info'> = {
    succeeded: 'success',
    pending: 'warning',
    failed: 'error',
    refunded: 'info',
    cancelled: 'light',
    unpaid: 'error',
    partiallyPaid: 'warning',
    paid: 'success',
};

/**
 * Determines the payment status badge based on total and paid amounts.
 */
export function getPaymentStatusBadge(total: any, paid: any): PaymentStatusBadge {
    const totalAmount = normalizeMoney(total);
    const paidAmount = normalizeMoney(paid);

    // Zero-value reservation: trivially settled — must not read as "Neplaćeno".
    // (catches complimentary upgrades, error-corrected 0 invoices, voided rows)
    if (totalAmount === 0) {
        return { text: 'Potpuno plaćeno', color: 'success' };
    }

    // Fully paid (with small tolerance for floating point)
    if (paidAmount >= totalAmount) {
        return { text: 'Potpuno plaćeno', color: 'success' };
    }

    // Partially paid
    if (paidAmount > 0) {
        return { text: 'Djelimično plaćeno', color: 'warning' };
    }

    // Unpaid
    return { text: 'Neplaćeno', color: 'error' };
}
