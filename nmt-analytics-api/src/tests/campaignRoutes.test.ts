import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { previewCampaignAudienceMock, sendCampaignMock } = vi.hoisted(() => ({
  previewCampaignAudienceMock: vi.fn(),
  sendCampaignMock: vi.fn(),
}));

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));

let currentOrgId = 'org-1';

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
    previewCampaignAudience: (...args: any[]) => previewCampaignAudienceMock(...args),
    sendCampaign: (...args: any[]) => sendCampaignMock(...args),
  };
});

let campaigns: any[] = [];
let templates: any[] = [];

function applyFilters(rows: any[], filters: Record<string, any>) {
  return rows.filter((item) => Object.entries(filters).every(([key, value]) => item[key] === value));
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};
      let orderKey = 'created_at';
      let ascending = false;

      const rows = () => {
        if (table === 'campaigns') return campaigns;
        if (table === 'message_templates') return templates;
        throw new Error(`Unhandled table: ${table}`);
      };

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
            created_at: '2026-08-28T10:00:00.000Z',
            updated_at: '2026-08-28T10:00:00.000Z',
            sent_at: null,
            ...payload,
          };
          campaigns.unshift(inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
            }),
          };
        }),
        update: vi.fn((updates: any) => {
          const updateFilters: Record<string, any> = {};
          const updateBuilder: any = {
            eq: vi.fn((column: string, value: any) => {
              updateFilters[column] = value;
              return updateBuilder;
            }),
            select: vi.fn(() => ({
              single: async () => {
                const row = campaigns.find((item) =>
                  Object.entries(updateFilters).every(([key, value]) => item[key] === value),
                );
                if (!row) return { data: null, error: { code: 'PGRST116' } };
                Object.assign(row, updates);
                return { data: row, error: null };
              },
            })),
            then: async (resolve: any) => {
              const matched = campaigns.filter((item) =>
                Object.entries(updateFilters).every(([key, value]) => item[key] === value),
              );
              matched.forEach((row) => Object.assign(row, updates));
              return resolve({ data: matched, error: null });
            },
          };
          return updateBuilder;
        }),
        delete: vi.fn(() => {
          const deleteFilters: Record<string, any> = {};
          const deleteBuilder: any = {
            eq: vi.fn((column: string, value: any) => {
              deleteFilters[column] = value;
              return deleteBuilder;
            }),
            then: async (resolve: any) => {
              const before = campaigns.length;
              campaigns = campaigns.filter((item) =>
                !Object.entries(deleteFilters).every(([key, value]) => item[key] === value),
              );
              return resolve({ data: null, error: before === campaigns.length ? { code: 'PGRST116' } : null });
            },
          };
          return deleteBuilder;
        }),
        single: vi.fn(async () => {
          const row = rows().find((item) => Object.entries(filters).every(([key, value]) => item[key] === value));
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
        }),
        then: undefined,
      };

      builder.then = async (resolve: any) => {
        const filtered = [...applyFilters(rows(), filters)].sort((a, b) =>
          ascending
            ? String(a[orderKey]).localeCompare(String(b[orderKey]))
            : String(b[orderKey]).localeCompare(String(a[orderKey])),
        );
        return resolve({ data: filtered, error: null });
      };

      return builder;
    }),
  },
}));

import campaignsRoutes from '../routes/campaigns';

function app() {
  const app = express();
  app.use(express.json());
  app.use('/settings', campaignsRoutes);
  return app;
}

const draftId = '11111111-1111-4111-8111-111111111111';
const otherOrgId = '22222222-2222-4222-8222-222222222222';

