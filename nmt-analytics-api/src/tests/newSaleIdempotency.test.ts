import { describe, expect, it } from 'vitest';
import {
  normalizeSaleIdempotencyKey,
  saleRequestFingerprint,
} from '../lib/saleIdempotency';

describe('new sale idempotency contract', () => {
  it('accepts stable retry keys and rejects missing or unsafe keys', () => {
    expect(normalizeSaleIdempotencyKey('sale-2026.10:abc')).toBe('sale-2026.10:abc');
    expect(normalizeSaleIdempotencyKey(undefined)).toBeNull();
    expect(normalizeSaleIdempotencyKey('bad key')).toBeNull();
    expect(normalizeSaleIdempotencyKey('x'.repeat(256))).toBeNull();
  });

  it('keeps the fingerprint stable when a retry receives a new reservation timestamp', () => {
    const first = {
      customerName: 'Pilot Customer',
      partySize: 2,
      reservationAt: '2026-10-11T23:00:00.000Z',
      totalAmount: 500,
    };
    const retry = { ...first, reservationAt: '2026-10-11T23:01:00.000Z' };

    expect(saleRequestFingerprint(first)).toBe(saleRequestFingerprint(retry));
    expect(saleRequestFingerprint(first)).not.toBe(
      saleRequestFingerprint({ ...first, totalAmount: 501 }),
    );
  });
});
