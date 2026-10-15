import { fromCents, multiplyMoneyToCents, toCents } from './money';

const SUCCESSFUL_PAYMENT_STATUS = 'succeeded';

export const departureCostCategories = [
  'hotel',
  'transport',
  'flight',
  'tour',
  'insurance',
  'supplier',
  'extra_service',
  'other',
] as const;

export type DepartureCostCategory = typeof departureCostCategories[number];

export function isEligibleReservationStatus(status: unknown): boolean {
  return status !== 'cancelled';
}

export function isSuccessfulPaymentStatus(status: unknown): boolean {
  return status === SUCCESSFUL_PAYMENT_STATUS;
}

export function deriveDepartureFinance(input: {
  reservations: Array<{ id: string; total_amount: unknown; currency?: string | null; status?: string | null }>;
  payments: Array<{ reservation_id: string; amount: unknown; status?: string | null; currency?: string | null }>;
  costItems: Array<{ id?: string; category?: string; quantity: unknown; unit_cost: unknown; currency?: string | null }>;
  payables?: Array<{
    id: string;
    amount: unknown;
    currency?: string | null;
    cancelled_at?: string | null;
    entries?: Array<{ id?: string; kind?: string | null; amount: unknown }>;
  }>;
  currency: string;
}) {
  const eligibleReservations = input.reservations.filter((reservation) => isEligibleReservationStatus(reservation.status));
  const eligibleReservationIds = new Set(eligibleReservations.map((reservation) => reservation.id));
  const warnings: Array<{ code: string; message: string; details?: unknown }> = [];

  for (const reservation of eligibleReservations) {
    const reservationCurrency = reservation.currency || input.currency;
    if (reservationCurrency !== input.currency) {
      warnings.push({
        code: 'RESERVATION_CURRENCY_MISMATCH',
        message: 'Reservation currency does not match departure currency',
        details: { reservationId: reservation.id, reservationCurrency, departureCurrency: input.currency },
      });
    }
  }

  for (const payment of input.payments) {
    if (!eligibleReservationIds.has(payment.reservation_id) || !isSuccessfulPaymentStatus(payment.status)) continue;
    const paymentCurrency = payment.currency || input.currency;
    if (paymentCurrency !== input.currency) {
      warnings.push({
        code: 'PAYMENT_CURRENCY_MISMATCH',
        message: 'Payment currency does not match departure currency',
        details: { reservationId: payment.reservation_id, paymentCurrency, departureCurrency: input.currency },
      });
    }
  }

  for (const item of input.costItems) {
    const costCurrency = item.currency || input.currency;
    if (costCurrency !== input.currency) {
      warnings.push({
        code: 'COST_CURRENCY_MISMATCH',
        message: 'Cost item currency does not match departure currency',
        details: { costItemId: item.id, costCurrency, departureCurrency: input.currency },
      });
    }
  }

  const payables = input.payables || [];
  for (const payable of payables) {
    if (payable.cancelled_at) continue;
    const payableCurrency = payable.currency || input.currency;
    if (payableCurrency !== input.currency) {
      warnings.push({
        code: 'SUPPLIER_PAYABLE_CURRENCY_MISMATCH',
        message: 'Supplier payable currency does not match departure currency',
        details: { payableId: payable.id, payableCurrency, departureCurrency: input.currency },
      });
    }
  }

  if (warnings.length > 0) {
    return {
      ok: false as const,
      warnings,
      reservationCount: eligibleReservations.length,
      revenue: 0,
      collected: 0,
      outstanding: 0,
      supplierCosts: 0,
      estimatedGrossProfit: 0,
      marginPct: null,
      supplierObligationsIssued: 0,
      supplierPaid: 0,
      supplierOutstanding: 0,
      realizedCashProfit: 0,
      costBreakdown: [],
    };
  }

  const successfulPaymentsByReservation = new Map<string, number>();
  for (const payment of input.payments) {
    if (!eligibleReservationIds.has(payment.reservation_id) || !isSuccessfulPaymentStatus(payment.status)) continue;
    successfulPaymentsByReservation.set(
      payment.reservation_id,
      (successfulPaymentsByReservation.get(payment.reservation_id) || 0) + toCents(payment.amount),
    );
  }

  let revenueCents = 0;
  let collectedCents = 0;
  let outstandingCents = 0;

  for (const reservation of eligibleReservations) {
    const totalCents = toCents(reservation.total_amount);
    const paidCents = successfulPaymentsByReservation.get(reservation.id) || 0;
    revenueCents += totalCents;
    collectedCents += paidCents;
    outstandingCents += Math.max(totalCents - paidCents, 0);
  }

  const breakdownByCategory = new Map<string, number>();
  let supplierCostCents = 0;
  for (const item of input.costItems) {
    const itemCents = multiplyMoneyToCents(item.quantity, item.unit_cost);
    supplierCostCents += itemCents;
    const category = item.category || 'other';
    breakdownByCategory.set(category, (breakdownByCategory.get(category) || 0) + itemCents);
  }

  let supplierObligationsIssuedCents = 0;
  let supplierPaidCents = 0;

  for (const payable of payables) {
    if (payable.cancelled_at) continue;
    supplierObligationsIssuedCents += toCents(payable.amount);

    for (const entry of payable.entries || []) {
      supplierPaidCents += toCents(entry.amount);
    }
  }

  const supplierOutstandingCents = Math.max(supplierObligationsIssuedCents - supplierPaidCents, 0);
  const grossProfitCents = revenueCents - supplierCostCents;
  const marginPct = revenueCents > 0 ? Math.round((grossProfitCents / revenueCents) * 10000) / 100 : null;
  const realizedCashProfitCents = collectedCents - supplierPaidCents;

  return {
    ok: true as const,
    warnings,
    reservationCount: eligibleReservations.length,
    revenue: fromCents(revenueCents),
    collected: fromCents(collectedCents),
    outstanding: fromCents(outstandingCents),
    supplierCosts: fromCents(supplierCostCents),
    estimatedGrossProfit: fromCents(grossProfitCents),
    marginPct,
    supplierObligationsIssued: fromCents(supplierObligationsIssuedCents),
    supplierPaid: fromCents(supplierPaidCents),
    supplierOutstanding: fromCents(supplierOutstandingCents),
    realizedCashProfit: fromCents(realizedCashProfitCents),
    costBreakdown: Array.from(breakdownByCategory.entries()).map(([category, amountCents]) => ({
      category,
      amount: fromCents(amountCents),
    })),
  };
}
