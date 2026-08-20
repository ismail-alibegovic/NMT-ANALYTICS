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

const quotationSchema = z.object({
  itineraryId: z.string().uuid(),
  itineraryVersionId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  clientNotes: z.string().max(4000).optional().nullable(),
  internalNotes: z.string().max(4000).optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  markupStrategy: z.enum(['uniform', 'per_item']).default('per_item'),
  globalMarkupPercent: z.number().min(0).max(1000).default(0),
});

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

async function computePricing(
  versionId: string,
  orgId: string,
  strategy: 'uniform' | 'per_item',
  globalMarkupPercent: number
) {
  const { data: items } = await supabaseAdmin
    .from('itinerary_items')
    .select('net_unit_price,quantity,markup_percent')
    .eq('itinerary_version_id', versionId)
    .eq('org_id', orgId);

  let net = 0;
  let sell = 0;
  for (const item of items || []) {
    const n = Number(item.net_unit_price) * Number(item.quantity);
    net += n;
    if (strategy === 'uniform') {
      sell += n * (1 + globalMarkupPercent / 100);
    } else {
      sell += n * (1 + Number(item.markup_percent) / 100);
    }
  }
  return {
    netTotal: Math.round(net * 100) / 100,
    sellTotal: Math.round(sell * 100) / 100,
    marginTotal: Math.round((sell - net) * 100) / 100,
  };
}

function nextReference(index: number) {
  const year = new Date().getFullYear();
  return `QTN-${year}-${String(index + 1).padStart(4, '0')}`;
}

router.get('/quotations', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (_req, res: Response) => {
  const { data: rows, error } = await supabaseAdmin
    .from('quotations')
    .select('*')
    .eq('org_id', _req.orgId!)
    .order('updated_at', { ascending: false });
  if (error) return handleSupabaseError(res, error, 'Failed to load quotations');
  return res.json({ data: (rows || []).map(quotationOut) });
});

router.post('/quotations', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'itinerary'), async (req, res: Response) => {
  const parsed = quotationSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation', parsed.error.issues);

  const b = parsed.data;
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

  const pricing = await computePricing(b.itineraryVersionId, req.orgId!, b.markupStrategy, b.globalMarkupPercent);
  const { count } = await supabaseAdmin.from('quotations').select('*', { count: 'exact', head: true }).eq('org_id', req.orgId!);

  const { data, error } = await supabaseAdmin
    .from('quotations')
    .insert({
      org_id: req.orgId!,
      itinerary_id: b.itineraryId,
      itinerary_version_id: b.itineraryVersionId,
      title: b.title,
      reference: nextReference(count || 0),
      status: 'draft',
      client_notes: b.clientNotes || null,
      internal_notes: b.internalNotes || null,
      valid_until: b.validUntil || null,
      markup_strategy: b.markupStrategy,
      global_markup_percent: b.globalMarkupPercent,
      net_total: pricing.netTotal,
      sell_total: pricing.sellTotal,
      margin_total: pricing.marginTotal,
      currency: itinerary.currency,
      created_by: req.user?.id || null,
    })
    .select('*')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to create quotation');
  return res.status(201).json(quotationOut(data));
});

router.get('/quotations/:id', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('quotations')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();
  if (error) return handleSupabaseError(res, error, 'Quotation not found');

  const { data: itinerary } = await supabaseAdmin
    .from('itineraries')
    .select('*')
    .eq('id', data.itinerary_id)
    .eq('org_id', req.orgId!)
    .single();
  const { data: version } = await supabaseAdmin
    .from('itinerary_versions')
    .select('*')
    .eq('id', data.itinerary_version_id)
    .eq('org_id', req.orgId!)
    .single();
  const { data: items } = await supabaseAdmin
    .from('itinerary_items')
    .select('*')
    .eq('itinerary_version_id', data.itinerary_version_id)
    .eq('org_id', req.orgId!)
    .order('day_number')
    .order('sort_order');

  const quotationData = quotationOut(data);
  const lineItems = (items || []).map((row: any) => {
    const netUnit = Number(row.net_unit_price);
    const qty = Number(row.quantity);
    const netLineTotal = Math.round(netUnit * qty * 100) / 100;
    const effectiveMarkup = quotationData.markupStrategy === 'uniform'
      ? quotationData.globalMarkupPercent
      : Number(row.markup_percent);
    const sellLineTotal = Math.round(netLineTotal * (1 + effectiveMarkup / 100) * 100) / 100;
    return {
      id: row.id,
      itineraryVersionId: row.itinerary_version_id,
      dayNumber: row.day_number,
      sortOrder: row.sort_order,
      startTime: row.start_time?.slice(0, 5) || null,
      title: row.title,
      description: row.description,
      location: row.location,
      category: row.category,
      supplierId: row.supplier_id,
      supplierServiceId: row.supplier_service_id,
      quantity: qty,
      unit: row.unit,
      netUnitPrice: netUnit,
      currency: row.currency,
      markupPercent: Number(row.markup_percent),
      included: row.included,
      netLineTotal,
      sellLineTotal,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return res.json({
    ...quotationData,
    itinerary: itinerary || null,
    version: version || null,
    items: lineItems,
  });
});

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

router.get('/quotations/:id/pdf', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const { data: quotation, error } = await supabaseAdmin
    .from('quotations')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', req.orgId!)
    .single();
  if (error) return handleSupabaseError(res, error, 'Quotation not found');

  const { data: itinerary } = await supabaseAdmin
    .from('itineraries')
    .select('*')
    .eq('id', quotation.itinerary_id)
    .eq('org_id', req.orgId!)
    .single();
  const { data: version } = await supabaseAdmin
    .from('itinerary_versions')
    .select('*')
    .eq('id', quotation.itinerary_version_id)
    .eq('org_id', req.orgId!)
    .single();
  const { data: items } = await supabaseAdmin
    .from('itinerary_items')
    .select('*')
    .eq('itinerary_version_id', quotation.itinerary_version_id)
    .eq('org_id', req.orgId!)
    .order('day_number')
    .order('sort_order');

  const branding = await getOrgBranding(req.orgId!).catch(() => null);
  const pdf = await generateOfferPDF({
    quotation: quotationOut(quotation),
    itinerary: itinerary || null,
    version: version || null,
    items: items || [],
  }, branding || undefined);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="offer-${quotation.reference || quotation.id}.pdf"`);
  return res.send(pdf);
});

export default router;
