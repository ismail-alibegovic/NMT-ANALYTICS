import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFrom = vi.fn();
const mockLogAction = vi.fn((..._args: any[]) => Promise.resolve());
const mockExecuteCompletion = vi.fn();
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

vi.mock('../middleware/requireAiEntitlement', () => ({
  requireAiEntitlement: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: any, _res: any, next: any) => next(),
  logAuditEntry: (...args: any[]) => mockLogAction(...args),
}));

vi.mock('../lib/aiProviderService', () => ({
  executeOrgAiCompletion: (...args: any[]) => mockExecuteCompletion(...args),
  parseEncryptedCustomHeaders: () => undefined,
}));

import aiActionsRouter, { extractJsonObject } from '../routes/aiActions';

describe('M9 AI Drafts & Controlled Human-Approved Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = 'agent';
    mockExecuteCompletion.mockResolvedValue({
      text: JSON.stringify({
        contactName: 'Haris Kovac',
        phone: '+38761222333',
        email: 'haris@example.com',
        destination: 'Istanbul',
        travelers: 4,
        tripType: 'scheduled_group',
        notes: 'Family trip',
      }),
    });
  });

  it('extractJsonObject strips <think> tags and fenced markdown before parsing JSON', () => {
    const parsed = extractJsonObject('<think>Plan draft</think>\n```json\n{"name":"Istanbul","basePrice":890}\n```');
    expect(parsed).toEqual({ name: 'Istanbul', basePrice: 890 });
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

  it('rejects agent role for create_package_draft (requires manager+)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiActionsRouter);
    currentRole = 'agent';

    const res = await request(app)
      .post('/api/ai/proposals')
      .send({ actionType: 'create_package_draft', prompt: 'Istanbul 5 days', locale: 'en' });
    expect(res.status).toBe(403);
  });

  it('saves incomplete create_package_draft with missingFields without inventing basePrice, then executes package creation on confirm', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiActionsRouter);
    currentRole = 'manager';

    mockExecuteCompletion.mockResolvedValueOnce({
      text: '<think>reasoning</think>```json\n{"name":"Istanbul Proljece","destination":"Istanbul","durationDays":"5","basePrice":null,"currency":"BAM"}\n```',
    });

    let insertedPackage: any = null;
    let proposalStatus: 'draft' | 'executed' = 'draft';
    const storedDraft = {
      name: 'Istanbul Proljece',
      destination: 'Istanbul',
      durationDays: 5,
      basePrice: null,
      currency: 'BAM',
    };

    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        insert: vi.fn((row: any) => {
          if (table === 'packages') insertedPackage = row;
          return chain;
        }),
        update: vi.fn(() => {
          proposalStatus = 'executed';
          return chain;
        }),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'prop-pkg-1',
            org_id: 'org-test-1',
            action_type: 'create_package_draft',
            status: 'executed',
            proposed_payload: storedDraft,
          },
          error: null,
        })),
        single: vi.fn(async () => {
          if (table === 'packages') {
            return { data: { id: 'pkg-100', name: 'Istanbul Proljece', destination: 'Istanbul' }, error: null };
          }
          return {
            data: {
              id: 'prop-pkg-1',
              org_id: 'org-test-1',
              action_type: 'create_package_draft',
              status: proposalStatus,
              proposed_payload: storedDraft,
              missing_fields: ['basePrice'],
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            },
            error: null,
          };
        }),
      };
      return chain;
    });

    const createRes = await request(app)
      .post('/api/ai/proposals')
      .send({ actionType: 'create_package_draft', prompt: 'Istanbul Proljece 5 dana', locale: 'bs' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.missingFields).toEqual(['basePrice']);
    expect(insertedPackage).toBeNull();

    // Confirming without supplying basePrice returns 400 validation error
    const incompleteConfirm = await request(app)
      .post('/api/ai/proposals/prop-pkg-1/confirm')
      .send({ idempotencyKey: 'idem-pkg-1' });
    expect(incompleteConfirm.status).toBe(400);

    // Confirming with basePrice creates package and logs audit
    const okConfirm = await request(app)
      .post('/api/ai/proposals/prop-pkg-1/confirm')
      .send({
        idempotencyKey: 'idem-pkg-1',
        editedPayload: { ...storedDraft, basePrice: 890 },
      });
    expect(okConfirm.status).toBe(200);
    expect(okConfirm.body.executed).toBe(true);
    expect(okConfirm.body.result.route).toBe('/packages/pkg-100');
    expect(insertedPackage.base_price).toBe(890);
    expect(mockLogAction).toHaveBeenCalled();
  });

  it('rejects expired proposal on confirm with 410 PROPOSAL_EXPIRED', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', aiActionsRouter);

    mockFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: {
            id: 'prop-expired',
            org_id: 'org-test-1',
            action_type: 'create_inquiry',
            status: 'draft',
            proposed_payload: { contactName: 'Test', travelers: 2, tripType: 'other' },
            expires_at: new Date(Date.now() - 60_000).toISOString(),
          },
          error: null,
        })),
      };
      return chain;
    });

    const res = await request(app)
      .post('/api/ai/proposals/prop-expired/confirm')
      .send({ idempotencyKey: 'idem-exp-1' });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('PROPOSAL_EXPIRED');
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
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'prop-1',
            org_id: 'org-test-1',
            action_type: 'create_inquiry',
            status: 'executed',
            proposed_payload: { contactName: 'Haris Kovac', travelers: 4 },
            execution_result: storedResult,
          },
          error: null,
        })),
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
