import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../app';

// Header assertions must not perform network/database connectivity checks.
// Real health connectivity remains covered by the disposable acceptance stack.
vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }) },
  supabase: {}, handleSupabaseError: vi.fn(),
}));

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
