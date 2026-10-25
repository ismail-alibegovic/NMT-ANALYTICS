import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
vi.mock('../routes/index', async () => {
  const { Router } = await import('express');
  const router = Router();
  router.post('/resource-probe', (req,res) => res.json({ accepted: req.body?.synthetic === true }));
  router.get('/resource-probe/internal', () => { throw new Error('synthetic-provider-secret'); });
  return { default: router };
});
vi.mock('../lib/email/activateSmtpProvider', () => ({ activateSmtpProvider: vi.fn() }));
vi.mock('../middleware/sentry', () => ({
  sentryRequestContext: (_req: unknown,_res: unknown,next: () => void) => next(),
  sentryErrorHandler: (error: unknown,_req: unknown,_res: unknown,next: (err: unknown) => void) => next(error),
  captureHandled: vi.fn(),
}));
import app from '../app';
const secret = 'synthetic-provider-secret';
// Send actual compressed bytes: Superagent's JSON serializer otherwise wraps
// Buffer values as JSON and would test an invalid fixture instead of gzip.
async function sendGzip(body: Buffer): Promise<{ status: number; body: { accepted?: boolean } }> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing isolated test listener');
  try {
    return await new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port: address.port, path: '/api/resource-probe', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': body.length } }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
        res.on('error', reject);
      });
      req.setTimeout(2000, () => req.destroy(new Error('Bounded request timeout')));
      req.on('error', reject); req.end(body);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe('public request body resource and error boundaries', () => {
  it('preserves internal error status and privacy for unrelated failures', async () => {
    const response = await request(app).get('/api/resource-probe/internal');
    expect(response.status).toBe(500); expect(JSON.stringify(response.body)).not.toContain(secret);
  });
  it('rejects malformed JSON as a client error without reflecting body contents', async () => {
    const response = await request(app).post('/api/resource-probe').set('Content-Type','application/json').send(`{"password":"${secret}",`);
    expect(response.status).toBe(400); expect(JSON.stringify(response.body)).not.toContain(secret);
  });
  it('rejects an oversized decompressed body and still accepts the next valid request', async () => {
    const body = gzipSync(Buffer.from(JSON.stringify({ synthetic: true, value: 'a'.repeat(110*1024) })));
    const rejected = await sendGzip(body);
    expect(rejected.status).toBe(413);
    const accepted = await request(app).post('/api/resource-probe').send({ synthetic: true });
    expect(accepted.status).toBe(200); expect(accepted.body.accepted).toBe(true);
  });
  it('rejects an unsupported encoding without reflecting its untrusted name', async () => {
    const response = await request(app).post('/api/resource-probe').set('Content-Type','application/json').set('Content-Encoding',secret).send('{}');
    expect(response.status).toBe(415); expect(JSON.stringify(response.body)).not.toContain(secret);
  });
  it('continues to accept a bounded valid gzip JSON request', async () => {
    const body = gzipSync(Buffer.from('{"synthetic":true}'));
    const response = await sendGzip(body);
    expect(response.status).toBe(200); expect(response.body.accepted).toBe(true);
  });
});
