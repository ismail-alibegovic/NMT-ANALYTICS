export type CurrencyAmount = {
  currency?: string | null;
  amount?: number | string | null;
};

export function normalizeCurrency(currency: string | null | undefined, fallback = 'BAM'): string {
  return (currency || fallback).toUpperCase();
}

export function toMoneyCents(amount: unknown): number {
  return Math.round(Number(amount || 0) * 100);
}

export function fromMoneyCents(cents: number): number {
  return cents / 100;
}

export function addMoneyCents(...amounts: unknown[]): number {
  return amounts.reduce<number>((sum, amount) => sum + toMoneyCents(amount), 0);
}

export function buildCurrencyBreakdown<T extends Record<string, unknown>>(
  rows: T[],
  fields: Record<string, keyof T>,
  currencyKey: keyof T = 'currency' as keyof T,
) {
  const grouped = new Map<string, Record<string, number>>();

  for (const row of rows) {
    const currency = normalizeCurrency(row[currencyKey] as string | null | undefined);
    const current = grouped.get(currency) || {};
    for (const [outKey, rowKey] of Object.entries(fields)) {
      current[outKey] = (current[outKey] || 0) + toMoneyCents(row[rowKey]);
    }
    grouped.set(currency, current);
  }

  const currencyBreakdown = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, cents]) => ({
      currency,
      ...Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, fromMoneyCents(value)])),
    }));

  return {
    availableCurrencies: currencyBreakdown.map((row) => row.currency),
    multiCurrency: currencyBreakdown.length > 1,
    currencyBreakdown,
  };
}

export function scalarForCurrencyBreakdown(
  breakdown: ReturnType<typeof buildCurrencyBreakdown>,
  key: string,
  requestedCurrency?: string | null,
): number | null {
  if (requestedCurrency) {
    return Number((breakdown.currencyBreakdown.find((row) => row.currency === normalizeCurrency(requestedCurrency)) as any)?.[key] || 0);
  }
  if (breakdown.currencyBreakdown.length === 0) return 0;
  if (breakdown.currencyBreakdown.length === 1) return Number((breakdown.currencyBreakdown[0] as any)[key] || 0);
  return null;
}
