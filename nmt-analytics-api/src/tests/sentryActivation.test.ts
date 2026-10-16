import { afterEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@sentry/node', () => ({ init: h.init }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('configuration-only monitoring activation', () => {
  it('makes no SDK initialization call without a DSN', async () => {
    vi.resetModules(); vi.stubEnv('SENTRY_DSN', '');
    const m = await import('../instrument'); 
    expect(m.sentryEnabled).toBe(false); expect(h.init).not.toHaveBeenCalled();
  });
  it('enables capture with a privacy hook when a DSN is configured', async () => {
    vi.resetModules(); vi.stubEnv('SENTRY_DSN', 'https://public@example.test/1');
    const m = await import('../instrument'); 
    expect(m.sentryEnabled).toBe(true);
    expect(h.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 0, beforeSend: expect.any(Function) }));
  });
});
