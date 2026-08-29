import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveRecipientsMock = vi.fn();
const loadTemplateContextMock = vi.fn(async () => ({}));
const resolveMessageMock = vi.fn();
const extractPlaceholdersMock: any = vi.fn(() => []);

vi.mock('../lib/recipientResolver', () => ({
  resolveRecipients: (...args: any[]) => (resolveRecipientsMock as any)(...args),
  RecipientTargetNotFoundError: class extends Error {},
}));

vi.mock('../lib/placeholderResolver', () => ({
  loadTemplateContextForScope: async (...args: any[]) => (loadTemplateContextMock as any)(...args),
  resolveMessagePerRecipient: (...args: any[]) => (resolveMessageMock as any)(...args),
}));

vi.mock('../lib/templatePlaceholders', () => ({
  extractPlaceholders: (...args: any[]) => (extractPlaceholdersMock as any)(...args),
}));

// ── Supabase admin mock with a chainable, filter-applying query builder ──
type World = {
  activeRules: any[];
  templates: Record<string, any>;
  departures: any[];
  reservations: any[];
  payments: any[];
  claimed: Set<string>;
  filters: Record<string, Record<string, any[]>>;
};

const world: World = {
  activeRules: [],
  templates: {},
  departures: [],
  reservations: [],
  payments: [],
  claimed: new Set(),
  filters: {},
};

function resetWorld() {
  world.activeRules = [];
  world.templates = {};
  world.departures = [];
  world.reservations = [];
  world.payments = [];
  world.claimed = new Set();
  world.filters = {};
}

const TABLE_KEY: Record<string, keyof World> = {
  automation_rules: 'activeRules',
  departures: 'departures',
  reservations: 'reservations',
  payments: 'payments',
};

function recordFilter(table: string, key: string, value: any) {
  if (!world.filters[table]) world.filters[table] = {};
  if (!world.filters[table][key]) world.filters[table][key] = [];
  world.filters[table][key].push(value);
}

function rowMatches(row: any, table: string): boolean {
  const filters = world.filters[table] || {};
  for (const eq of filters.eq || []) {
    if (row[eq.col] !== eq.val) return false;
  }
  for (const lte of filters.lte || []) {
    if (!(row[lte.col] <= lte.val)) return false;
  }
  for (const gte of filters.gte || []) {
    if (!(row[gte.col] >= gte.val)) return false;
  }
  for (const gt of filters.gt || []) {
    if (!(row[gt.col] > gt.val)) return false;
  }
  for (const not of filters.not || []) {
    if (not.op === 'is' && not.val === null && row[not.col] != null) return true;
    if (not.op === 'is' && not.val !== null && row[not.col] === null) return false;
  }
  return true;
}

function makeBuilder(table: string): any {
  const builder: any = {
    select: () => builder,
    insert: (payload: any) => {
      const key = `${payload.rule_id}:${payload.entity_type}:${payload.entity_id}`;
      if (world.claimed.has(key)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
      }
      world.claimed.add(key);
      return Promise.resolve({ data: payload, error: null });
    },
    update: (payload: any) => builder,
    eq: (col: string, val: any) => {
      recordFilter(table, 'eq', { col, val });
      return builder;
    },
    lte: (col: string, val: any) => {
      recordFilter(table, 'lte', { col, val });
      return builder;
    },
    gt: (col: string, val: any) => {
      recordFilter(table, 'gt', { col, val });
      return builder;
    },
    gte: (col: string, val: any) => {
      recordFilter(table, 'gte', { col, val });
      return builder;
    },
    not: (col: string, op: string, val: any) => {
      recordFilter(table, 'not', { col, op, val });
      return builder;
    },
    order: () => builder,
    maybeSingle: async () => {
      const rows = table === 'message_templates'
        ? Object.values(world.templates)
        : [];
      const first = rows.find((r) => rowMatches(r, table)) ?? null;
      return { data: first, error: null };
    },
    then: (resolve: any) => {
      const key = TABLE_KEY[table];
      const rows = key ? (world[key] as any[]) : [];
      const filtered = rows.filter((r) => rowMatches(r, table));
      resolve({ data: filtered, error: null });
    },
  };
  return builder;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => makeBuilder(table),
  },
}));

