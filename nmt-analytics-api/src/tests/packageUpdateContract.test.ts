import { beforeAll, describe, expect, it, vi } from 'vitest';

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
  supabaseAdmin: {},
  handleSupabaseError: vi.fn(),
}));

let buildPackageUpdateData: typeof import('../routes/packages').buildPackageUpdateData;
let normalizePackageVariantInput: typeof import('../routes/packages').normalizePackageVariantInput;

beforeAll(async () => {
  const mod = await import('../routes/packages');
  buildPackageUpdateData = mod.buildPackageUpdateData;
  normalizePackageVariantInput = mod.normalizePackageVariantInput;
});

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
});
