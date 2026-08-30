import { get, post, patch, del } from './client';

export interface RoomOption {
  type: string;
  label: string;
  net_price: number;
  sell_price: number;
  available: number;
}

export interface PackageHotelCatalogHotel {
  id: string;
  name: string;
  destination?: string;
  stars?: number | null;
}

export interface PackageHotel {
  id: string;
  packageId: string;
  hotelId: string;
  roomOptions: RoomOption[];
  priceModifier: number;
  sortOrder: number;
  hotel?: PackageHotelCatalogHotel | null;
  createdAt: string;
  updatedAt: string;
}

export interface HotelPackage {
  id: string;
  packageId: string;
  hotelId: string;
  roomOptions: RoomOption[];
  priceModifier: number;
  sortOrder: number;
  package?: { id: string; name: string; destination?: string; trip_type?: string } | null;
}

export interface PackageHotelUpsertInput {
  hotelId: string;
  roomOptions?: RoomOption[];
  priceModifier?: number;
  sortOrder?: number;
}

export interface PackageHotelPatchInput {
  roomOptions?: RoomOption[];
  priceModifier?: number;
  sortOrder?: number;
}

function normalizeRoomOption(raw: any): RoomOption {
  return {
    type: raw?.type ?? 'double',
    label: raw?.label ?? '',
    net_price: Number(raw?.net_price ?? raw?.netPrice ?? 0),
    sell_price: Number(raw?.sell_price ?? raw?.sellPrice ?? 0),
    available: Number(raw?.available ?? 0),
  };
}

export function normalizePackageHotel(raw: any): PackageHotel {
  return {
    id: raw.id,
    packageId: raw.packageId ?? raw.package_id,
    hotelId: raw.hotelId ?? raw.hotel_id,
    roomOptions: (raw.roomOptions ?? raw.room_options ?? []).map(normalizeRoomOption),
    priceModifier: Number(raw.priceModifier ?? raw.price_modifier ?? 0),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
    hotel: raw.hotel
      ? {
          id: raw.hotel.id,
          name: raw.hotel.name,
          destination: raw.hotel.destination,
          stars: raw.hotel.stars ?? null,
        }
      : null,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
}

export async function getPackageHotels(packageId: string): Promise<PackageHotel[]> {
  const { data } = await get<{ data: PackageHotel[] }>(`/packages/${packageId}/hotels`);
  return (data?.data || []).map(normalizePackageHotel);
}

export async function linkHotelToPackage(packageId: string, body: PackageHotelUpsertInput): Promise<PackageHotel> {
  const { data } = await post<PackageHotel>(`/packages/${packageId}/hotels`, body);
  return normalizePackageHotel(data);
}

export async function updatePackageHotel(id: string, body: PackageHotelPatchInput): Promise<PackageHotel> {
  const { data } = await patch<PackageHotel>(`/package-hotels/${id}`, body);
  return normalizePackageHotel(data);
}

export async function unlinkHotelFromPackage(id: string): Promise<void> {
  await del(`/package-hotels/${id}`);
}

export async function getHotelPackages(hotelId: string): Promise<HotelPackage[]> {
  const { data } = await get<{ data: HotelPackage[] }>(`/hotels/${hotelId}/packages`);
  return data?.data || [];
}
