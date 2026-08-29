import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'director@example.ba', role: 'director' };
    next();
  },
}));
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => {
    req.orgId = 'org-1';
    next();
  },
}));
vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

let rules: any[] = [];
let templates: any[] = [];

function applyFilters(rows: any[], filters: Record<string, any>) {
  return rows.filter((item) => Object.entries(filters).every(([k, v]) => item[k] === v));
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {};
      let orderKey = 'created_at';
      let ascending = false;

      const rows = () => {
        if (table === 'automation_rules') return rules;
        if (table === 'message_templates') return templates;
        throw new Error(`Unhandled table: ${table}`);
      };

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => { filters[column] = value; return builder; }),
        ilike: vi.fn((_column: string, _value: any) => builder),
        order: vi.fn((column: string, opts?: any) => { orderKey = column; ascending = !!opts?.ascending; return builder; }),
        insert: vi.fn((payload: any) => ({
          select: () => ({
            single: async () => {
              const inserted = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: '2026-08-29T10:00:00.000Z', updated_at: '2026-08-29T10:00:00.000Z', ...payload };
              rules.unshift(inserted);
              return { data: inserted, error: null };
            },
          }),
        })),
        update: vi.fn((updates: any) => {
          const uf: Record<string, any> = {};
          const ub: any = {
            eq: vi.fn((column: string, value: any) => { uf[column] = value; return ub; }),
            select: vi.fn(() => ({
              single: async () => {
                const row = rules.find((item) => Object.entries(uf).every(([k, v]) => item[k] === v));
                if (!row) return { data: null, error: { code: 'PGRST116' } };
                Object.assign(row, updates);
                return { data: row, error: null };
              },
            })),
          };
          return ub;
        }),
        delete: vi.fn(() => {
          const df: Record<string, any> = {};
          const db: any = {
            eq: vi.fn((column: string, value: any) => { df[column] = value; return db; }),
            then: async (resolve: any) => {
              const before = rules.length;
              rules = rules.filter((item) => !Object.entries(df).every(([k, v]) => item[k] === v));
              return resolve({ data: null, error: before === rules.length ? { code: 'PGRST116' } : null });
            },
          };
          return db;
        }),
        single: vi.fn(async () => {
          const row = rows().find((item) => Object.entries(filters).every(([k, v]) => item[k] === v));
          return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
        }),
        then: undefined,
      };
      builder.then = async (resolve: any) => {
        let filtered = applyFilters(rows(), filters);
        filtered = [...filtered].sort((a, b) => {
          const av = a[orderKey];
          const bv = b[orderKey];
          return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
        return resolve({ data: filtered, error: null });
      };
      return builder;
    }),
  },
}));

import automationRulesRoutes from '../routes/automationRules';

function app() {
  const a = express();
  a.use(express.json());
  a.use(automationRulesRoutes);
  return a;
}

const activeTemplate = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: 'org-1',
  name: 'Departure Reminder',
  channel: 'email',
  subject: 'Your trip is coming up!',
  body: 'Hi {{customerName}}, your departure is soon.',
  is_active: true,
  created_at: '2026-08-29T00:00:00.000Z',
  updated_at: '2026-08-29T00:00:00.000Z',
};

const inactiveTemplate = {
  ...activeTemplate,
  id: '22222222-2222-4222-8222-222222222222',
  is_active: false,
};

const smsTemplate = {
  ...activeTemplate,
  id: '33333333-3333-4333-8333-333333333333',
  channel: 'sms',
  subject: null,
};

const foreignOrgTemplate = {
  ...activeTemplate,
  id: '44444444-4444-4444-8444-444444444444',
  org_id: 'org-99',
};

beforeEach(() => {
  rules = [];
  templates = [activeTemplate, inactiveTemplate, smsTemplate, foreignOrgTemplate];
});

