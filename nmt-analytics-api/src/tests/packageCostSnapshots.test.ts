import { beforeEach, describe, expect, it, vi } from 'vitest';
import { materializeDepartureCostsFromPackage } from '../lib/packageCostSnapshots';

let rows: Record<string, any[]>;

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => query(table)),
  },
}));

function query(table: string) {
  const state = {
    filters: [] as Array<(row: any) => boolean>,
    upsertRows: [] as any[],
  };

  const api: any = {
    select: vi.fn(() => api),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    order: vi.fn(() => api),
    upsert: vi.fn((data: any[]) => {
      state.upsertRows = data;
      for (const incoming of data) {
        const exists = rows[table].some((row) =>
          row.org_id === incoming.org_id &&
          row.departure_id === incoming.departure_id &&
          row.source_package_cost_item_id === incoming.source_package_cost_item_id,
        );
        if (!exists) rows[table].push({ id: `dep-cost-${rows[table].length + 1}`, ...incoming });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    then(resolve: any) {
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      return Promise.resolve({ data: result, error: null, count: result.length }).then(resolve);
    },
  };

  return api;
}

beforeEach(() => {
  rows = {
    package_cost_items: [
      { id: 'pkg-cost-1', org_id: 'org-1', package_id: 'pkg-1', category: 'transport', label: 'Transport', supplier_id: null, quantity: 1, unit_cost: 5000, currency: 'BAM', notes: 'T1' },
    ],
    departure_cost_items: [],
  };
});

describe('package to departure cost snapshots', () => {
  it('snapshots package costs into departure costs without live-binding later package edits', async () => {
    await materializeDepartureCostsFromPackage({ orgId: 'org-1', packageId: 'pkg-1', departureId: 'dep-a', currency: 'BAM' });
    rows.package_cost_items[0].unit_cost = 5500;
    await materializeDepartureCostsFromPackage({ orgId: 'org-1', packageId: 'pkg-1', departureId: 'dep-b', currency: 'BAM' });

    expect(rows.departure_cost_items).toMatchObject([
      { departure_id: 'dep-a', unit_cost: 5000, source_package_cost_item_id: 'pkg-cost-1' },
      { departure_id: 'dep-b', unit_cost: 5500, source_package_cost_item_id: 'pkg-cost-1' },
    ]);
  });

  it('does not duplicate snapshots when materialization is retried for the same departure', async () => {
    await materializeDepartureCostsFromPackage({ orgId: 'org-1', packageId: 'pkg-1', departureId: 'dep-a', currency: 'BAM' });
    await materializeDepartureCostsFromPackage({ orgId: 'org-1', packageId: 'pkg-1', departureId: 'dep-a', currency: 'BAM' });

    expect(rows.departure_cost_items).toHaveLength(1);
  });

  it('keeps zero-cost packages on the existing departure creation path', async () => {
    rows.package_cost_items = [];
    const result = await materializeDepartureCostsFromPackage({ orgId: 'org-1', packageId: 'pkg-empty', departureId: 'dep-empty', currency: 'BAM' });

    expect(result).toEqual({ inserted: 0 });
    expect(rows.departure_cost_items).toHaveLength(0);
  });
});
