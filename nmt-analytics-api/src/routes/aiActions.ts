import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { requireAiEntitlement } from '../middleware/requireAiEntitlement';
import { auditLog, logAuditEntry } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { executeOrgAiCompletion } from '../lib/aiProviderService';

const router = Router();

const actionTypes = [
  'create_inquiry',
  'create_quotation_draft',
  'create_customer_draft',
  'create_package_draft',
] as const;
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
  travelers: z.number().int().min(1).max(1000),
  tripType: z
    .enum(['scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only', 'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'])
    .default('other'),
  notes: z.string().max(4000).optional().nullable(),
});

const quotationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  currency: z.string().length(3).default('BAM'),
  clientNotes: z.string().max(4000).optional().nullable(),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        quantity: z.number().positive(),
        netUnitPrice: z.number().min(0),
        markupPercent: z.number().min(0).max(500),
      }),
    )
    .min(1)
    .max(25),
});

const customerPayloadSchema = z.object({
  fullName: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const packagePayloadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  destination: z.string().trim().min(1).max(160),
  durationDays: z.number().int().min(1).max(365),
  basePrice: z.number().min(0),
  currency: z.string().length(3).default('BAM'),
  description: z.string().max(4000).optional().nullable(),
});

const confirmSchema = z.object({
  idempotencyKey: z.string().trim().min(4).max(120),
  editedPayload: z.record(z.string(), z.any()).optional(),
});

function validatePayloadForAction(actionType: ActionType, raw: unknown) {
  if (actionType === 'create_inquiry') return inquiryPayloadSchema.safeParse(raw);
  if (actionType === 'create_quotation_draft') return quotationPayloadSchema.safeParse(raw);
  if (actionType === 'create_package_draft') return packagePayloadSchema.safeParse(raw);
  return customerPayloadSchema.safeParse(raw);
}

