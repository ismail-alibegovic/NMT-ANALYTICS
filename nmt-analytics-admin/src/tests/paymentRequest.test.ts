import { afterEach, describe, expect, it } from 'vitest';
import { paymentRequest } from '../lib/paymentRequest';
afterEach(() => sessionStorage.clear());
describe('payment request keys', () => {
  it('keeps one key across repeated or ambiguous submissions and rotates only on success', () => {
    const payload = { reservation_id: 'reservation-a', amount: 100 };
    const first = paymentRequest(payload);
    expect(paymentRequest(payload).key).toBe(first.key);
    first.complete();
    const next = paymentRequest(payload);
    expect(next.key).not.toBe(first.key);
    next.complete();
  });
  it('separates different reservation and amount intents', () => {
    const left = paymentRequest({ reservation_id: 'a', amount: 100 });
    const right = paymentRequest({ reservation_id: 'b', amount: 100 });
    expect(right.key).not.toBe(left.key);
    left.complete(); right.complete();
  });
});
