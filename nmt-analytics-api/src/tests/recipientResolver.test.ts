import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exact resolution-semantics tests for the reusable recipient resolver.
 * The resolver is the single source of truth for who actually receives a
 * message, so these assert precise counts, exact skip reasons, and strict
 * org / membership scoping — no permissive ranges.
 */

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';

const DEP_A = 'dep-a';
const DEP_B = 'dep-b';

// departure_passengers rows
const passengers = [
  { id: 'pA1', org_id: ORG_A, departure_id: DEP_A, reservation_id: 'resA1', full_name: 'Alice', email: 'alice@x.com', phone: '+38761000001' },
  { id: 'pA2', org_id: ORG_A, departure_id: DEP_A, reservation_id: 'resA2', full_name: 'Bob', email: 'bob@x.com', phone: '+38761000002' },
  { id: 'pA3', org_id: ORG_A, departure_id: DEP_A, reservation_id: 'resA3', full_name: 'NoContact', email: null, phone: null },
  { id: 'pA4', org_id: ORG_A, departure_id: DEP_A, reservation_id: 'resA4', full_name: 'BadData', email: 'not-an-email', phone: '123' },
  { id: 'pA5', org_id: ORG_A, departure_id: DEP_A, reservation_id: 'resA5', full_name: 'AliceDup', email: 'ALICE@x.com', phone: '+38761000001' },
  { id: 'pB1', org_id: ORG_B, departure_id: DEP_B, reservation_id: 'resB1', full_name: 'Foreign', email: 'foreign@y.com', phone: '+38761999999' },
];

const reservations = [
  { id: 'resA1', org_id: ORG_A, departure_id: DEP_A, customer_name: 'Alice C', customer_phone: '+38761000010', customers: { id: 'cA1', full_name: 'Alice Customer', phone: '+38761000010', email: 'customer-a@x.com' } },
  { id: 'resB1', org_id: ORG_B, departure_id: DEP_B, customer_name: 'B C', customer_phone: '+38761000099', customers: { id: 'cB1', full_name: 'B Customer', phone: '+38761000099', email: 'customer-b@y.com' } },
];

const groups = [
  { id: 'gA1', org_id: ORG_A, departure_id: DEP_A },
  { id: 'gDup', org_id: ORG_A, departure_id: DEP_A },
  { id: 'gB1', org_id: ORG_B, departure_id: DEP_B },
];

const groupMembers = [
  { group_id: 'gA1', passenger_id: 'pA1' },
  { group_id: 'gA1', passenger_id: 'pA2' },
  { group_id: 'gDup', passenger_id: 'pA1' },
  { group_id: 'gDup', passenger_id: 'pA5' },
  { group_id: 'gB1', passenger_id: 'pB1' },
];

const departures = [
  { id: DEP_A, org_id: ORG_A },
  { id: DEP_B, org_id: ORG_B },
];

const db: Record<string, any[]> = {
  departure_passengers: passengers,
  reservations,
  trip_passenger_groups: groups,
  trip_passenger_group_members: groupMembers,
  departures,
};

function makeBuilder(table: string) {
  const eqFilters: Record<string, unknown> = {};
  const inFilters: Record<string, unknown[]> = {};
  const rows = () => {
    let result = db[table] ?? [];
    for (const [col, val] of Object.entries(eqFilters)) result = result.filter((r) => r[col] === val);
    for (const [col, vals] of Object.entries(inFilters)) result = result.filter((r) => vals.includes(r[col]));
    return result;
  };
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: unknown) => { eqFilters[col] = val; return builder; },
    in: (col: string, vals: unknown[]) => { inFilters[col] = vals; return builder; },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: { data: any[]; error: null }) => void) => resolve({ data: rows(), error: null }),
  };
  return builder;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { from: (table: string) => makeBuilder(table) },
}));

let resolveRecipients: typeof import('../lib/recipientResolver').resolveRecipients;
let RecipientTargetNotFoundError: typeof import('../lib/recipientResolver').RecipientTargetNotFoundError;

beforeEach(async () => {
  const mod = await import('../lib/recipientResolver');
  resolveRecipients = mod.resolveRecipients;
  RecipientTargetNotFoundError = mod.RecipientTargetNotFoundError;
});

