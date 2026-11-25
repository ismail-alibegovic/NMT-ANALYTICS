import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFrom = vi.fn();
const mockLogAction = vi.fn((..._args: any[]) => Promise.resolve());
let currentRole = 'agent';

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
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
  logAuditEntry: (...args: any[]) => mockLogAction(...args),
}));

vi.mock('../lib/aiProviderService', () => ({
  executeOrgAiCompletion: vi.fn(async () => ({
    text: JSON.stringify({
      contactName: 'Haris Kovac',
      phone: '+38761222333',
      email: 'haris@example.com',
      destination: 'Istanbul',
      travelers: 4,
      tripType: 'scheduled_group',
      notes: 'Family trip',
    }),
  })),
}));

import aiActionsRouter from '../routes/aiActions';

describe('M9 AI Drafts & Controlled Human-Approved Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'agent';
  });

  it('rejects viewer role with 403', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiActionsRouter);
    currentRole = 'viewer';

    const res = await request(app)
      .post('/api/ai/proposals')
      .send({ actionType: 'create_inquiry', prompt: 'Haris Kovac Istanbul 4 pax', locale: 'en' });
    expect(res.status).toBe(403);
  });

  it('POST /api/ai/proposals saves draft without mutating business tables', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiActionsRouter);

    const touchedTables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      touchedTables.push(table);
      const chain: any = {
        insert: vi.fn(() => chain),
        select: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: {
            id: 'prop-1',
            org_id: 'org-test-1',
            action_type: 'create_inquiry',
            status: 'draft',
            proposed_payload: { contactName: 'Haris Kovac', destination: 'Istanbul', travelers: 4 },
          },
          error: null,
        })),
      };
      return chain;
    });

    const res = await request(app)
      .post('/api/ai/proposals')
      .send({ actionType: 'create_inquiry', prompt: 'Haris Kovac Istanbul 4 pax', locale: 'en' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(touchedTables).toEqual(['ai_action_proposals']);
  });

  it('confirm executes inquiry insert, logs audit, and replays idempotently when already executed', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiActionsRouter);

    let proposalStatus: 'draft' | 'executed' = 'draft';
    const storedResult = { entityType: 'inquiry', entityId: 'inq-99', route: '/inquiries' };
    let inquiryInsertCount = 0;

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        insert: vi.fn(() => {
          if (table === 'inquiries') inquiryInsertCount++;
          return chain;
        }),
        update: vi.fn(() => {
          proposalStatus = 'executed';
          return chain;
        }),
        single: vi.fn(async () => {
          if (table === 'ai_action_proposals') {
            return {
              data: {
                id: 'prop-1',
                org_id: 'org-test-1',
                action_type: 'create_inquiry',
                status: proposalStatus,
                proposed_payload: { contactName: 'Haris Kovac', travelers: 4 },
                execution_result: proposalStatus === 'executed' ? storedResult : null,
              },
              error: null,
            };
          }
          return { data: { id: 'inq-99', contact_name: 'Haris Kovac Edited', stage: 'new' }, error: null };
        }),
      };
      return chain;
    });

    const first = await request(app)
      .post('/api/ai/proposals/prop-1/confirm')
      .send({
        idempotencyKey: 'idem-key-1234',
        editedPayload: { contactName: 'Haris Kovac Edited', travelers: 5, tripType: 'scheduled_group' },
      });
    expect(first.status).toBe(200);
    expect(first.body.executed).toBe(true);
    expect(first.body.idempotentReplay).toBe(false);
    expect(inquiryInsertCount).toBe(1);
    expect(mockLogAction).toHaveBeenCalled();

    const replay = await request(app)
      .post('/api/ai/proposals/prop-1/confirm')
      .send({ idempotencyKey: 'idem-key-1234' });
    expect(replay.status).toBe(200);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(inquiryInsertCount).toBe(1);
  });
});
