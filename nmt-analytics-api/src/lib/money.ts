export function toCents(amount: unknown): number {
  return Math.round(Number(amount || 0) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function multiplyMoneyToCents(quantity: unknown, unitCost: unknown): number {
  return Math.round(Number(quantity || 0) * Number(unitCost || 0) * 100);
}
