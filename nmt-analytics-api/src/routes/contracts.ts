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
import { generateContractPDF } from '../lib/contractGenerator';

const router = Router();

const auditContractCreate = auditLog(
  'CREATE',
  'contract',
  undefined,
  (req) => (req.body as any)?.travelerName
);
const auditContractUpdate = auditLog(
  'UPDATE',
  'contract',
  (req) => req.params.id
);

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    status: z.enum(['draft', 'signed', 'cancelled']).optional(),
    reservationId: z.string().uuid().optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({
    ...data,
    ...getPaginationParams(data),
  }));

const createSchema = z.object({
  reservationId: z.string().uuid('Invalid reservation ID'),
  travelerName: z.string().min(1, 'Traveler name is required').optional(),
  travelerPhone: z.string().optional(),
  travelerEmail: z.string().email().optional(),
  packageDescription: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  partySize: z.number().int().min(1).optional(),
  totalAmount: z.number().min(0).optional(),
  currency: z.string().default('BAM'),
  paymentTerms: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  status: z.enum(['draft', 'signed']).default('draft'),
  signedAt: z.string().datetime().optional(),
});

const updateSchema = z.object({
  travelerName: z.string().min(1).optional(),
  travelerPhone: z.string().optional(),
  travelerEmail: z.string().email().optional(),
  packageDescription: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  partySize: z.number().int().min(1).optional(),
  totalAmount: z.number().min(0).optional(),
  currency: z.string().optional(),
  paymentTerms: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  status: z.enum(['draft', 'signed', 'cancelled']).optional(),
  signedAt: z.string().datetime().nullable().optional(),
});

function transformContract(c: any) {
  const reservation = c.reservations;
  const customer = c.reservations?.customers;
  const departure = c.reservations?.departures;
  const pkg = c.reservations?.departures?.packages;
  const org = c.organizations;

  return {
    id: c.id,
    orgId: c.org_id,
    reservationId: c.reservation_id,
    contractNumber: c.contract_number,
    contractDate: c.contract_date,
    travelerName: c.traveler_name || customer?.full_name || reservation?.customer_name,
    travelerPhone: c.traveler_phone || customer?.phone || reservation?.customer_phone,
    travelerEmail: c.traveler_email || customer?.email,
    packageDescription: c.package_description || pkg?.name,
    packageName: pkg?.name || null,
    destination: pkg?.destination || null,
    departureDate: c.departure_date || departure?.depart_at,
    returnDate: c.return_date || departure?.return_at,
    partySize: c.party_size ?? reservation?.party_size,
    totalAmount: Number(c.total_amount ?? 0),
    currency: c.currency || 'BAM',
    paymentTerms: c.payment_terms,
    cancellationPolicy: c.cancellation_policy,
    status: c.status,
    signedAt: c.signed_at,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    orgName: org?.name || null,
    reservation,
  };
}

/**
 * GET /api/contracts
 */
