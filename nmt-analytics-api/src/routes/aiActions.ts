import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { requireModule } from '../middleware/requireModule';
import { auditLog, logAuditEntry } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { executeOrgAiCompletion } from '../lib/aiProviderService';

const router = Router();

const actionTypes = ['create_inquiry', 'create_quotation_draft', 'create_customer_draft'] as const;
type ActionType = (typeof actionTypes)[number];

const createProposalSchema = z.object({
  actionType: z.enum(actionTypes),
  prompt: z.string().trim().min(3).max(2000),
  locale: z.enum(['bs', 'en']).default('bs'),
});

const inquiryPayloadSchema = z.object({
  contactName: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  destination: z.string().trim().max(160).optional().nullable(),
  travelers: z.number().int().min(1).max(1000).default(1),
  tripType: z.enum(['scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only', 'corporate', 'pilgrimage', 'excursion', 'transfer', 'other']).default('other'),
  notes: z.string().max(4000).optional().nullable(),
});

const quotationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  currency: z.string().length(3).default('BAM'),
  clientNotes: z.string().max(4000).optional().nullable(),
  items: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    quantity: z.number().positive().default(1),
    netUnitPrice: z.number().min(0).default(0),
    markupPercent: z.number().min(0).max(500).default(15),
  })).min(1).max(25),
});

const customerPayloadSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const confirmSchema = z.object({
  idempotencyKey: z.string().trim().min(4).max(120),
  editedPayload: z.record(z.string(), z.any()).optional(),
});

function buildDeterministicFallback(actionType: ActionType, prompt: string): Record<string, any> {
  const cleanPrompt = prompt.trim();
  if (actionType === 'create_inquiry') {
    return {
      contactName: cleanPrompt.slice(0, 60),
      phone: null,
      email: null,
      destination: null,
      travelers: 2,
      tripType: 'tailor_made',
      notes: cleanPrompt,
    };
  }
  if (actionType === 'create_quotation_draft') {
    return {
      title: cleanPrompt.slice(0, 80),
      currency: 'BAM',
      clientNotes: cleanPrompt,
      items: [{ title: cleanPrompt.slice(0, 80), quantity: 1, netUnitPrice: 0, markupPercent: 15 }],
    };
  }
  return {
    fullName: cleanPrompt.slice(0, 60),
    phone: null,
    email: null,
    notes: cleanPrompt,
  };
}

