import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdmin } from '../lib/supabase';
import { assertNoForeignSeedDependents, resolveGoldenDemoTargetOrg } from '../scripts/seed_demo';

vi.mock('../lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }));

type QueryRecord = {
  table: string;
  columns?: string;
  eq: { column: string; value: unknown }[];
  inFilters: { column: string; values: string[] }[];
  notFilters: { column: string; values: string }[];
  mutation?: string;
};

const expectOrgScoped = (queries: QueryRecord[], orgId: string) => {
  expect(queries.length).toBeGreaterThan(0);
  for (const query of queries) {
    expect(query.eq.some((filter) => filter.column === 'org_id' && filter.value === orgId)).toBe(true);
  }
};

describe('golden demo seed: target organization resolution', () => {
  const scenarios = [
    { DEMO_TARGET_ORG_ID: '', DEMO_RESET_CONFIRMATION: '' },
    { DEMO_TARGET_ORG_ID: 'org-1', DEMO_RESET_CONFIRMATION: '' },
    { DEMO_TARGET_ORG_ID: 'org-1', DEMO_RESET_CONFIRMATION: 'YES' },
  ];
  const expectations = [
    /DEMO_TARGET_ORG_ID is required/,
    /DEMO_RESET_CONFIRMATION must be set to YES_RESET_DEMO_DATA/,
    /DEMO_RESET_CONFIRMATION must be set to YES_RESET_DEMO_DATA/,
  ];

  beforeEach(() => {
    vi.resetModules();
  });

  it.each(scenarios.map((scenario, index) => [index, scenario, expectations[index]] as const))(
    'refuses ambiguous or unconfirmed targets (case %i)',
    async (_index, env, expected) => {
      vi.stubEnv('DEMO_TARGET_ORG_ID', env.DEMO_TARGET_ORG_ID);
      vi.stubEnv('DEMO_RESET_CONFIRMATION', env.DEMO_RESET_CONFIRMATION);
      await expect(resolveGoldenDemoTargetOrg()).rejects.toThrow(expected);
    },
  );

  it('refuses an unknown organization id without querying other organizations', async () => {
    vi.stubEnv('DEMO_TARGET_ORG_ID', 'org-missing');
    vi.stubEnv('DEMO_RESET_CONFIRMATION', 'YES_RESET_DEMO_DATA');
    const queries: QueryRecord[] = [];
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      const query: QueryRecord = { table, eq: [], inFilters: [], notFilters: [] };
      queries.push(query);
      const chain: any = {
        select: (columns: string) => {
          query.columns = columns;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          query.eq.push({ column, value });
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return chain;
    });

    await expect(resolveGoldenDemoTargetOrg()).rejects.toThrow(/does not reference an existing organization/);
    expect(queries).toHaveLength(1);
    expect(queries[0].table).toBe('organizations');
    expect(queries[0].eq).toEqual([{ column: 'id', value: 'org-missing' }]);
  });

  it('returns the confirmed target and never re-scopes to another organization', async () => {
    vi.stubEnv('DEMO_TARGET_ORG_ID', 'org-1');
    vi.stubEnv('DEMO_RESET_CONFIRMATION', 'YES_RESET_DEMO_DATA');
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      expect(table).toBe('organizations');
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: { id: 'org-1', name: 'Other Agency', slug: 'other-agency', currency: 'EUR', timezone: 'UTC' },
            error: null,
          }),
      };
      return chain;
    });

    await expect(resolveGoldenDemoTargetOrg()).resolves.toEqual({ orgId: 'org-1', isLegacyDemoOrg: false });
  });
});

