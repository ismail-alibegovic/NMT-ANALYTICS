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

const router = Router();

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
  items: z.array(quotationItemSchema).optional().default([]),
  clientNotes: z.string().max(4000).optional().nullable(),
  internalNotes: z.string().max(4000).optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  markupStrategy: z.enum(['uniform', 'per_item']).default('per_item'),
  globalMarkupPercent: z.number().min(0).max(1000).default(0),
}).refine(
  (v) => (v.itineraryId ? true : false) === (v.itineraryVersionId ? true : false),
  { message: 'both itineraryId and itineraryVersionId are required, or both must be absent for a standalone quotation' }
);

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

function nextReference(index: number) {
  const year = new Date().getFullYear();
  return `QTN-${year}-${String(index + 1).padStart(4, '0')}`;
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
router.post('/quotations', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'itinerary'), async (req, res: Response) => {
  const parsed = quotationSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation', parsed.error.issues);

  const b = parsed.data;
  const isItineraryDerived = !!b.itineraryId;
  let currency = 'BAM';

  if (isItineraryDerived) {
    const { data: itinerary } = await supabaseAdmin
      .from('itineraries')
      .select('id,currency,current_version')
      .eq('id', b.itineraryId)
      .eq('org_id', req.orgId!)
      .maybeSingle();
    if (!itinerary) return apiError(res, 404, 'NOT_FOUND', 'Itinerary not found');

    const { data: version } = await supabaseAdmin
      .from('itinerary_versions')
      .select('id')
      .eq('id', b.itineraryVersionId)
      .eq('org_id', req.orgId!)
      .eq('itinerary_id', b.itineraryId)
      .maybeSingle();
    if (!version) return apiError(res, 404, 'NOT_FOUND', 'Itinerary version not found');

    currency = itinerary.currency;
  }

  const { count } = await supabaseAdmin.from('quotations').select('*', { count: 'exact', head: true }).eq('org_id', req.orgId!);
  const ref = nextReference(count || 0);

  const quotationPayload: Record<string, unknown> = {
    org_id: req.orgId!,
    itinerary_id: b.itineraryId || null,
    itinerary_version_id: b.itineraryVersionId || null,
    title: b.title,
    reference: ref,
    status: 'draft',
    client_notes: b.clientNotes || null,
    internal_notes: b.internalNotes || null,
    valid_until: b.validUntil || null,
    markup_strategy: b.markupStrategy,
    global_markup_percent: b.globalMarkupPercent,
    net_total: 0,
    sell_total: 0,
    margin_total: 0,
    currency,
    created_by: req.user?.id || null,
  };

  const { data: quotation, error } = await supabaseAdmin
    .from('quotations')
    .insert(quotationPayload)
    .select('*')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to create quotation');

  let itemsToPricing: Array<{ netUnitPrice: number; quantity: number; markupPercent: number }> = [];

  if (isItineraryDerived) {
    const { data: sourceItems } = await supabaseAdmin
      .from('itinerary_items')
      .select('day_number,sort_order,start_time,title,description,location,category,supplier_id,supplier_service_id,quantity,unit,net_unit_price,currency,markup_percent,included')
      .eq('itinerary_version_id', b.itineraryVersionId)
      .eq('org_id', req.orgId!)
      .order('day_number')
      .order('sort_order');

    const inserts = (sourceItems || []).map((si: any) => ({
      org_id: req.orgId!,
      quotation_id: quotation.id,
      day_number: si.day_number,
      sort_order: si.sort_order,
      start_time: si.start_time,
      title: si.title,
      description: si.description,
      location: si.location,
      category: si.category,
      supplier_id: si.supplier_id,
      supplier_service_id: si.supplier_service_id,
      quantity: si.quantity,
      unit: si.unit,
      net_unit_price: si.net_unit_price,
      currency: si.currency,
      markup_percent: si.markup_percent,
      included: si.included,
    }));

    if (inserts.length > 0) {
      await supabaseAdmin.from('quotation_items').insert(inserts);
    }

    itemsToPricing = (sourceItems || []).map((i: any) => ({
      netUnitPrice: Number(i.net_unit_price),
      quantity: Number(i.quantity),
      markupPercent: Number(i.markup_percent),
    }));
  } else if (b.items && b.items.length > 0) {
    const inserts = b.items.map((item) => ({
      org_id: req.orgId!,
      quotation_id: quotation.id,
      day_number: item.dayNumber,
      sort_order: item.sortOrder,
      start_time: item.startTime || null,
      title: item.title,
      description: item.description || null,
      location: item.location || null,
      category: item.category,
      supplier_id: item.supplierId || null,
      supplier_service_id: item.supplierServiceId || null,
      quantity: item.quantity,
      unit: item.unit,
      net_unit_price: item.netUnitPrice,
      currency: item.currency,
      markup_percent: item.markupPercent,
      included: item.included,
    }));

    await supabaseAdmin.from('quotation_items').insert(inserts);

    itemsToPricing = b.items.map((i) => ({
      netUnitPrice: i.netUnitPrice,
      quantity: i.quantity,
      markupPercent: i.markupPercent,
    }));
  }

  if (itemsToPricing.length > 0) {
    const pricing = computePricingFromItems(itemsToPricing, b.markupStrategy, b.globalMarkupPercent);
    await supabaseAdmin
      .from('quotations')
      .update({
        net_total: pricing.netTotal,
        sell_total: pricing.sellTotal,
        margin_total: pricing.marginTotal,
        currency: isItineraryDerived ? currency : (b.items?.[0]?.currency || 'BAM'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotation.id)
      .eq('org_id', req.orgId!);
  }

  const { data: created } = await supabaseAdmin
    .from('quotations')
    .select('*')
    .eq('id', quotation.id)
    .eq('org_id', req.orgId!)
    .single();

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

  const [itemsRes, itineraryRes, versionRes] = await Promise.all([
    itemsPromise,
    itineraryPromise,
    versionPromise,
  ]);

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
    itinerary: itineraryRes?.data || null,
    version: versionRes?.data || null,
    items: lineItems,
  });
});

