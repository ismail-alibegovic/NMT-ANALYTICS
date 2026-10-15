import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { generateOfferPDF } from '../lib/pdfGenerator';
import { getOrgBranding } from '../lib/orgBranding';

import quotationBookingRoutes from './quotationBooking';

const router = Router();
router.use(quotationBookingRoutes);

const quotationItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  category: z.string().max(50).default('other'),
  quantity: z.number().positive().default(1),
  unit: z.string().max(30).default('fixed'),
  netUnitPrice: z.number().min(0).default(0),
  markupPercent: z.number().min(0).max(1000).default(0),
  currency: z.string().max(10).default('BAM'),
  included: z.boolean().default(true),
  dayNumber: z.number().int().positive().default(1),
  sortOrder: z.number().int().default(0),
  startTime: z.string().max(8).optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  supplierServiceId: z.string().uuid().optional().nullable(),
});

const quotationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  itineraryId: z.string().uuid().optional().nullable(),
  itineraryVersionId: z.string().uuid().optional().nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  items: z.array(quotationItemSchema.extend({ currency: z.string().trim().regex(/^[A-Z]{3}$/).optional() })).max(500).optional().default([]),
  clientNotes: z.string().max(4000).optional().nullable(),
  internalNotes: z.string().max(4000).optional().nullable(),
  validUntil: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  markupStrategy: z.enum(['uniform', 'per_item']).default('per_item'),
  globalMarkupPercent: z.number().min(0).max(1000).default(0),
}).refine(
  (v) => (v.itineraryId ? true : false) === (v.itineraryVersionId ? true : false),
  { message: 'both itineraryId and itineraryVersionId are required, or both must be absent for a standalone quotation' }
);

const quotationPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  clientNotes: z.string().max(4000).optional().nullable(),
  internalNotes: z.string().max(4000).optional().nullable(),
  validUntil: z.union([z.string().date(), z.string().datetime()]).optional().nullable(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']).optional(),
});

const quotationLocked = (row: any) => !!row.commercial_locked || row.status === 'accepted' || !!row.accepted_at;

function quotationWriteError(res: Response, error: any, fallback: string) {
  if (error?.message === 'QUOTATION_LOCKED' || error?.message === 'QUOTATION_ITEM_IDENTITY_LOCKED') {
    return apiError(res, 409, 'QUOTATION_LOCKED', 'Accepted quotation terms cannot be changed');
  }
  if (error?.message === 'QUOTATION_INVALID_PRICING') {
    return apiError(res, 422, 'QUOTATION_INVALID_PRICING', 'A quotation needs persisted items in one currency before acceptance');
  }
  return handleSupabaseError(res, error, fallback);
}

