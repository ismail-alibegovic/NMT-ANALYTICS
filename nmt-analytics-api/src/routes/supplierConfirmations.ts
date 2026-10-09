import { Router, Response } from 'express';
import { z } from 'zod';
import { apiError } from '../lib/errors';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { transformCostItem } from './departureProfitability';

const router = Router();

const idSchema = z.string().uuid('Invalid ID');
const confirmationStatuses = ['unconfirmed', 'requested', 'confirmed', 'cancelled'] as const;
const confirmationSchema = z.object({
  status: z.enum(confirmationStatuses),
  note: z.string().trim().max(1000).optional(),
});
const eventsLimitSchema = z.coerce.number().int().min(1).max(200).default(100);

const COST_ITEM_SELECT =
  'id, departure_id, category, label, supplier_id, quantity, unit_cost, currency, notes, confirmation_status, created_at, updated_at, suppliers!departure_cost_items_supplier_org_fk(id, name)';

async function loadDeparture(orgId: string, departureId: string) {
  const { data, error } = await supabaseAdmin
    .from('departures')
    .select('id, org_id, package_id, packages(id, name, currency)')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .single();

  return { departure: data as any, error };
}

function transformEvent(row: any) {
  return {
    id: row.id,
    departureId: row.departure_id,
    costItemId: row.cost_item_id,
    costItemLabel: row.departure_cost_items?.label || null,
    status: row.status,
    note: row.note,
    actorEmail: row.actor_email,
    createdAt: row.created_at,
  };
}

function summarize(items: Array<{ confirmationStatus: string }>) {
  const byStatus: Record<string, number> = { unconfirmed: 0, requested: 0, confirmed: 0, cancelled: 0 };
  for (const item of items) {
    const status = confirmationStatuses.includes(item.confirmationStatus as (typeof confirmationStatuses)[number])
      ? item.confirmationStatus
      : 'unconfirmed';
    byStatus[status] += 1;
  }
  const outstanding = byStatus.unconfirmed + byStatus.requested;
  return {
    total: items.length,
    byStatus,
    outstanding,
    ready: outstanding === 0,
  };
}

// Confirmation board for one departure: which supplier services are secured.
router.get('/departures/:departureId/supplier-confirmations', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsedId = idSchema.safeParse(req.params.departureId);
  if (!parsedId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid departure ID');

  const orgId = req.orgId!;
  const { error: departureError } = await loadDeparture(orgId, parsedId.data);
  if (departureError) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { data: costItems, error } = await supabaseAdmin
    .from('departure_cost_items')
    .select(COST_ITEM_SELECT)
    .eq('departure_id', parsedId.data)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) return handleSupabaseError(res, error, 'Failed to load supplier confirmations');

  const items = (costItems || []).map(transformCostItem);
  return res.json({
    departureId: parsedId.data,
    items,
    summary: summarize(items),
  });
});

// Record a confirmation status change with an optional request note.
// Status update and history insert are two writes: if the event insert fails after
// the status update, the client may retry the same request (duplicate-safe).
router.post('/departures/:departureId/cost-items/:itemId/confirmation', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('UPDATE', 'departure_cost_item', (req) => req.params.itemId), async (req, res: Response) => {
  const parsedDepartureId = idSchema.safeParse(req.params.departureId);
  const parsedItemId = idSchema.safeParse(req.params.itemId);
  const parsedBody = confirmationSchema.safeParse(req.body);
  if (!parsedDepartureId.success || !parsedItemId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid ID');
  if (!parsedBody.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid confirmation payload', parsedBody.error.issues);

  const orgId = req.orgId!;
  const departureId = parsedDepartureId.data;
  const itemId = parsedItemId.data;

  const { error: departureError } = await loadDeparture(orgId, departureId);
  if (departureError) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { data: costItem, error: updateError } = await supabaseAdmin
    .from('departure_cost_items')
    .update({ confirmation_status: parsedBody.data.status })
    .eq('id', itemId)
    .eq('departure_id', departureId)
    .eq('org_id', orgId)
    .select(COST_ITEM_SELECT)
    .single();

  if (updateError) {
    if ((updateError as any).code === 'PGRST116') return apiError(res, 404, 'NOT_FOUND', 'Cost item not found');
    return handleSupabaseError(res, updateError, 'Failed to update cost item confirmation status');
  }
  if (!costItem) return apiError(res, 404, 'NOT_FOUND', 'Cost item not found');

  const { data: event, error: eventError } = await supabaseAdmin
    .from('supplier_confirmation_events')
    .insert({
      org_id: orgId,
      departure_id: departureId,
      cost_item_id: itemId,
      status: parsedBody.data.status,
      note: parsedBody.data.note || null,
      actor_id: (req as any).user?.id || null,
      actor_email: (req as any).user?.email || null,
    })
    .select('id, departure_id, cost_item_id, status, note, actor_id, actor_email, created_at, departure_cost_items!supplier_confirmation_events_cost_item_org_fk(label)')
    .single();

  if (eventError) {
    return apiError(res, 500, 'CONFIRMATION_EVENT_LOG_FAILED', 'Confirmation status updated but the history event could not be recorded. Retry with the same status if history completeness is required.');
  }

  const transformedEvent = transformEvent(event);
  if (!transformedEvent.costItemLabel) transformedEvent.costItemLabel = costItem.label;

  return res.json({ costItem: transformCostItem(costItem), event: transformedEvent });
});

// Append-only request/notes history for a departure.
router.get('/departures/:departureId/supplier-confirmation-events', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsedId = idSchema.safeParse(req.params.departureId);
  const parsedLimit = eventsLimitSchema.safeParse(req.query.limit ?? undefined);
  if (!parsedId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid departure ID');
  if (!parsedLimit.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid limit');

  const orgId = req.orgId!;
  const { error: departureError } = await loadDeparture(orgId, parsedId.data);
  if (departureError) return apiError(res, 404, 'NOT_FOUND', 'Departure not found');

  const { data: events, error } = await supabaseAdmin
    .from('supplier_confirmation_events')
    .select('id, departure_id, cost_item_id, status, note, actor_id, actor_email, created_at, departure_cost_items!supplier_confirmation_events_cost_item_org_fk(label)')
    .eq('departure_id', parsedId.data)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(parsedLimit.data);

  if (error) return handleSupabaseError(res, error, 'Failed to load supplier confirmation events');

  return res.json({ departureId: parsedId.data, events: (events || []).map(transformEvent) });
});

export default router;
