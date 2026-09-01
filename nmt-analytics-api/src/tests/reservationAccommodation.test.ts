import { beforeEach, describe, expect, it, vi } from 'vitest';

let reservations: any[] = [];
let requirements: any[] = [];
let allocations: any[] = [];
let departures: any[] = [];
let departurePassengers: any[] = [];
const rpcMock = vi.fn();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function createBuilder(table: string) {
  const state: Record<string, any> = {
    filters: {},
    notFilters: {},
    action: 'select',
    selectColumns: '',
  };

  const builder: any = {
    select: vi.fn((columns?: string) => {
      state.selectColumns = columns || '';
      return builder;
    }),
    eq: vi.fn((column: string, value: any) => {
      state.filters[column] = value;
      return builder;
    }),
    neq: vi.fn((column: string, value: any) => {
      state.notFilters[column] = value;
      return builder;
    }),
    in: vi.fn((column: string, values: any[]) => {
      state.filters[column] = values;
      return builder;
    }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      const result = await execute();
      return { data: result.data?.[0] ?? null, error: result.error };
    }),
    delete: vi.fn(() => {
      state.action = 'delete';
      return builder;
    }),
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  function applyFilters(rows: any[]) {
    return rows.filter((row) => (
      Object.entries(state.filters).every(([key, value]) => {
        if (key === 'reservations.status') {
          const reservation = reservations.find((item) => item.id === row.reservation_id);
          return Array.isArray(value) ? value.includes(reservation?.status) : reservation?.status === value;
        }
        return Array.isArray(value) ? value.includes(row[key]) : row[key] === value;
      }) &&
      Object.entries(state.notFilters).every(([key, value]) => row[key] !== value)
    ));
  }

  async function execute() {
    if (table === 'reservations') return { data: clone(applyFilters(reservations)), error: null };
    if (table === 'departures') return { data: clone(applyFilters(departures)), error: null };
    if (table === 'hotel_allocations') {
      const rows = applyFilters(allocations).map((row) => ({
        ...row,
        hotels: { id: row.hotel_id, name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
      }));
      return { data: clone(rows), error: null };
    }
    if (table === 'reservation_accommodation_requirements') {
      if (state.action === 'delete') {
        requirements = requirements.filter((row) => applyFilters([row]).length === 0);
        return { data: null, error: null };
      }
      const rows = applyFilters(requirements).map((row) => (
        state.selectColumns.includes('hotels:')
          ? { ...row, hotels: { id: row.hotel_id, name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 } }
          : row
      ));
      return { data: clone(rows), error: null };
    }
    if (table === 'departure_passengers') {
      return { data: clone(applyFilters(departurePassengers)), error: null };
    }
    throw new Error(`Unhandled table ${table}`);
  }

  return builder;
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => createBuilder(table)),
    rpc: (fn: string, args: Record<string, any>) => rpcMock(fn, args),
  },
}));

