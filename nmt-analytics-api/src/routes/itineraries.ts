import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';

const router = Router();
const tripTypes = ['scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only', 'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'] as const;
const categories = ['accommodation', 'transport', 'flight', 'guide', 'activity', 'meal', 'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'] as const;
const units = ['per_person', 'per_room', 'per_night', 'per_vehicle', 'per_group', 'per_booking', 'per_day', 'per_hour', 'fixed'] as const;

const itinerarySchema = z.object({
  inquiryId: z.string().uuid().optional().nullable(), title: z.string().trim().min(1).max(200),
  tripType: z.enum(tripTypes).default('other'), status: z.enum(['draft', 'active', 'archived']).default('draft'),
  destination: z.string().trim().max(180).optional().nullable(), travelStart: z.string().date().optional().nullable(),
  travelEnd: z.string().date().optional().nullable(), travelers: z.number().int().min(1).max(10000).default(1),
  currency: z.string().length(3).default('BAM'),
});
const itemSchema = z.object({
  supplierServiceId: z.string().uuid().optional().nullable(), dayNumber: z.number().int().min(1), sortOrder: z.number().int().min(0).default(0),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(), title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(), location: z.string().trim().max(180).optional().nullable(),
  category: z.enum(categories).default('other'), quantity: z.number().positive().default(1), unit: z.enum(units).default('fixed'),
  netUnitPrice: z.number().min(0).default(0), currency: z.string().length(3).default('BAM'),
  markupPercent: z.number().min(0).max(1000).default(0), included: z.boolean().default(true),
}).refine((value) => value.supplierServiceId || value.title, { message: 'Title is required for manual items', path: ['title'] });

const itemOut = (row: any) => ({
  id: row.id, itineraryVersionId: row.itinerary_version_id, dayNumber: row.day_number, sortOrder: row.sort_order,
  startTime: row.start_time?.slice(0, 5) || null, title: row.title, description: row.description, location: row.location,
  category: row.category, supplierId: row.supplier_id, supplierServiceId: row.supplier_service_id,
  quantity: Number(row.quantity), unit: row.unit, netUnitPrice: Number(row.net_unit_price), currency: row.currency,
  markupPercent: Number(row.markup_percent), included: row.included, createdAt: row.created_at, updatedAt: row.updated_at,
});
const versionOut = (row: any, items: any[] = []) => ({
  id: row.id, itineraryId: row.itinerary_id, versionNumber: row.version_number, name: row.name,
  summary: row.summary, internalNotes: row.internal_notes, createdAt: row.created_at, items: items.map(itemOut),
});
const itineraryOut = (row: any, inquiry: any = null, versions: any[] = [], items: any[] = []) => ({
  id: row.id, inquiryId: row.inquiry_id, inquiry: inquiry ? { id: inquiry.id, contactName: inquiry.contact_name } : null,
  title: row.title, tripType: row.trip_type, status: row.status, destination: row.destination,
  travelStart: row.travel_start, travelEnd: row.travel_end, travelers: row.travelers, currency: row.currency,
  currentVersion: row.current_version, assignedTo: row.assigned_to, createdAt: row.created_at, updatedAt: row.updated_at,
  versions: versions.map((version) => versionOut(version, version.version_number === row.current_version ? items : [])),
});

async function realProfileId(userId: string | undefined, orgId: string) {
  if (!userId) return null;
  const { data } = await supabaseAdmin.from('profiles').select('id').eq('id', userId).eq('org_id', orgId).maybeSingle();
  return data?.id || null;
}

router.get('/itineraries', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const parsed = z.object({ search: z.string().optional(), status: z.enum(['draft', 'active', 'archived']).optional() }).safeParse(req.query);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid itinerary filters');
  let query = supabaseAdmin.from('itineraries').select('*').eq('org_id', req.orgId!).order('updated_at', { ascending: false });
  if (parsed.data.status) query = query.eq('status', parsed.data.status);
  if (parsed.data.search?.trim()) query = query.or(`title.ilike.%${parsed.data.search.trim()}%,destination.ilike.%${parsed.data.search.trim()}%`);
  const { data: rows, error } = await query;
  if (error) return handleSupabaseError(res, error, 'Failed to load itineraries');
  const inquiryIds = [...new Set((rows || []).map((row) => row.inquiry_id).filter(Boolean))];
  const { data: inquiries } = inquiryIds.length ? await supabaseAdmin.from('inquiries').select('id,contact_name').eq('org_id', req.orgId!).in('id', inquiryIds) : { data: [] };
  return res.json({ data: (rows || []).map((row) => itineraryOut(row, (inquiries || []).find((inquiry) => inquiry.id === row.inquiry_id))) });
});

