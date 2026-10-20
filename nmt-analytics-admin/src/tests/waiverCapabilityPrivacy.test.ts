import { describe, expect, it } from 'vitest';
import { redactCapabilityPath, sanitizeSentryEvent } from '../lib/sentryPrivacy';
describe('waiver capability privacy', () => {
  const secret = 'a'.repeat(48);
  it.each(['/waiver/', '/public/waiver/', '/api/public/waiver/'])('redacts tokens from %s in request, transaction and stack URLs', prefix => {
    const path = prefix + secret + '/sign?secret=query#fragment';
    expect(redactCapabilityPath(path)).toBe(prefix + '[redacted]/sign');
    const event = sanitizeSentryEvent({
      request: { method: 'POST', url: 'https://example.test' + path },
      transaction: 'POST ' + path,
      exception: { values: [{ stacktrace: { frames: [{ filename: 'https://example.test' + path }] } }] },
    });
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(JSON.stringify(event)).not.toContain('query');
    expect(event.request.url).toContain('[redacted]/sign');
  });
  it('keeps ordinary resource IDs for diagnostics while removing URL query values', () => {
    expect(redactCapabilityPath('/api/reservations/record-id?search=private')).toBe('/api/reservations/record-id');
  });
});
