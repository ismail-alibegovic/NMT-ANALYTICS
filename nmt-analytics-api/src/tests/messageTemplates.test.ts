import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import messageTemplatesRoutes from '../routes/messageTemplates';

let currentOrgId = 'org-1';
let rows = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    org_id: 'org-1',
    name: 'Reservation follow-up',
    channel: 'email',
    subject: 'Follow-up',
    body: 'Email body',
    is_active: true,
    created_at: '2026-08-24T08:00:00.000Z',
    updated_at: '2026-08-24T08:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    org_id: 'org-1',
    name: 'Old SMS',
    channel: 'sms',
    subject: null,
    body: 'SMS body',
    is_active: false,
    created_at: '2026-08-23T08:00:00.000Z',
    updated_at: '2026-08-23T08:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    org_id: 'org-2',
    name: 'Other org',
    channel: 'email',
    subject: 'Other',
    body: 'Other body',
    is_active: true,
    created_at: '2026-08-22T08:00:00.000Z',
    updated_at: '2026-08-22T08:00:00.000Z',
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

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'message_templates') throw new Error(`Unhandled table: ${table}`);
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
            id: '44444444-4444-4444-8444-444444444444',
            created_at: '2026-08-24T10:00:00.000Z',
            updated_at: '2026-08-24T10:00:00.000Z',
            ...payload,
          };
          rows = [inserted, ...rows];
          return {
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
            }),
          };
        }),
        update: vi.fn((updates: any) => {
          const updateBuilder: any = {
            eq: vi.fn((column: string, value: any) => {
              filters[column] = value;
              return updateBuilder;
            }),
            select: vi.fn(() => ({
              single: async () => {
                const row = rows.find((item) => item.id === filters.id && item.org_id === filters.org_id);
                if (!row) return { data: null, error: { code: 'PGRST116' } };
                Object.assign(row, updates);
                return { data: row, error: null };
              },
            })),
          };
          return updateBuilder;
        }),
        single: vi.fn(async () => {
          const row = rows.find((item) => Object.entries(filters).every(([k, v]) => (item as any)[k] === v));
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
        }),
        then: undefined,
      };

      builder.then = async (resolve: any) => {
        let filtered = rows.filter((row) => Object.entries(filters).every(([k, v]) => (row as any)[k] === v));
        filtered = [...filtered].sort((a, b) => ascending ? String((a as any)[orderKey]).localeCompare(String((b as any)[orderKey])) : String((b as any)[orderKey]).localeCompare(String((a as any)[orderKey])));
        return resolve({ data: filtered, error: null });
      };

      return builder;
    }),
  },
}));

function app() {
  const app = express();
  app.use(express.json());
  app.use('/settings', messageTemplatesRoutes);
  return app;
}

describe('message templates route', () => {
  beforeEach(() => {
    currentOrgId = 'org-1';
    rows = [...rows];
  });

  it('lists org-scoped templates', async () => {
    const res = await request(app()).get('/settings/message-templates');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((row: any) => row.org_id === 'org-1')).toBe(true);
  });

  it('filters inactive templates out when activeOnly=true', async () => {
    const res = await request(app()).get('/settings/message-templates').query({ activeOnly: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].is_active).toBe(true);
  });

  it('creates an email template', async () => {
    const res = await request(app()).post('/settings/message-templates').send({
      name: 'New email',
      channel: 'email',
      subject: 'Subject',
      body: 'Body',
    });
    expect(res.status).toBe(201);
    expect(res.body.channel).toBe('email');
    expect(res.body.subject).toBe('Subject');
  });

  it('rejects invalid email template without subject', async () => {
    const res = await request(app()).post('/settings/message-templates').send({
      name: 'Bad email',
      channel: 'email',
      body: 'Body',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid sms template with subject', async () => {
    const res = await request(app()).post('/settings/message-templates').send({
      name: 'Bad SMS',
      channel: 'sms',
      subject: 'Nope',
      body: 'Body',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('updates a template', async () => {
    const res = await request(app()).patch('/settings/message-templates/11111111-1111-4111-8111-111111111111').send({
      body: 'Updated body',
    });
    expect(res.status).toBe(200);
    expect(res.body.body).toBe('Updated body');
  });

  it('archives a template with delete', async () => {
    const res = await request(app()).delete('/settings/message-templates/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    const list = await request(app()).get('/settings/message-templates').query({ activeOnly: 'true' });
    expect(list.body.data.find((row: any) => row.id === '11111111-1111-4111-8111-111111111111')).toBeUndefined();
  });

  it('keeps org isolation on update', async () => {
    currentOrgId = 'org-2';
    const res = await request(app()).patch('/settings/message-templates/11111111-1111-4111-8111-111111111111').send({
      body: 'No access',
    });
    expect(res.status).toBe(404);
  });
});