router.get(
  '/contracts',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res, next) => {
    try {
      const r = listQuerySchema.safeParse(req.query);
      if (!r.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);
      }
      const { search, status, reservationId, page, limit, offset, orderBy, orderDir } = r.data;
      const orgId = req.orgId!;

      let query = supabaseAdmin
        .from('contracts')
        .select(
          `*,
          organizations (id, name, slug, email, phone, address, currency),
          reservations (
            id, customer_name, customer_phone, party_size, total_amount, currency, status,
            customers (id, full_name, phone, email),
            departures (id, depart_at, return_at, packages (id, name, destination))
          )`,
          { count: 'exact' }
        )
        .eq('org_id', orgId)
        .order(orderBy as string || 'created_at', { ascending: orderDir === 'asc' })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);
      if (reservationId) query = query.eq('reservation_id', reservationId);

      if (search && search.trim()) {
        const term = search.trim();
        query = query.or(
          `contract_number.ilike.%${term}%,traveler_name.ilike.%${term}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const transformed = (data || []).map(transformContract);
      return res.json(formatListResponse(transformed, count || 0, page, limit));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/contracts/:id
 */
router.get(
  '/contracts/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const { data, error } = await supabaseAdmin
        .from('contracts')
        .select(
          `*,
          organizations (id, name, slug, email, phone, address, currency),
          reservations (
            id, customer_name, customer_phone, party_size, total_amount, currency, status,
            customers (id, full_name, phone, email),
            departures (id, depart_at, return_at, packages (id, name, destination))
          )`
        )
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (error || !data) {
        return apiError(res, 404, 'NOT_FOUND', 'Contract not found');
      }
      return res.json(transformContract(data));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/contracts
 * If reservationId is supplied without extra fields, the contract is auto-
 * generated from the reservation. A sequential contract number is minted in
 * the form UG-YYYY-XXXX (org-scoped).
 */
router.post(
  '/contracts',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  auditContractCreate,
  async (req, res: Response) => {
    try {
      const r = createSchema.safeParse(req.body);
      if (!r.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', r.error.issues);
      }
      const body = r.data;
      const orgId = req.orgId!;

      // 1. Load the reservation to auto-fill missing fields
      const { data: reservation, error: resErr } = await supabaseAdmin
        .from('reservations')
        .select(
          `id, customer_name, customer_phone, party_size, total_amount, currency, status,
          customers (id, full_name, phone, email),
          departures (id, depart_at, return_at, packages (id, name, destination))`
        )
        .eq('id', body.reservationId)
        .eq('org_id', orgId)
        .single();

      if (resErr || !reservation) {
        return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');
      }

      const customer = reservation.customers as any;
      const departure = reservation.departures as any;
      const pkg = departure?.packages as any;

      const travelerName = body.travelerName || customer?.full_name || reservation.customer_name || 'Putnik';
      const travelerPhone = body.travelerPhone || customer?.phone || reservation.customer_phone || null;
      const travelerEmail = body.travelerEmail || customer?.email || null;
      const pkgDescription = body.packageDescription || pkg?.name || null;
      const departureDate = body.departureDate || departure?.depart_at || null;
      const returnDate = body.returnDate || departure?.return_at || null;
      const partySize = body.partySize ?? reservation.party_size ?? 1;
      const totalAmount = body.totalAmount ?? Number(reservation.total_amount ?? 0);
      const currency = body.currency || reservation.currency || 'BAM';

      // 2. Mint contract number: UG-YYYY-XXXX — retry on collision (seq race).
      let contract: any | null = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const year = new Date().getFullYear();
        const { count } = await supabaseAdmin
          .from('contracts')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .gte('created_at', `${year}-01-01T00:00:00Z`);
        const seq = (count || 0) + attempt + 1;
        const contractNumber = `UG-${year}-${String(seq).padStart(4, '0')}`;

        const insertPayload: any = {
          org_id: orgId,
          reservation_id: body.reservationId,
          contract_number: contractNumber,
          contract_date: new Date().toISOString().slice(0, 10),
          traveler_name: travelerName,
          traveler_phone: travelerPhone,
          traveler_email: travelerEmail,
          package_description: pkgDescription,
          departure_date: departureDate,
          return_date: returnDate,
          party_size: partySize,
          total_amount: totalAmount,
          currency,
          payment_terms: body.paymentTerms || null,
          cancellation_policy: body.cancellationPolicy || null,
          status: body.status,
          signed_at: body.signedAt || null,
        };
        if (req.user?.id && req.user.id !== '00000000-0000-0000-0000-000000000000') {
          insertPayload.created_by = req.user.id;
        }

        const { data: attemptContract, error: attemptErr } = await supabaseAdmin
          .from('contracts')
          .insert(insertPayload)
          .select()
          .single();
        if (!attemptErr) {
          contract = { ...attemptContract, organizations: undefined, reservations: reservation };
          lastErr = null;
          break;
        }
        if (attemptErr.code !== '23505') {
          return handleSupabaseError(res, attemptErr, 'Failed to create contract');
        }
        lastErr = attemptErr;
      }
      if (!contract) {
        return apiError(res, 409, 'DUPLICATE_CONTRACT', lastErr ? `Contract number collision — retried 5x: ${lastErr.message}` : 'Contract number collision — retry');
      }

      return res.status(201).json(transformContract(contract));
    } catch (err) {
      console.error('Error in POST /contracts:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

/**
 * PATCH /api/contracts/:id
 */
router.patch(
  '/contracts/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  auditContractUpdate,
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const r = updateSchema.safeParse(req.body);
      if (!r.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', r.error.issues);
      }

      const orgId = req.orgId!;
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('contracts')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .single();
      if (fetchErr || !existing) {
        return apiError(res, 404, 'NOT_FOUND', 'Contract not found');
      }

      const b = r.data;
      const updateData: any = {};
      if (b.travelerName !== undefined) updateData.traveler_name = b.travelerName;
      if (b.travelerPhone !== undefined) updateData.traveler_phone = b.travelerPhone;
      if (b.travelerEmail !== undefined) updateData.traveler_email = b.travelerEmail;
      if (b.packageDescription !== undefined) updateData.package_description = b.packageDescription;
      if (b.departureDate !== undefined) updateData.departure_date = b.departureDate;
      if (b.returnDate !== undefined) updateData.return_date = b.returnDate;
      if (b.partySize !== undefined) updateData.party_size = b.partySize;
      if (b.totalAmount !== undefined) updateData.total_amount = b.totalAmount;
      if (b.currency !== undefined) updateData.currency = b.currency;
      if (b.paymentTerms !== undefined) updateData.payment_terms = b.paymentTerms;
      if (b.cancellationPolicy !== undefined) updateData.cancellation_policy = b.cancellationPolicy;
      if (b.status !== undefined) updateData.status = b.status;
      if (b.signedAt !== undefined) updateData.signed_at = b.signedAt;

      // Mark signed_at automatically if status flips to "signed" and no explicit signedAt
      if (b.status === 'signed' && !b.signedAt && !existing.signed_at) {
        updateData.signed_at = new Date().toISOString();
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('contracts')
        .update(updateData)
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (updateErr) return handleSupabaseError(res, updateErr, 'Failed to update contract');

      await logAction(req, 'UPDATE', 'contract' as any, id, {
        oldValues: existing,
        newValues: updated,
      });

      return res.json(transformContract({ ...updated, organizations: undefined, reservations: undefined }));
    } catch (err) {
      console.error('Error in PATCH /contracts/:id:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

/**
 * DELETE /api/contracts/:id
 */
router.delete(
  '/contracts/:id',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  auditLog('DELETE', 'contract', (req) => req.params.id),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;
      const { error } = await supabaseAdmin
        .from('contracts')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId);
      if (error) return handleSupabaseError(res, error, 'Failed to delete contract');
      return res.status(204).send();
    } catch (err) {
      console.error('Error in DELETE /contracts/:id:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

/**
 * GET /api/contracts/:id/pdf
 */
router.get(
  '/contracts/:id/pdf',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = req.orgId!;

      const { data: contract, error } = await supabaseAdmin
        .from('contracts')
        .select(
          `*,
          organizations (id, name, slug, email, phone, address, currency),
          reservations (
            id, customer_name, customer_phone, party_size, total_amount, currency, status,
            customers (id, full_name, phone, email),
            departures (id, depart_at, return_at, packages (id, name, destination))
          )`
        )
        .eq('id', id)
        .eq('org_id', orgId)
        .single();

      if (error || !contract) {
        return apiError(res, 404, 'NOT_FOUND', 'Contract not found');
      }

      const branding = (contract.organizations as any)?.branding;
      const pdfBuffer = await generateContractPDF(contract, branding);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="contract_${contract.contract_number}.pdf"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      console.error('Error generating contract PDF:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Failed to generate contract PDF', String(err));
    }
  }
);

export default router;
