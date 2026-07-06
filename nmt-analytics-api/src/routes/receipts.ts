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
import { generateReceiptPDF } from '../lib/receiptGenerator';

const router = Router();

const auditReceiptCreate = auditLog(
  'CREATE',
  'receipt',
  undefined,
  (req) => (req.body as any)?.receiptType
);
const auditReceiptUpdate = auditLog('UPDATE', 'receipt', (req) => req.params.id);

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    type: z.enum(['advance', 'final', 'refund']).optional(),
    reservationId: z.string().uuid().optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({ ...data, ...getPaginationParams(data) }));

const createSchema = z.object({
  reservationId: z.string().uuid('Invalid reservation ID'),
  contractId: z.string().uuid().optional(),
  receiptType: z.enum(['advance', 'final', 'refund']),
  amount: z.number().min(0).default(0),
  currency: z.string().default('BAM'),
  paymentMethod: z.enum(['cash', 'card', 'bank']).optional(),
  linkedReceiptId: z.string().uuid().optional().nullable(),
  fiscalData: z.record(z.string(), z.any()).optional(),
});

const updateSchema = z.object({
  receiptType: z.enum(['advance', 'final', 'refund']).optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank']).optional().nullable(),
  linkedReceiptId: z.string().uuid().optional().nullable(),
  fiscalData: z.record(z.string(), z.any()).optional(),
});

function transformReceipt(r: any) {
  const reservation = r.reservations;
  const customer = reservation?.customers;
  const contract = r.contracts;
  return {
    id: r.id,
    orgId: r.org_id,
    reservationId: r.reservation_id,
    contractId: r.contract_id,
    receiptNumber: r.receipt_number,
    receiptType: r.receipt_type,
    amount: Number(r.amount ?? 0),
    currency: r.currency || 'BAM',
    paymentMethod: r.payment_method,
    linkedReceiptId: r.linked_receipt_id,
    fiscalData: r.fiscal_data || {},
    issuedAt: r.issued_at,
    issuedBy: r.issued_by,
    createdAt: r.created_at,
    travelerName: customer?.full_name || reservation?.customer_name,
    contractNumber: contract?.contract_number,
  };
}

/**
 * GET /api/receipts
 */