const quotationOut = (row: any) => ({
  id: row.id,
  itineraryId: row.itinerary_id,
  itineraryVersionId: row.itinerary_version_id,
  title: row.title,
  reference: row.reference,
  status: row.status,
  clientNotes: row.client_notes,
  internalNotes: row.internal_notes,
  validUntil: row.valid_until,
  markupStrategy: row.markup_strategy,
  globalMarkupPercent: Number(row.global_markup_percent),
  sellTotal: Number(row.sell_total),
  netTotal: Number(row.net_total),
  marginTotal: Number(row.margin_total),
  currency: row.currency,
  sentAt: row.sent_at,
  acceptedAt: row.accepted_at,
  commercialLocked: !!row.commercial_locked,
  bookingContext: row.booking_context || {},
  rejectedAt: row.rejected_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const quotationItemOut = (row: any) => ({
  id: row.id,
  quotationId: row.quotation_id,
  dayNumber: row.day_number,
  sortOrder: row.sort_order,
  startTime: row.start_time?.slice(0, 5) || null,
  title: row.title,
  description: row.description,
  location: row.location,
  category: row.category,
  supplierId: row.supplier_id,
  supplierServiceId: row.supplier_service_id,
  quantity: Number(row.quantity),
  unit: row.unit,
  netUnitPrice: Number(row.net_unit_price),
  currency: row.currency,
  markupPercent: Number(row.markup_percent),
  included: row.included,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function computePricingFromItems(
  items: Array<{ netUnitPrice: number; quantity: number; markupPercent: number }>,
  strategy: 'uniform' | 'per_item',
  globalMarkupPercent: number
) {
  let net = 0;
  let sell = 0;
  for (const item of items) {
    const n = item.netUnitPrice * item.quantity;
    net += n;
    if (strategy === 'uniform') {
      sell += n * (1 + globalMarkupPercent / 100);
    } else {
      sell += n * (1 + item.markupPercent / 100);
    }
  }
  return {
    netTotal: Math.round(net * 100) / 100,
    sellTotal: Math.round(sell * 100) / 100,
    marginTotal: Math.round((sell - net) * 100) / 100,
  };
}

async function recalcQuotationTotals(quotationId: string, orgId: string, supabase = supabaseAdmin) {
  const { data: items } = await supabase
    .from('quotation_items')
    .select('net_unit_price,quantity,markup_percent')
    .eq('quotation_id', quotationId)
    .eq('org_id', orgId);

  const { data: quotation } = await supabase
    .from('quotations')
    .select('markup_strategy,global_markup_percent')
    .eq('id', quotationId)
    .eq('org_id', orgId)
    .single();

  if (!quotation) throw new Error('Quotation not found');

  const pricing = computePricingFromItems(
    (items || []).map((i: any) => ({
      netUnitPrice: Number(i.net_unit_price),
      quantity: Number(i.quantity),
      markupPercent: Number(i.markup_percent),
    })),
    quotation.markup_strategy,
    Number(quotation.global_markup_percent)
  );

  await supabase
    .from('quotations')
    .update({
      net_total: pricing.netTotal,
      sell_total: pricing.sellTotal,
      margin_total: pricing.marginTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quotationId)
    .eq('org_id', orgId);
}

// ─── List ──────────────────────────────────────────────────
router.get('/quotations', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (_req, res: Response) => {
  const { data: rows, error } = await supabaseAdmin
    .from('quotations')
    .select('*')
    .eq('org_id', _req.orgId!)
    .order('updated_at', { ascending: false });
  if (error) return handleSupabaseError(res, error, 'Failed to load quotations');
  return res.json({ data: (rows || []).map(quotationOut) });
});

// ─── Create ────────────────────────────────────────────────
router.post('/quotations', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'quotation'), async (req, res: Response) => {
  const parsed = quotationSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation', parsed.error.issues);

  const b = parsed.data;
  const { data: created, error } = await supabaseAdmin.rpc('create_quotation_snapshot_atomic', {
    p_org_id: req.orgId!,
    p_actor_id: req.user!.id,
    p_payload: {
      title: b.title, itinerary_id: b.itineraryId || null, itinerary_version_id: b.itineraryVersionId || null,
      currency: b.currency || null, client_notes: b.clientNotes || null, internal_notes: b.internalNotes || null,
      valid_until: b.validUntil || null, markup_strategy: b.markupStrategy, global_markup_percent: b.globalMarkupPercent,
      items: b.items.map(item => ({
        title: item.title, description: item.description || null, location: item.location || null,
        category: item.category, day_number: item.dayNumber, sort_order: item.sortOrder, start_time: item.startTime || null,
        supplier_id: item.supplierId || null, supplier_service_id: item.supplierServiceId || null,
        quantity: item.quantity, unit: item.unit, net_unit_price: item.netUnitPrice, markup_percent: item.markupPercent,
        currency: item.currency || null, included: item.included,
      })),
    },
  });
  if (error) {
    if (error.message === 'QUOTATION_SOURCE_NOT_FOUND') return apiError(res, 404, 'NOT_FOUND', 'Quotation source not found');
    if (error.message === 'QUOTATION_ACTOR_CONTEXT_INVALID') return apiError(res, 403, 'INSUFFICIENT_PERMISSIONS', 'Quotation actor context is invalid');
    if (error.message === 'QUOTATION_CURRENCY_MISMATCH') return apiError(res, 422, 'QUOTATION_CURRENCY_MISMATCH', 'Quotation items must use the quotation currency');
    if (['QUOTATION_INVALID_PAYLOAD', 'QUOTATION_TOO_MANY_ITEMS'].includes(error.message) || ['23503', '23514', '22003'].includes(error.code)) {
      return apiError(res, 422, 'QUOTATION_INVALID_SNAPSHOT', 'Quotation source or item values are invalid');
    }
    return handleSupabaseError(res, error, 'Failed to create complete quotation snapshot');
  }
  if (!created?.id || created.org_id !== req.orgId!) {
    return apiError(res, 500, 'QUOTATION_SNAPSHOT_FAILED', 'Quotation snapshot was not created');
  }
  return res.status(201).json(quotationOut(created));
});

// ─── Get single ────────────────────────────────────────────
router.get('/quotations/:id', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('quotations')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();
  if (error || !data) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');

  const itemsPromise = supabaseAdmin
    .from('quotation_items')
    .select('*')
    .eq('quotation_id', data.id)
    .eq('org_id', req.orgId!)
    .order('day_number')
    .order('sort_order');

  const itineraryPromise = data.itinerary_id
    ? supabaseAdmin
        .from('itineraries')
        .select('*')
        .eq('id', data.itinerary_id)
        .eq('org_id', req.orgId!)
        .single()
    : Promise.resolve(null);

  const versionPromise = data.itinerary_id
    ? supabaseAdmin
        .from('itinerary_versions')
        .select('*')
        .eq('id', data.itinerary_version_id)
        .eq('org_id', req.orgId!)
        .single()
    : Promise.resolve(null);

  const bookingPromise = supabaseAdmin.from('reservations').select('id,status,creation_state')
    .eq('org_id',req.orgId!).eq('quotation_id',data.id).maybeSingle();
  const [itemsRes, itineraryRes, versionRes, bookingRes] = await Promise.all([
    itemsPromise,
    itineraryPromise,
    versionPromise,
    bookingPromise,
  ]);
  if (bookingRes.error) return handleSupabaseError(res,bookingRes.error,'Failed to load linked booking');

  const items = (itemsRes?.data || []).map(quotationItemOut);

  const lineItems = items.map((row: any) => {
    const netUnit = row.netUnitPrice;
    const qty = row.quantity;
    const netLineTotal = Math.round(netUnit * qty * 100) / 100;
    const effectiveMarkup = data.markup_strategy === 'uniform'
      ? Number(data.global_markup_percent)
      : row.markupPercent;
    const sellLineTotal = Math.round(netLineTotal * (1 + effectiveMarkup / 100) * 100) / 100;
    return {
      ...row,
      itineraryVersionId: data.itinerary_version_id || null,
      netLineTotal,
      sellLineTotal,
    };
  });

  return res.json({
    ...quotationOut(data),
    booking: bookingRes.data || null,
    itinerary: itineraryRes?.data || null,
    version: versionRes?.data || null,
    items: lineItems,
  });
});

// ─── Update ────────────────────────────────────────────────
router.patch('/quotations/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'quotation', (r) => r.params.id), async (req, res: Response) => {
  const parsed = quotationPatchSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation update', parsed.error.issues);
  const body = parsed.data;
  if (Object.keys(body).length === 0) return apiError(res, 400, 'VALIDATION_ERROR', 'No valid fields to update');
  const { data: current, error: lookupError } = await supabaseAdmin
    .from('quotations').select('*').eq('id', req.params.id).eq('org_id', req.orgId!).maybeSingle();
  if (lookupError) return handleSupabaseError(res, lookupError, 'Failed to load quotation');
  if (!current) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');
  if (quotationLocked(current) && Object.entries(body).some(([key, value]) =>
    key !== 'internalNotes' && !(key === 'status' && (value === current.status || value === 'rejected' || value === 'expired'))
  )) return apiError(res, 409, 'QUOTATION_LOCKED', 'Accepted quotation terms cannot be changed');

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    updates[key.replace(/[A-Z]/g, (m: string) => `_${m.toLowerCase()}`)] = value;
  }
  if (body.status && body.status !== current.status) {
    const ts = new Date().toISOString();
    if (body.status === 'sent') updates.sent_at = ts;
    if (body.status === 'accepted') updates.accepted_at = ts;
    if (body.status === 'rejected') updates.rejected_at = ts;
  }

  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('quotations')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .select('*')
    .single();

  if (error) return quotationWriteError(res, error, 'Failed to update quotation');
  return res.json(quotationOut(data));
});

// ─── Add quotation item ────────────────────────────────────
router.post('/quotations/:id/items', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'quotation', (r) => r.params.id), async (req, res: Response) => {
  const parsed = quotationItemSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation item', parsed.error.issues);

  const { data: quotation } = await supabaseAdmin
    .from('quotations')
    .select('id,status,accepted_at,commercial_locked')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (!quotation) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');
  if (quotationLocked(quotation)) return apiError(res, 409, 'QUOTATION_LOCKED', 'Accepted quotation terms cannot be changed');

  const b = parsed.data;
  const { data: item, error } = await supabaseAdmin
    .from('quotation_items')
    .insert({
      org_id: req.orgId!,
      quotation_id: req.params.id,
      day_number: b.dayNumber,
      sort_order: b.sortOrder,
      start_time: b.startTime || null,
      title: b.title,
      description: b.description || null,
      location: b.location || null,
      category: b.category,
      supplier_id: b.supplierId || null,
      supplier_service_id: b.supplierServiceId || null,
      quantity: b.quantity,
      unit: b.unit,
      net_unit_price: b.netUnitPrice,
      currency: b.currency,
      markup_percent: b.markupPercent,
      included: b.included,
    })
    .select('*')
    .single();

  if (error) return quotationWriteError(res, error, 'Failed to add item');

  await recalcQuotationTotals(req.params.id, req.orgId!);
  return res.status(201).json(quotationItemOut(item));
});

