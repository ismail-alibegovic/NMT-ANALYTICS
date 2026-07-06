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
import { generateSubAgentSalePDF } from '../lib/excursionGenerator';

const router = Router();

const auditSubAgentCreate = auditLog('CREATE', 'sub_agent', undefined, (req) => (req.body as any)?.name);
const auditSubAgentUpdate = auditLog('UPDATE', 'sub_agent', (req) => req.params.id);

const listQuerySchema = z
  .object({
    search: z.string().optional(),
    minRole: z.enum(['manager']).optional(),
    ...paginationQuerySchema,
  })
  .transform((data) => ({ ...data, ...getPaginationParams(data) }));

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  commissionRate: z.number().min(0).max(100).default(0),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

function transformSubAgent(s: any) {
  return {
    id: s.id,
    orgId: s.org_id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    commissionRate: Number(s.commission_rate || 0),
    isActive: s.is_active,
    createdAt: s.created_at,
    sales: s.sales,
  };
}

/** GET /api/subagents */
router.get('/subagents', authenticateToken, requireOrgContext, async (req, res, next) => {
  try {
    const r = listQuerySchema.safeParse(req.query);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data, error, count } = await supabaseAdmin
      .from('sub_agents')
      .select('*, sub_agent_sales(*)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(0, 99);
    if (error) throw error;

    return res.json(formatListResponse(data || [], count || 0, 1, 25));
  } catch (err) { next(err); }
});

/** POST /api/subagents */
router.post('/subagents', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditSubAgentCreate, async (req, res: Response) => {
  try {
    const r = createSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: agent, error: err } = await supabaseAdmin
      .from('sub_agents')
      .insert({
        org_id: orgId,
        name: r.data.name,
        phone: r.data.phone,
        email: r.data.email,
        commission_rate: r.data.commissionRate,
        is_active: true,
      })
      .select()
      .single();
    if (err) return handleSupabaseError(res, err, 'Failed to create sub-agent');

    return res.status(201).json(transformSubAgent(agent));
  } catch (err) { console.error('Error in POST /subagents:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** PATCH /api/subagents/:id */
router.patch('/subagents/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), auditSubAgentUpdate, async (req, res: Response) => {
  try {
    const { id } = req.params;
    const r = updateSchema.safeParse(req.body);
    if (!r.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', r.error.issues);

    const orgId = req.orgId!;
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('sub_agents').select('*').eq('id', id).eq('org_id', orgId).single();
    if (fetchErr || !existing) return apiError(res, 404, 'NOT_FOUND', 'Sub-agent not found');

    const updates: Record<string, unknown> = {};
    if (r.data.name !== undefined) updates.name = r.data.name;
    if (r.data.phone !== undefined) updates.phone = r.data.phone;
    if (r.data.email !== undefined) updates.email = r.data.email;
    if (r.data.commissionRate !== undefined) updates.commission_rate = r.data.commissionRate;
    if (r.data.isActive !== undefined) updates.is_active = r.data.isActive;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('sub_agents').update(updates).eq('id', id).eq('org_id', orgId).select().single();
    if (updateErr) return handleSupabaseError(res, updateErr, 'Failed to update sub-agent');

    return res.json(transformSubAgent(updated));
  } catch (err) { console.error('Error in PATCH /subagents/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** DELETE /api/subagents/:id */
router.delete('/subagents/:id', authenticateToken, requireOrgContext, requireMinimumRole('director'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { error } = await supabaseAdmin.from('sub_agents').delete().eq('id', id).eq('org_id', orgId);
    if (error) return handleSupabaseError(res, error, 'Failed to delete sub-agent');
    return res.status(204).send();
  } catch (err) { console.error('Error in DELETE /subagents/:id:', err); apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err)); }
});

/** POST /api/subagents/:id/generate-sale */
router.post('/subagents/:id/generate-sale', authenticateToken, requireOrgContext, requireMinimumRole('director'), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body; // reservationId + optional fields
    const orgId = req.orgId!;

    // Load sub-agent
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from('sub_agents')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();
    if (agentErr || !agent) return apiError(res, 404, 'NOT_FOUND', 'Sub-agent not found');

    // Create reservation via API call pattern (reuse existing logic)
    const reservationResp = await fetch('http://localhost:3001/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        customerName: 'Client',
        departureId: null,
        source: 'subagent',
        ...body,
      }),
    }).catch(() => null);

    // Simplified for this implementation - real impl would use Supabase directly
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .insert({
        customer_name: body.customerName || 'Client',
        departure_id: body.departureId || null,
        source: 'subagent',
        status: 'pending',
        total_amount: body.totalAmount || 0,
        currency: body.currency || 'BAM',
      })
      .select()
      .single();

    if (resErr || !reservation) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to create reservation');
    }

    // Create contract
    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', `${year}-01-01T00:00:00Z`);
    const seq = (count || 0) + 1;
    const contractNumber = `UG-${year}-${String(seq).padStart(4, '0')}`;

    const { data: contract, error: cErr } = await supabaseAdmin
      .from('contracts')
      .insert({
        org_id: orgId,
        reservation_id: reservation.id,
        contract_number: contractNumber,
        contract_date: new Date().toISOString().slice(0, 10),
        traveler_name: body.travelerName || 'Client',
        traveler_phone: body.travelerPhone || null,
        traveler_email: body.travelerEmail || null,
        package_description: body.packageDescription || 'Package',
        departure_date: body.departureDate || null,
        return_date: body.returnDate || null,
        party_size: body.partySize || 1,
        total_amount: body.totalAmount || 0,
        currency: body.currency || 'BAM',
        payment_terms: body.paymentTerms || null,
        cancellation_policy: body.cancellationPolicy || null,
        status: 'draft',
      })
      .select()
      .single();

    if (cErr || !contract) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to create contract');
    }

    // Create receipt
    const { data: receipt, error: rErr } = await supabaseAdmin
      .from('receipts')
      .insert({
        org_id: orgId,
        reservation_id: reservation.id,
        contract_id: contract.id,
        receipt_number: `FR-${year}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
        receipt_type: 'advance',
        amount: body.totalAmount || 0,
        currency: body.currency || 'BAM',
        payment_method: body.paymentMethod || 'cash',
      })
      .select()
      .single();

    if (rErr || !receipt) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to create receipt');
    }

    // Update sub-agent sales
    await supabaseAdmin
      .from('sub_agent_sales')
      .insert({
        org_id: orgId,
        sub_agent_id: id,
        reservation_id: reservation.id,
        commission_amount: ((body.totalAmount || 0) * (agent.commission_rate || 0)) / 100,
        documents_generated: { najava: true, ugovor: true, faktura: true },
      });

    // Generate PDF bundle
    const branding = { primaryColor: '#1D4ED8', secondaryColor: '#111827' };
    const pdfBuffer = await generateSubAgentSalePDF({
      agent,
      contract,
      receipt,
      reservation,
    }, branding);

    return res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="subagent_bundle_${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error in POST /subagents/:id/generate-sale:', err);
    apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
  }
});

export default router;
