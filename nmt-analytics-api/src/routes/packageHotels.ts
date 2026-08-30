import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';

const router = Router();

const roomOptionSchema = z.object({
  type: z.enum(['single', 'double', 'triple', 'apartment', 'studio', 'suite']),
  label: z.string().trim().min(1).max(80),
  net_price: z.number().min(0),
  sell_price: z.number().min(0),
  available: z.number().int().min(0),
});

const roomOptionInputSchema = z.object({
  type: z.enum(['single', 'double', 'triple', 'apartment', 'studio', 'suite']),
  label: z.string().trim().min(1).max(80),
  netPrice: z.number().min(0).optional(),
  sellPrice: z.number().min(0).optional(),
  available: z.number().int().min(0),
  net_price: z.number().min(0).optional(),
  sell_price: z.number().min(0).optional(),
}).transform((data) => ({
  type: data.type,
  label: data.label,
  net_price: data.netPrice ?? data.net_price ?? 0,
  sell_price: data.sellPrice ?? data.sell_price ?? 0,
  available: data.available,
}));

const linkSchema = z.object({
  hotelId: z.string().uuid().optional(),
  hotel_id: z.string().uuid().optional(),
  roomOptions: z.array(roomOptionInputSchema).optional(),
  room_options: z.array(roomOptionInputSchema).optional(),
  priceModifier: z.number().optional(),
  price_modifier: z.number().optional(),
  sortOrder: z.number().int().min(0).optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine((data) => Boolean(data.hotelId ?? data.hotel_id), {
  message: 'hotelId is required',
  path: ['hotelId'],
}).transform((data) => ({
  hotel_id: data.hotelId ?? data.hotel_id ?? '',
  room_options: data.roomOptions ?? data.room_options ?? [],
  price_modifier: data.priceModifier ?? data.price_modifier ?? 0,
  sort_order: data.sortOrder ?? data.sort_order ?? 0,
}));

const updateSchema = z.object({
  roomOptions: z.array(roomOptionInputSchema).optional(),
  room_options: z.array(roomOptionInputSchema).optional(),
  priceModifier: z.number().optional(),
  price_modifier: z.number().optional(),
  sortOrder: z.number().int().min(0).optional(),
  sort_order: z.number().int().min(0).optional(),
}).transform((data) => ({
  room_options: data.roomOptions ?? data.room_options,
  price_modifier: data.priceModifier ?? data.price_modifier,
  sort_order: data.sortOrder ?? data.sort_order,
}));

const packageHotelOut = (row: any) => ({
  id: row.id,
  packageId: row.package_id,
  hotelId: row.hotel_id,
  roomOptions: row.room_options || [],
  priceModifier: Number(row.price_modifier),
  sortOrder: row.sort_order,
  hotel: row.hotels ? { id: row.hotels.id, name: row.hotels.name, destination: row.hotels.destination, stars: row.hotels.stars } : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function ensurePackageInOrg(packageId: string, orgId: string) {
  const { data } = await supabaseAdmin
    .from('packages')
    .select('id')
    .eq('id', packageId)
    .eq('org_id', orgId)
    .maybeSingle();

  return data;
}

async function ensureHotelInOrg(hotelId: string, orgId: string) {
  const { data } = await supabaseAdmin
    .from('hotels')
    .select('id')
    .eq('id', hotelId)
    .eq('org_id', orgId)
    .maybeSingle();

  return data;
}

router.get('/packages/:id/hotels', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const pkg = await ensurePackageInOrg(req.params.id, req.orgId!);
  if (!pkg) return apiError(res, 404, 'NOT_FOUND', 'Package not found');

  const { data, error } = await supabaseAdmin
    .from('package_hotels')
    .select('*, hotels:hotel_id(id,name,destination,stars)')
    .eq('package_id', req.params.id)
    .eq('org_id', req.orgId!)
    .order('sort_order');
  if (error) return handleSupabaseError(res, error, 'Failed to load package hotels');
  return res.json({ data: (data || []).map(packageHotelOut) });
});

router.post('/packages/:id/hotels', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid hotel link', parsed.error.issues);

  const pkg = await ensurePackageInOrg(req.params.id, req.orgId!);
  if (!pkg) return apiError(res, 404, 'NOT_FOUND', 'Package not found');

  const hotel = await ensureHotelInOrg(parsed.data.hotel_id, req.orgId!);
  if (!hotel) return apiError(res, 404, 'NOT_FOUND', 'Hotel not found');

  const { data: existing } = await supabaseAdmin.from('package_hotels').select('id').eq('package_id', req.params.id).eq('hotel_id', parsed.data.hotel_id).eq('org_id', req.orgId!).maybeSingle();
  if (existing) return apiError(res, 409, 'CONFLICT', 'Hotel already linked to this package');

  const { data, error } = await supabaseAdmin.from('package_hotels').insert({
    org_id: req.orgId!,
    package_id: req.params.id,
    hotel_id: parsed.data.hotel_id,
    room_options: parsed.data.room_options,
    price_modifier: parsed.data.price_modifier,
    sort_order: parsed.data.sort_order,
  }).select('*, hotels:hotel_id(id,name,destination,stars)').single();

  if (error) return handleSupabaseError(res, error, 'Failed to link hotel');
  return res.status(201).json(packageHotelOut(data));
});

router.patch('/package-hotels/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);

  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid update', parsed.error.issues);

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('package_hotels')
    .select('id')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();

  if (existingErr) return handleSupabaseError(res, existingErr, 'Failed to load hotel link');
  if (!existing) return apiError(res, 404, 'NOT_FOUND', 'Package hotel link not found');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const b = parsed.data;
  if (b.room_options !== undefined) updates.room_options = b.room_options;
  if (b.price_modifier !== undefined) updates.price_modifier = b.price_modifier;
  if (b.sort_order !== undefined) updates.sort_order = b.sort_order;

  const { data, error } = await supabaseAdmin.from('package_hotels').update(updates).eq('id', req.params.id).eq('org_id', req.orgId!).select('*, hotels:hotel_id(id,name,destination,stars)').single();
  if (error) return handleSupabaseError(res, error, 'Failed to update hotel link');
  return res.json(packageHotelOut(data));
});

router.delete('/package-hotels/:id', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('package_hotels')
    .select('id')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();

  if (existingErr) return handleSupabaseError(res, existingErr, 'Failed to load hotel link');
  if (!existing) return apiError(res, 404, 'NOT_FOUND', 'Package hotel link not found');

  const { error } = await supabaseAdmin.from('package_hotels').delete().eq('id', req.params.id).eq('org_id', req.orgId!);
  if (error) return handleSupabaseError(res, error, 'Failed to unlink hotel');
  return res.status(204).send();
});

router.get('/hotels/:id/packages', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data, error } = await supabaseAdmin.from('package_hotels').select('*, packages:package_id(id,name,destination,trip_type)').eq('hotel_id', req.params.id).eq('org_id', req.orgId!).order('created_at', { ascending: false });
  if (error) return handleSupabaseError(res, error, 'Failed to load hotel packages');
  const items = (data || []).map((row: any) => ({ id: row.id, packageId: row.package_id, hotelId: row.hotel_id, roomOptions: row.room_options, priceModifier: Number(row.price_modifier), sortOrder: row.sort_order, package: row.packages || null }));
  return res.json({ data: items });
});

export default router;
