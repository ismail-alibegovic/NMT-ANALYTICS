import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const h = vi.hoisted(() => ({ signUp: vi.fn(), client: vi.fn(), from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: h.client }));
vi.mock('../lib/supabase', () => ({ supabaseAdmin: { from: h.from } }));
vi.mock('../middleware/auditLogger', () => ({ auditLog: () => (_req: any, _res: any, next: any) => next() }));
import signup from '../routes/signup';
import { signupRedirectUrl } from '../lib/authSignup';
const payload = { email: 'new@example.test', password: 'long-password', org_name: 'Pilot Agency' };
function app() { const a = express(); a.use(express.json()); a.use(signup); return a; }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ADMIN_URL', 'https://travline.example.test');
  h.client.mockReturnValue({ auth: { signUp: h.signUp } });
  const q: any = { select: () => q, eq: () => q, single: async () => ({ data: null }) };
  h.from.mockReturnValue(q);
});
afterEach(() => vi.unstubAllEnvs());
describe('Auth SMTP readiness', () => {
  it('uses normal signup and a server-owned redirect without returning a session', async () => {
    h.signUp.mockResolvedValue({ data: { user: { id: 'u', email: payload.email, identities: [{}] }, session: null }, error: null });
    const res = await request(app()).post('/auth/signup').send({ ...payload, redirectTo: 'https://attacker.test' });
    expect(res.status).toBe(201);
    expect(res.body.confirmationRequired).toBe(true);
    expect(res.body.session).toBeUndefined();
    expect(h.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: 'https://travline.example.test/auth/signin', data: {} } }));
    expect(h.client).toHaveBeenCalledWith(expect.any(String), expect.any(String), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  });
  it('does not mutate organizations for an obfuscated existing user response', async () => {
    h.signUp.mockResolvedValue({ data: { user: { id: 'fake', identities: [] }, session: null }, error: null });
    expect((await request(app()).post('/auth/signup').send(payload)).status).toBe(201);
    expect(h.from).not.toHaveBeenCalled();
  });
  it('does not return provider secrets on signup failure', async () => {
    h.signUp.mockResolvedValue({ data: {}, error: { message: 'SMTP AUTH secret-password' } });
    const res = await request(app()).post('/auth/signup').send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('secret-password');
  });
  it('requires an approved HTTPS origin in production', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('ADMIN_URL', 'http://unsafe.test');
    expect(() => signupRedirectUrl()).toThrow('AUTH_REDIRECT_INVALID');
  });
});
