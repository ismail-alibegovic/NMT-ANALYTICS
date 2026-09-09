import { describe, expect, it } from 'vitest';
import { deriveDepartureFinance } from '../lib/departureProfitability';

const currency = 'BAM';

describe('departure profitability derivation', () => {
  it('aggregates revenue, succeeded collected, per-reservation outstanding, costs, gross profit, and margin', () => {
    const result = deriveDepartureFinance({
      currency,
      reservations: [
        { id: 'r1', total_amount: 1000, currency, status: 'confirmed' },
        { id: 'r2', total_amount: 500, currency, status: 'confirmed' },
        { id: 'cancelled', total_amount: 900, currency, status: 'cancelled' },
      ],
      payments: [
        { reservation_id: 'r1', amount: 300, currency, status: 'succeeded' },
        { reservation_id: 'r1', amount: 200, currency, status: 'pending' },
        { reservation_id: 'r1', amount: 100, currency, status: 'failed' },
        { reservation_id: 'r1', amount: 50, currency, status: 'refunded' },
        { reservation_id: 'r2', amount: 600, currency, status: 'succeeded' },
        { reservation_id: 'cancelled', amount: 900, currency, status: 'succeeded' },
      ],
      costItems: [
        { category: 'hotel', quantity: 2, unit_cost: 100, currency },
        { category: 'transport', quantity: 1, unit_cost: 150, currency },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.reservationCount).toBe(2);
    expect(result.revenue).toBe(1500);
    expect(result.collected).toBe(900);
    expect(result.outstanding).toBe(700);
    expect(result.supplierCosts).toBe(350);
    expect(result.estimatedGrossProfit).toBe(1150);
    expect(result.marginPct).toBe(76.67);
    expect(result.costBreakdown).toEqual([
      { category: 'hotel', amount: 200 },
      { category: 'transport', amount: 150 },
    ]);
  });

  it('does not allow one overpaid reservation to offset another reservation outstanding', () => {
    const result = deriveDepartureFinance({
      currency,
      reservations: [
        { id: 'overpaid', total_amount: 100, currency, status: 'confirmed' },
        { id: 'unpaid', total_amount: 300, currency, status: 'confirmed' },
      ],
      payments: [
        { reservation_id: 'overpaid', amount: 500, currency, status: 'succeeded' },
      ],
      costItems: [],
    });

    expect(result.collected).toBe(500);
    expect(result.outstanding).toBe(300);
  });

  it('uses cent-safe rounding and returns null margin for zero revenue', () => {
    const result = deriveDepartureFinance({
      currency,
      reservations: [],
      payments: [],
      costItems: [{ category: 'other', quantity: 3, unit_cost: 0.335, currency }],
    });

    expect(result.supplierCosts).toBe(1.01);
    expect(result.estimatedGrossProfit).toBe(-1.01);
    expect(result.marginPct).toBeNull();
    expect(Number.isFinite(result.supplierCosts)).toBe(true);
  });

  it('returns structured warnings instead of summing mixed currencies', () => {
    const result = deriveDepartureFinance({
      currency,
      reservations: [{ id: 'r1', total_amount: 100, currency: 'EUR', status: 'confirmed' }],
      payments: [{ reservation_id: 'r1', amount: 50, currency, status: 'succeeded' }],
      costItems: [{ id: 'c1', category: 'hotel', quantity: 1, unit_cost: 20, currency: 'EUR' }],
    });

    expect(result.ok).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'RESERVATION_CURRENCY_MISMATCH',
      'COST_CURRENCY_MISMATCH',
    ]);
    expect(result.revenue).toBe(0);
    expect(result.marginPct).toBeNull();
  });
});