describe('golden demo seed: non-destructive preflight for seed-owned records', () => {
  let queries: QueryRecord[];
  let foreignRows: Record<string, { id: string }[]>;
  let failingTable: string | undefined;

  const owned = {
    packages: ['p-seed-1'],
    hotels: [],
    flights: [],
    customers: ['c-seed-1'],
    reservations: ['r-seed-1'],
    trip_passenger_groups: [],
    departures: ['d-seed-1'],
    package_hotels: [],
    hotel_allocations: [],
    departure_room_slots: [],
    departure_room_slot_assignments: [],
    reservation_accommodation_requirements: [],
    departure_passengers: [],
    payments: [],
    transactions: [],
    departure_flights: [],
    trip_passenger_group_members: [],
  };

  beforeEach(() => {
    queries = [];
    foreignRows = {};
    failingTable = undefined;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      const query: QueryRecord = { table, eq: [], inFilters: [], notFilters: [] };
      queries.push(query);
      const chain: any = {
        select: (columns: string) => {
          query.columns = columns;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          query.eq.push({ column, value });
          return chain;
        },
        in: (column: string, values: string[]) => {
          query.inFilters.push({ column, values });
          return chain;
        },
        not: (column: string, _operator: string, values: string) => {
          query.notFilters.push({ column, values });
          return chain;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          if (table === failingTable) {
            return Promise.resolve({ data: null, error: { message: 'unavailable' } }).then(resolve, reject);
          }
          let rows = foreignRows[table] ?? [];
          for (const notFilter of query.notFilters) {
            const excluded = notFilter.values.replace(/^[(]|[)]$/g, '').split(',').filter(Boolean);
            rows = rows.filter((row: any) => !excluded.includes(row[notFilter.column]));
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return chain;
    });
  });

  it('refuses user-created departures attached to seed-owned packages', async () => {
    foreignRows = { departures: [{ id: 'user-dep-1' }] };
    await expect(assertNoForeignSeedDependents('org-1', owned)).rejects.toThrow(
      /Golden demo seed refused to reset seed-owned records: user-created departures reference seed-owned packages/,
    );
    const probe = queries.find((query) => query.table === 'departures');
    expect(probe?.inFilters[0]).toEqual({ column: 'package_id', values: ['p-seed-1'] });
    expect(probe?.notFilters[0]).toEqual({ column: 'id', values: '(d-seed-1)' });
    expectOrgScoped(queries, 'org-1');
  });

  it('refuses user-created reservations attached to seed-owned departures', async () => {
    foreignRows = { departures: [], reservations: [{ id: 'user-res-1' }] };
    await expect(assertNoForeignSeedDependents('org-1', owned)).rejects.toThrow(
      /user-created reservations are attached to seed-owned departures/,
    );
    const probes = queries.filter((query) => query.table === 'reservations');
    expect(probes[0]?.inFilters[0]).toEqual({ column: 'departure_id', values: ['d-seed-1'] });
    expectOrgScoped(queries, 'org-1');
  });

  it('refuses user-created reservations referencing seed-owned customers', async () => {
    foreignRows = { departures: [], reservations: [{ id: 'user-res-2' }] };
    const reservationQueries: QueryRecord[] = [];
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      const query: QueryRecord = { table, eq: [], inFilters: [], notFilters: [] };
      queries.push(query);
      if (table === 'reservations') reservationQueries.push(query);
      const chain: any = {
        select: (columns: string) => {
          query.columns = columns;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          query.eq.push({ column, value });
          return chain;
        },
        in: (column: string, values: string[]) => {
          query.inFilters.push({ column, values });
          return chain;
        },
        not: (column: string, _operator: string, values: string) => {
          query.notFilters.push({ column, values });
          return chain;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          const isCustomerProbe = query.inFilters.some((filter) => filter.column === 'customer_id');
          const rows =
            table === 'reservations' && isCustomerProbe
              ? [{ id: 'user-res-2' }]
              : table === 'reservations'
                ? []
                : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return chain;
    });

    await expect(assertNoForeignSeedDependents('org-1', owned)).rejects.toThrow(
      /user-created reservations reference seed-owned customers/,
    );
    const customerProbe = reservationQueries.find((query) =>
      query.inFilters.some((filter) => filter.column === 'customer_id'),
    );
    expect(customerProbe?.inFilters[0]).toEqual({ column: 'customer_id', values: ['c-seed-1'] });
    expectOrgScoped(queries, 'org-1');
  });

  it('permits the cleanup when only seed-owned records reference each other', async () => {
    foreignRows = { departures: [{ id: 'd-seed-1' }] };
    await expect(assertNoForeignSeedDependents('org-1', owned)).resolves.toBeUndefined();
    expectOrgScoped(queries, 'org-1');
  });

  it('fails closed on database errors instead of proceeding to cleanup', async () => {
    failingTable = 'reservations';
    await expect(assertNoForeignSeedDependents('org-1', owned)).rejects.toThrow(
      /check foreign dependents in reservations: unavailable/,
    );
  });

  it('never issues a mutation while verifying dependents', async () => {
    await expect(assertNoForeignSeedDependents('org-1', owned)).resolves.toBeUndefined();
    for (const query of queries) {
      expect(query.mutation).toBeUndefined();
      expect(query.columns).toBe('id');
    }
  });
});
