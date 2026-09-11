import { fromCents, multiplyMoneyToCents } from './money';

export const packageCostCategories = [
  'hotel',
  'transport',
  'flight',
  'tour',
  'insurance',
  'supplier',
  'extra_service',
  'other',
] as const;

export const packageCostUnits = [
  'per_person',
  'per_room',
  'per_night',
  'per_vehicle',
  'per_group',
  'per_booking',
  'per_day',
  'per_hour',
  'fixed',
] as const;

export type PackageCostCategory = typeof packageCostCategories[number];
export type PackageCostUnit = typeof packageCostUnits[number];

export function derivePackageCosting(input: {
  costItems: Array<{ category?: string | null; quantity: unknown; unit_cost: unknown; currency?: string | null }>;
  currency: string;
}) {
  const warnings: Array<{ code: string; message: string; details?: unknown }> = [];

  for (const item of input.costItems) {
    const itemCurrency = item.currency || input.currency;
    if (itemCurrency !== input.currency) {
      warnings.push({
        code: 'COST_CURRENCY_MISMATCH',
        message: 'Cost item currency does not match package currency',
        details: { itemCurrency, packageCurrency: input.currency },
      });
    }
  }

  if (warnings.length > 0) {
    return {
      ok: false as const,
      totalCost: 0,
      categoryBreakdown: [],
      warnings,
    };
  }

  let totalCostCents = 0;
  const byCategory = new Map<string, number>();

  for (const item of input.costItems) {
    const itemCents = multiplyMoneyToCents(item.quantity, item.unit_cost);
    const category = item.category || 'other';
    totalCostCents += itemCents;
    byCategory.set(category, (byCategory.get(category) || 0) + itemCents);
  }

  return {
    ok: true as const,
    totalCost: fromCents(totalCostCents),
    categoryBreakdown: Array.from(byCategory.entries()).map(([category, amountCents]) => ({
      category,
      amount: fromCents(amountCents),
    })),
    warnings,
  };
}