router.get(
  '/receipts',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res, next) => {
    try {
      const r = listQuerySchema.safeParse(req.query);
      if (!r.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);
      }
      const { search, type, reservationId, page, limit, offset, orderBy, orderDir } = r.data;
      const orgId = req.orgId!;

      let query = supabaseAdmin
        .from('receipts')
        .select(
          `*,
          reservations (id, customer_name, customer_phone, customers (id, full_name, phone, email)),
          contracts (id, contract_number)`,
          { count: 'exact' }
        )
        .eq('org_id', orgId)
        .order(orderBy as string || 'issued_at', { ascending: orderDir === 'asc' })
        .range(offset, offset + limit - 1);

      if (type) query = query.eq('receipt_type', type);
      if (reservationId) query = query.eq('reservation_id', reservationId);
      if (search && search.trim()) {
        const term = search.trim();
        query = query.or(`receipt_number.ilike.%${term}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const transformed = (data || []).map(transformReceipt);
      return res.json(formatListResponse(transformed, count || 0, page, limit));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/receipts/:id
 */
router.get(
  '/receipts/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const { data, error } = await supabaseAdmin
        .from('receipts')
        .select(
          `*,
          organizations (id, name, slug, email, phone, address, currency),
          reservations (
            id, customer_name, customer_phone,
            customers (id, full_name, phone, email)
          ),
          contracts (id, contract_number)`
        )
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (error || !data) {
        return apiError(res, 404, 'NOT_FOUND', 'Receipt not found');
      }
      return res.json(transformReceipt(data));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/receipts
 * Auto-mints FR-YYYY-XXXX receipt number per org.
 */
router.post(
  '/receipts',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  auditReceiptCreate,
  async (req, res: Response) => {
    try {
      const r = createSchema.safeParse(req.body);
      if (!r.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', r.error.issues);
      }
      const body = r.data;
      const orgId = req.orgId!;

      // Validate reservation belongs to org
      const { data: reservation, error: resErr } = await supabaseAdmin
        .from('reservations')
        .select('id, customer_name, customer_phone, currency')
        .eq('id', body.reservationId)
        .eq('org_id', orgId)
        .single();
      if (resErr || !reservation) {
        return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');
      }

      // Mint receipt number FR-YYYY-XXXX with retry on collision.
      let receiptInserted: any | null = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const year = new Date().getFullYear();
        const { count } = await supabaseAdmin
          .from('receipts')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .gte('issued_at', `${year}-01-01T00:00:00Z`);
        const seq = (count || 0) + attempt + 1;
        const receiptNumber = `FR-${year}-${String(seq).padStart(4, '0')}`;
        const insertPayload: any = {
          org_id: orgId,
          reservation_id: body.reservationId,
          contract_id: body.contractId || null,
          receipt_number: receiptNumber,
          receipt_type: body.receiptType,
          amount: body.amount,
          currency: body.currency,
          payment_method: body.paymentMethod || null,
          linked_receipt_id: body.linkedReceiptId || null,
          fiscal_data: body.fiscalData || {},
        };
        if (req.user?.id && req.user.id !== '00000000-0000-0000-0000-000000000000') {
          insertPayload.issued_by = req.user.id;
        }
        const { data: attemptReceipt, error: attemptErr } = await supabaseAdmin
          .from('receipts')
          .insert(insertPayload)
          .select()
          .single();
        if (!attemptErr) {
          receiptInserted = { ...attemptReceipt, reservations: reservation, contracts: null };
          lastErr = null;
          break;
        }
        if (attemptErr.code !== '23505') {
          return handleSupabaseError(res, attemptErr, 'Failed to create receipt');
        }
        lastErr = attemptErr;
      }
      if (!receiptInserted) {
        return apiError(res, 409, 'DUPLICATE_RECEIPT', lastErr ? `Receipt number collision — retried 5x: ${lastErr.message}` : 'Receipt number collision — retry');
      }

      return res.status(201).json(transformReceipt(receiptInserted));
    } catch (err) {
      console.error('Error in POST /receipts:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

/**
 * PATCH /api/receipts/:id
 */
router.patch(
  '/receipts/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  auditReceiptUpdate,
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const r = updateSchema.safeParse(req.body);
      if (!r.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', r.error.issues);
      }

      const orgId = req.orgId!;
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('receipts')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();
      if (fetchErr || !existing) {
        return apiError(res, 404, 'NOT_FOUND', 'Receipt not found');
      }

      const b = r.data;
      const updateData: any = {};
      if (b.receiptType !== undefined) updateData.receipt_type = b.receiptType;
      if (b.amount !== undefined) updateData.amount = b.amount;
      if (b.currency !== undefined) updateData.currency = b.currency;
      if (b.paymentMethod !== undefined) updateData.payment_method = b.paymentMethod;
      if (b.linkedReceiptId !== undefined) updateData.linked_receipt_id = b.linkedReceiptId;
      if (b.fiscalData !== undefined) updateData.fiscal_data = b.fiscalData;

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('receipts')
        .update(updateData)
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (updateErr) return handleSupabaseError(res, updateErr, 'Failed to update receipt');

      await logAction(req, 'UPDATE', 'receipt' as any, id, { oldValues: existing, newValues: updated });

      return res.json(transformReceipt({ ...updated, reservations: undefined, contracts: null }));
    } catch (err) {
      console.error('Error in PATCH /receipts/:id:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

/**
 * POST /api/receipts/:id/refund
 * Issues a refund receipt linked to the original receipt.
 */
router.post(
  '/receipts/:id/refund',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;

      const { data: original, error: fetchErr } = await supabaseAdmin
        .from('receipts')
        .select('id, org_id, reservation_id, contract_id, amount, currency, payment_method')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();
      if (fetchErr || !original) {
        return apiError(res, 404, 'NOT_FOUND', 'Receipt not found');
      }

      // Mint refund receipt number FR-YYYY-XXXX — retry on collision (seq race).
      let refundInserted: any | null = null;
      let refundErr: any = null;
      for (let attempt = 0; attempt < 5 && !refundInserted; attempt++) {
        const year = new Date().getFullYear();
        const { count } = await supabaseAdmin
          .from('receipts')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .gte('issued_at', `${year}-01-01T00:00:00Z`);
        const seq = (count || 0) + attempt + 1;
        const receiptNumber = `FR-${year}-${String(seq).padStart(4, '0')}`;

        const refundPayload: any = {
          org_id: orgId,
          reservation_id: original.reservation_id,
          contract_id: original.contract_id,
          receipt_number: receiptNumber,
          receipt_type: 'refund',
          amount: Number(req.body?.amount ?? original.amount),
          currency: original.currency,
          payment_method: req.body?.paymentMethod || original.payment_method || null,
          linked_receipt_id: original.id,
          fiscal_data: { refundOf: original.id },
        };

        const { data: refund, error: insertErr } = await supabaseAdmin
          .from('receipts')
          .insert(refundPayload)
          .select()
          .single();

        if (!insertErr) {
          refundInserted = { ...refund, reservations: undefined, contracts: null };
          refundErr = null;
          break;
        }
        if (insertErr.code !== '23505') {
          return handleSupabaseError(res, insertErr, 'Failed to create refund receipt');
        }
        refundErr = insertErr;
      }
      if (!refundInserted) {
        return apiError(res, 409, 'DUPLICATE_RECEIPT', refundErr ? `Receipt number collision — retried 5x: ${refundErr.message}` : 'Receipt number collision — retry');
      }

      await logAction(req, 'CREATE', 'receipt' as any, refundInserted.id, { metadata: { refundOf: original.id } });

      return res.status(201).json(transformReceipt({ ...refundInserted, reservations: undefined, contracts: null }));
    } catch (err) {
      console.error('Error in POST /receipts/:id/refund:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

/**
 * DELETE /api/receipts/:id
 */
router.delete(
  '/receipts/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  auditLog('DELETE', 'receipt', (req) => req.params.id),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const { error } = await supabaseAdmin
        .from('receipts')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId);
      if (error) return handleSupabaseError(res, error, 'Failed to delete receipt');
      return res.status(204).send();
    } catch (err) {
      console.error('Error in DELETE /receipts/:id:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

/**
 * GET /api/receipts/:id/pdf
 */
router.get(
  '/receipts/:id/pdf',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;

      const { data: receipt, error } = await supabaseAdmin
        .from('receipts')
        .select(
          `*,
          organizations (id, name, slug, email, phone, address, currency),
          reservations (
            id, customer_name, customer_phone,
            customers (id, full_name, phone, email)
          ),
          contracts (id, contract_number)`
        )
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (error || !receipt) {
        return apiError(res, 404, 'NOT_FOUND', 'Receipt not found');
      }

      console.log("[RECEIPT PDF DEBUG]", JSON.stringify(receipt).slice(0, 1000)); const pdfBuffer = await generateReceiptPDF(receipt);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="receipt_${receipt.receipt_number}.pdf"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      console.error('Error generating receipt PDF:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Failed to generate receipt PDF', String(err));
    }
  }
);

export default router;