describe('recipientResolver — direct', () => {
  it('direct email — one valid recipient', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'direct', email: 'Direct@X.com' });
    expect(r.totalCandidates).toBe(1);
    expect(r.sendableRecipients).toBe(1);
    expect(r.recipients[0].contact).toBe('direct@x.com');
    expect(r.relatedReservationId).toBeNull();
    expect(r.relatedDepartureId).toBeNull();
  });

  it('direct SMS — one valid recipient normalized to E.164', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'sms', targetType: 'direct', phone: '0038761000123' });
    expect(r.sendableRecipients).toBe(1);
    expect(r.recipients[0].contact).toBe('+38761000123');
  });

  it('invalid phone — direct SMS skipped as invalid', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'sms', targetType: 'direct', phone: 'abc' });
    expect(r.sendableRecipients).toBe(0);
    expect(r.skippedInvalid).toBe(1);
    expect(r.skipped[0].reason).toBe('invalid');
  });

  it('invalid email — direct email skipped as invalid', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'direct', email: 'nope' });
    expect(r.sendableRecipients).toBe(0);
    expect(r.skippedInvalid).toBe(1);
  });
});

describe('recipientResolver — reservation', () => {
  it('reservation target uses booking customer contact + relates reservation/departure', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'reservation', targetId: 'resA1' });
    expect(r.sendableRecipients).toBe(1);
    expect(r.recipients[0].contact).toBe('customer-a@x.com');
    expect(r.relatedReservationId).toBe('resA1');
    expect(r.relatedDepartureId).toBe(DEP_A);
  });

  it('wrong-org reservation is not found', async () => {
    await expect(
      resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'reservation', targetId: 'resB1' }),
    ).rejects.toBeInstanceOf(RecipientTargetNotFoundError);
  });
});

describe('recipientResolver — passenger', () => {
  it('passenger target uses departure_passengers contact + identity', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'passenger', targetId: 'pA1' });
    expect(r.sendableRecipients).toBe(1);
    expect(r.recipients[0].contact).toBe('alice@x.com');
    expect(r.recipients[0].passengerId).toBe('pA1');
  });

  it('missing contact — passenger with no email is skipped as empty', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'passenger', targetId: 'pA3' });
    expect(r.totalCandidates).toBe(1);
    expect(r.sendableRecipients).toBe(0);
    expect(r.skippedEmpty).toBe(1);
    expect(r.skipped[0].reason).toBe('empty');
  });

  it('invalid contact — passenger with malformed email is skipped as invalid', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'passenger', targetId: 'pA4' });
    expect(r.sendableRecipients).toBe(0);
    expect(r.skippedInvalid).toBe(1);
  });

  it('wrong-org passenger is not found', async () => {
    await expect(
      resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'passenger', targetId: 'pB1' }),
    ).rejects.toBeInstanceOf(RecipientTargetNotFoundError);
  });
});

describe('recipientResolver — group', () => {
  it('group contains only its own members', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'group', targetId: 'gA1' });
    expect(r.totalCandidates).toBe(2);
    expect(r.sendableRecipients).toBe(2);
    const ids = r.recipients.map((x) => x.passengerId).sort();
    expect(ids).toEqual(['pA1', 'pA2']);
    expect(r.relatedDepartureId).toBe(DEP_A);
    expect(r.relatedReservationId).toBeNull();
  });

  it('group deduplicates recipients sharing a normalized contact', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'group', targetId: 'gDup' });
    expect(r.totalCandidates).toBe(2);
    expect(r.sendableRecipients).toBe(1);
    expect(r.skippedDuplicates).toBe(1);
    expect(r.skipped[0].reason).toBe('duplicate');
  });

  it('wrong-org group is not found', async () => {
    await expect(
      resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'group', targetId: 'gB1' }),
    ).rejects.toBeInstanceOf(RecipientTargetNotFoundError);
  });
});

describe('recipientResolver — departure', () => {
  it('departure contains only its passengers (never reservation customers)', async () => {
    const r = await resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'departure', targetId: DEP_A });
    // depA passengers: pA1, pA2, pA3(empty), pA4(invalid), pA5(dup of pA1)
    expect(r.totalCandidates).toBe(5);
    expect(r.sendableRecipients).toBe(2); // pA1, pA2 (pA5 dup, pA3 empty, pA4 invalid)
    expect(r.skippedEmpty).toBe(1);
    expect(r.skippedInvalid).toBe(1);
    expect(r.skippedDuplicates).toBe(1);
    for (const rec of r.recipients) {
      expect(rec.departureId).toBe(DEP_A);
    }
    // no foreign-org passenger leaked in
    expect(r.recipients.find((x) => x.passengerId === 'pB1')).toBeUndefined();
    expect(r.relatedDepartureId).toBe(DEP_A);
    expect(r.relatedReservationId).toBeNull();
  });

  it('wrong-org departure is not found', async () => {
    await expect(
      resolveRecipients({ orgId: ORG_A, channel: 'email', targetType: 'departure', targetId: DEP_B }),
    ).rejects.toBeInstanceOf(RecipientTargetNotFoundError);
  });
});
