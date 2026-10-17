import { describe, expect, it } from 'vitest';
import { sanitizeSentryEvent } from '../lib/sentryPrivacy';
describe('telemetry privacy boundary', () => {
  it('removes credentials, personal data and auth URL tokens while preserving stack/type and tenant IDs', () => {
    const event = {
      request: { method: 'POST', url: 'https://example.test/auth/reset-password?code=secret#access_token=secret', headers: { AUTHORIZATION: 'secret', 'x-api-key': 'secret' }, cookies: 'secret', data: { password: 'secret' }, query_string: 'code=secret' },
      user: { id: 'user-id', email: 'private@example.test', ip_address: 'private' },
      tags: { 'tenant.org_id': 'org-id', password: 'secret' },
      extra: { smtp: 'secret' }, contexts: { form: { password: 'secret' } }, message: 'secret',
      breadcrumbs: [{ category: 'http', message: 'secret', data: { body: 'secret' } }],
      exception: { values: [{ type: 'Error', value: 'AUTH secret', stacktrace: { frames: [{ filename: 'https://example.test/app.js?token=secret', vars: { pass: 'secret' } }] } }] },
    };
    const safe = sanitizeSentryEvent(event);
    expect(JSON.stringify(safe)).not.toMatch(/secret|private@example|ip_address/);
    expect(safe.user).toEqual({ id: 'user-id' });
    expect(safe.request).toEqual({ method: 'POST', url: 'https://example.test/auth/reset-password' });
    expect(safe.exception.values[0].type).toBe('Error');
    expect(safe.tags).toEqual({ 'tenant.org_id': 'org-id' });
  });
});
