import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
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
  name: z.string().min(1, 'Hotel name is required'),
  destination: z.string().min(1, 'Destination is required'),
  address: z.string().optional(),
  contact: z.string().optional(),
  totalRooms: z.number().int().positive().default(0),
  stars: z.number().int().min(1).max(5).optional().nullable(),
  description: z.string().optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
});

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
  totalRooms: z.number().int().positive().optional(),
});

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
    rooms: h.rooms,
    allocations: h.allocations,
  };
}

/** GET /api/hotels */
router.get('/hotels', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res, next) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const { search, destination, page, limit, offset, orderBy, orderDir } = r.data;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('hotels')
      .select('*, hotel_rooms(*), hotel_allocations(*)')
      .eq('org_id', orgId)
      .order(orderBy as string || 'created_at', { ascending: orderDir === 'asc' })
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

/** POST /api/hotels */
router.post('/hotels', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditHotelCreate, async (req, res: Response) => {
  try {
    const r = createSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const body = r.data;
    const orgId = req.orgId!;
    const slug = `${body.name.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}-${Math.random().toString(36).substr(2, 9)}`;

    const { data: hotel, error: err } = await supabaseAdmin
      .from('hotels')
      .insert({
        org_id: orgId,
        name: body.name,
        destination: body.destination,
        address: body.address,
        contact: body.contact,
        total_rooms: body.totalRooms,
        stars: body.stars ?? null,
        description: body.description ?? null,
        amenities: body.amenities ?? null,
        email: body.email ?? null,
        website: body.website ?? null,
        slug,
      })
      .select()
      .single();

    if (err) return handleSupabaseError(res, err, 'Failed to create hotel');

    // Auto-create room types based on totalRooms distribution
    const insertRoom = async (data: Record<string, unknown>) => {
      try { await supabaseAdmin.from('hotel_rooms').insert(data); } catch {}
    };

    await Promise.all([
      insertRoom({ org_id: orgId, hotel_id: hotel.id, room_type: 'single', capacity: 1, base_price: 0, available: body.totalRooms, total: 1 }),
      insertRoom({ org_id: orgId, hotel_id: hotel.id, room_type: 'double', capacity: 2, base_price: 0, available: Math.floor(body.totalRooms / 2), total: Math.floor(body.totalRooms / 2) }),
      insertRoom({ org_id: orgId, hotel_id: hotel.id, room_type: 'triple', capacity: 3, base_price: 0, available: Math.max(0, Math.ceil((body.totalRooms % 2) / 3)), total: Math.max(0, Math.ceil((body.totalRooms % 2) / 3)) }),
      insertRoom({ org_id: orgId, hotel_id: hotel.id, room_type: 'apartment', capacity: 4, base_price: 0, available: 0, total: 0 }),
    ]);

    return res.status(201).json(transformHotel(hotel));
  } catch (err) { console.error('Error in POST /hotels:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
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
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { roomType, capacity, basePrice, currency } = req.body;

    if (!roomType) return apiError(res, 400, 'VALIDATION_ERROR', 'Room type is required');

    // Verify hotel belongs to org
    const { data: hotel } = await supabaseAdmin.from('hotels').select('id,total_rooms').eq('id', id).eq('org_id', orgId).single();
    if (!hotel) return apiError(res, 404, 'NOT_FOUND', 'Hotel not found');

    const { data: room, error: err } = await supabaseAdmin
      .from('hotel_rooms')
      .insert({
        org_id: orgId,
        hotel_id: id,
        room_type: roomType,
        capacity: capacity || 2,
        base_price: basePrice || 0,
        currency: currency || 'BAM',
        available: capacity || 1,
        total: capacity || 1,
      })
      .select()
      .single();
    if (err) return handleSupabaseError(res, err, 'Failed to create room');
    return res.status(201).json(room);
  } catch (err) { console.error('Error in POST /hotels/:id/rooms:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
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

/** POST /api/departures/:id/allocations — create hotel allocation */
router.post('/departures/:id/allocations', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  try {
    const depId = req.params.id;
    const orgId = req.orgId!;
    const { hotelId, roomType, roomsReserved, checkIn, checkOut, pricePerNight } = req.body;

    // Verify departure belongs to org
    const { data: dep } = await supabaseAdmin.from('departures').select('id').eq('id', depId).eq('org_id', orgId).single();
    if (!dep) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

    // Verify hotel belongs to org
    const { data: hotel } = await supabaseAdmin.from('hotels').select('id').eq('id', hotelId).eq('org_id', orgId).single();
    if (!hotel) return apiError(res, 404, 'NOT_FOUND', 'Hotel not found');

    const { data: alloc, error: err } = await supabaseAdmin
      .from('hotel_allocations')
      .insert({
        org_id: orgId,
        departure_id: depId,
        hotel_id: hotelId,
        room_type: roomType,
        rooms_reserved: roomsReserved || 0,
        check_in: checkIn,
        check_out: checkOut,
        price_per_night: pricePerNight || 0,
      })
      .select()
      .single();
    if (err) return handleSupabaseError(res, err, 'Failed to create allocation');
    return res.status(201).json(alloc);
  } catch (err) { console.error('Error in POST /departures/:id/allocations:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** GET /api/public/hotels/:slug/rooms */
router.get('/public/hotels/:slug/rooms', async (req, res: Response) => {
  try {
    const { slug } = req.params;
    const { data, error } = await supabaseAdmin
      .from('hotels')
      .select('id, name, slug, hotel_rooms(*)')
      .eq('slug', slug)
      .single();
    if (error || !data) return apiError(res, 404, 'NOT_FOUND', 'Hotel not found');

    // Aggregate room availability
    const rooms = (data.hotel_rooms || []).map((r: any) => ({
      id: r.id,
      roomType: r.room_type,
      capacity: r.capacity,
      pricePerNight: r.base_price,
      available: r.available,
      total: r.total,
    }));

    return res.json({ hotel: data.name, slug: data.slug, rooms });
  } catch (err) { console.error('Error in GET /public/hotels/:slug/rooms:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

export default router;
