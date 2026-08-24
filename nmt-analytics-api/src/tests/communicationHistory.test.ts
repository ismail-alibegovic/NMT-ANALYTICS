import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let currentOrgId = 'org-1';
const rows = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    org_id: 'org-1',
    channel: 'email',
    recipient: 'guest1@example.ba',
    subject: 'Booking Confirmation',
    body_preview: 'Booking confirmed',
    status: 'sent',
    error_message: null,
    related_departure_id: '123e4567-e89b-42d3-a456-426614174000',
    related_reservation_id: '223e4567-e89b-42d3-a456-426614174001',
    created_at: '2026-08-24T08:00:00.000Z',
    sent_at: '2026-08-24T08:00:10.000Z',
    departures: { id: '123e4567-e89b-42d3-a456-426614174000', depart_at: '2026-09-01T09:00:00.000Z', packages: { id: 'pkg-1', name: 'Istanbul' } },
    reservations: { id: '223e4567-e89b-42d3-a456-426614174001', customer_name: 'Guest One' },
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    org_id: 'org-1',
    channel: 'sms',
    recipient: '+38761111222',
    subject: null,
    body_preview: 'Reminder',
    status: 'failed',
    error_message: 'provider error',
    related_departure_id: '123e4567-e89b-42d3-a456-426614174000',
    related_reservation_id: null,
    created_at: '2026-08-24T09:00:00.000Z',
    sent_at: null,
    departures: { id: '123e4567-e89b-42d3-a456-426614174000', depart_at: '2026-09-01T09:00:00.000Z', packages: { id: 'pkg-1', name: 'Istanbul' } },
    reservations: null,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    org_id: 'org-2',
    channel: 'email',
    recipient: 'other@example.ba',
    subject: 'Other Org',
    body_preview: 'Other',
    status: 'skipped',
    error_message: 'missing config',
    related_departure_id: null,
    related_reservation_id: null,
    created_at: '2026-08-24T10:00:00.000Z',
    sent_at: null,
    departures: null,
    reservations: null,
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

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'communication_history') throw new Error(`Unhandled table: ${table}`);
      const filters: Record<string, any> = {};
      let rangeStart = 0;
      let rangeEnd = 19;
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters[column] = value;
          return builder;
        }),
        order: vi.fn(() => builder),
        range: vi.fn(async (start: number, end: number) => {
          rangeStart = start;
          rangeEnd = end;
          let filtered = rows.filter((row) => row.org_id === filters.org_id);
          if (filters.channel) filtered = filtered.filter((row) => row.channel === filters.channel);
          if (filters.status) filtered = filtered.filter((row) => row.status === filters.status);
          if (filters.related_departure_id) filtered = filtered.filter((row) => row.related_departure_id === filters.related_departure_id);
          if (filters.related_reservation_id) filtered = filtered.filter((row) => row.related_reservation_id === filters.related_reservation_id);
          filtered = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
          return {
            data: filtered.slice(rangeStart, rangeEnd + 1),
            error: null,
            count: filtered.length,
          };
        }),
      };
      return builder;
    }),
  },
}));

import communicationHistoryRoutes from '../routes/communicationHistory';

function app() {
  const app = express();
  app.use(express.json());
  app.use('/', communicationHistoryRoutes);
  return app;
}

describe('communication history route', () => {
  beforeEach(() => {
    currentOrgId = 'org-1';
  });

  it('returns org-scoped newest-first communication history', async () => {
    const res = await request(app()).get('/communication-history');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe('22222222-2222-2222-2222-222222222222');
    expect(res.body.data[1].id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('filters by channel and status', async () => {
    const res = await request(app()).get('/communication-history').query({ channel: 'sms', status: 'failed' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].channel).toBe('sms');
    expect(res.body.data[0].status).toBe('failed');
  });

  it('filters by related_departure_id', async () => {
    const res = await request(app()).get('/communication-history').query({ related_departure_id: '123e4567-e89b-42d3-a456-426614174000' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((row: any) => row.related_departure_id === '123e4567-e89b-42d3-a456-426614174000')).toBe(true);
  });

  it('filters by related_reservation_id', async () => {
    const res = await request(app()).get('/communication-history').query({ related_reservation_id: '223e4567-e89b-42d3-a456-426614174001' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].related_reservation_id).toBe('223e4567-e89b-42d3-a456-426614174001');
  });

  it('keeps org isolation', async () => {
    currentOrgId = 'org-2';
    const res = await request(app()).get('/communication-history');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].org_id).toBe('org-2');
  });
});
