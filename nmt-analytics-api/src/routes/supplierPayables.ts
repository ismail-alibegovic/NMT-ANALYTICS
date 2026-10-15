import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { toCents, fromCents } from '../lib/money';
import { saleRequestFingerprint } from '../lib/saleIdempotency';

const router = Router();
const id = z.string().uuid().transform(value => value.toLowerCase());
const date = z.string().date();
const issue = z.object({ requestId: id, costItemId: id, dueDate: date });
const details = { requestId: id, currency: z.string().regex(/^[A-Z]{3}$/), paymentDate: date, reference: z.string().trim().max(200).default(''), note: z.string().trim().max(1000).default('') };
const entry = z.discriminatedUnion('kind', [
  z.object({ ...details, kind: z.literal('payment'), amount: z.number().positive().max(999999999999.99).multipleOf(0.01) }),
  z.object({ ...details, kind: z.literal('reversal'), reversesId: id, note: z.string().trim().min(1).max(1000) }),
]);

export function payableError(res: Response, error: any) {
  const code = error?.message;
  if (['PAYABLE_NOT_FOUND', 'PAYABLE_SOURCE_NOT_FOUND', 'PAYABLE_PAYMENT_NOT_FOUND'].includes(code))
    return apiError(res, 404, code, 'Supplier obligation or source not found');
  if (code === 'PAYABLE_ACTOR_INVALID') return apiError(res, 403, code, 'Invalid obligation actor');
  if (code === 'PAYABLE_CURRENCY_MISMATCH') return apiError(res, 422, code, 'Payment currency must match the supplier obligation');
  if (['PAYABLE_SOURCE_INVALID', 'PAYABLE_REVERSAL_INVALID'].includes(code) || ['23514', '22003', '22008'].includes(error?.code))
    return apiError(res, 422, 'PAYABLE_INVALID', 'Check supplier, amount, currency and dates');
  if (typeof code === 'string' && code.startsWith('PAYABLE_'))
    return apiError(res, 409, code, 'Supplier obligation conflicts with its current ledger');
  if (error?.code === '23505') return apiError(res, 409, 'PAYABLE_REQUEST_CONFLICT', 'Request identifier already used');
  if (error?.code === '23503') return apiError(res, 422, 'PAYABLE_INVALID', 'Invalid supplier obligation reference');
  return handleSupabaseError(res, error, 'Supplier obligations could not be processed');
}

export function transformPayable(row: any) {
  if (!Array.isArray(row.entries)) throw new Error('Supplier ledger missing');
  const paid = row.entries.reduce((sum: number, item: any) => sum + toCents(item.amount), 0);
  const amount = toCents(row.amount);
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(paid) || paid < 0 || paid > amount) throw new Error('Invalid supplier ledger balance');
  return {
    id: row.id, requestId: row.request_id, departureId: row.departure_id, costItemId: row.cost_item_id, supplierId: row.supplier_id,
    supplierName: row.supplier_name, label: row.label, amount: fromCents(amount), currency: row.currency,
    dueDate: row.due_date, createdAt: row.created_at, cancelledAt: row.cancelled_at,
    paid: fromCents(paid), remaining: row.cancelled_at ? 0 : fromCents(amount - paid),
    status: row.cancelled_at ? 'cancelled' : paid === amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    entries: [...row.entries].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map(item => ({
      id: item.id, requestId: item.request_id, kind: item.kind, amount: Number(item.amount), paymentDate: item.payment_date,
      reference: item.reference, note: item.note, reversesId: item.reverses_id, createdAt: item.created_at,
    })),
  };
}

const access = [authenticateToken, requireOrgContext, requireMinimumRole('manager')];
router.get('/departures/:id/supplier-payables', ...access, async (req, res: Response) => {
  const parsed = id.safeParse(req.params.id);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid departure ID');
  const { data, error } = await supabaseAdmin.rpc('list_supplier_payables', { p_org_id: req.orgId!, p_departure_id: parsed.data });
  if (error) return payableError(res, error);
  if (!Array.isArray(data) || data.some(row => row.org_id !== req.orgId || row.departure_id !== parsed.data))
    return apiError(res, 500, 'PAYABLE_LEDGER_INVALID', 'Supplier balances could not be confirmed');
  try { return res.json({ payables: data.map(transformPayable) }); }
  catch { return apiError(res, 500, 'PAYABLE_LEDGER_INVALID', 'Supplier balances could not be confirmed'); }
});

router.post('/departures/:id/supplier-payables', ...access, async (req, res: Response) => {
  const parsedId = id.safeParse(req.params.id), parsed = issue.safeParse(req.body);
  if (!parsedId.success || !parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier obligation');
  const { requestId, ...payload } = parsed.data;
  const { data, error } = await supabaseAdmin.rpc('issue_supplier_payable', {
    p_org_id: req.orgId!, p_actor_id: req.user!.id, p_departure_id: parsedId.data,
    p_cost_item_id: parsed.data.costItemId, p_due_date: parsed.data.dueDate,
    p_request_id: requestId, p_fingerprint: saleRequestFingerprint(payload),
  });
  if (error) return payableError(res, error);
  if (!data?.record?.id || data.record.org_id !== req.orgId || data.record.departure_id !== parsedId.data || typeof data.created !== 'boolean')
    return apiError(res, 500, 'PAYABLE_LEDGER_INVALID', 'Supplier obligation could not be confirmed');
  if (data.created) await auditLog('CREATE', 'supplier_payable', () => data.record.id)(req, res, () => {});
  return res.status(data.created ? 201 : 200).json(data);
});

router.post('/supplier-payables/:id/entries', ...access, async (req, res: Response) => {
  const parsedId = id.safeParse(req.params.id), parsed = entry.safeParse(req.body);
  if (!parsedId.success || !parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier payment record');
  const { requestId, ...payload } = parsed.data;
  const { data, error } = await supabaseAdmin.rpc('record_supplier_payable_entry', {
    p_org_id: req.orgId!, p_actor_id: req.user!.id, p_payable_id: parsedId.data,
    p_request_id: requestId, p_payload: payload, p_fingerprint: saleRequestFingerprint(payload),
  });
  if (error) return payableError(res, error);
  if (!data?.record?.id || data.record.org_id !== req.orgId || data.record.payable_id !== parsedId.data || data.record.request_id !== requestId || typeof data.created !== 'boolean')
    return apiError(res, 500, 'PAYABLE_LEDGER_INVALID', 'Supplier payment could not be confirmed');
  if (data.created) await auditLog('CREATE', 'supplier_payable_entry', () => data.record.id)(req, res, () => {});
  return res.status(data.created ? 201 : 200).json(data);
});

router.post('/supplier-payables/:id/cancel', ...access, async (req, res: Response) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier obligation');
  const { data, error } = await supabaseAdmin.rpc('cancel_supplier_payable', { p_org_id: req.orgId!, p_actor_id: req.user!.id, p_payable_id: parsedId.data });
  if (error) return payableError(res, error);
  if (!data?.record?.id || data.record.org_id !== req.orgId || data.record.id !== parsedId.data || typeof data.created !== 'boolean')
    return apiError(res, 500, 'PAYABLE_LEDGER_INVALID', 'Supplier obligation cancellation could not be confirmed');
  if (data.created) await auditLog('STATUS_CHANGE', 'supplier_payable', () => data.record.id)(req, res, () => {});
  return res.json(data);
});
export default router;
