import { beforeEach, describe, expect, it, vi } from 'vitest';

let campaigns: any[] = [];
const futureDate = new Date(Date.now() + 86400000).toISOString();
const futureDate2 = new Date(Date.now() + 172800000).toISOString();
const pastDate = new Date(Date.now() - 86400000).toISOString();
const dueDate = new Date(Date.now() - 3600000).toISOString();

vi.mock('../lib/campaigns', async () => {
  const actual = await vi.importActual<any>('../lib/campaigns');
  return actual;
});

function makeBuilder(table: string) {
  const filters: Record<string, any> = {};
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: any) => {
      filters[column] = value;
      return builder;
    }),
    in: vi.fn((_column: string, _values: any[]) => builder),
    lte: vi.fn((column: string, value: any) => {
      filters['__lte__' + column] = value;
      return builder;
    }),
    order: vi.fn(() => builder),
    single: vi.fn(async () => {
      const row = campaigns.find((item) => matches(item, filters));
      return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
    }),
    update: vi.fn((updates: any) => {
      const uf: Record<string, any> = {};
      const ub: any = {
        eq: vi.fn((column: string, value: any) => {
          uf[column] = value;
          return ub;
        }),
        in: vi.fn((_c: string, _v: any[]) => ub),
        select: vi.fn(() => ({
          single: async () => {
            const row = campaigns.find((item) => matches(item, uf));
            if (!row) return { data: null, error: { code: 'PGRST116' } };
            if ('status' in updates) row.status = updates.status;
            if ('scheduled_at' in updates) row.scheduled_at = updates.scheduled_at;
            if ('updated_at' in updates) row.updated_at = updates.updated_at;
            return { data: row, error: null };
          },
        })),
      };
      return ub;
    }),
  };
  builder.then = async (resolve: any) => {
    const filtered = campaigns.filter((item) => matches(item, filters));
    return resolve({ data: filtered, error: null });
  };
  return builder;
}

function matches(item: any, filters: Record<string, any>): boolean {
  return Object.entries(filters).every(([key, value]) => {
    if (key.startsWith('__lte__')) {
      const col = key.slice('__lte__'.length);
      return item[col] !== null && item[col] <= value;
    }
    return item[key] === value;
  });
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { from: vi.fn((t: string) => makeBuilder(t)) },
}));

import {
  scheduleCampaign,
  rescheduleCampaign,
  cancelSchedule,
  processDueScheduledCampaigns,
} from '../lib/campaigns';

describe('campaign scheduling', () => {
  beforeEach(() => {
    campaigns = [
      {
        id: 'camp-1', org_id: 'org-1', name: 'Draft', channel: 'email', template_id: null,
        subject: 'Hello', body: 'Body {{customerName}}', audience_type: 'all', audience_data: {},
        status: 'draft', recipient_count: 12, scheduled_at: null,
        created_at: '2026-08-24T00:00:00.000Z', updated_at: '2026-08-24T00:00:00.000Z', sent_at: null,
      },
      {
        id: 'camp-2', org_id: 'org-1', name: 'Scheduled', channel: 'email', template_id: null,
        subject: 'Subject', body: 'Body {{customerName}}', audience_type: 'all', audience_data: {},
        status: 'scheduled', recipient_count: 5, scheduled_at: futureDate,
        created_at: '2026-08-24T00:00:00.000Z', updated_at: '2026-08-24T00:00:00.000Z', sent_at: null,
      },
      {
        id: 'camp-3', org_id: 'org-1', name: 'Due', channel: 'email', template_id: null,
        subject: 'Hello', body: 'Body {{customerName}}', audience_type: 'all', audience_data: {},
        status: 'scheduled', recipient_count: 5, scheduled_at: dueDate,
        created_at: '2026-08-24T00:00:00.000Z', updated_at: '2026-08-24T00:00:00.000Z', sent_at: null,
      },
      {
        id: 'camp-4', org_id: 'org-2', name: 'Other org', channel: 'sms', template_id: null,
        subject: null, body: 'Body', audience_type: 'all', audience_data: {},
        status: 'draft', recipient_count: 3, scheduled_at: null,
        created_at: '2026-08-23T00:00:00.000Z', updated_at: '2026-08-23T00:00:00.000Z', sent_at: null,
      },
    ];
  });

  it('schedules a draft campaign', async () => {
    const result = await scheduleCampaign('org-1', 'camp-1', futureDate);
    expect(result.campaignId).toBe('camp-1');
    expect(result.scheduledAt).toBe(futureDate);
    const c = campaigns.find((c) => c.id === 'camp-1');
    expect(c.status).toBe('scheduled');
    expect(c.scheduled_at).toBe(futureDate);
  });

  it('rejects past schedule time', async () => {
    await expect(scheduleCampaign('org-1', 'camp-1', pastDate)).rejects.toThrow('Scheduled time must be in the future');
  });

  it('rejects scheduling non-draft campaign', async () => {
    await expect(scheduleCampaign('org-1', 'camp-2', futureDate)).rejects.toThrow();
  });

  it('reschedules a scheduled campaign', async () => {
    const result = await rescheduleCampaign('org-1', 'camp-2', futureDate2);
    expect(result.campaignId).toBe('camp-2');
    expect(result.scheduledAt).toBe(futureDate2);
  });

  it('rejects reschedule with past time', async () => {
    await expect(rescheduleCampaign('org-1', 'camp-2', pastDate)).rejects.toThrow('Scheduled time must be in the future');
  });

  it('cancels schedule back to draft', async () => {
    const result = await cancelSchedule('org-1', 'camp-2');
    expect(result.campaignId).toBe('camp-2');
    expect(result.previousStatus).toBe('scheduled');
    const c = campaigns.find((c) => c.id === 'camp-2');
    expect(c.status).toBe('draft');
    expect(c.scheduled_at).toBeNull();
  });

  it('rejects cancelling non-scheduled campaign', async () => {
    await expect(cancelSchedule('org-1', 'camp-1')).rejects.toThrow();
  });

  it('rejects cross-org schedule', async () => {
    await expect(scheduleCampaign('org-2', 'camp-1', futureDate)).rejects.toThrow();
  });

  it('processes due campaigns and claims atomically', async () => {
    const result = await processDueScheduledCampaigns();
    expect(result.processed).toBe(1);
    expect(result.results[0].campaignId).toBe('camp-3');
    const c = campaigns.find((c) => c.id === 'camp-3');
    expect(c.status).toBe('sending');
  });
});
