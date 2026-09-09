import { Router, Response } from 'express';
import { z } from 'zod';
import { apiError } from '../lib/errors';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { departureCostCategories, deriveDepartureFinance } from '../lib/departureProfitability';
import { multiplyMoneyToCents, fromCents } from '../lib/money';

const router = Router();

const idSchema = z.string().uuid('Invalid ID');
const costItemSchema = z.object({
  category: z.enum(departureCostCategories),
  label: z.string().trim().min(1).max(160),
  supplierId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(3),
  notes: z.string().trim().max(1000).nullable().optional(),
});

function transformCostItem(row: any) {
  const quantity = Number(row.quantity || 0);
  const unitCost = Number(row.unit_cost || 0);
  return {
    id: row.id,
    departureId: row.departure_id,
    category: row.category,
    label: row.label,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.name || null,
    quantity,
    unitCost,
    totalCost: fromCents(multiplyMoneyToCents(quantity, unitCost)),
    currency: row.currency,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadDeparture(orgId: string, departureId: string) {
  const { data, error } = await supabaseAdmin
    .from('departures')
    .select('id, org_id, package_id, packages(id, name, destination, currency)')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .single();

  return { departure: data as any, error };
}

async function loadProfitability(orgId: string, departureId: string) {
  const { departure, error: departureError } = await loadDeparture(orgId, departureId);
  if (departureError || !departure) {
    return { status: 404, body: { code: 'NOT_FOUND', message: 'Departure not found' } };
  }

  const currency = departure.packages?.currency || 'BAM';

  const [{ data: reservations, error: reservationsError }, { data: payments, error: paymentsError }, { data: costItems, error: costItemsError }] =
    await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select('id, total_amount, currency, status')
        .eq('departure_id', departureId)
        .eq('org_id', orgId),
      supabaseAdmin
        .from('payments')
        .select('id, reservation_id, amount, currency, status')
        .eq('org_id', orgId),
      supabaseAdmin
        .from('departure_cost_items')
        .select('id, departure_id, category, label, supplier_id, quantity, unit_cost, currency, notes, created_at, updated_at, suppliers:supplier_id(id, name)')
        .eq('departure_id', departureId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: true }),
    ]);

  if (reservationsError) return { status: 500, body: { code: 'DATABASE_ERROR', message: 'Failed to load reservations', details: reservationsError.message } };
  if (paymentsError) return { status: 500, body: { code: 'DATABASE_ERROR', message: 'Failed to load payments', details: paymentsError.message } };
  if (costItemsError) return { status: 500, body: { code: 'DATABASE_ERROR', message: 'Failed to load departure cost items', details: costItemsError.message } };

  const reservationIds = new Set((reservations || []).map((reservation: any) => reservation.id));
  const scopedPayments = (payments || []).filter((payment: any) => reservationIds.has(payment.reservation_id));
  const finance = deriveDepartureFinance({
    reservations: reservations || [],
    payments: scopedPayments,
    costItems: costItems || [],
    currency,
  });

  return {
    status: 200,
    body: {
      departureId,
      currency,
      revenue: finance.revenue,
      collected: finance.collected,
      outstanding: finance.outstanding,
      supplierCosts: finance.supplierCosts,
      estimatedGrossProfit: finance.estimatedGrossProfit,
      marginPct: finance.marginPct,
      reservationCount: finance.reservationCount,
      costItems: (costItems || []).map(transformCostItem),
      costBreakdown: finance.costBreakdown,
      warnings: finance.warnings,
    },
  };
}

router.get('/departures/:departureId/profitability', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsedId = idSchema.safeParse(req.params.departureId);
  if (!parsedId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid departure ID');

  const result = await loadProfitability(req.orgId!, parsedId.data);
  return res.status(result.status).json(result.body);
});

