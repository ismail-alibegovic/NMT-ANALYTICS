import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
let currentRole = 'director';

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
  handleSupabaseError: vi.fn((res: any, err: any) => res.status(500).json({ error: err?.message || 'db error' })),
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

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
}));

import departureProfitabilityRouter from '../routes/departureProfitability';
import inquiriesRouter from '../routes/inquiries';
import aiRouter from '../routes/ai';

describe('M3 Business Logic & Security Fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'director';
  });

  it('departureProfitability scopes payments query by .in(reservation_id)', async () => {
    const app = express();
    app.use('/api', departureProfitabilityRouter);

    const inCalls: Array<[string, any[]]> = [];
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn((col: string, vals: any[]) => {
          inCalls.push([col, vals]);
          return chain;
        }),
        order: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: table === 'departures' ? { id: '11111111-1111-4111-8111-111111111111', org_id: 'org-test-1', depart_at: '2026-07-01', packages: { currency: 'BAM' } } : null,
          error: null,
        })),
        maybeSingle: vi.fn(async () => ({
          data: table === 'departures' ? { id: '11111111-1111-4111-8111-111111111111', org_id: 'org-test-1', depart_at: '2026-07-01', packages: { currency: 'BAM' } } : null,
          error: null,
        })),
        then: (resolve: any, reject: any) => {
          if (table === 'reservations') {
            return Promise.resolve({ data: [{ id: 'res-10', total_amount: 1000, currency: 'BAM', status: 'confirmed' }], error: null }).then(resolve, reject);
          }
          if (table === 'payments') {
            return Promise.resolve({ data: [{ id: 'pay-1', reservation_id: 'res-10', amount: 400, currency: 'BAM', status: 'succeeded' }], error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return chain;
    });
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await request(app).get('/api/departures/11111111-1111-4111-8111-111111111111/profitability');
    expect(res.status).toBe(200);
    expect(inCalls).toContainEqual(['reservation_id', ['res-10']]);
  });

  it('inquiries PATCH accepts source=public_form and returns sourceMetadata', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', inquiriesRouter);

    mockFrom.mockImplementation(() => {
      const chain: any = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        select: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: {
            id: 'inq-1',
            contact_name: 'Amir',
            trip_type: 'scheduled_group',
            stage: 'qualified',
            source: 'public_form',
            source_metadata: { formSlug: 'istanbul-2026' },
            travelers: 2,
            budget: null,
            currency: 'BAM',
          },
          error: null,
        })),
      };
      return chain;
    });

    const res = await request(app).patch('/api/inquiries/inq-1').send({ source: 'public_form', stage: 'qualified' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('public_form');
    expect(res.body.sourceMetadata).toEqual({ formSlug: 'istanbul-2026' });
  });

  it('ai routes reject agent role with 403', async () => {
    const app = express();
    app.use('/api', aiRouter);
    currentRole = 'agent';

    const res = await request(app).get('/api/ai/revenue-down?from=2026-01-01&to=2026-01-31');
    expect(res.status).toBe(403);
  });
});
