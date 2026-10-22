import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdmin } from '../lib/supabase';
import { assertEmptyDemoTarget } from '../scripts/seed_demo';

vi.mock('../lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }));

type QueryRecord = { table: string; orgId?: string; columns?: string; limited: boolean };

describe('demo seed non-destructive preflight', () => {
  const queries: QueryRecord[] = [];
  let occupied: string | undefined;
  let failure: string | undefined;
  let missingData = false;
  let registryRows: { entity: string; record_id: string }[] = [];
  let departureRows: { id: string; package_id: string }[] = [];
  let reservationDepartureRows: { id: string; departure_id: string }[] = [];
  let reservationCustomerRows: { id: string; customer_id: string }[] = [];

  const resultFor = (query: QueryRecord) => {
    if (query.limited) {
      if (missingData) return { data: null, error: null };
      if (query.table === failure) return { data: null, error: { message: 'unavailable' } };
      return { data: query.table === occupied ? [{ id: 'existing-record' }] : [], error: null };
    }
    if (query.table === failure) return { data: null, error: { message: 'unavailable' } };
    if (query.table === 'seed_owned_records') return { data: registryRows, error: null };
    if (query.table === 'departures') return { data: departureRows, error: null };
    if (query.table === 'reservations' && query.columns?.includes('departure_id')) return { data: reservationDepartureRows, error: null };
    if (query.table === 'reservations' && query.columns?.includes('customer_id')) return { data: reservationCustomerRows, error: null };
    return { data: [], error: null };
  };

  beforeEach(() => {
    queries.length = 0;
    occupied = undefined;
    failure = undefined;
    missingData = false;
    registryRows = [];
    departureRows = [];
    reservationDepartureRows = [];
    reservationCustomerRows = [];
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      const query: QueryRecord = { table, orgId: undefined, columns: undefined, limited: false };
      queries.push(query);
      const chain: any = {
        select: vi.fn((columns: string) => {
          query.columns = columns;
          return chain;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          if (column === 'org_id') query.orgId = value as string;
          return chain;
        }),
        limit: vi.fn(() => {
          query.limited = true;
          return Promise.resolve(resultFor(query));
        }),
      };
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(resultFor(query)).then(resolve, reject);
      return chain;
    });
  });

  it('permits an empty target and scopes every read to that organization', async () => {
    await expect(assertEmptyDemoTarget('demo-org')).resolves.toBeUndefined();
    expect(queries).toHaveLength(17);
    expect(queries.every(query => query.orgId === 'demo-org' && query.limited)).toBe(true);
  });

  it.each(['seed_owned_records', 'departures', 'reservations', 'payments', 'departure_room_slot_assignments'])('refuses existing %s without any mutation capability', async table => {
    occupied = table;
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('Reset is disabled');
    expect(queries[queries.length - 1]?.table).toBe(table);
  });

  it('refuses database errors', async () => {
    failure = 'seed_owned_records';
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('unavailable');
  });

  it('refuses a missing query result', async () => {
    missingData = true;
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('not confirmed empty');
  });

  it('refuses an interrupted run on the next invocation', async () => {
    await assertEmptyDemoTarget('demo-org');
    occupied = 'packages';
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('Reset is disabled');
  });

  it('reports user-created records that depend on seed-owned data', async () => {
    occupied = 'departures';
    registryRows = [
      { entity: 'packages', record_id: 'seed-pkg-1' },
      { entity: 'departures', record_id: 'seed-dep-1' },
      { entity: 'customers', record_id: 'seed-cust-1' },
      { entity: 'reservations', record_id: 'seed-res-1' },
    ];
    departureRows = [{ id: 'user-dep-1', package_id: 'seed-pkg-1' }];
    reservationDepartureRows = [{ id: 'user-res-1', departure_id: 'seed-dep-1' }];
    reservationCustomerRows = [{ id: 'user-res-2', customer_id: 'seed-cust-1' }];

    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow(
      'Golden demo seed refused to reset seed-owned records',
    );
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('user-created departures reference seed-owned packages.');
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('user-created reservations are attached to seed-owned departures.');
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('user-created reservations reference seed-owned customers.');
  });

  it('does not report seed-owned records as user-created dependencies', async () => {
    occupied = 'departures';
    registryRows = [
      { entity: 'packages', record_id: 'seed-pkg-1' },
      { entity: 'departures', record_id: 'seed-dep-1' },
      { entity: 'customers', record_id: 'seed-cust-1' },
      { entity: 'reservations', record_id: 'seed-res-1' },
    ];
    departureRows = [{ id: 'seed-dep-1', package_id: 'seed-pkg-1' }];
    reservationDepartureRows = [{ id: 'seed-res-1', departure_id: 'seed-dep-1' }];
    reservationCustomerRows = [{ id: 'seed-res-1', customer_id: 'seed-cust-1' }];

    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('Golden demo seed refused to reset seed-owned records');
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('Reset is disabled');
    await expect(assertEmptyDemoTarget('demo-org')).rejects.not.toThrow('user-created');
  });

  it('scopes dependency reads to the target organization only', async () => {
    occupied = 'departures';
    registryRows = [{ entity: 'packages', record_id: 'seed-pkg-1' }];
    departureRows = [{ id: 'user-dep-1', package_id: 'seed-pkg-1' }];
    await expect(assertEmptyDemoTarget('demo-org')).rejects.toThrow('Reset is disabled');
    expect(queries.length).toBeGreaterThan(17);
    expect(queries.every(query => query.orgId === 'demo-org')).toBe(true);
  });
});
