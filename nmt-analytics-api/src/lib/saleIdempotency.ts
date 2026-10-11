import { createHash } from 'node:crypto';

export const SALE_IDEMPOTENCY_HEADER = 'idempotency-key';

export type SaleCreationState = 'in_progress' | 'completed' | 'recovery_required';

export function normalizeSaleIdempotencyKey(value: string | undefined): string | null {
  const key = value?.trim();
  if (!key || key.length > 255 || !/^[A-Za-z0-9._:-]+$/.test(key)) return null;
  return key;
}

export function saleRequestFingerprint(body: Record<string, unknown>): string {
  const { reservationAt: _reservationAt, ...stableBody } = body;
  return createHash('sha256').update(JSON.stringify(stableBody)).digest('hex');
}
