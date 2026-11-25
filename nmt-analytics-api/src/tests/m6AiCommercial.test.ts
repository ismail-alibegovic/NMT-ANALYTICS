import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.AI_SECRETS_ENCRYPTION_KEY = 'test-master-key-for-m6-commercial-tests!';

const mockFrom = vi.fn();
let currentRole = 'director';
let currentUserId = 'user-1';

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
  handleSupabaseError: vi.fn((res: any, err: any) => res.status(500).json({ error: err?.message || 'db error' })),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: currentUserId, role: currentRole };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = 'org-test-1';
    next();
  },
}));

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

import aiProvidersRouter from '../routes/aiProviders';
import { resolveActiveAiProvider } from '../lib/aiProviderService';
import { encryptSecret } from '../lib/secretVault';

describe('M6 AI Commercial Architecture & Provider Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'director';
    currentUserId = 'user-1';
  });

  it('platform routes reject non-platform-admin users with 403', async () => {
    const app = express();
    app.use('/api', aiProvidersRouter);

    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      return chain;
    });

    const res = await request(app).get('/api/platform/ai-providers');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLATFORM_ADMIN_REQUIRED');
  });

  it('POST /api/ai-providers rejects SSRF baseUrl and encrypts valid keys without returning plaintext', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiProvidersRouter);

    const insertedPayloads: any[] = [];
    mockFrom.mockImplementation(() => {
      const chain: any = {
        insert: vi.fn((payload: any) => {
          insertedPayloads.push(payload);
          return chain;
        }),
        select: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: {
            id: 'prov-1',
            scope: 'org',
            org_id: 'org-test-1',
            provider_type: 'openai',
            display_name: 'Agency OpenAI',
            base_url: null,
            key_hint: 'sk-l...7890',
            default_model: 'gpt-4o-mini',
            is_active: true,
            priority: 100,
            created_at: '2026-11-25T10:00:00Z',
            updated_at: '2026-11-25T10:00:00Z',
          },
          error: null,
        })),
      };
      return chain;
    });

    const badRes = await request(app).post('/api/ai-providers').send({
      providerType: 'openai_compatible',
      displayName: 'Bad Local',
      baseUrl: 'https://127.0.0.1/v1',
      apiKey: 'sk-live-1234567890',
      defaultModel: 'llama-3',
    });
    expect(badRes.status).toBe(400);
    expect(badRes.body.code).toBe('INVALID_BASE_URL');

    const okRes = await request(app).post('/api/ai-providers').send({
      providerType: 'openai',
      displayName: 'Agency OpenAI',
      apiKey: 'sk-live-1234567890',
      defaultModel: 'gpt-4o-mini',
    });
    expect(okRes.status).toBe(201);
    expect(okRes.body.keyHint).toBe('sk-l...7890');
    expect(okRes.body.encrypted_api_key).toBeUndefined();
    expect(insertedPayloads[0].encrypted_api_key.startsWith('v1:')).toBe(true);
    expect(insertedPayloads[0].encrypted_api_key).not.toContain('sk-live-1234567890');
  });

  it('resolveActiveAiProvider prefers org BYOK provider over platform fallback', async () => {
    const orgCipher = encryptSecret('sk-org-key-1234567890');
    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => ({
          data: [
            {
              id: 'prov-org-1',
              scope: 'org',
              provider_type: 'gemini',
              base_url: null,
              encrypted_api_key: orgCipher,
              default_model: 'gemini-2.5-flash',
              priority: 10,
            },
          ],
          error: null,
        })),
      };
      return chain;
    });

    const resolved = await resolveActiveAiProvider('org-test-1');
    expect(resolved?.id).toBe('prov-org-1');
    expect(resolved?.scope).toBe('org');
    expect(resolved?.apiKey).toBe('sk-org-key-1234567890');
  });
});
