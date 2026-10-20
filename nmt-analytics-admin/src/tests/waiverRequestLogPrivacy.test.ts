import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ logs: [] as string[] }));
vi.mock('../utils/logger', () => ({ logger: {
  log: (...args: unknown[]) => state.logs.push(JSON.stringify(args)),
  warn: vi.fn(), error: vi.fn(), debugError: vi.fn(),
} }));
vi.mock('../lib/sentry', () => ({ captureError: vi.fn() }));
vi.mock('../lib/authSession', () => ({ handleExpiredSession: vi.fn(), markSessionEstablished: vi.fn() }));
import api from '../lib/apiClient';

it('redacts capabilities and bearer fragments from client request logs without changing the request', async () => {
  const token = 'a'.repeat(48), bearer = 'SyntheticBearerCapabilityShouldNeverBeLogged';
  const path = '/public/waiver/' + token + '?source=private-query-value';
  localStorage.setItem('nmt_auth_token', bearer);
  const previousAdapter = api.defaults.adapter;
  let sent: any;
  state.logs = [];
  try {
    api.defaults.adapter = async config => {
      sent = config; return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };
    await api.get(path);
    expect(sent.url).toBe(path);
    expect(sent.headers.Authorization).toBe('Bearer ' + bearer);
    const logs = state.logs.join(' ');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(bearer.slice(0, 20));
    expect(logs).not.toContain('private-query-value');
    expect(logs).toContain('/public/waiver/[redacted]');
  } finally {
    api.defaults.adapter = previousAdapter;
    localStorage.removeItem('nmt_auth_token');
  }
});
