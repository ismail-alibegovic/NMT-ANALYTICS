import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { NodeClient, defaultStackParser } from '@sentry/node';
import { sanitizeSentryEvent } from '../lib/sentryPrivacy';
import { requestId, requestLogging } from '../middleware/logging';
afterEach(() => vi.restoreAllMocks());
it('observes auth and handled finance failures without caller secrets', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const app = express(); app.use(requestId, requestLogging);
  app.get('/api/payments/:token', (_req, res) => res.status(503).json({ error: 'private-response' }));
  app.get('/api/protected', (_req, res) => res.sendStatus(401));
  const response = await request(app).get('/api/payments/private-capability?password=private-query').set('x-request-id', 'private-header');
  await request(app).get('/api/protected');
  expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  const output = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
  expect(output).not.toContain('private-');
  expect(output).toContain('/api/payments/:token');
  const events = warn.mock.calls.map(([entry]) => JSON.parse(entry));
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ event: 'http_failure', area: 'finance', status: 503 }),
    expect.objectContaining({ event: 'http_failure', status: 401 }),
  ]));
});
it('delivers a sanitized event through the real Sentry SDK to an in-memory transport', async () => {
  const envelopes: unknown[] = [];
  const client = new NodeClient({
    dsn: 'https://synthetic@example.test/1', integrations: [], stackParser: defaultStackParser,
    beforeSend: sanitizeSentryEvent, sendDefaultPii: false,
    transport: () => ({ send: async envelope => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
  });
  client.captureEvent({ message: 'private-password', exception: { values: [{ type: 'SyntheticError', value: 'private-passenger' }] },
    request: { url: 'https://example.test/waiver/private-capability?token=private-query', headers: { authorization: 'private-token' }, data: 'private-payment' },
    tags: { 'operation.area': 'finance', 'http.status_code': '503', password: 'private-secret' },
  });
  expect(await client.flush(2000)).toBe(true);
  expect(envelopes).toHaveLength(1);
  const output = JSON.stringify(envelopes);
  expect(output).not.toContain('private-');
  expect(output).toContain('SyntheticError');
  expect(output).toContain('finance');
  await client.close();
});

it('never logs database error row details or caller context', async () => {
  const { handleSupabaseError } = await import('../lib/supabase');
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  handleSupabaseError(response as any, { code: '23505', message: 'private-passenger', details: 'private-payment' }, 'private-context');
  expect(error).toHaveBeenCalledWith(JSON.stringify({ event: 'database_failure', code: '23505', category: 'database' }));
  expect(JSON.stringify(error.mock.calls)).not.toContain('private-');
});

it('retains safe provider codes and transport classification without raw errors', async () => {
  const { handleSupabaseError } = await import('../lib/supabase');
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  handleSupabaseError(response as any, { code: 'PGRST116', message: 'private-row' });
  handleSupabaseError(response as any, { code: '', message: 'TypeError: fetch failed', details: 'private-url-token' });
  handleSupabaseError(response as any, { code: 'private-code', message: 'private-passenger' });
  expect(error.mock.calls.map(([entry]) => JSON.parse(entry))).toEqual([
    { event: 'database_failure', code: 'PGRST116', category: 'database' },
    { event: 'database_failure', code: 'DATABASE_ERROR', category: 'transport' },
    { event: 'database_failure', code: 'DATABASE_ERROR', category: 'unknown' },
  ]);
  expect(JSON.stringify(error.mock.calls)).not.toContain('private-');
});
