import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFrom = vi.fn();
const mockExecuteCompletion = vi.fn();
let currentRole = 'agent';

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: currentRole };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = 'org-test-1';
    next();
  },
}));

vi.mock('../middleware/requireModule', () => ({
  requireModule: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/requireAiEntitlement', () => ({
  requireAiEntitlement: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/aiProviderService', () => ({
  executeOrgAiCompletion: (...args: any[]) => mockExecuteCompletion(...args),
}));

import aiRouter from '../routes/ai';

function setupSnapshotMocks() {
  mockFrom.mockImplementation((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(async () => {
        if (table === 'departures') {
          return {
            data: [{ id: 'dep-1', depart_at: '2026-12-01', capacity: 40, status: 'scheduled', packages: { name: 'Istanbul', destination: 'Turkey' } }],
            error: null,
          };
        }
        if (table === 'reservations') {
          return {
            data: [{ id: 'res-1', balance_due: 300, currency: 'BAM', status: 'confirmed' }],
            error: null,
          };
        }
        return { data: [], error: null };
      }),
    };
    return chain;
  });
}

describe('M7 Read-Only Travline AI Assistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'agent';
    setupSnapshotMocks();
  });

  it('rejects viewer role with 403', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiRouter);
    currentRole = 'viewer';

    const res = await request(app).post('/api/ai/assistant').send({ question: 'How many departures?', locale: 'en' });
    expect(res.status).toBe(403);
  });

  it('returns 503 NO_ACTIVE_AI_PROVIDER when no provider is configured', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiRouter);
    mockExecuteCompletion.mockRejectedValueOnce(new Error('NO_ACTIVE_AI_PROVIDER'));

    const res = await request(app).post('/api/ai/assistant').send({ question: 'Upcoming departures?', locale: 'en' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_ACTIVE_AI_PROVIDER');
  });

  it('redacts financialSummary for agent and includes it for manager', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiRouter);
    mockExecuteCompletion.mockResolvedValue({
      text: 'Grounded answer',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      usage: { promptTokens: 50, completionTokens: 15, totalTokens: 65 },
      latencyMs: 120,
    });

    currentRole = 'agent';
    const agentRes = await request(app).post('/api/ai/assistant').send({ question: 'Status?', locale: 'en' });
    expect(agentRes.status).toBe(200);
    expect(agentRes.body.roleScope).toBe('operational');
    expect(mockExecuteCompletion.mock.calls[0][3].messages[0].content).not.toContain('totalOpenBalanceByCurrency');

    currentRole = 'manager';
    const mgrRes = await request(app).post('/api/ai/assistant').send({ question: 'Open balances?', locale: 'en' });
    expect(mgrRes.status).toBe(200);
    expect(mgrRes.body.roleScope).toBe('full_financial');
    expect(mockExecuteCompletion.mock.calls[1][3].messages[0].content).toContain('totalOpenBalanceByCurrency');
  });
});
