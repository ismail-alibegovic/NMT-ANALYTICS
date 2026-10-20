import { expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestId, requestLogging } from '../middleware/logging';
it('never writes a public consent capability to access logs', async () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const app = express(); app.use(requestId, requestLogging);
    app.post('/api/public/waiver/:token/sign', (_req, res) => res.json({ ok: true }));
    const token = 'b'.repeat(48);
    const result = await request(app).post('/api/public/waiver/' + token + '/sign');
    expect(result.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    const logs = spy.mock.calls.flat().join(' ');
    expect(logs).not.toContain(token);
    expect(logs).toContain('/api/public/waiver/[redacted]/sign');
  } finally { spy.mockRestore(); }
});