describe('campaign routes', () => {
  beforeEach(() => {
    currentOrgId = 'org-1';
    previewCampaignAudienceMock.mockReset();
    sendCampaignMock.mockReset();
    previewCampaignAudienceMock.mockResolvedValue({
      audienceType: 'all',
      totalCandidates: 3,
      uniqueRecipients: 2,
      sendableRecipients: 2,
      skippedEmpty: 0,
      skippedInvalid: 1,
      skippedDuplicates: 0,
      sampleRecipients: ['guest@example.com'],
      skipped: [{ recipient: 'bad@example.com', reason: 'invalid_recipient' }],
      recipients: [{ recipient: 'guest@example.com' }],
    });
    sendCampaignMock.mockResolvedValue({
      status: 'completed',
      sentCount: 2,
      failedCount: 0,
      skippedCount: 1,
      totalRecipients: 2,
      sentAt: '2026-08-29T00:00:00.000Z',
      preview: {
        audienceType: 'all',
        totalCandidates: 3,
        uniqueRecipients: 2,
        sendableRecipients: 2,
        skippedEmpty: 0,
        skippedInvalid: 1,
        skippedDuplicates: 0,
        sampleRecipients: ['guest@example.com'],
      },
    });
    campaigns = [
      {
        id: draftId,
        org_id: 'org-1',
        name: 'Draft email',
        channel: 'email',
        template_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        subject: 'Subject',
        body: 'Body {{customerName}}',
        audience_type: 'all',
        audience_data: {},
        status: 'draft',
        recipient_count: 7,
        created_at: '2026-08-24T08:00:00.000Z',
        updated_at: '2026-08-24T09:00:00.000Z',
        sent_at: null,
      },
      {
        id: otherOrgId,
        org_id: 'org-2',
        name: 'Other org',
        channel: 'sms',
        template_id: null,
        subject: null,
        body: 'Body',
        audience_type: 'all',
        audience_data: {},
        status: 'draft',
        recipient_count: 2,
        created_at: '2026-08-23T08:00:00.000Z',
        updated_at: '2026-08-23T09:00:00.000Z',
        sent_at: null,
      },
    ];
    templates = [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', org_id: 'org-1', channel: 'email', is_active: true },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', org_id: 'org-1', channel: 'sms', is_active: true },
    ];
  });

  it('lists org-scoped campaigns', async () => {
    const res = await request(app()).get('/settings/campaigns');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('creates a campaign draft', async () => {
    const res = await request(app()).post('/settings/campaigns').send({
      name: 'Launch',
      channel: 'email',
      template_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      subject: 'Subject',
      body: 'Body {{customerName}}',
      audience: { audienceType: 'all' },
      recipient_count: 12,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  it('launches a draft campaign', async () => {
    const res = await request(app()).post(`/settings/campaigns/${draftId}/send`).send({});
    expect(res.status).toBe(200);
    expect(previewCampaignAudienceMock).toHaveBeenCalledWith('org-1', 'email', { audienceType: 'all' });
    expect(sendCampaignMock).toHaveBeenCalled();
    expect(campaigns[0].status).toBe('sending');
    expect(res.body.sentCount).toBe(2);
  });

  it('blocks launch when sendable recipient count is zero', async () => {
    previewCampaignAudienceMock.mockResolvedValueOnce({
      audienceType: 'all',
      totalCandidates: 0,
      uniqueRecipients: 0,
      sendableRecipients: 0,
      skippedEmpty: 0,
      skippedInvalid: 0,
      skippedDuplicates: 0,
      sampleRecipients: [],
      skipped: [],
      recipients: [],
    });
    const res = await request(app()).post(`/settings/campaigns/${draftId}/send`).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_SENDABLE_RECIPIENTS');
    expect(sendCampaignMock).not.toHaveBeenCalled();
  });

  it('prevents relaunch for non-draft campaigns', async () => {
    campaigns[0].status = 'completed';
    const res = await request(app()).post(`/settings/campaigns/${draftId}/send`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CAMPAIGN_LOCKED');
  });

  it('prevents concurrent double launch with atomic draft lock', async () => {
    sendCampaignMock.mockImplementationOnce(async () => {
      campaigns[0].status = 'completed';
      return {
        status: 'completed',
        sentCount: 1,
        failedCount: 0,
        skippedCount: 0,
        totalRecipients: 1,
        sentAt: '2026-08-29T00:00:00.000Z',
        preview: { audienceType: 'all', totalCandidates: 1, uniqueRecipients: 1, sendableRecipients: 1, skippedEmpty: 0, skippedInvalid: 0, skippedDuplicates: 0, sampleRecipients: [] },
      };
    });

    const first = await request(app()).post(`/settings/campaigns/${draftId}/send`).send({});
    const second = await request(app()).post(`/settings/campaigns/${draftId}/send`).send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('CAMPAIGN_LOCKED');
  });

  it('rejects malformed uuid on launch', async () => {
    const res = await request(app()).post('/settings/campaigns/not-a-uuid/send').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_UUID');
  });

  it('rejects cross-org launch', async () => {
    currentOrgId = 'org-2';
    const res = await request(app()).post(`/settings/campaigns/${draftId}/send`).send({});
    expect(res.status).toBe(404);
  });

  it('returns controlled error when audience is missing', async () => {
    campaigns[0].audience_type = null;
    campaigns[0].audience_data = null;
    const res = await request(app()).post(`/settings/campaigns/${draftId}/send`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_AUDIENCE');
  });

  it('schedules a draft campaign', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app()).post(`/settings/campaigns/${draftId}/schedule`).send({ scheduled_at: future });
    expect(res.status).toBe(200);
    expect(res.body.campaignId).toBe(draftId);
    expect(campaigns[0].status).toBe('scheduled');
  });

  it('rejects scheduling with past time', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const res = await request(app()).post(`/settings/campaigns/${draftId}/schedule`).send({ scheduled_at: past });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SCHEDULE_TIME');
  });

  it('rejects scheduling a non-draft campaign', async () => {
    campaigns[0].status = 'scheduled';
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app()).post(`/settings/campaigns/${draftId}/schedule`).send({ scheduled_at: future });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CAMPAIGN_NOT_DRAFT');
  });

  it('reschedules a scheduled campaign', async () => {
    campaigns[0].status = 'scheduled';
    const future = new Date(Date.now() + 172800000).toISOString();
    const res = await request(app()).patch(`/settings/campaigns/${draftId}/schedule`).send({ scheduled_at: future });
    expect(res.status).toBe(200);
    expect(campaigns[0].scheduled_at).toBe(future);
  });

  it('cancels schedule back to draft', async () => {
    campaigns[0].status = 'scheduled';
    campaigns[0].scheduled_at = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app()).post(`/settings/campaigns/${draftId}/schedule/cancel`).send();
    expect(res.status).toBe(200);
    expect(campaigns[0].status).toBe('draft');
    expect(campaigns[0].scheduled_at).toBeNull();
  });

  it('rejects schedule cancel for non-scheduled campaign', async () => {
    const res = await request(app()).post(`/settings/campaigns/${draftId}/schedule/cancel`).send();
    expect(res.status).toBe(404);
  });

  it('rejects cross-org schedule', async () => {
    currentOrgId = 'org-2';
    const future = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app()).post(`/settings/campaigns/${draftId}/schedule`).send({ scheduled_at: future });
    expect(res.status).toBe(404);
  });
});