router.post('/departures/:departureId/cost-items', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('CREATE', 'departure_cost_item'), async (req, res: Response) => {
  const parsedId = idSchema.safeParse(req.params.departureId);
  const parsedBody = costItemSchema.safeParse(req.body);
  if (!parsedId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid departure ID');
  if (!parsedBody.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid cost item', parsedBody.error.issues);

  const orgId = req.orgId!;
  const departureId = parsedId.data;
  const { departure, error: departureError } = await loadDeparture(orgId, departureId);
  if (departureError || !departure) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const departureCurrency = departure.packages?.currency || 'BAM';
  if (parsedBody.data.currency !== departureCurrency) {
    return apiError(res, 400, 'CURRENCY_MISMATCH', 'Cost item currency must match departure currency');
  }

  if (parsedBody.data.supplierId) {
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from('suppliers')
      .select('id')
      .eq('id', parsedBody.data.supplierId)
      .eq('org_id', orgId)
      .single();
    if (supplierError || !supplier) return apiError(res, 404, 'SUPPLIER_NOT_FOUND', 'Supplier not found');
  }

  const { data, error } = await supabaseAdmin
    .from('departure_cost_items')
    .insert({
      org_id: orgId,
      departure_id: departureId,
      category: parsedBody.data.category,
      label: parsedBody.data.label,
      supplier_id: parsedBody.data.supplierId || null,
      quantity: parsedBody.data.quantity,
      unit_cost: parsedBody.data.unitCost,
      currency: parsedBody.data.currency,
      notes: parsedBody.data.notes || null,
    })
    .select('id, departure_id, category, label, supplier_id, quantity, unit_cost, currency, notes, created_at, updated_at, suppliers:supplier_id(id, name)')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to create departure cost item');
  return res.status(201).json({ costItem: transformCostItem(data) });
});

router.patch('/departures/:departureId/cost-items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('UPDATE', 'departure_cost_item', (req) => req.params.itemId), async (req, res: Response) => {
  const parsedDepartureId = idSchema.safeParse(req.params.departureId);
  const parsedItemId = idSchema.safeParse(req.params.itemId);
  const parsedBody = costItemSchema.partial().safeParse(req.body);
  if (!parsedDepartureId.success || !parsedItemId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid ID');
  if (!parsedBody.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid cost item', parsedBody.error.issues);

  const orgId = req.orgId!;
  const { departure, error: departureError } = await loadDeparture(orgId, parsedDepartureId.data);
  if (departureError || !departure) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  if (parsedBody.data.currency && parsedBody.data.currency !== (departure.packages?.currency || 'BAM')) {
    return apiError(res, 400, 'CURRENCY_MISMATCH', 'Cost item currency must match departure currency');
  }

  if (parsedBody.data.supplierId) {
    const { data: supplier, error: supplierError } = await supabaseAdmin
      .from('suppliers')
      .select('id')
      .eq('id', parsedBody.data.supplierId)
      .eq('org_id', orgId)
      .single();
    if (supplierError || !supplier) return apiError(res, 404, 'SUPPLIER_NOT_FOUND', 'Supplier not found');
  }

  const updates: Record<string, unknown> = {};
  if (parsedBody.data.category) updates.category = parsedBody.data.category;
  if (parsedBody.data.label) updates.label = parsedBody.data.label;
  if (parsedBody.data.supplierId !== undefined) updates.supplier_id = parsedBody.data.supplierId || null;
  if (parsedBody.data.quantity !== undefined) updates.quantity = parsedBody.data.quantity;
  if (parsedBody.data.unitCost !== undefined) updates.unit_cost = parsedBody.data.unitCost;
  if (parsedBody.data.currency) updates.currency = parsedBody.data.currency;
  if (parsedBody.data.notes !== undefined) updates.notes = parsedBody.data.notes || null;

  const { data, error } = await supabaseAdmin
    .from('departure_cost_items')
    .update(updates)
    .eq('id', parsedItemId.data)
    .eq('departure_id', parsedDepartureId.data)
    .eq('org_id', orgId)
    .select('id, departure_id, category, label, supplier_id, quantity, unit_cost, currency, notes, created_at, updated_at, suppliers:supplier_id(id, name)')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to update departure cost item');
  return res.json({ costItem: transformCostItem(data) });
});

router.delete('/departures/:departureId/cost-items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('DELETE', 'departure_cost_item', (req) => req.params.itemId), async (req, res: Response) => {
  const parsedDepartureId = idSchema.safeParse(req.params.departureId);
  const parsedItemId = idSchema.safeParse(req.params.itemId);
  if (!parsedDepartureId.success || !parsedItemId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid ID');

  const { error } = await supabaseAdmin
    .from('departure_cost_items')
    .delete()
    .eq('id', parsedItemId.data)
    .eq('departure_id', parsedDepartureId.data)
    .eq('org_id', req.orgId!);

  if (error) return handleSupabaseError(res, error, 'Failed to delete departure cost item');
  return res.status(204).send();
});

export default router;