import { processDueAutomationRules } from '../lib/automationExecution';

const orgId = '00000000-0000-4000-8000-000000000001';

function activeRule(overrides: any = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    org_id: orgId,
    name: 'Departure Reminder',
    is_active: true,
    channel: 'email',
    template_id: '22222222-2222-4222-8222-222222222222',
    trigger_type: 'before_departure',
    timing_offset: 3,
    timing_unit: 'days',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function template(overrides: any = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    org_id: orgId,
    channel: 'email',
    subject: 'Your trip {{customerName}}',
    body: 'Hello {{customerName}}, {{destination}}',
    is_active: true,
    ...overrides,
  };
}

function recipient(overrides: any = {}) {
  return {
    contact: 'a@b.com',
    name: 'Test Customer',
    reservationId: '33333333-3333-4333-8333-333333333333',
    departureId: '44444444-4444-4444-8444-444444444444',
    ...overrides,
  };
}

describe('processDueAutomationRules', () => {
  beforeEach(() => {
    resetWorld();
    resolveRecipientsMock.mockReset();
    resolveMessageMock.mockReset();
    loadTemplateContextMock.mockReset();
    extractPlaceholdersMock.mockReset();
    extractPlaceholdersMock.mockReturnValue([]);
  });

  it('ignores inactive rules', async () => {
    world.activeRules = [
      activeRule({ is_active: false, trigger_type: 'after_reservation' }),
    ];
    const result = await processDueAutomationRules({});
    expect(result.rulesExamined).toBe(0);
    expect(result.entitiesFound).toBe(0);
    expect(resolveRecipientsMock).not.toHaveBeenCalled();
  });

  it('skips rule when no compatible active template exists', async () => {
    world.activeRules = [activeRule()];
    world.templates = {}; // no template present
    const result = await processDueAutomationRules({});
    expect(result.rulesExamined).toBe(1);
    expect(result.entitiesFound).toBe(0);
    expect(resolveRecipientsMock).not.toHaveBeenCalled();
  });

  it('skips rule when template channel mismatches rule channel', async () => {
    world.activeRules = [activeRule({ channel: 'email' })];
    world.templates = { any: template({ channel: 'sms' }) };
    const result = await processDueAutomationRules({});
    expect(result.entitiesFound).toBe(0);
    expect(resolveRecipientsMock).not.toHaveBeenCalled();
  });

  it('processes due before_departure entities', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    world.activeRules = [activeRule({ trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days' })];
    world.templates = { any: template() };
    world.departures = [
      { id: 'dep-1', org_id: orgId, depart_at: '2026-08-04T00:00:00.000Z', status: 'active' },
    ];
    resolveRecipientsMock.mockResolvedValue({ recipients: [recipient()] });
    resolveMessageMock.mockReturnValue({ subject: 'Hi', body: 'Hello', unresolved: [] });

    const deps = {
      sendEmail: vi.fn(async () => {}),
      logHistory: vi.fn(async () => {}),
      now: () => now,
    };

    const result = await processDueAutomationRules(deps as any);

    expect(result.entitiesFound).toBe(1);
    expect(result.messagesSent).toBe(1);
    expect(result.completed).toBe(1);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('skips future departures (not yet due)', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    world.activeRules = [activeRule({ trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days' })];
    world.templates = { any: template() };
    // departure is 30 days away → outside the 3-day window
    world.departures = [
      { id: 'dep-1', org_id: orgId, depart_at: '2026-08-30T00:00:00.000Z', status: 'active' },
    ];

    const result = await processDueAutomationRules({ now: () => now });

    expect(result.entitiesFound).toBe(0);
    expect(resolveRecipientsMock).not.toHaveBeenCalled();
  });

  it('processes after_reservation entities (post-creation)', async () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    world.activeRules = [activeRule({
      trigger_type: 'after_reservation',
      timing_offset: 1,
      timing_unit: 'days',
      created_at: '2026-08-01T00:00:00.000Z',
    })];
    world.templates = { any: template() };
    world.reservations = [
      { id: 'res-1', org_id: orgId, created_at: '2026-08-04T00:00:00.000Z', departure_id: 'dep-1' },
    ];
    resolveRecipientsMock.mockResolvedValue({ recipients: [recipient()] });
    resolveMessageMock.mockReturnValue({ subject: 'Hi', body: 'Hello', unresolved: [] });

    const deps = { sendEmail: vi.fn(async () => {}), logHistory: vi.fn(async () => {}), now: () => now };

    const result = await processDueAutomationRules(deps as any);

    expect(result.entitiesFound).toBe(1);
    expect(result.messagesSent).toBe(1);
  });

  it('does not retroactively send after_reservation for pre-rule reservations', async () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    world.activeRules = [activeRule({
      trigger_type: 'after_reservation',
      timing_offset: 1,
      timing_unit: 'days',
      created_at: '2026-08-04T00:00:00.000Z',
    })];
    world.templates = { any: template() };
    // reservation created BEFORE the rule existed → must not be sent
    world.reservations = [
      { id: 'res-1', org_id: orgId, created_at: '2026-08-03T00:00:00.000Z', departure_id: 'dep-1' },
    ];

    const result = await processDueAutomationRules({ now: () => now });

    expect(result.entitiesFound).toBe(0);
    expect(resolveRecipientsMock).not.toHaveBeenCalled();
  });

  it('processes before_payment_due entities and ignores paid obligations', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    world.activeRules = [activeRule({ trigger_type: 'before_payment_due', timing_offset: 3, timing_unit: 'days' })];
    world.templates = { any: template() };
    world.payments = [
      { id: 'pay-1', org_id: orgId, reservation_id: 'res-1', due_date: '2026-08-04T00:00:00.000Z', status: 'pending', installment_number: 1 },
      { id: 'pay-2', org_id: orgId, reservation_id: 'res-1', due_date: '2026-08-04T00:00:00.000Z', status: 'succeeded', installment_number: 2 },
    ];
    resolveRecipientsMock.mockResolvedValue({ recipients: [recipient()] });
    resolveMessageMock.mockReturnValue({ subject: 'Hi', body: 'Hello', unresolved: [] });

    const deps = { sendEmail: vi.fn(async () => {}), logHistory: vi.fn(async () => {}), now: () => now };

    const result = await processDueAutomationRules(deps as any);

    // only the pending payment is due (paid one filtered out)
    expect(result.entitiesFound).toBe(1);
    expect(result.messagesSent).toBe(1);
  });

  it('renders placeholders separately per recipient', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    extractPlaceholdersMock.mockReturnValue(['customerName', 'destination']);
    world.activeRules = [activeRule({ trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days' })];
    world.templates = { any: template() };
    world.departures = [
      { id: 'dep-1', org_id: orgId, depart_at: '2026-08-04T00:00:00.000Z', status: 'active' },
    ];
    resolveRecipientsMock.mockResolvedValue({
      recipients: [
        recipient({ contact: 'alice@x.com', name: 'Alice' }),
        recipient({ contact: 'bob@x.com', name: 'Bob' }),
      ],
    });
    resolveMessageMock
      .mockReturnValueOnce({ subject: 'Hi Alice', body: 'Hello Alice', unresolved: [] })
      .mockReturnValueOnce({ subject: 'Hi Bob', body: 'Hello Bob', unresolved: [] });

    const deps = { sendEmail: vi.fn(async () => {}), logHistory: vi.fn(async () => {}), now: () => now };

    await processDueAutomationRules(deps as any);

    expect(deps.sendEmail).toHaveBeenCalledTimes(2);
    const firstCall = (deps.sendEmail as any).mock.calls[0][0];
    const secondCall = (deps.sendEmail as any).mock.calls[1][0];
    expect(firstCall.recipient).toBe('alice@x.com');
    expect(secondCall.recipient).toBe('bob@x.com');
    expect(firstCall.body).toContain('Alice');
    expect(secondCall.body).toContain('Bob');
    expect(firstCall.body).not.toContain('Bob');
    expect(secondCall.body).not.toContain('Alice');
  });

  it('skips unresolved placeholders and does not send', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    extractPlaceholdersMock.mockReturnValue(['customerName']);
    world.activeRules = [activeRule({ trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days' })];
    world.templates = { any: template() };
    world.departures = [
      { id: 'dep-1', org_id: orgId, depart_at: '2026-08-04T00:00:00.000Z', status: 'active' },
    ];
    resolveRecipientsMock.mockResolvedValue({ recipients: [recipient()] });
    resolveMessageMock.mockReturnValue({ subject: 'Hi', body: 'Hello', unresolved: ['customerName'] });

    const deps = { sendEmail: vi.fn(async () => {}), logHistory: vi.fn(async () => {}), now: () => now };

    const result = await processDueAutomationRules(deps as any);

    expect(result.messagesSent).toBe(0);
    expect(result.messagesSkipped).toBe(1);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.logHistory).toHaveBeenCalled();
    const historyCall = (deps.logHistory as any).mock.calls[0][0];
    expect(historyCall.status).toBe('skipped');
  });

  it('is idempotent across runs (no double-send)', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    world.activeRules = [activeRule({ trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days' })];
    world.templates = { any: template() };
    world.departures = [
      { id: 'dep-1', org_id: orgId, depart_at: '2026-08-04T00:00:00.000Z', status: 'active' },
    ];
    resolveRecipientsMock.mockResolvedValue({ recipients: [recipient()] });
    resolveMessageMock.mockReturnValue({ subject: 'Hi', body: 'Hello', unresolved: [] });

    const deps = { sendEmail: vi.fn(async () => {}), logHistory: vi.fn(async () => {}), now: () => now };

    const first = await processDueAutomationRules(deps as any);
    const second = await processDueAutomationRules(deps as any);

    expect(first.messagesSent).toBe(1);
    expect(second.messagesSent).toBe(0);
    expect(second.alreadyProcessed).toBe(1);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not resolve recipients cross-org (template mismatch)', async () => {
    const deps = { sendEmail: vi.fn(async () => {}), logHistory: vi.fn(async () => {}) };
    world.activeRules = [activeRule()];
    world.templates = {
      any: template({ org_id: '99999999-9999-4999-8999-999999999999' }),
    };

    const result = await processDueAutomationRules(deps as any);

    expect(result.entitiesFound).toBe(0);
    expect(resolveRecipientsMock).not.toHaveBeenCalled();
  });

  it('SMS rule sends body only (no subject populated)', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    world.activeRules = [activeRule({ channel: 'sms', trigger_type: 'before_departure', timing_offset: 3, timing_unit: 'days' })];
    world.templates = { any: template({ channel: 'sms', subject: null, body: 'Reminder {{destination}}' }) };
    world.departures = [
      { id: 'dep-1', org_id: orgId, depart_at: '2026-08-04T00:00:00.000Z', status: 'active' },
    ];
    resolveRecipientsMock.mockResolvedValue({ recipients: [recipient()] });
    resolveMessageMock.mockReturnValue({ subject: null, body: 'Reminder', unresolved: [] });

    const deps = { sendSms: vi.fn(async () => {}), logHistory: vi.fn(async () => {}), now: () => now };

    const result = await processDueAutomationRules(deps as any);

    expect(result.messagesSent).toBe(1);
    expect(deps.sendSms).toHaveBeenCalledTimes(1);
    const call = (deps.sendSms as any).mock.calls[0][0];
    expect(call.recipient).toBe('a@b.com');
  });
});