router.get(
  '/ai/proposals',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  requireAiEntitlement,
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
  requireAiEntitlement,
  auditLog('CREATE', 'ai_action_proposal'),
  async (req: Request, res: Response) => {
    const parsed = createProposalSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid proposal request', parsed.error.issues);

    const { actionType, prompt, locale } = parsed.data;
    const schemaHint =
      actionType === 'create_inquiry'
        ? '{"contactName":string,"phone":string|null,"email":string|null,"destination":string|null,"travelers":number,"tripType":"scheduled_group"|"tailor_made"|"corporate"|"other","notes":string}'
        : actionType === 'create_quotation_draft'
        ? '{"title":string,"currency":"BAM"|"EUR","clientNotes":string,"items":[{"title":string,"quantity":number,"netUnitPrice":number,"markupPercent":number}]}'
        : actionType === 'create_package_draft'
        ? '{"name":string,"destination":string,"durationDays":number,"basePrice":number,"currency":"BAM"|"EUR","description":string}'
        : '{"fullName":string,"phone":string|null,"email":string|null,"notes":string}';

    let rawAiPayload: any;
    try {
      const completion = await executeOrgAiCompletion(req.orgId!, req.user?.id || null, `proposal_${actionType}`, {
        messages: [
          {
            role: 'system',
            content: `Extract a valid JSON object matching this schema (JSON only, no invented names/prices/counts, language ${locale}): ${schemaHint}`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        maxTokens: 700,
        responseFormat: 'json_object',
      });

      const stripped = completion.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      rawAiPayload = JSON.parse(stripped);
    } catch (err: any) {
      if (err?.message === 'NO_ACTIVE_AI_PROVIDER') {
        return apiError(res, 503, 'NO_ACTIVE_AI_PROVIDER', 'No active AI provider is configured to generate structured drafts.');
      }
      return apiError(res, 422, 'AI_DRAFT_GENERATION_FAILED', 'AI provider did not return valid structured JSON. Please refine your prompt and retry.');
    }

    const validated = validatePayloadForAction(actionType, rawAiPayload);
    if (!validated.success) {
      return apiError(
        res,
        422,
        'AI_DRAFT_INCOMPLETE',
        'Generated draft is missing required business fields; please include complete details in your prompt.',
        validated.error.issues,
      );
    }

    const { data, error } = await supabaseAdmin
      .from('ai_action_proposals')
      .insert({
        org_id: req.orgId!,
        created_by: req.user?.id || null,
        action_type: actionType,
        status: 'draft',
        prompt,
        proposed_payload: validated.data,
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
  requireAiEntitlement,
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
    const validated = validatePayloadForAction(proposal.action_type, rawPayload);
    if (!validated.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Edited payload is invalid', validated.error.issues);
    }

    // Concurrency guard: atomically claim the draft row before creating business records
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('ai_action_proposals')
      .update({
        status: 'executed',
        edited_payload: editedPayload || null,
        idempotency_key: idempotencyKey,
        executed_by: req.user?.id || null,
        executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .eq('org_id', orgId)
      .eq('status', 'draft')
      .select('*')
      .maybeSingle();

    if (claimErr) return handleSupabaseError(res, claimErr, 'Failed to claim proposal for execution');
    if (!claimed) {
      const { data: latest } = await supabaseAdmin
        .from('ai_action_proposals')
        .select('*')
        .eq('id', proposal.id)
        .eq('org_id', orgId)
        .single();
      if (latest?.status === 'executed') {
        return res.json({ executed: true, idempotentReplay: true, proposal: latest, result: latest.execution_result });
      }
      return apiError(res, 409, 'PROPOSAL_CONFLICT', 'Proposal state changed concurrently');
    }

    let executionResult: Record<string, any> = {};
    const b: any = validated.data;

    try {
      if (proposal.action_type === 'create_inquiry') {
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
        if (inqErr || !inq) throw new Error(inqErr?.message || 'Inquiry insert failed');
        await logAuditEntry({
          org_id: orgId,
          user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
          action: 'CREATE',
          entity: 'inquiry' as any,
          entity_id: inq.id,
          entity_name: inq.contact_name,
          metadata: { source: 'ai_proposal', proposalId: proposal.id },
        });
        executionResult = { entityType: 'inquiry', entityId: inq.id, route: '/inquiries', record: inq };
      } else if (proposal.action_type === 'create_customer_draft') {
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
        if (custErr || !cust) throw new Error(custErr?.message || 'Customer insert failed');
        await logAuditEntry({
          org_id: orgId,
          user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
          action: 'CREATE',
          entity: 'customer',
          entity_id: cust.id,
          entity_name: cust.full_name,
          metadata: { source: 'ai_proposal', proposalId: proposal.id },
        });
        executionResult = { entityType: 'customer', entityId: cust.id, route: `/customers/${cust.id}`, record: cust };
      } else if (proposal.action_type === 'create_package_draft') {
        const { data: pkg, error: pkgErr } = await supabaseAdmin
          .from('packages')
          .insert({
            org_id: orgId,
            name: b.name,
            destination: b.destination,
            duration_days: b.durationDays,
            base_price: b.basePrice,
            currency: b.currency,
            description: b.description || null,
            is_active: true,
          })
          .select('id, name, destination')
          .single();
        if (pkgErr || !pkg) throw new Error(pkgErr?.message || 'Package insert failed');
        await logAuditEntry({
          org_id: orgId,
          user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
          action: 'CREATE',
          entity: 'package',
          entity_id: pkg.id,
          entity_name: pkg.name,
          metadata: { source: 'ai_proposal', proposalId: proposal.id },
        });
        executionResult = { entityType: 'package', entityId: pkg.id, route: `/packages/${pkg.id}`, record: pkg };
      } else if (proposal.action_type === 'create_quotation_draft') {
        const netTotal = b.items.reduce((s: number, it: any) => s + it.quantity * it.netUnitPrice, 0);
        const sellTotal = b.items.reduce(
          (s: number, it: any) => s + it.quantity * it.netUnitPrice * (1 + it.markupPercent / 100),
          0,
        );
        const ref = `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
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
        if (quoErr || !quo) throw new Error(quoErr?.message || 'Quotation insert failed');

        const itemRows = b.items.map((it: any, idx: number) => ({
          org_id: orgId,
          quotation_id: quo.id,
          day_number: 1,
          sort_order: idx,
          title: it.title,
          category: 'other',
          quantity: it.quantity,
          unit: 'fixed',
          net_unit_price: it.netUnitPrice,
          markup_percent: it.markupPercent,
          currency: b.currency,
          included: true,
        }));
        const { error: itemsErr } = await supabaseAdmin.from('quotation_items').insert(itemRows);
        if (itemsErr) throw new Error(itemsErr.message);

        await logAuditEntry({
          org_id: orgId,
          user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
          action: 'CREATE',
          entity: 'quotation' as any,
          entity_id: quo.id,
          entity_name: quo.reference,
          metadata: { source: 'ai_proposal', proposalId: proposal.id, itemCount: itemRows.length },
        });
        executionResult = { entityType: 'quotation', entityId: quo.id, route: `/quotations/${quo.id}`, record: quo };
      }
    } catch (execErr: any) {
      // Revert claim so user can safely retry
      await supabaseAdmin
        .from('ai_action_proposals')
        .update({ status: 'draft', idempotency_key: null, executed_at: null, executed_by: null })
        .eq('id', proposal.id)
        .eq('org_id', orgId);
      return apiError(res, 500, 'PROPOSAL_EXECUTION_FAILED', execErr?.message || 'Failed to execute proposal');
    }

    const { data: finalized } = await supabaseAdmin
      .from('ai_action_proposals')
      .update({ execution_result: executionResult, updated_at: new Date().toISOString() })
      .eq('id', proposal.id)
      .eq('org_id', orgId)
      .select('*')
      .single();

    await logAuditEntry({
      org_id: orgId,
      user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
      action: 'UPDATE',
      entity: 'ai_action_proposal',
      entity_id: proposal.id,
      metadata: { executionResult },
    });

    return res.json({
      executed: true,
      idempotentReplay: false,
      proposal: finalized || claimed,
      result: executionResult,
    });
  },
);

router.post(
  '/ai/proposals/:id/reject',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  requireAiEntitlement,
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
