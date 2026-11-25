import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFrom = vi.fn();
let currentRole = 'manager';

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

import aiRouter from '../routes/ai';

describe('M8 Executive Signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'manager';
  });

  it('rejects agent role with 403', async () => {
    const app = express();
    app.use('/api', aiRouter);
    currentRole = 'agent';

    const res = await request(app).get('/api/ai/signals');
    expect(res.status).toBe(403);
  });

  it('computes deterministic low_occupancy_departures, open_balance_reservations, and stale_inquiries', async () => {
    const app = express();
    app.use('/api', aiRouter);

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => {
          if (table === 'departures') {
            return {
              data: [{ id: 'dep-1', depart_at: '2026-12-05', capacity: 40, status: 'scheduled', packages: { name: 'Istanbul' } }],
              error: null,
            };
          }
          if (table === 'reservations') {
            return {
              data: [{ id: 'res-1', departure_id: 'dep-1', party_size: 4, balance_due: 500, currency: 'BAM', status: 'confirmed', customer_name: 'Amir' }],
              error: null,
            };
          }
          if (table === 'inquiries') {
            return {
              data: [{ id: 'inq-1', contact_name: 'Lejla', stage: 'new', updated_at: '2026-11-01T10:00:00Z' }],
              error: null,
            };
          }
          return { data: [], error: null };
        }),
      };
      return chain;
    });

    const res = await request(app).get('/api/ai/signals');
    expect(res.status).toBe(200);
    expect(res.body.signals).toHaveLength(3);
    const lowOcc = res.body.signals.find((s: any) => s.key === 'low_occupancy_departures');
    const openBal = res.body.signals.find((s: any) => s.key === 'open_balance_reservations');
    const stale = res.body.signals.find((s: any) => s.key === 'stale_inquiries');
    expect(lowOcc.count).toBe(1);
    expect(lowOcc.items[0].occupancyPct).toBe(10);
    expect(openBal.count).toBe(1);
    expect(stale.count).toBe(1);
  });
});
