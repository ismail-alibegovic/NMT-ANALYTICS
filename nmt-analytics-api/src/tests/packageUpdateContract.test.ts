import { beforeAll, describe, expect, it, vi } from 'vitest';

let rows: Record<string, any[]> = {};

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auditLogger', () => ({
  auditPackageCreate: (_req: any, _res: any, next: any) => next(),
  auditPackageUpdate: (_req: any, _res: any, next: any) => next(),
  auditPackageDelete: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => query(table)),
  },
  handleSupabaseError: vi.fn(),
}));

let buildPackageUpdateData: typeof import('../routes/packages').buildPackageUpdateData;
let ensurePackageCurrencyChangeAllowed: typeof import('../routes/packages').ensurePackageCurrencyChangeAllowed;
let normalizePackageVariantInput: typeof import('../routes/packages').normalizePackageVariantInput;

beforeAll(async () => {
  const mod = await import('../routes/packages');
  buildPackageUpdateData = mod.buildPackageUpdateData;
  ensurePackageCurrencyChangeAllowed = mod.ensurePackageCurrencyChangeAllowed;
  normalizePackageVariantInput = mod.normalizePackageVariantInput;
});

function query(table: string) {
  const state = {
    filters: [] as Array<(row: any) => boolean>,
    countMode: false,
  };

  const api: any = {
    select: vi.fn((_clause?: string, options?: { count?: string; head?: boolean }) => {
      state.countMode = !!options?.count;
      return api;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push((row) => row[column] === value);
      return api;
    }),
    single: vi.fn(async () => {
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      const row = result[0] || null;
      return { data: row, error: row ? null : { code: 'PGRST116', message: 'Not found' } };
    }),
    then(resolve: any) {
      const result = (rows[table] || []).filter((row) => state.filters.every((filter) => filter(row)));
      return Promise.resolve({ data: state.countMode ? null : result, error: null, count: result.length }).then(resolve);
    },
  };

  return api;
}

describe('package update contract helpers', () => {
  it('maps canonical package fields to database column names', () => {
    const updateData = buildPackageUpdateData({
      name: 'Updated package',
      destination: 'Medina',
      price: 900,
      currency: 'EUR',
      active: false,
      description: 'Updated description',
      durationDays: 7,
      transportType: 'bus',
      transportCapacity: 50,
      tripType: 'pilgrimage',
      travelerRequirements: {
        travelScope: 'international',
        documentType: 'passport',
        allowFillLater: true,
        requireExpiry: true,
      },
      variants: [
        normalizePackageVariantInput({
          id: 'variant-1',
          name: 'Premium',
          tier: 'deluxe',
          accommodation: 'hotel',
          priceModifier: 150,
          capacity: 20,
          currency: 'EUR',
        }),
      ],
    });

    expect(updateData).toEqual({
      name: 'Updated package',
      destination: 'Medina',
      base_price: 900,
      currency: 'EUR',
      is_active: false,
      description: 'Updated description',
      duration_days: 7,
      transport_type: 'bus',
      trip_type: 'pilgrimage',
      transport_capacity: 50,
      traveler_requirements: {
        travel_scope: 'international',
        document_type: 'passport',
        allow_fill_later: true,
        require_expiry: true,
      },
      variants: [
        {
          id: 'variant-1',
          name: 'Premium',
          tier: 'deluxe',
          accommodation: 'hotel',
          priceModifier: 150,
          capacity: 20,
          currency: 'EUR',
          hotelName: null,
          roomType: null,
        },
      ],
    });
  });

  it('normalizes legacy variant aliases while preserving compatibility', () => {
    const normalized = normalizePackageVariantInput({
      name: 'Standard',
      tier: 'delux',
      hotelName: 'Hotel 5*',
      price_delta: 75,
      capacity: 30,
    });

    expect(normalized).toEqual({
      name: 'Standard',
      tier: 'deluxe',
      accommodation: 'Hotel 5*',
      priceModifier: 75,
      capacity: 30,
      currency: null,
      hotelName: 'Hotel 5*',
      roomType: null,
    });
  });

  it('accepts train transport on package update mapping', () => {
    expect(buildPackageUpdateData({ transportType: 'train' })).toEqual({
      transport_type: 'train',
    });
  });

  it('accepts ship transport on package update mapping', () => {
    expect(buildPackageUpdateData({ transportType: 'ship' })).toEqual({
      transport_type: 'ship',
    });
  });

  it('accepts mixed transport on package update mapping', () => {
    expect(buildPackageUpdateData({ transportType: 'mixed' })).toEqual({
      transport_type: 'mixed',
    });
  });

  it('keeps existing bus, flight, and none transport mappings', () => {
    expect(buildPackageUpdateData({ transportType: 'bus' })).toEqual({
      transport_type: 'bus',
    });
    expect(buildPackageUpdateData({ transportType: 'flight' })).toEqual({
      transport_type: 'flight',
    });
    expect(buildPackageUpdateData({ transportType: 'none' })).toEqual({
      transport_type: 'none',
    });
  });

  it('allows package currency changes when no package cost items exist', async () => {
    rows = {
      packages: [{ id: 'pkg-1', org_id: 'org-1', currency: 'BAM' }],
      package_cost_items: [],
    };

    await expect(ensurePackageCurrencyChangeAllowed('org-1', 'pkg-1', 'EUR')).resolves.toEqual({ allowed: true });
  });

  it('rejects package currency changes when package costs already exist and preserves cost currency', async () => {
    rows = {
      packages: [{ id: 'pkg-1', org_id: 'org-1', currency: 'BAM' }],
      package_cost_items: [{ id: 'cost-1', org_id: 'org-1', package_id: 'pkg-1', currency: 'BAM', unit_cost: 100 }],
    };

    const result = await ensurePackageCurrencyChangeAllowed('org-1', 'pkg-1', 'EUR');

    expect(result).toMatchObject({
      allowed: false,
      status: 400,
      code: 'PACKAGE_COST_CURRENCY_LOCKED',
    });
    expect(rows.packages[0].currency).toBe('BAM');
    expect(rows.package_cost_items[0]).toMatchObject({ currency: 'BAM', unit_cost: 100 });
  });

  it('allows same-currency and unrelated package updates when package costs exist', async () => {
    rows = {
      packages: [{ id: 'pkg-1', org_id: 'org-1', currency: 'BAM' }],
      package_cost_items: [{ id: 'cost-1', org_id: 'org-1', package_id: 'pkg-1', currency: 'BAM' }],
    };

    await expect(ensurePackageCurrencyChangeAllowed('org-1', 'pkg-1', 'BAM')).resolves.toEqual({ allowed: true });
    await expect(ensurePackageCurrencyChangeAllowed('org-1', 'pkg-1', undefined)).resolves.toEqual({ allowed: true });
  });
});
