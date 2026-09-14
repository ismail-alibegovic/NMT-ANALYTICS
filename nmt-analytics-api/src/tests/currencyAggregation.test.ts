import { describe, expect, it } from 'vitest';
import { buildCurrencyBreakdown, scalarForCurrencyBreakdown } from '../lib/currency';

describe('currency-aware money aggregation', () => {
  it('does not expose a cross-currency scalar total for mixed BAM/EUR data', () => {
    const breakdown = buildCurrencyBreakdown([
      { currency: 'BAM', amount: 100 },
      { currency: 'EUR', amount: 200 },
    ], { totalAmount: 'amount' });

    expect(breakdown).toMatchObject({
      availableCurrencies: ['BAM', 'EUR'],
      multiCurrency: true,
      currencyBreakdown: [
        { currency: 'BAM', totalAmount: 100 },
        { currency: 'EUR', totalAmount: 200 },
      ],
    });
    expect(scalarForCurrencyBreakdown(breakdown, 'totalAmount')).toBeNull();
    expect(scalarForCurrencyBreakdown(breakdown, 'totalAmount', 'BAM')).toBe(100);
    expect(scalarForCurrencyBreakdown(breakdown, 'totalAmount', 'EUR')).toBe(200);
  });

  it('uses cent-safe accumulation for a single currency', () => {
    const breakdown = buildCurrencyBreakdown([
      { currency: 'EUR', amount: 0.1 },
      { currency: 'EUR', amount: 0.2 },
    ], { totalAmount: 'amount' });

    expect(scalarForCurrencyBreakdown(breakdown, 'totalAmount')).toBe(0.3);
  });
});