describe('reservation accommodation helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    departures = [{ id: 'departure-1', org_id: 'org-1' }];
    reservations = [
      { id: 'reservation-1', org_id: 'org-1', status: 'confirmed' },
      { id: 'reservation-2', org_id: 'org-1', status: 'pending' },
      { id: 'reservation-3', org_id: 'org-1', status: 'cancelled' },
    ];
    allocations = [{
      id: 'allocation-1',
      org_id: 'org-1',
      departure_id: 'departure-1',
      hotel_id: 'hotel-1',
      room_type: 'double',
      room_label: 'Double',
      rooms_reserved: 5,
      capacity_per_room: 2,
      sell_price: 790,
      net_price: 650,
      check_in: '2027-06-10',
      check_out: '2027-06-17',
    }];
    requirements = [
      { id: 'requirement-1', org_id: 'org-1', reservation_id: 'reservation-1', hotel_allocation_id: 'allocation-1', room_count: 2 },
      { id: 'requirement-2', org_id: 'org-1', reservation_id: 'reservation-2', hotel_allocation_id: 'allocation-1', room_count: 1 },
      { id: 'requirement-3', org_id: 'org-1', reservation_id: 'reservation-3', hotel_allocation_id: 'allocation-1', room_count: 1 },
    ];
    departurePassengers = [
      { id: 'passenger-1', org_id: 'org-1', reservation_id: 'reservation-1', reservation_accommodation_requirement_id: 'requirement-1' },
      { id: 'passenger-2', org_id: 'org-1', reservation_id: 'reservation-1', reservation_accommodation_requirement_id: 'requirement-rpc' },
      { id: 'passenger-3', org_id: 'org-1', reservation_id: 'reservation-1', reservation_accommodation_requirement_id: 'requirement-rpc' },
    ];
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 'requirement-rpc',
          reservation_id: 'reservation-1',
          departure_id: 'departure-1',
          hotel_allocation_id: 'allocation-1',
          hotel_id: 'hotel-1',
          room_type: 'double',
          room_label: 'Double',
          room_count: 1,
          guests_expected: 2,
          capacity_per_room: 2,
          unit_sell_price: 790,
          unit_net_price: 650,
          total_sell_price: 790,
          notes: 'together',
        },
        {
          id: 'requirement-rpc-2',
          reservation_id: 'reservation-1',
          departure_id: 'departure-1',
          hotel_allocation_id: 'allocation-2',
          hotel_id: 'hotel-1',
          room_type: 'single',
          room_label: 'Single',
          room_count: 2,
          guests_expected: 2,
          capacity_per_room: 1,
          unit_sell_price: 590,
          unit_net_price: 450,
          total_sell_price: 1180,
          notes: null,
        },
      ],
      error: null,
    });
  });

  it('counts only active reservation accommodation requirements as sold rooms', async () => {
    const { getSoldRoomsForAllocation } = await import('../lib/reservationAccommodation');

    await expect(getSoldRoomsForAllocation('org-1', 'allocation-1')).resolves.toBe(3);
    await expect(getSoldRoomsForAllocation('org-1', 'allocation-1', 'reservation-1')).resolves.toBe(1);
  });

  it('returns sellable accommodation options with real available room counts', async () => {
    const { getAccommodationOptions } = await import('../lib/reservationAccommodation');

    const result = await getAccommodationOptions('departure-1', 'org-1');

    expect(result?.items).toEqual([
      expect.objectContaining({
        id: 'allocation-1',
        reservedRooms: 3,
        availableRooms: 2,
        capacityPerRoom: 2,
        unitSellPrice: 790,
        hotel: expect.objectContaining({ name: 'Hotel Azure Antalya' }),
      }),
    ]);
  });

  it('excludes only the current reservation when requested', async () => {
    const { getAccommodationOptions } = await import('../lib/reservationAccommodation');

    const result = await getAccommodationOptions('departure-1', 'org-1', 'reservation-1');

    expect(result?.items).toEqual([
      expect.objectContaining({
        id: 'allocation-1',
        reservedRooms: 1,
        availableRooms: 4,
      }),
    ]);
  });

  it('replaces reservation accommodation through the canonical atomic RPC payload', async () => {
    const { replaceReservationAccommodation } = await import('../lib/reservationAccommodation');

    const result = await replaceReservationAccommodation('reservation-1', 'org-1', [
      {
        hotelAllocationId: 'allocation-1',
        roomCount: 1,
        guestsExpected: 2,
        notes: 'together',
        passengerIds: ['passenger-2', 'passenger-3'],
      },
      {
        hotelAllocationId: 'allocation-2',
        roomCount: 2,
        guestsExpected: 2,
        passengerIds: [],
      },
    ]);

    expect(rpcMock).toHaveBeenCalledWith('replace_reservation_accommodation_requirements_atomic', {
      p_org_id: 'org-1',
      p_reservation_id: 'reservation-1',
      p_requirements: [
        {
          hotel_allocation_id: 'allocation-1',
          room_count: 1,
          guests_expected: 2,
          notes: 'together',
          passenger_ids: ['passenger-2', 'passenger-3'],
        },
        {
          hotel_allocation_id: 'allocation-2',
          room_count: 2,
          guests_expected: 2,
          notes: null,
          passenger_ids: [],
        },
      ],
    });
    expect(result).toEqual([
      expect.objectContaining({
        reservationId: 'reservation-1',
        hotelAllocationId: 'allocation-1',
        roomType: 'double',
        roomCount: 1,
        totalSellPrice: 790,
        passengerIds: ['passenger-2', 'passenger-3'],
      }),
      expect.objectContaining({
        hotelAllocationId: 'allocation-2',
        roomType: 'single',
        roomCount: 2,
      }),
    ]);
  });

  it('loads passenger mappings for each accommodation line', async () => {
    requirements = [
      {
        id: 'requirement-1',
        org_id: 'org-1',
        reservation_id: 'reservation-1',
        departure_id: 'departure-1',
        hotel_allocation_id: 'allocation-1',
        hotel_id: 'hotel-1',
        room_type: 'double',
        room_label: 'Double',
        room_count: 1,
        guests_expected: 2,
        capacity_per_room: 2,
        unit_sell_price: 790,
        unit_net_price: 650,
        total_sell_price: 790,
      },
      {
        id: 'requirement-2',
        org_id: 'org-1',
        reservation_id: 'reservation-1',
        departure_id: 'departure-1',
        hotel_allocation_id: 'allocation-2',
        hotel_id: 'hotel-1',
        room_type: 'single',
        room_label: 'Single',
        room_count: 2,
        guests_expected: 2,
        capacity_per_room: 1,
        unit_sell_price: 590,
        unit_net_price: 450,
        total_sell_price: 1180,
      },
    ];
    departurePassengers = [
      { id: 'passenger-a', org_id: 'org-1', reservation_id: 'reservation-1', reservation_accommodation_requirement_id: 'requirement-1' },
      { id: 'passenger-b', org_id: 'org-1', reservation_id: 'reservation-1', reservation_accommodation_requirement_id: 'requirement-1' },
      { id: 'passenger-c', org_id: 'org-1', reservation_id: 'reservation-1', reservation_accommodation_requirement_id: 'requirement-2' },
      { id: 'passenger-d', org_id: 'org-1', reservation_id: 'reservation-1', reservation_accommodation_requirement_id: 'requirement-2' },
    ];

    const { getReservationAccommodation } = await import('../lib/reservationAccommodation');
    const result = await getReservationAccommodation('reservation-1', 'org-1');

    expect(result).toEqual([
      expect.objectContaining({ hotelAllocationId: 'allocation-1', passengerIds: ['passenger-a', 'passenger-b'] }),
      expect.objectContaining({ hotelAllocationId: 'allocation-2', passengerIds: ['passenger-c', 'passenger-d'] }),
    ]);
  });
});