// ─── Update ────────────────────────────────────────────────
router.patch('/quotations/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'itinerary', (r) => r.params.id), async (req, res: Response) => {
  const allowed = ['title', 'clientNotes', 'internalNotes', 'validUntil', 'status'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const col = key.replace(/[A-Z]/g, (m: string) => `_${m.toLowerCase()}`);
      updates[col] = req.body[key];
    }
  }

  if (req.body.status) {
    const ts = new Date().toISOString();
    if (req.body.status === 'sent') updates.sent_at = ts;
    if (req.body.status === 'accepted') updates.accepted_at = ts;
    if (req.body.status === 'rejected') updates.rejected_at = ts;
  }

  if (Object.keys(updates).length === 0) return apiError(res, 400, 'VALIDATION_ERROR', 'No valid fields to update');

  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('quotations')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .select('*')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to update quotation');
  return res.json(quotationOut(data));
});

// ─── Add quotation item ────────────────────────────────────
router.post('/quotations/:id/items', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'itinerary', (r) => r.params.id), async (req, res: Response) => {
  const parsed = quotationItemSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation item', parsed.error.issues);

  const { data: quotation } = await supabaseAdmin
    .from('quotations')
    .select('id')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (!quotation) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');

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

  if (error) return handleSupabaseError(res, error, 'Failed to add item');

  await recalcQuotationTotals(req.params.id, req.orgId!);
  return res.status(201).json(quotationItemOut(item));
});

// ─── Update quotation item ─────────────────────────────────
router.patch('/quotations/:id/items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'itinerary', (r) => r.params.id), async (req, res: Response) => {
  const parsed = quotationItemSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation item', parsed.error.issues);

  const { data: quotation } = await supabaseAdmin
    .from('quotations')
    .select('id')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (!quotation) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');

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

  if (error) return handleSupabaseError(res, error, 'Item not found');

  await recalcQuotationTotals(req.params.id, req.orgId!);
  return res.json(quotationItemOut(item));
});

// ─── Delete quotation item ─────────────────────────────────
router.delete('/quotations/:id/items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'itinerary', (r) => r.params.id), async (req, res: Response) => {
  const { data: quotation } = await supabaseAdmin
    .from('quotations')
    .select('id')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .maybeSingle();
  if (!quotation) return apiError(res, 404, 'NOT_FOUND', 'Quotation not found');

  const { error } = await supabaseAdmin
    .from('quotation_items')
    .delete()
    .eq('id', req.params.itemId)
    .eq('quotation_id', req.params.id)
    .eq('org_id', req.orgId!);

  if (error) return handleSupabaseError(res, error, 'Failed to delete item');

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