router.post('/itineraries', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'itinerary'), async (req, res: Response) => {
  const parsed = itinerarySchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid itinerary', parsed.error.issues);
  const b = parsed.data;
  if (b.inquiryId) {
    const { data: inquiry } = await supabaseAdmin.from('inquiries').select('id').eq('id', b.inquiryId).eq('org_id', req.orgId!).maybeSingle();
    if (!inquiry) return apiError(res, 404, 'NOT_FOUND', 'Inquiry not found');
  }
  const assignedTo = await realProfileId(req.user?.id, req.orgId!);
  const { data: itinerary, error } = await supabaseAdmin.from('itineraries').insert({
    org_id: req.orgId!, inquiry_id: b.inquiryId || null, title: b.title, trip_type: b.tripType, status: b.status,
    destination: b.destination || null, travel_start: b.travelStart || null, travel_end: b.travelEnd || null,
    travelers: b.travelers, currency: b.currency, assigned_to: assignedTo,
  }).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to create itinerary');
  const { data: version, error: versionError } = await supabaseAdmin.from('itinerary_versions').insert({
    org_id: req.orgId!, itinerary_id: itinerary.id, version_number: 1, name: 'Working version', created_by: assignedTo,
  }).select('*').single();
  if (versionError) {
    await supabaseAdmin.from('itineraries').delete().eq('id', itinerary.id).eq('org_id', req.orgId!);
    return handleSupabaseError(res, versionError, 'Failed to create itinerary version');
  }
  return res.status(201).json(itineraryOut(itinerary, null, [version]));
});

router.get('/itineraries/:id', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data: itinerary, error } = await supabaseAdmin.from('itineraries').select('*').eq('id', req.params.id).eq('org_id', req.orgId!).single();
  if (error) return handleSupabaseError(res, error, 'Itinerary not found');
  const [{ data: versions }, { data: inquiry }] = await Promise.all([
    supabaseAdmin.from('itinerary_versions').select('*').eq('itinerary_id', itinerary.id).eq('org_id', req.orgId!).order('version_number', { ascending: false }),
    itinerary.inquiry_id ? supabaseAdmin.from('inquiries').select('id,contact_name').eq('id', itinerary.inquiry_id).eq('org_id', req.orgId!).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const current = (versions || []).find((version) => version.version_number === itinerary.current_version);
  const { data: items, error: itemsError } = current ? await supabaseAdmin.from('itinerary_items').select('*').eq('itinerary_version_id', current.id).eq('org_id', req.orgId!).order('day_number').order('sort_order') : { data: [], error: null };
  if (itemsError) return handleSupabaseError(res, itemsError, 'Failed to load itinerary items');
  return res.json(itineraryOut(itinerary, inquiry, versions || [], items || []));
});

router.patch('/itineraries/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'itinerary', (req) => req.params.id), async (req, res: Response) => {
  const parsed = itinerarySchema.partial().safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid itinerary update', parsed.error.issues);
  const fields: Record<string, string> = { inquiryId: 'inquiry_id', tripType: 'trip_type', travelStart: 'travel_start', travelEnd: 'travel_end' };
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(parsed.data)) updates[fields[key] || key] = value || null;
  const { data, error } = await supabaseAdmin.from('itineraries').update(updates).eq('id', req.params.id).eq('org_id', req.orgId!).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to update itinerary');
  return res.json(itineraryOut(data));
});

