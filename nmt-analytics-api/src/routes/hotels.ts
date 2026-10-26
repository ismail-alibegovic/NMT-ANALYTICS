import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { ROOM_CAPACITY } from '../lib/departureAccommodation';
import { auditLog } from '../middleware/auditLogger';
import { logAction } from '../lib/audit';
import {
  formatListResponse,
  paginationQuerySchema,
  getPaginationParams,
} from '../utils/pagination';
import { requireMinimumRole } from '../middleware/requireRole';

const router = Router();

const auditHotelCreate = auditLog('CREATE', 'hotel', undefined, (req) => (req.body as any)?.name);
const auditHotelUpdate = auditLog('UPDATE', 'hotel', (req) => req.params.id);

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    destination: z.string().optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({ ...data, ...getPaginationParams(data) }));

const createSchema = z.object({
  name: z.string().trim().min(1, 'Hotel name is required').max(200),
  destination: z.string().trim().min(1, 'Destination is required').max(200),
  address: z.string().optional(),
  contact: z.string().optional(),
  totalRooms: z.number().int().min(0).max(2147483647).default(0),
  stars: z.number().int().min(1).max(5).optional().nullable(),
  description: z.string().optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
}).strict();

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  stars: z.number().int().min(1).max(5).optional().nullable(),
  description: z.string().optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
  destination: z.string().min(1).optional(),
  address: z.string().optional(),
  contact: z.string().optional(),
  totalRooms: z.number().int().min(0).optional(),
});

const roomCreateSchema = z.object({
  roomType: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(2147483647).default(2),
  quantity: z.number().int().min(0).max(2147483647).default(1),
  basePrice: z.number().min(0).max(9999999999.99).multipleOf(0.01).default(0),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
}).strict();

function inventoryError(res: Response, error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return apiError(res, 503, 'MIGRATION_PENDING', 'Hotel inventory requires a service update.');
  }
  if (error.message === 'HOTEL_NOT_FOUND' || error.message === 'HOTEL_ORG_NOT_FOUND') {
    return apiError(res, 404, 'NOT_FOUND', 'Hotel not found');
  }
  if (error.code?.startsWith('22') || error.message?.startsWith('INVALID_HOTEL')) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid hotel inventory settings');
  }
  if (error.code === '23514') return apiError(res, 409, 'CONFLICT', 'Hotel stock is inconsistent with the requested total');
  return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to save hotel inventory');
}

function transformHotel(h: any) {
  return {
    id: h.id,
    orgId: h.org_id,
    name: h.name,
    destination: h.destination,
    address: h.address,
    contact: h.contact,
    totalRooms: h.total_rooms,
    stars: h.stars,
    description: h.description,
    amenities: h.amenities,
    email: h.email,
    website: h.website,
    slug: h.slug,
    createdAt: h.created_at,
    rooms: h.rooms || h.hotel_rooms,
    allocations: h.allocations || h.hotel_allocations,
  };
}