// ─── Update quotation item ─────────────────────────────────
router.patch('/quotations/:id/items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'quotation', (r) => r.params.id), async (req, res: Response) => {
  const parsed = quotationItemSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation item', parsed.error.issues);

  const { data: quotation } = await supabaseAdmin
    .from('quotations')
    .select('id,status,accepted_at,commercial_locked')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (!quotation) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');
  if (quotationLocked(quotation)) return apiError(res, 409, 'QUOTATION_LOCKED', 'Accepted quotation terms cannot be changed');

  const b = parsed.data;
  const { data: item, error } = await supabaseAdmin
    .from('quotation_items')
    .update({
      day_number: b.dayNumber,
      sort_order: b.sortOrder,
      start_time: b.startTime || null,
      title: b.title,
      description: b.description || null,
      location: b.location || null,
      category: b.category,
      supplier_id: b.supplierId || null,
      supplier_service_id: b.supplierServiceId || null,
      quantity: b.quantity,
      unit: b.unit,
      net_unit_price: b.netUnitPrice,
      currency: b.currency,
      markup_percent: b.markupPercent,
      included: b.included,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.itemId)
    .eq('quotation_id', req.params.id)
    .eq('org_id', req.orgId!)
    .select('*')
    .single();

  if (error) return quotationWriteError(res, error, 'Item not found');

  await recalcQuotationTotals(req.params.id, req.orgId!);
  return res.json(quotationItemOut(item));
});

