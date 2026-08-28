import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import messageTemplatesRoutes from '../routes/messageTemplates';

let currentOrgId = 'org-1';
let rows: any[] = [];

function makeTemplate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id || '44444444-4444-4444-8444-444444444444',
    org_id: overrides.org_id || currentOrgId,
    name: overrides.name || 'Default',
    channel: overrides.channel || 'email',
    subject: overrides.subject ?? 'Subject',
    body: overrides.body || 'Hello {{customerName}}',
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at || '2026-08-24T10:00:00.000Z',
    updated_at: overrides.updated_at || '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
}

function seed() {
  rows = [
    makeTemplate({ id: '11111111-1111-4111-8111-111111111111', name: 'Reservation follow-up', channel: 'email', subject: 'Follow-up', body: 'Email body with {{customerName}}' }),
    makeTemplate({ id: '22222222-2222-4222-8222-222222222222', name: 'Old SMS', channel: 'sms', subject: null, body: 'SMS body', is_active: false }),
    makeTemplate({ id: '33333333-3333-4333-8333-333333333333', org_id: 'org-2', name: 'Other org', channel: 'email', subject: 'Other', body: 'Other body' }),
  ];
}

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
        select: vi.fn((_sel?: string) => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        ilike: vi.fn((_column: string, _value: string) => builder),
        order: vi.fn((column: string, opts?: any) => {
          orderKey = column;
          ascending = !!opts?.ascending;
          return builder;
        }),
        insert: vi.fn((payload: any) => {
          const inserted = makeTemplate(payload);
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
                return { data: { ...row }, error: null };
              },
            })),
          };
          return updateBuilder;
        }),
        delete: vi.fn(() => {
          const deleteBuilder: any = {
            eq: vi.fn((column: string, value: any) => {
              filters[column] = value;
              return deleteBuilder;
            }),
          };
          deleteBuilder.then = async (resolve: any) => {
            const idx = rows.findIndex((item) => item.id === filters.id && item.org_id === filters.org_id);
            if (idx !== -1) rows.splice(idx, 1);
            return resolve({ data: null, error: null });
          };
          return deleteBuilder;
        }),
        single: vi.fn(async () => {
          const row = rows.find((item) => Object.entries(filters).every(([k, v]) => (item as any)[k] === v));
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
        }),
        then: undefined,
      };

      builder.then = async (resolve: any) => {
        let filtered = rows.filter((row) => Object.entries(filters).every(([k, v]) => (row as any)[k] === v));
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
  app.use('/settings', messageTemplatesRoutes);
  return app;
}

describe('message templates route', () => {
  beforeEach(() => {
    currentOrgId = 'org-1';
    seed();
  });

  describe('GET /message-templates', () => {
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
  });

  describe('GET /message-templates/:id', () => {
    it('returns a single template by id', async () => {
      const res = await request(app()).get('/settings/message-templates/11111111-1111-4111-8111-111111111111');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(res.body.name).toBe('Reservation follow-up');
    });

    it('returns 404 for cross-org access', async () => {
      const res = await request(app()).get('/settings/message-templates/33333333-3333-4333-8333-333333333333');
      expect(res.status).toBe(404);
    });

    it('returns 400 for malformed UUID', async () => {
      const res = await request(app()).get('/settings/message-templates/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_UUID');
    });
  });

  describe('POST /message-templates', () => {
    it('creates an email template', async () => {
      const res = await request(app()).post('/settings/message-templates').send({
        name: 'New email',
        channel: 'email',
        subject: 'Hello {{customerName}}',
        body: 'Body with {{customerName}}',
      });
      expect(res.status).toBe(201);
      expect(res.body.channel).toBe('email');
      expect(res.body.subject).toBe('Hello {{customerName}}');
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

    it('rejects unsupported placeholders', async () => {
      const res = await request(app()).post('/settings/message-templates').send({
        name: 'Bad placeholders',
        channel: 'email',
        subject: 'Test',
        body: 'Body with {{unsupportedVar}}',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /message-templates/:id', () => {
    it('updates a template', async () => {
      const res = await request(app()).patch('/settings/message-templates/11111111-1111-4111-8111-111111111111').send({
        body: 'Updated body',
      });
      expect(res.status).toBe(200);
      expect(res.body.body).toBe('Updated body');
    });

    it('keeps org isolation on update', async () => {
      currentOrgId = 'org-2';
      const res = await request(app()).patch('/settings/message-templates/11111111-1111-4111-8111-111111111111').send({
        body: 'No access',
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for malformed UUID', async () => {
      const res = await request(app()).patch('/settings/message-templates/not-a-uuid').send({
        body: 'Updated',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_UUID');
    });
  });

  describe('DELETE /message-templates/:id', () => {
    it('hard-deletes a template', async () => {
      const res = await request(app()).delete('/settings/message-templates/11111111-1111-4111-8111-111111111111');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const list = await request(app()).get('/settings/message-templates');
      expect(list.body.data).toHaveLength(1);
    });

    it('returns 400 for malformed UUID', async () => {
      const res = await request(app()).delete('/settings/message-templates/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_UUID');
    });

    it('returns 200 even if not found (idempotent)', async () => {
      const res = await request(app()).delete('/settings/message-templates/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /message-templates/:id/duplicate', () => {
    it('duplicates a template', async () => {
      const res = await request(app()).post('/settings/message-templates/11111111-1111-4111-8111-111111111111/duplicate');
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Reservation follow-up (copy)');
      expect(res.body.is_active).toBe(true);
      expect(res.body.org_id).toBe('org-1');
    });

    it('returns 404 for cross-org duplicate', async () => {
      const res = await request(app()).post('/settings/message-templates/33333333-3333-4333-8333-333333333333/duplicate');
      expect(res.status).toBe(404);
    });

    it('returns 400 for malformed UUID', async () => {
      const res = await request(app()).post('/settings/message-templates/not-a-uuid/duplicate');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_UUID');
    });
  });
});