router.post('/itineraries/:id/versions', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'itinerary_version'), async (req, res: Response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional() }).safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid version');
  const { data: itinerary } = await supabaseAdmin.from('itineraries').select('*').eq('id', req.params.id).eq('org_id', req.orgId!).maybeSingle();
  if (!itinerary) return apiError(res, 404, 'NOT_FOUND', 'Itinerary not found');
  const { data: current } = await supabaseAdmin.from('itinerary_versions').select('*').eq('itinerary_id', itinerary.id).eq('version_number', itinerary.current_version).eq('org_id', req.orgId!).single();
  const nextNumber = itinerary.current_version + 1;
  const createdBy = await realProfileId(req.user?.id, req.orgId!);
  const { data: version, error } = await supabaseAdmin.from('itinerary_versions').insert({ org_id: req.orgId!, itinerary_id: itinerary.id, version_number: nextNumber, name: parsed.data.name || `Version ${nextNumber}`, summary: current?.summary, internal_notes: current?.internal_notes, created_by: createdBy }).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to create itinerary version');
  if (current) {
    const { data: items } = await supabaseAdmin.from('itinerary_items').select('*').eq('itinerary_version_id', current.id).eq('org_id', req.orgId!);
    if (items?.length) {
      const clones = items.map(({ id, created_at, updated_at, ...item }) => ({ ...item, itinerary_version_id: version.id }));
      const { error: cloneError } = await supabaseAdmin.from('itinerary_items').insert(clones);
      if (cloneError) { await supabaseAdmin.from('itinerary_versions').delete().eq('id', version.id); return handleSupabaseError(res, cloneError, 'Failed to clone itinerary items'); }
    }
  }
  await supabaseAdmin.from('itineraries').update({ current_version: nextNumber, updated_at: new Date().toISOString() }).eq('id', itinerary.id).eq('org_id', req.orgId!);
  return res.status(201).json(versionOut(version));
});

router.post('/itineraries/:id/items', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'itinerary_item'), async (req, res: Response) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid itinerary item', parsed.error.issues);
  const { data: itinerary } = await supabaseAdmin.from('itineraries').select('*').eq('id', req.params.id).eq('org_id', req.orgId!).maybeSingle();
  if (!itinerary) return apiError(res, 404, 'NOT_FOUND', 'Itinerary not found');
  const { data: version } = await supabaseAdmin.from('itinerary_versions').select('id').eq('itinerary_id', itinerary.id).eq('version_number', itinerary.current_version).eq('org_id', req.orgId!).single();
  const b = parsed.data;
  let snapshot: any = null;
  if (b.supplierServiceId) {
    const { data } = await supabaseAdmin.from('supplier_services').select('*').eq('id', b.supplierServiceId).eq('org_id', req.orgId!).eq('active', true).maybeSingle();
    if (!data) return apiError(res, 404, 'NOT_FOUND', 'Supplier service not found');
    snapshot = data;
  }
  const { data, error } = await supabaseAdmin.from('itinerary_items').insert({
    org_id: req.orgId!, itinerary_version_id: version!.id, day_number: b.dayNumber, sort_order: b.sortOrder,
    start_time: b.startTime || null, title: b.title || snapshot.name, description: b.description || null, location: b.location || null,
    category: snapshot?.category || b.category, supplier_id: snapshot?.supplier_id || null, supplier_service_id: snapshot?.id || null,
    quantity: b.quantity, unit: snapshot?.unit || b.unit, net_unit_price: snapshot ? Number(snapshot.net_price) : b.netUnitPrice,
    currency: snapshot?.currency || b.currency, markup_percent: snapshot ? Number(snapshot.default_markup) : b.markupPercent, included: b.included,
  }).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to add itinerary item');
  await supabaseAdmin.from('itineraries').update({ updated_at: new Date().toISOString() }).eq('id', itinerary.id).eq('org_id', req.orgId!);
  return res.status(201).json(itemOut(data));
});


const itemUpdateSchema = z.object({
  quantity: z.number().positive().optional(), netUnitPrice: z.number().min(0).optional(),
  markupPercent: z.number().min(0).max(1000).optional(), title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(), dayNumber: z.number().int().min(1).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  location: z.string().trim().max(180).optional().nullable(), category: z.enum(categories).optional(),
  included: z.boolean().optional(),
});
router.delete('/itinerary-items/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('DELETE', 'itinerary_item', (req) => req.params.id), async (req, res: Response) => {
  const { error } = await supabaseAdmin.from('itinerary_items').delete().eq('id', req.params.id).eq('org_id', req.orgId!);
  if (error) return handleSupabaseError(res, error, 'Failed to delete itinerary item');
  return res.status(204).send();
});


router.patch('/itinerary-items/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'itinerary_item', (req) => req.params.id), async (req, res: Response) => {
  const parsed = itemUpdateSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid itinerary item update', parsed.error.issues);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fieldMap: Record<string, string> = { netUnitPrice: 'net_unit_price', markupPercent: 'markup_percent', dayNumber: 'day_number', startTime: 'start_time' };
  for (const [key, value] of Object.entries(parsed.data)) updates[fieldMap[key] || key] = value;
  const { data, error } = await supabaseAdmin.from('itinerary_items').update(updates).eq('id', req.params.id).eq('org_id', req.orgId!).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to update itinerary item');
  return res.json(itemOut(data));
});
export default router;
