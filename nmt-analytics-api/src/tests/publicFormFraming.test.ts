import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('public form iframe embedding headers', () => {
  it('does not send X-Frame-Options for the public form page', async () => {
    const res = await request(app).get('/public/forms/summer-trips?embed=1');
    expect(res.headers['x-frame-options']).toBeUndefined();
  });

  it('keeps clickjacking protection on other routes', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    const login = await request(app).get('/login');
    expect(login.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
