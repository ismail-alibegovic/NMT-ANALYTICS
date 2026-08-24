import { get, post, patch, del } from './client';

export interface RoomOption {
  type: string;
  label: string;
  net_price: number;
  sell_price: number;
  available: number;
}

export interface PackageHotel {
  id: string;
  packageId: string;
  hotelId: string;
  roomOptions: RoomOption[];
  priceModifier: number;
  sortOrder: number;
  hotel?: { id: string; name: string; destination?: string; stars?: number } | null;
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

export async function getPackageHotels(packageId: string): Promise<PackageHotel[]> {
  const { data } = await get<{ data: PackageHotel[] }>(`/packages/${packageId}/hotels`);
  return data?.data || [];
}

export async function linkHotelToPackage(packageId: string, body: { hotel_id: string; room_options?: RoomOption[]; price_modifier?: number; sort_order?: number }): Promise<PackageHotel> {
  const { data } = await post<PackageHotel>(`/packages/${packageId}/hotels`, body);
  return data;
}

export async function updatePackageHotel(id: string, body: { room_options?: RoomOption[]; price_modifier?: number; sort_order?: number }): Promise<PackageHotel> {
  const { data } = await patch<PackageHotel>(`/package-hotels/${id}`, body);
  return data;
}

export async function unlinkHotelFromPackage(id: string): Promise<void> {
  await del(`/package-hotels/${id}`);
}

export async function getHotelPackages(hotelId: string): Promise<HotelPackage[]> {
  const { data } = await get<{ data: HotelPackage[] }>(`/hotels/${hotelId}/packages`);
  return data?.data || [];
}