async function generateStructuredDraft(orgId: string, userId: string | null, actionType: ActionType, prompt: string, locale: 'bs' | 'en') {
  try {
    const schemaHint =
      actionType === 'create_inquiry'
        ? '{"contactName":string,"phone":string|null,"email":string|null,"destination":string|null,"travelers":number,"tripType":"scheduled_group"|"tailor_made"|"corporate"|"other","notes":string}'
        : actionType === 'create_quotation_draft'
        ? '{"title":string,"currency":"BAM"|"EUR","clientNotes":string,"items":[{"title":string,"quantity":number,"netUnitPrice":number,"markupPercent":number}]}'
        : '{"fullName":string,"phone":string|null,"email":string|null,"notes":string}';

    const res = await executeOrgAiCompletion(orgId, userId, `proposal_${actionType}`, {
      messages: [
        {
          role: 'system',
          content: `Extract a valid JSON object matching this exact schema (no markdown fences, JSON only, language ${locale}): ${schemaHint}`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      maxTokens: 600,
    });
    const stripped = res.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Fallback deterministically when no provider is configured or JSON parsing fails.
  }
  return buildDeterministicFallback(actionType, prompt);
}

router.get(
  '/ai/proposals',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  requireModule('ai_assistant'),
  async (req: Request, res: Response) => {
    const { data, error } = await supabaseAdmin
      .from('ai_action_proposals')
      .select('*')
      .eq('org_id', req.orgId!)
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) return handleSupabaseError(res, error, 'Failed to list AI proposals');
    return res.json({ proposals: data || [] });
  },
);

router.post(
  '/ai/proposals',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  requireModule('ai_assistant'),
  auditLog('CREATE', 'ai_action_proposal'),
  async (req: Request, res: Response) => {
    const parsed = createProposalSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid proposal request', parsed.error.issues);

    const { actionType, prompt, locale } = parsed.data;
    const proposedPayload = await generateStructuredDraft(req.orgId!, req.user?.id || null, actionType, prompt, locale);

    const { data, error } = await supabaseAdmin
      .from('ai_action_proposals')
      .insert({
        org_id: req.orgId!,
        created_by: req.user?.id || null,
        action_type: actionType,
        status: 'draft',
        prompt,
        proposed_payload: proposedPayload,
      })
      .select('*')
      .single();

    if (error) return handleSupabaseError(res, error, 'Failed to save AI proposal draft');
    return res.status(201).json(data);
  },
);

router.post(
  '/ai/proposals/:id/confirm',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  requireModule('ai_assistant'),
  async (req: Request, res: Response) => {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid confirmation payload', parsed.error.issues);

    const orgId = req.orgId!;
    const { idempotencyKey, editedPayload } = parsed.data;

    const { data: proposal, error: fetchErr } = await supabaseAdmin
      .from('ai_action_proposals')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', orgId)
      .single();

    if (fetchErr || !proposal) return apiError(res, 404, 'NOT_FOUND', 'Proposal not found');
    if (proposal.status === 'rejected') return apiError(res, 409, 'PROPOSAL_REJECTED', 'Rejected proposal cannot be executed');
    if (proposal.status === 'executed') {
      return res.json({
        executed: true,
        idempotentReplay: true,
        proposal,
        result: proposal.execution_result,
      });
    }

    const rawPayload = editedPayload || proposal.proposed_payload || {};
    let executionResult: Record<string, any> = {};

    if (proposal.action_type === 'create_inquiry') {
      const v = inquiryPayloadSchema.safeParse(rawPayload);
      if (!v.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid inquiry payload', v.error.issues);
      const b = v.data;
      const { data: inq, error: inqErr } = await supabaseAdmin
        .from('inquiries')
        .insert({
          org_id: orgId,
          contact_name: b.contactName,
          phone: b.phone || null,
          email: b.email || null,
          destination: b.destination || null,
          travelers: b.travelers,
          trip_type: b.tripType,
          source: 'other',
          notes: b.notes || null,
          assigned_to: req.user?.id || null,
        })
        .select('id, contact_name, stage')
        .single();
      if (inqErr || !inq) return handleSupabaseError(res, inqErr, 'Failed to create inquiry from proposal');
      await logAuditEntry({
        org_id: orgId,
        user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
        action: 'CREATE',
        entity: 'inquiry' as any,
        entity_id: inq.id,
        entity_name: inq.contact_name,
        metadata: { newValues: inq },
      });
      executionResult = { entityType: 'inquiry', entityId: inq.id, route: '/inquiries', record: inq };
    } else if (proposal.action_type === 'create_customer_draft') {
      const v = customerPayloadSchema.safeParse(rawPayload);
      if (!v.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid customer payload', v.error.issues);
      const b = v.data;
      const { data: cust, error: custErr } = await supabaseAdmin
        .from('customers')
        .insert({
          org_id: orgId,
          full_name: b.fullName,
          phone: b.phone || null,
          email: b.email || null,
          notes: b.notes || null,
        })
        .select('id, full_name')
        .single();
      if (custErr || !cust) return handleSupabaseError(res, custErr, 'Failed to create customer from proposal');
      await logAuditEntry({
        org_id: orgId,
        user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
        action: 'CREATE',
        entity: 'customer',
        entity_id: cust.id,
        entity_name: cust.full_name,
        metadata: { newValues: cust },
      });
      executionResult = { entityType: 'customer', entityId: cust.id, route: `/customers/${cust.id}`, record: cust };
    } else if (proposal.action_type === 'create_quotation_draft') {
      const v = quotationPayloadSchema.safeParse(rawPayload);
      if (!v.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid quotation payload', v.error.issues);
      const b = v.data;
      const netTotal = b.items.reduce((s, it) => s + it.quantity * it.netUnitPrice, 0);
      const sellTotal = b.items.reduce((s, it) => s + it.quantity * it.netUnitPrice * (1 + it.markupPercent / 100), 0);
      const ref = `QT-AI-${Date.now().toString().slice(-6)}`;
      const { data: quo, error: quoErr } = await supabaseAdmin
        .from('quotations')
        .insert({
          org_id: orgId,
          reference: ref,
          title: b.title,
          status: 'draft',
          currency: b.currency,
          net_total: Number(netTotal.toFixed(2)),
          sell_total: Number(sellTotal.toFixed(2)),
          margin_total: Number((sellTotal - netTotal).toFixed(2)),
          client_notes: b.clientNotes || null,
        })
        .select('id, reference, title, status')
        .single();
      if (quoErr || !quo) return handleSupabaseError(res, quoErr, 'Failed to create quotation from proposal');
      await logAuditEntry({
        org_id: orgId,
        user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
        action: 'CREATE',
        entity: 'quotation' as any,
        entity_id: quo.id,
        entity_name: quo.reference,
        metadata: { newValues: quo },
      });
      executionResult = { entityType: 'quotation', entityId: quo.id, route: `/quotations/${quo.id}`, record: quo };
    }

    const { data: updatedProposal, error: updErr } = await supabaseAdmin
      .from('ai_action_proposals')
      .update({
        status: 'executed',
        edited_payload: editedPayload || null,
        idempotency_key: idempotencyKey,
        executed_by: req.user?.id || null,
        executed_at: new Date().toISOString(),
        execution_result: executionResult,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (updErr) return handleSupabaseError(res, updErr, 'Failed to finalize proposal execution');
    await logAuditEntry({
      org_id: orgId,
      user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
      action: 'UPDATE',
      entity: 'ai_action_proposal',
      entity_id: proposal.id,
      metadata: { newValues: updatedProposal },
    });

    return res.json({
      executed: true,
      idempotentReplay: false,
      proposal: updatedProposal,
      result: executionResult,
    });
  },
);

router.post(
  '/ai/proposals/:id/reject',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  requireModule('ai_assistant'),
  auditLog('UPDATE', 'ai_action_proposal', (req) => req.params.id),
  async (req: Request, res: Response) => {
    const { data, error } = await supabaseAdmin
      .from('ai_action_proposals')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('org_id', req.orgId!)
      .eq('status', 'draft')
      .select('*')
      .single();

    if (error || !data) return apiError(res, 404, 'NOT_FOUND', 'Draft proposal not found');
    return res.json(data);
  },
);

export default router;
