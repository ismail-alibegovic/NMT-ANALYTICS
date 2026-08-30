import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDelete = vi.fn();

vi.mock('../api/client', () => ({
  get: (...args: any[]) => apiGet(...args),
  post: (...args: any[]) => apiPost(...args),
  patch: (...args: any[]) => apiPatch(...args),
  del: (...args: any[]) => apiDelete(...args),
}));

describe('packages API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes snake_case package fields and legacy variant fields on read', async () => {
    const packagePayload = {
      id: 'pkg-1',
      name: 'Umrah',
      destination: 'Mekka',
      base_price: 1500,
      currency: 'BAM',
      is_active: true,
      duration_days: 10,
      transport_type: 'bus',
      transport_capacity: 50,
      trip_type: 'pilgrimage',
      created_at: '2026-08-30T10:00:00.000Z',
      package_hotels: [
        {
          id: 'link-1',
          package_id: 'pkg-1',
          hotel_id: 'hotel-1',
          room_options: [
            { type: 'double', label: 'Double room', net_price: 80, sell_price: 100, available: 5 },
          ],
          price_modifier: 25,
          sort_order: 2,
          created_at: '2026-08-30T11:00:00.000Z',
          updated_at: '2026-08-30T11:00:00.000Z',
          hotel: {
            id: 'hotel-1',
            name: 'Hotel Bosna',
            destination: 'Sarajevo',
            stars: 4,
          },
        },
      ],
      variants: [
        {
          id: 'variant-1',
          name: 'Standard',
          tier: 'delux',
          hotelName: 'Hotel 5*',
          price_delta: 120,
          capacity: 30,
          currency: 'BAM',
        },
      ],
    };

    apiGet
      .mockResolvedValueOnce({
      data: {
        data: [
          packagePayload,
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    })
      .mockResolvedValueOnce({
        data: {
          data: packagePayload,
        },
      });

    const { getPackages, getPackageById } = await import('../api/packages');
    const result = await getPackages({ page: 1, limit: 10 });
    const detail = await getPackageById('pkg-1');

    expect(result.data[0]).toMatchObject({
      price: 1500,
      active: true,
      durationDays: 10,
      transportType: 'bus',
      transportCapacity: 50,
      tripType: 'pilgrimage',
      transport_type: 'bus',
      transport_capacity: 50,
      trip_type: 'pilgrimage',
    });
    expect(result.data[0].variants?.[0]).toMatchObject({
      id: 'variant-1',
      tier: 'deluxe',
      accommodation: 'Hotel 5*',
      priceModifier: 120,
      capacity: 30,
    });
    expect(detail.packageHotels?.[0]).toMatchObject({
      id: 'link-1',
      hotelId: 'hotel-1',
      priceModifier: 25,
      sortOrder: 2,
      hotel: {
        name: 'Hotel Bosna',
        destination: 'Sarajevo',
        stars: 4,
      },
    });
    expect(detail.packageHotels?.[0].roomOptions).toEqual([
      { type: 'double', label: 'Double room', net_price: 80, sell_price: 100, available: 5 },
    ]);
  });

  it('sends canonical camelCase request fields on update', async () => {
    apiPatch.mockResolvedValue({
      data: {
        id: 'pkg-1',
        name: 'Updated package',
        destination: 'Istanbul',
        base_price: 900,
        currency: 'EUR',
        is_active: true,
        description: 'Updated',
        duration_days: 7,
        transport_type: 'bus',
        transport_capacity: 50,
        trip_type: 'city',
        created_at: '2026-08-30T10:00:00.000Z',
        variants: [],
      },
    });

    const { updatePackage } = await import('../api/packages');

    await updatePackage('pkg-1', {
      name: 'Updated package',
      destination: 'Istanbul',
      price: 900,
      currency: 'EUR',
      active: true,
      description: 'Updated',
      durationDays: 7,
      transportType: 'bus',
      transportCapacity: 50,
      tripType: 'city',
      variants: [
        {
          id: 'variant-1',
          name: 'Premium',
          tier: 'deluxe',
          accommodation: 'hotel',
          priceModifier: 100,
          capacity: 20,
          currency: 'EUR',
        },
      ],
    });

    expect(apiPatch).toHaveBeenCalledWith('/packages/pkg-1', {
      name: 'Updated package',
      destination: 'Istanbul',
      price: 900,
      currency: 'EUR',
      active: true,
      description: 'Updated',
      durationDays: 7,
      maxParticipants: null,
      startDate: null,
      endDate: null,
      transportType: 'bus',
      transportCapacity: 50,
      tripType: 'city',
      tags: null,
      variants: [
        {
          id: 'variant-1',
          name: 'Premium',
          tier: 'deluxe',
          accommodation: 'hotel',
          priceModifier: 100,
          capacity: 20,
          currency: 'EUR',
          hotelName: null,
          roomType: null,
        },
      ],
    });
  });
});
