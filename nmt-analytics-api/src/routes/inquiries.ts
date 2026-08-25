import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';

const router = Router();
const stages = ['new', 'qualified', 'proposal', 'follow_up', 'won', 'lost'] as const;
const tripTypes = ['scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only', 'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'] as const;
const sources = ['web', 'phone', 'email', 'walk_in', 'partner', 'social', 'referral', 'other'] as const;

const createSchema = z.object({
  contactName: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  tripType: z.enum(tripTypes).default('other'),
  source: z.enum(sources).default('other'),
  destination: z.string().trim().max(160).optional().nullable(),
  travelStart: z.string().date().optional().nullable(),
  travelEnd: z.string().date().optional().nullable(),
  travelers: z.number().int().min(1).max(10000).default(1),
  budget: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default('BAM'),
  nextActionAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  stage: z.enum(stages).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  lostReason: z.string().max(500).optional().nullable(),
});

function transform(row: any) {
  return {
    id: row.id, contactName: row.contact_name, phone: row.phone, email: row.email,
    tripType: row.trip_type, stage: row.stage, source: row.source,
    destination: row.destination, travelStart: row.travel_start, travelEnd: row.travel_end,
    travelers: row.travelers, budget: row.budget === null ? null : Number(row.budget),
    currency: row.currency, assignedTo: row.assigned_to, nextActionAt: row.next_action_at,
    notes: row.notes, lostReason: row.lost_reason, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

router.get('/inquiries', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const parsed = z.object({ stage: z.enum(stages).optional(), search: z.string().optional() }).safeParse(req.query);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid inquiry filters');
  let query = supabaseAdmin.from('inquiries').select('*').eq('org_id', req.orgId!).order('updated_at', { ascending: false });
  if (parsed.data.stage) query = query.eq('stage', parsed.data.stage);
  if (parsed.data.search?.trim()) {
    const term = parsed.data.search.trim();
    query = query.or(`contact_name.ilike.%${term}%,destination.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) return handleSupabaseError(res, error, 'Failed to load inquiries');
  return res.json({ data: (data || []).map(transform) });
});

router.get('/inquiries/:id', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data: inquiry, error } = await supabaseAdmin
    .from('inquiries')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();
  if (error) return handleSupabaseError(res, error, 'Inquiry not found');
  if (!inquiry) return apiError(res, 404, 'NOT_FOUND', 'Inquiry not found');

  const { data: itineraries } = await supabaseAdmin
    .from('itineraries')
    .select('id, title, status, created_at, updated_at')
    .eq('inquiry_id', req.params.id)
    .eq('org_id', req.orgId!)
    .order('created_at', { ascending: false });

  return res.json({ ...transform(inquiry), itineraries: (itineraries || []).map((i: any) => ({ id: i.id, title: i.title, status: i.status, createdAt: i.created_at, updatedAt: i.updated_at })) });
});

router.post('/inquiries', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'inquiry'), async (req, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid inquiry', parsed.error.issues);
  const b = parsed.data;
  let assignedTo: string | null = null;
  if (req.user?.id) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', req.user.id)
      .eq('org_id', req.orgId!)
      .maybeSingle();
    assignedTo = profile?.id || null;
  }
  const { data, error } = await supabaseAdmin.from('inquiries').insert({
    org_id: req.orgId!, contact_name: b.contactName, phone: b.phone || null, email: b.email || null,
    trip_type: b.tripType, source: b.source, destination: b.destination || null,
    travel_start: b.travelStart || null, travel_end: b.travelEnd || null, travelers: b.travelers,
    budget: b.budget ?? null, currency: b.currency, next_action_at: b.nextActionAt || null,
    notes: b.notes || null, assigned_to: assignedTo,
  }).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to create inquiry');
  return res.status(201).json(transform(data));
});

router.patch('/inquiries/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'inquiry', (req) => req.params.id), async (req, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid inquiry update', parsed.error.issues);
  const b = parsed.data;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields: Record<string, string> = { contactName: 'contact_name', tripType: 'trip_type', travelStart: 'travel_start', travelEnd: 'travel_end', assignedTo: 'assigned_to', nextActionAt: 'next_action_at', lostReason: 'lost_reason' };
  for (const [key, value] of Object.entries(b)) updates[fields[key] || key] = value;
  const { data, error } = await supabaseAdmin.from('inquiries').update(updates).eq('id', req.params.id).eq('org_id', req.orgId!).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to update inquiry');
  return res.json(transform(data));
});

export default router;