describe('automation rules API', () => {
  it('lists rules for org', async () => {
    rules.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', org_id: 'org-1', name: 'Test Rule', is_active: true, channel: 'email', template_id: null, trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    const res = await request(app()).get('/automation-rules');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].human_trigger).toContain('3 days before departure');
  });

  it('creates a rule', async () => {
    const res = await request(app()).post('/automation-rules').send({
      name: 'New Rule',
      trigger_type: 'before_departure',
      timing: { value: 3, unit: 'days' },
      channel: 'email',
      template_id: activeTemplate.id,
      is_active: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Rule');
    expect(res.body.trigger_type).toBe('before_departure');
    expect(res.body.timing).toEqual({ value: 3, unit: 'days' });
  });

  it('rejects template from different org', async () => {
    const res = await request(app()).post('/automation-rules').send({
      name: 'New Rule',
      trigger_type: 'before_departure',
      timing: { value: 3, unit: 'days' },
      channel: 'email',
      template_id: foreignOrgTemplate.id,
    });
    expect(res.status).toBe(404);
  });

  it('rejects inactive template', async () => {
    const res = await request(app()).post('/automation-rules').send({
      name: 'New Rule',
      trigger_type: 'before_departure',
      timing: { value: 3, unit: 'days' },
      channel: 'email',
      template_id: inactiveTemplate.id,
    });
    expect(res.status).toBe(400);
  });

  it('rejects template with mismatched channel', async () => {
    const res = await request(app()).post('/automation-rules').send({
      name: 'New Rule',
      trigger_type: 'before_departure',
      timing: { value: 3, unit: 'days' },
      channel: 'email',
      template_id: smsTemplate.id,
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown trigger type', async () => {
    const res = await request(app()).post('/automation-rules').send({
      name: 'New Rule',
      trigger_type: 'unknown',
      timing: { value: 3, unit: 'days' },
      channel: 'email',
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed UUID', async () => {
    const res = await request(app()).get('/automation-rules/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_UUID');
  });

  it('returns 404 for non-existent rule', async () => {
    const res = await request(app()).get('/automation-rules/33333333-3333-4333-8333-333333333333');
    expect(res.status).toBe(404);
  });

  it('returns 404 for cross-org rule', async () => {
    rules.push({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', org_id: 'org-99', name: 'Other Org Rule', is_active: true, channel: 'email', template_id: null, trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    const res = await request(app()).get('/automation-rules/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(res.status).toBe(404);
  });

  it('updates a rule', async () => {
    rules.push({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', org_id: 'org-1', name: 'Old Name', is_active: true, channel: 'email', template_id: null, trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    const res = await request(app()).patch('/automation-rules/cccccccc-cccc-4ccc-8ccc-cccccccccccc').send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('enables a rule', async () => {
    rules.push({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', org_id: 'org-1', name: 'Toggle Rule', is_active: false, channel: 'email', template_id: null, trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    const res = await request(app()).patch('/automation-rules/dddddddd-dddd-4ddd-8ddd-dddddddddddd/toggle').send({ is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);
  });

  it('deletes a rule', async () => {
    rules.push({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', org_id: 'org-1', name: 'Delete Me', is_active: true, channel: 'email', template_id: null, trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    const res = await request(app()).delete('/automation-rules/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('lists rules with channel filter', async () => {
    rules.push({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', org_id: 'org-1', name: 'Email Rule', is_active: true, channel: 'email', template_id: null, trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    rules.push({ id: '99999999-9999-4999-8999-999999999999', org_id: 'org-1', name: 'SMS Rule', is_active: true, channel: 'sms', template_id: null, trigger_type: 'after_reservation', timing_offset: 0, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    const res = await request(app()).get('/automation-rules?channel=sms');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].channel).toBe('sms');
  });

  it('lists active-only rules', async () => {
    rules.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', org_id: 'org-1', name: 'Active Rule', is_active: true, channel: 'email', template_id: null, trigger_type: 'before_departure', timing_offset: 1, timing_unit: 'days', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    rules.push({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', org_id: 'org-1', name: 'Inactive Rule', is_active: false, channel: 'email', template_id: null, trigger_type: 'after_reservation', timing_offset: 0, timing_unit: 'hours', created_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z' });
    const res = await request(app()).get('/automation-rules?activeOnly=true');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].is_active).toBe(true);
  });
});
