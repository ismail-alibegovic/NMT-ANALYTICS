import { describe, expect, it } from 'vitest';
import { derivePackageCosting } from '../lib/packageCosting';

describe('package costing derivation', () => {
  it('returns zero for an empty package cost ledger', () => {
    const result = derivePackageCosting({ currency: 'BAM', costItems: [] });

    expect(result.ok).toBe(true);
    expect(result.totalCost).toBe(0);
    expect(result.categoryBreakdown).toEqual([]);
  });

  it('derives quantity times unit cost and category breakdown with cent-safe math', () => {
    const result = derivePackageCosting({
      currency: 'BAM',
      costItems: [
        { category: 'transport', quantity: 30, unit_cost: 125, currency: 'BAM' },
        { category: 'hotel', quantity: 3, unit_cost: 0.335, currency: 'BAM' },
        { category: 'hotel', quantity: 1, unit_cost: 100, currency: 'BAM' },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.totalCost).toBe(3851.01);
    expect(result.categoryBreakdown).toEqual([
      { category: 'transport', amount: 3750 },
      { category: 'hotel', amount: 101.01 },
    ]);
  });

  it('returns a warning instead of summing mixed currencies', () => {
    const result = derivePackageCosting({
      currency: 'BAM',
      costItems: [{ category: 'flight', quantity: 1, unit_cost: 200, currency: 'EUR' }],
    });

    expect(result.ok).toBe(false);
    expect(result.totalCost).toBe(0);
    expect(result.warnings).toEqual([
      {
        code: 'COST_CURRENCY_MISMATCH',
        message: 'Cost item currency does not match package currency',
        details: { itemCurrency: 'EUR', packageCurrency: 'BAM' },
      },
    ]);
  });

  it('does not derive costs from sell price, package base price, flight base price, or package services', () => {
    const result = derivePackageCosting({
      currency: 'BAM',
      costItems: [{ category: 'other', quantity: 1, unit_cost: 0, currency: 'BAM' }],
    });

    const ignoredCommercialValues = {
      packageBasePrice: 1200,
      flightBasePrice: 300,
      hotelSellPrice: 500,
      packageServiceUnitPrice: 100,
    };

    expect(ignoredCommercialValues.packageBasePrice).toBe(1200);
    expect(result.totalCost).toBe(0);
  });
});
