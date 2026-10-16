// Persist only a random request key and non-PII payment intent for ambiguous network retries.
// The reservation UUID scopes intents; the server additionally namespaces every key by organization.
const prefix = 'travline.payment-request.v1:';
const inFlight = new Map<string, string>();
export function paymentRequest(payload: object): { key: string; complete: () => void } {
  const intent = prefix + JSON.stringify(payload, Object.keys(payload).sort());
  let key = inFlight.get(intent);
  if (!key) {
    try { key = sessionStorage.getItem(intent) || undefined; } catch { /* storage unavailable */ }
  }
  if (!key) key = crypto.randomUUID();
  inFlight.set(intent, key);
  try { sessionStorage.setItem(intent, key); } catch { /* in-memory fallback */ }
  return { key, complete: () => {
    inFlight.delete(intent);
    try { sessionStorage.removeItem(intent); } catch { /* storage unavailable */ }
  } };
}