// ─── Delete quotation item ─────────────────────────────────
router.delete('/quotations/:id/items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'quotation', (r) => r.params.id), async (req, res: Response) => {
  const { data: quotation } = await supabaseAdmin
    .from('quotations')
    .select('id,status,accepted_at,commercial_locked')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (!quotation) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');
  if (quotationLocked(quotation)) return apiError(res, 409, 'QUOTATION_LOCKED', 'Accepted quotation terms cannot be changed');

  const { error } = await supabaseAdmin
    .from('quotation_items')
    .delete()
    .eq('id', req.params.itemId)
    .eq('quotation_id', req.params.id)
    .eq('org_id', req.orgId!);

  if (error) return quotationWriteError(res, error, 'Failed to delete item');

  await recalcQuotationTotals(req.params.id, req.orgId!);
  return res.json({ ok: true });
});

// ─── PDF ───────────────────────────────────────────────────
router.get('/quotations/:id/pdf', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data: quotation, error } = await supabaseAdmin
    .from('quotations')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();
  if (error || !quotation) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');

  const { data: items } = await supabaseAdmin
    .from('quotation_items')
    .select('*')
    .eq('quotation_id', quotation.id)
    .eq('org_id', req.orgId!)
    .order('day_number')
    .order('sort_order');

  const branding = await getOrgBranding(req.orgId!).catch(() => null);
  const pdf = await generateOfferPDF({
    quotation: quotationOut(quotation),
    itinerary: quotation.itinerary_id ? { id: quotation.itinerary_id } : null,
    version: quotation.itinerary_version_id ? { id: quotation.itinerary_version_id } : null,
    items: (items || []).map((row: any) => ({
      id: row.id,
      dayNumber: row.day_number,
      sortOrder: row.sort_order,
      startTime: row.start_time?.slice(0, 5) || null,
      title: row.title,
      description: row.description,
      location: row.location,
      category: row.category,
      quantity: Number(row.quantity),
      unit: row.unit,
      netUnitPrice: Number(row.net_unit_price),
      currency: row.currency,
      markupPercent: Number(row.markup_percent),
      included: row.included,
    })),
  }, branding || undefined);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="offer-${quotation.reference || quotation.id}.pdf"`);
  return res.send(pdf);
});

export default router;
