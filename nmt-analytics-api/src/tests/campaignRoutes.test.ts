import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { previewCampaignAudience, sendCampaign } = vi.hoisted(() => ({
  previewCampaignAudience: vi.fn(async () => ({
    audienceType: 'customers' as const,
    totalCandidates: 2,
    uniqueRecipients: 1,
    sendableRecipients: 1,
    skippedEmpty: 0,
    skippedInvalid: 1,
    skippedDuplicates: 0,
    sampleRecipients: ['guest@example.com'],
    skipped: [],
    recipients: [{ recipient: 'guest@example.com' }],
  })),
  sendCampaign: vi.fn(async () => ({
    status: 'completed' as const,
    sentCount: 1,
    failedCount: 0,
    skippedCount: 0,
    totalRecipients: 1,
    preview: {
      audienceType: 'customers' as const,
      totalCandidates: 1,
      uniqueRecipients: 1,
      sendableRecipients: 1,
      skippedEmpty: 0,
      skippedInvalid: 0,
      skippedDuplicates: 0,
      sampleRecipients: ['guest@example.com'],
      skipped: [],
      recipients: [{ recipient: 'guest@example.com' }],
    },
    sentAt: '2026-08-24T12:00:00.000Z',
  })),
}));

import campaignsRoutes from '../routes/campaigns';

let currentOrgId = 'org-1';
let campaigns = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    org_id: 'org-1',
    name: 'Draft email',
    channel: 'email',
    subject: 'Subject',
    body: 'Body',
    status: 'draft',
    created_at: '2026-08-24T08:00:00.000Z',
    sent_at: null,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    org_id: 'org-2',
    name: 'Other org',
    channel: 'sms',
    subject: null,
    body: 'Body',
    status: 'draft',
    created_at: '2026-08-23T08:00:00.000Z',
    sent_at: null,
  },
];

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = currentOrgId;
    next();
  },
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/campaigns', async () => {
  const actual = await vi.importActual<any>('../lib/campaigns');
  return {
    ...actual,
    previewCampaignAudience,
    sendCampaign,
  };
});

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'campaigns') throw new Error(`Unhandled table: ${table}`);
      const filters: Record<string, any> = {};
      let orderKey = 'created_at';
      let ascending = false;
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        order: vi.fn((column: string, opts?: any) => {
          orderKey = column;
          ascending = !!opts?.ascending;
          return builder;
        }),
        insert: vi.fn((payload: any) => {
          const inserted = {
            id: '33333333-3333-4333-8333-333333333333',
            created_at: '2026-08-24T10:00:00.000Z',
            sent_at: null,
            ...payload,
          };
          campaigns = [inserted, ...campaigns];
          return {
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
            }),
          };
        }),
        update: vi.fn((updates: any) => ({
          eq: vi.fn((column: string, value: any) => {
            filters[column] = value;
            return {
              eq: vi.fn((column2: string, value2: any) => {
                filters[column2] = value2;
                return {
                  select: vi.fn(() => ({
                    single: async () => {
                      const row = campaigns.find((item) => item.id === filters.id && item.org_id === filters.org_id);
                      if (!row) return { data: null, error: { code: 'PGRST116' } };
                      Object.assign(row, updates);
                      return { data: row, error: null };
                    },
                  })),
                };
              }),
            };
          }),
        })),
        single: vi.fn(async () => {
          const row = campaigns.find((item) => Object.entries(filters).every(([k, v]) => (item as any)[k] === v));
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
        }),
        then: undefined,
      };

      builder.then = async (resolve: any) => {
        let filtered = campaigns.filter((row) => Object.entries(filters).every(([k, v]) => (row as any)[k] === v));
        filtered = [...filtered].sort((a, b) => ascending
          ? String((a as any)[orderKey]).localeCompare(String((b as any)[orderKey]))
          : String((b as any)[orderKey]).localeCompare(String((a as any)[orderKey])));
        return resolve({ data: filtered, error: null });
      };

      return builder;
    }),
  },
}));

function app() {
  const app = express();
  app.use(express.json());
  app.use('/settings', campaignsRoutes);
  return app;
}

describe('campaign routes', () => {
  beforeEach(() => {
    currentOrgId = 'org-1';
    campaigns = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        org_id: 'org-1',
        name: 'Draft email',
        channel: 'email',
        subject: 'Subject',
        body: 'Body',
        status: 'draft',
        created_at: '2026-08-24T08:00:00.000Z',
        sent_at: null,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        org_id: 'org-2',
        name: 'Other org',
        channel: 'sms',
        subject: null,
        body: 'Body',
        status: 'draft',
        created_at: '2026-08-23T08:00:00.000Z',
        sent_at: null,
      },
    ];
    previewCampaignAudience.mockClear();
    sendCampaign.mockClear();
  });

  it('lists org-scoped campaigns', async () => {
    const res = await request(app()).get('/settings/campaigns');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].org_id).toBe('org-1');
  });

  it('creates a campaign draft', async () => {
    const res = await request(app()).post('/settings/campaigns').send({
      name: 'Launch',
      channel: 'email',
      subject: 'Subject',
      body: 'Body',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  it('updates a draft campaign', async () => {
    const res = await request(app()).patch('/settings/campaigns/11111111-1111-4111-8111-111111111111').send({
      body: 'Updated body',
    });
    expect(res.status).toBe(200);
    expect(res.body.body).toBe('Updated body');
  });

  it('keeps org isolation on update', async () => {
    currentOrgId = 'org-2';
    const res = await request(app()).patch('/settings/campaigns/11111111-1111-4111-8111-111111111111').send({
      body: 'No access',
    });
    expect(res.status).toBe(404);
  });

  it('previews audience counts', async () => {
    const res = await request(app()).post('/settings/campaigns/11111111-1111-4111-8111-111111111111/preview').send({
      audienceType: 'customers',
      customerIds: ['00000000-0000-4000-8000-000000000001'],
    });

    expect(res.status).toBe(200);
    expect(previewCampaignAudience).toHaveBeenCalled();
    expect(res.body.sendableRecipients).toBe(1);
  });

  it('sends a campaign and returns final status', async () => {
    const res = await request(app()).post('/settings/campaigns/11111111-1111-4111-8111-111111111111/send').send({
      audienceType: 'customers',
      customerIds: ['00000000-0000-4000-8000-000000000001'],
    });

    expect(res.status).toBe(200);
    expect(sendCampaign).toHaveBeenCalled();
    expect(res.body.status).toBe('completed');
  });
});
