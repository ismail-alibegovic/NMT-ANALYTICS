import { expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import { config } from '../config';
it('keeps unknown API routes JSON and protected context anonymous-safe', async () => {
  const missing = await request(app).get('/api/release-verification-missing');
  expect(missing.status).toBe(404);
  expect(missing.headers['content-type']).toContain('application/json');
  const protectedResponse = await request(app).get('/api/me/context');
  expect(protectedResponse.status).toBe(401);
  expect(protectedResponse.headers['content-type']).toContain('application/json');
});
it('allows configured-origin preflight without trusting arbitrary origins', async () => {
  const allowed = await request(app).options('/api/reservations')
    .set('Origin', config.ADMIN_URL).set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
  expect(allowed.status).toBe(200);
  expect(allowed.headers['access-control-allow-origin']).toBe(config.ADMIN_URL);
  expect(allowed.headers['access-control-allow-credentials']).toBe('true');
  const denied = await request(app).options('/api/reservations')
    .set('Origin', 'https://untrusted.example.test').set('Access-Control-Request-Method', 'POST');
  expect(denied.status).not.toBe(500);
  expect(denied.headers['access-control-allow-origin']).toBeUndefined();
});