/** GET /api/hotels */
router.get('/hotels', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res, next) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const { search, destination, page, limit, offset, orderBy, orderDir } = r.data;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('hotels')
      .select('*, hotel_rooms(*), hotel_allocations(*)', { count: 'exact' })
      .eq('org_id', orgId)
      .order(orderBy as string || 'created_at', { ascending: orderDir === 'asc' })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search}%,destination.ilike.%${search}%`);
    }
    if (destination) query = query.eq('destination', destination);

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json(formatListResponse(data || [], count || 0, page, limit));
  } catch (err) { next(err); }
});

/** GET /api/hotels/:id — identity lookup must not depend on a list page. */
router.get('/hotels/:id', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('hotels')
      .select('*, hotel_rooms(*), hotel_allocations(*)')
      .eq('id', req.params.id).eq('org_id', req.orgId!).maybeSingle();
    if (error) return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch hotel');
    if (!data) return apiError(res, 404, 'NOT_FOUND', 'Hotel not found');
    return res.json(transformHotel(data));
  } catch {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch hotel');
  }
});

/** POST /api/hotels */
router.post('/hotels', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditHotelCreate, async (req, res: Response) => {
  try {
    const r = createSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const { data: hotel, error } = await supabaseAdmin.rpc('create_hotel_inventory', {
      p_org_id: req.orgId!, p_hotel: r.data,
    });
    if (error) return inventoryError(res, error);
    if (!hotel) return apiError(res, 500, 'INTERNAL_ERROR', 'Hotel was not saved');
    return res.status(201).json(transformHotel(hotel));
  } catch {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to save hotel inventory');
  }
});

/** PATCH /api/hotels/:id */
router.patch('/hotels/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditHotelUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const r = updateSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('hotels').select('*').eq('id', id).eq('org_id', orgId).single();
    if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'Hotel not found');

    const updates: Record<string, unknown> = {};
    if (r.data.name !== undefined) updates.name = r.data.name;
    if (r.data.destination !== undefined) updates.destination = r.data.destination;
    if (r.data.address !== undefined) updates.address = r.data.address;
    if (r.data.contact !== undefined) updates.contact = r.data.contact;
    if (r.data.totalRooms !== undefined) updates.total_rooms = r.data.totalRooms;

    if (r.data.stars !== undefined) updates.stars = r.data.stars;
    if (r.data.description !== undefined) updates.description = r.data.description;
    if (r.data.amenities !== undefined) updates.amenities = r.data.amenities;
    if (r.data.email !== undefined) updates.email = r.data.email;
    if (r.data.website !== undefined) updates.website = r.data.website;
    const { data: updated, error: updateErr } = await supabaseAdmin.from('hotels').update(updates).eq('id', id).eq('org_id', orgId).select().single();
    if (updateErr?.code === '23514') return inventoryError(res, updateErr);
    if (updateErr) return handleSupabaseError(res, updateErr, 'Failed to update hotel');

    return res.json(transformHotel(updated));
  } catch (err) { console.error('Error in PATCH /hotels/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** DELETE /api/hotels/:id */
router.delete('/hotels/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { error } = await supabaseAdmin.from('hotels').delete().eq('id', id).eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to delete hotel');
    return res.status(204).send();
  } catch (err) { console.error('Error in DELETE /hotels/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** GET /api/hotels/:id/rooms */
router.get('/hotels/:id/rooms', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { data, error } = await supabaseAdmin
      .from('hotel_rooms')
      .select('*')
      .eq('hotel_id', id)
      .eq('org_id', orgId)
      .order('room_type');
    if (error) return handleSupabaseError(res, error, 'Failed to fetch hotel rooms');
    return res.json(data || []);
  } catch (err) { console.error('Error in GET /hotels/:id/rooms:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** POST /api/hotels/:id/rooms — create room type */
router.post('/hotels/:id/rooms', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsed = roomCreateSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid hotel room', parsed.error.issues);
  try {
    const { data: room, error } = await supabaseAdmin.rpc('create_hotel_room_inventory', {
      p_org_id: req.orgId!, p_hotel_id: req.params.id, p_room: parsed.data,
    });
    if (error) return inventoryError(res, error);
    if (!room) return apiError(res, 500, 'INTERNAL_ERROR', 'Room was not saved');
    await logAction(req, 'CREATE', 'hotel_room', room.id, { newValues: room });
    return res.status(201).json(room);
  } catch {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to save hotel inventory');
  }
});

/** DELETE /api/hotel-rooms/:id — delete room type */
router.delete('/hotel-rooms/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { error } = await supabaseAdmin.from('hotel_rooms').delete().eq('id', id).eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to delete room');
    return res.status(204).send();
  } catch (err) { console.error('Error in DELETE /hotel-rooms/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

const allocationMoney = z.number().min(0).max(9999999999.99).multipleOf(0.01);
const allocationCreateSchema = z.object({
  hotelId: z.uuid(),
  roomType: z.string().trim().min(1).max(100),
  // Bound allotments consumed by the existing synchronous room-slot sync.
  roomsReserved: z.number().int().min(0).max(1000),
  capacityPerRoom: z.number().int().min(1).max(100).optional(),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  pricePerNight: allocationMoney.optional(),
  netPrice: allocationMoney.optional(),
  sellPrice: allocationMoney.default(0),
}).strict().superRefine((value, ctx) => {
  if (value.checkOut < value.checkIn) ctx.addIssue({code: 'custom', path: ['checkOut'], message: 'Check-out precedes check-in'});
  if (value.capacityPerRoom === undefined && !Object.prototype.hasOwnProperty.call(ROOM_CAPACITY, value.roomType)) {
    ctx.addIssue({code: 'custom', path: ['capacityPerRoom'], message: 'Capacity is required for custom room types'});
  }
  if (value.netPrice !== undefined && value.pricePerNight !== undefined && value.netPrice !== value.pricePerNight) {
    ctx.addIssue({code: 'custom', path: ['netPrice'], message: 'Conflicting net prices'});
  }
});

/** POST /api/departures/:id/allocations — create hotel allocation */
router.post('/departures/:id/allocations', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsed = allocationCreateSchema.safeParse(req.body);
  if (!parsed.success || !z.uuid().safeParse(req.params.id).success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid hotel allocation');
  }
  try {
    const depId = req.params.id;
    const orgId = req.orgId!;
    const input = parsed.data;
    for (const [table, id] of [['departures', depId], ['hotels', input.hotelId]]) {
      const {data, error} = await supabaseAdmin.from(table).select('id').eq('id', id).eq('org_id', orgId).single();
      if (error && error.code !== 'PGRST116') return apiError(res, 500, 'INTERNAL_ERROR', 'Could not verify allocation details');
      if (!data) return apiError(res, 404, 'NOT_FOUND', 'Hotel or departure not found');
    }
    const netPrice = input.netPrice ?? input.pricePerNight ?? 0;
    // Creation is one database insert; the existing room-slot sync consumes this snapshot.
    const {data: alloc, error} = await supabaseAdmin.from('hotel_allocations').insert({
      org_id: orgId, departure_id: depId, hotel_id: input.hotelId,
      room_type: input.roomType, room_label: input.roomType,
      rooms_reserved: input.roomsReserved,
      capacity_per_room: input.capacityPerRoom ?? ROOM_CAPACITY[input.roomType],
      check_in: input.checkIn, check_out: input.checkOut,
      price_per_night: netPrice, net_price: netPrice, sell_price: input.sellPrice,
    }).select().single();
    if (error) {
      if (error.code === '23503' || error.code === '23514') return apiError(res, 409, 'CONFLICT', 'Allocation details changed. Reload before retrying.');
      return apiError(res, 500, 'INTERNAL_ERROR', 'Could not save hotel allocation');
    }
    if (!alloc) return apiError(res, 500, 'INTERNAL_ERROR', 'Allocation was not saved');
    await logAction(req, 'CREATE', 'hotel_allocation', alloc.id, {newValues: alloc});
    return res.status(201).json(alloc);
  } catch {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Could not save hotel allocation');
  }
});

/** GET /api/public/hotels/:slug/rooms */
router.get('/public/hotels/:slug/rooms', (_req, res: Response) =>
  apiError(res, 410, 'LEGACY_HOTEL_CATALOG_DISABLED', 'Use a configured public booking form.'));

export default router;
