import { supabaseAdmin } from './supabase';

const ROOM_CAPACITY: Record<string, number> = {
  single: 1,
  double: 2,
  triple: 3,
  apartment: 4,
  studio: 2,
  suite: 2,
};

type PackageRoomOption = {
  type: string;
  label: string;
  net_price: number;
  sell_price: number;
  available: number;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Math.trunc(toNumber(value, fallback));
  return parsed >= 0 ? parsed : fallback;
}

function dateKey(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : null;
}

function normalizeRoomOption(raw: any): PackageRoomOption | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || 'double').trim() || 'double';
  const label = String(raw.label || type).trim() || type;
  const available = toInt(raw.available, 0);
  const netPrice = toNumber(raw.net_price ?? raw.netPrice, 0);
  const sellPrice = toNumber(raw.sell_price ?? raw.sellPrice, 0);

  return {
    type,
    label,
    net_price: Math.max(0, netPrice),
    sell_price: Math.max(0, sellPrice),
    available,
  };
}

export function normalizePackageRoomOptions(raw: any): PackageRoomOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRoomOption).filter(Boolean) as PackageRoomOption[];
}

export function allocationOut(row: any) {
  const roomsReserved = toInt(row.rooms_reserved, 0);
  const templateRooms = toInt(row.template_rooms, roomsReserved);
  const capacityPerRoom = Math.max(1, toInt(row.capacity_per_room, ROOM_CAPACITY[row.room_type] || 1));
  const allocatedRooms = toInt(row.allocated_rooms, 0);

  return {
    id: row.id,
    departureId: row.departure_id,
    hotelId: row.hotel_id,
    packageHotelId: row.package_hotel_id ?? null,
    roomType: row.room_type,
    roomLabel: row.room_label || row.room_type,
    templateRooms,
    departureRooms: roomsReserved,
    roomsReserved,
    capacityPerRoom,
    capacity: roomsReserved * capacityPerRoom,
    allocated: allocatedRooms,
    available: Math.max(0, roomsReserved - allocatedRooms),
    checkIn: row.check_in,
    checkOut: row.check_out,
    netPrice: toNumber(row.net_price, 0),
    sellPrice: toNumber(row.sell_price, 0),
    pricePerNight: toNumber(row.price_per_night, 0),
    sortOrder: toInt(row.sort_order, 0),
    hotel: row.hotels ? {
      id: row.hotels.id,
      name: row.hotels.name,
      destination: row.hotels.destination,
      stars: row.hotels.stars ?? null,
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function materializeDepartureAccommodationFromPackage(input: {
  orgId: string;
  departureId: string;
  packageId: string;
  departAt: string;
  returnAt: string;
}) {
  const { orgId, departureId, packageId, departAt, returnAt } = input;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('hotel_allocations')
    .select('id')
    .eq('org_id', orgId)
    .eq('departure_id', departureId)
    .limit(1);

  if (existingErr) throw existingErr;
  if ((existing || []).length > 0) return { inserted: 0, skipped: true };

  const { data: packageHotels, error: packageHotelsErr } = await supabaseAdmin
    .from('package_hotels')
    .select('id, hotel_id, room_options, sort_order')
    .eq('org_id', orgId)
    .eq('package_id', packageId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (packageHotelsErr) throw packageHotelsErr;

  const checkIn = dateKey(departAt);
  const checkOut = dateKey(returnAt);
  if (!checkIn || !checkOut) return { inserted: 0, skipped: false };

  const rows = (packageHotels || []).flatMap((link: any, linkIndex: number) => {
    const options = normalizePackageRoomOptions(link.room_options);
    return options.map((option, optionIndex) => ({
      org_id: orgId,
      departure_id: departureId,
      hotel_id: link.hotel_id,
      package_hotel_id: link.id,
      source_room_option_index: optionIndex,
      room_type: option.type,
      room_label: option.label,
      rooms_reserved: option.available,
      template_rooms: option.available,
      capacity_per_room: ROOM_CAPACITY[option.type] || 1,
      check_in: checkIn,
      check_out: checkOut,
      price_per_night: option.net_price,
      net_price: option.net_price,
      sell_price: option.sell_price,
      sort_order: (Number(link.sort_order) || 0) * 100 + linkIndex * 10 + optionIndex,
    }));
  });

  if (rows.length === 0) return { inserted: 0, skipped: false };

  const { error: insertErr } = await supabaseAdmin.from('hotel_allocations').insert(rows);
  if (insertErr) throw insertErr;

  return { inserted: rows.length, skipped: false };
}

export async function getDepartureAccommodationAllotments(departureId: string, orgId: string) {
  const { data: departure, error: depErr } = await supabaseAdmin
    .from('departures')
    .select('id')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (depErr) throw depErr;
  if (!departure) return null;

  const { data, error } = await supabaseAdmin
    .from('hotel_allocations')
    .select('*, hotels:hotel_id(id, name, destination, stars)')
    .eq('org_id', orgId)
    .eq('departure_id', departureId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return {
    departureId,
    items: (data || []).map(allocationOut),
  };
}

export async function updateDepartureAccommodationAllotment(input: {
  orgId: string;
  departureId: string;
  itemId: string;
  roomCount: number;
}) {
  const { orgId, departureId, itemId, roomCount } = input;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('hotel_allocations')
    .select('id, departure_id')
    .eq('id', itemId)
    .eq('departure_id', departureId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (existingErr) throw existingErr;
  if (!existing) return null;

  const { data, error } = await supabaseAdmin
    .from('hotel_allocations')
    .update({ rooms_reserved: roomCount })
    .eq('id', itemId)
    .eq('departure_id', departureId)
    .eq('org_id', orgId)
    .select('*, hotels:hotel_id(id, name, destination, stars)')
    .single();

  if (error) throw error;
  return allocationOut(data);
}
