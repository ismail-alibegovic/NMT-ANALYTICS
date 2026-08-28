import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { previewCampaignAudienceMock } = vi.hoisted(() => ({
  previewCampaignAudienceMock: vi.fn(async () => ({
    audienceType: 'all' as const,
    totalCandidates: 3,
    uniqueRecipients: 2,
    sendableRecipients: 2,
    skippedEmpty: 0,
    skippedInvalid: 1,
    skippedDuplicates: 0,
    sampleRecipients: ['guest@example.com', 'second@example.com'],
    skipped: [],
    recipients: [{ recipient: 'guest@example.com' }, { recipient: 'second@example.com' }],
  })),
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
    previewCampaignAudience: previewCampaignAudienceMock,
  };
});

let campaigns: any[] = [];
let templates: any[] = [];

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};
      let orderKey = 'created_at';
      let ascending = false;
      let selectedColumns = '*';

      const rows = () => {
        if (table === 'campaigns') return campaigns;
        if (table === 'message_templates') return templates;
        throw new Error(`Unhandled table: ${table}`);
      };

      const builder: any = {
        select: vi.fn((columns?: string) => {
          selectedColumns = columns || '*';
          return builder;
        }),
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
          rows().unshift(inserted);
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
                      const row = rows().find((item) => item.id === filters.id && item.org_id === filters.org_id);
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
        delete: vi.fn(() => ({
          eq: vi.fn((column: string, value: any) => {
            filters[column] = value;
            return {
              eq: vi.fn(async (column2: string, value2: any) => {
                filters[column2] = value2;
                const before = rows().length;
                if (table === 'campaigns') {
                  campaigns = campaigns.filter((item) => !(item.id === filters.id && item.org_id === filters.org_id));
                }
                return { data: null, error: before === rows().length ? { code: 'PGRST116' } : null };
              }),
            };
          }),
        })),
        single: vi.fn(async () => {
          const row = rows().find((item) => Object.entries(filters).every(([key, value]) => item[key] === value));
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
        }),
        then: undefined,
      };

      builder.then = async (resolve: any) => {
        const filtered = [...rows()]
          .filter((item) => Object.entries(filters).every(([key, value]) => item[key] === value))
          .sort((a, b) =>
            ascending
              ? String(a[orderKey]).localeCompare(String(b[orderKey]))
              : String(b[orderKey]).localeCompare(String(a[orderKey])),
          );
        return resolve({ data: filtered, error: null, selectedColumns });
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

describe('campaign routes', () => {
  beforeEach(() => {
    currentOrgId = 'org-1';
    previewCampaignAudienceMock.mockClear();
    campaigns = [
      {
        id: '11111111-1111-4111-8111-111111111111',
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
        id: '22222222-2222-4222-8222-222222222222',
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
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        org_id: 'org-1',
        channel: 'email',
        is_active: true,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        org_id: 'org-1',
        channel: 'sms',
        is_active: true,
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        org_id: 'org-1',
        channel: 'email',
        is_active: false,
      },
    ];
  });

  it('lists org-scoped campaigns', async () => {
    const res = await request(app()).get('/settings/campaigns');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].org_id).toBe('org-1');
    expect(res.body.data[0].recipient_count).toBe(7);
  });

  it('gets a single campaign', async () => {
    const res = await request(app()).get('/settings/campaigns/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.body.audience.audienceType).toBe('all');
  });

  it('returns controlled error for malformed uuid', async () => {
    const res = await request(app()).get('/settings/campaigns/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_UUID');
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
    expect(res.body.template_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(res.body.recipient_count).toBe(12);
  });

  it('rejects template channel mismatch', async () => {
    const res = await request(app()).post('/settings/campaigns').send({
      name: 'SMS mismatch',
      channel: 'email',
      template_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      subject: 'Subject',
      body: 'Body',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TEMPLATE_CHANNEL_MISMATCH');
  });

  it('rejects inactive template', async () => {
    const res = await request(app()).post('/settings/campaigns').send({
      name: 'Inactive template',
      channel: 'email',
      template_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      subject: 'Subject',
      body: 'Body',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TEMPLATE');
  });

  it('rejects invalid channel payload', async () => {
    const res = await request(app()).post('/settings/campaigns').send({
      name: 'Bad channel',
      channel: 'push',
      body: 'Body',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unsupported placeholders', async () => {
    const res = await request(app()).post('/settings/campaigns').send({
      name: 'Bad placeholders',
      channel: 'email',
      subject: 'Subject',
      body: 'Hello {{notSupported}}',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_PLACEHOLDER');
  });

  it('updates a draft campaign', async () => {
    const res = await request(app()).patch('/settings/campaigns/11111111-1111-4111-8111-111111111111').send({
      body: 'Updated body',
      audience: { audienceType: 'departure', departureId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
      recipient_count: 4,
    });

    expect(res.status).toBe(200);
    expect(res.body.body).toBe('Updated body');
    expect(res.body.audience.audienceType).toBe('departure');
    expect(res.body.recipient_count).toBe(4);
  });

  it('keeps org isolation on update', async () => {
    currentOrgId = 'org-2';
    const res = await request(app()).patch('/settings/campaigns/11111111-1111-4111-8111-111111111111').send({
      body: 'No access',
    });

    expect(res.status).toBe(404);
  });

  it('previews audience counts before save', async () => {
    const res = await request(app()).post('/settings/campaigns/preview').send({
      channel: 'email',
      template_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      audience: { audienceType: 'all' },
    });

    expect(res.status).toBe(200);
    expect(previewCampaignAudienceMock).toHaveBeenCalledWith('org-1', 'email', { audienceType: 'all' });
    expect(res.body.sendableRecipients).toBe(2);
  });

  it('deletes a campaign draft', async () => {
    const res = await request(app()).delete('/settings/campaigns/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(204);

    const list = await request(app()).get('/settings/campaigns');
    expect(list.body.data).toHaveLength(0);
  });

  it('disables campaign sending in this phase', async () => {
    const res = await request(app()).post('/settings/campaigns/11111111-1111-4111-8111-111111111111/send').send({
      audienceType: 'all',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CAMPAIGN_SENDING_DISABLED');
  });
});
