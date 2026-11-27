import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { requireAiEntitlement } from '../middleware/requireAiEntitlement';
import { auditLog, logAuditEntry } from '../middleware/auditLogger';
import { hasAccess } from '../types/roles';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { executeOrgAiCompletion, parseEncryptedCustomHeaders, type ResolvedAiProvider } from '../lib/aiProviderService';
import { decryptSecret } from '../lib/secretVault';

const router = Router();

const actionTypes = [
  'create_inquiry',
  'create_quotation_draft',
  'create_customer_draft',
  'create_package_draft',
  'create_departure_draft',
] as const;
type ActionType = (typeof actionTypes)[number];

const createProposalSchema = z.object({
  actionType: z.enum(actionTypes),
  prompt: z.string().trim().min(3).max(2000),
  locale: z.enum(['bs', 'en']).default('bs'),
  providerId: z.string().uuid().optional(),
  modelId: z.string().trim().min(1).max(160).optional(),
});

const numericPreprocess = (v: unknown) => {
  if (typeof v === 'string' && v.trim() !== '') {
    const cleaned = v.replace(/[^\d.-]/g, '');
    if (cleaned !== '' && !Number.isNaN(Number(cleaned))) return Number(cleaned);
  }
  return v;
};

const optionalPositiveInt = z.preprocess(numericPreprocess, z.number().int().min(1).max(1000)).optional().nullable();
const optionalCurrency = z
  .preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : 'BAM'), z.string().length(3))
  .default('BAM');

// Strict Execution Schemas (validated before writing to business tables)
const inquiryPayloadSchema = z.object({
  contactName: z.string().trim().min(1).max(150),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  destination: z.string().trim().max(160).optional().nullable(),
  travelers: z.preprocess(numericPreprocess, z.number().int().min(1).max(1000)),
  tripType: z
    .enum(['scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only', 'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'])
    .default('other'),
  notes: z.string().max(4000).optional().nullable(),
});

const quotationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  currency: optionalCurrency,
  clientNotes: z.string().max(4000).optional().nullable(),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        quantity: z.preprocess(numericPreprocess, z.number().positive()),
        netUnitPrice: z.preprocess(numericPreprocess, z.number().min(0)),
        markupPercent: z.preprocess(numericPreprocess, z.number().min(0).max(500)),
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
  durationDays: z.preprocess(numericPreprocess, z.number().int().min(1).max(365)),
  basePrice: z.preprocess(numericPreprocess, z.number().min(0)),
  currency: optionalCurrency,
  maxParticipants: optionalPositiveInt,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  transportType: z.enum(['flight', 'bus', 'train', 'ship', 'mixed', 'none']).optional().nullable(),
  tripType: z.string().trim().max(60).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
});

const departurePayloadSchema = z.object({
  packageId: z.string().uuid(),
  packageName: z.string().trim().max(160).optional().nullable(),
  departAt: z.string().trim().min(10).max(60),
  returnAt: z.string().trim().min(10).max(60),
  capacity: z.preprocess(numericPreprocess, z.number().int().min(1).max(1000)),
  transportType: z.enum(['flight', 'bus', 'train', 'ship', 'mixed', 'none']).default('none'),
});

// Draft Schemas (tolerate missing required fields as null without inventing values)
const inquiryDraftSchema = z.object({
  contactName: z.string().trim().max(150).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  destination: z.string().trim().max(160).nullable().optional(),
  travelers: z.preprocess(numericPreprocess, z.number().int().min(1).max(1000)).nullable().optional(),
  tripType: z
    .enum(['scheduled_group', 'tailor_made', 'accommodation_only', 'flight_only', 'corporate', 'pilgrimage', 'excursion', 'transfer', 'other'])
    .nullable()
    .optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const quotationDraftSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  currency: optionalCurrency.optional(),
  clientNotes: z.string().max(4000).nullable().optional(),
  items: z
    .array(
      z.object({
        title: z.string().trim().max(200),
        quantity: z.preprocess(numericPreprocess, z.number().positive()).nullable().optional(),
        netUnitPrice: z.preprocess(numericPreprocess, z.number().min(0)).nullable().optional(),
        markupPercent: z.preprocess(numericPreprocess, z.number().min(0).max(500)).nullable().optional(),
      }),
    )
    .max(25)
    .nullable()
    .optional(),
});

const customerDraftSchema = z.object({
  fullName: z.string().trim().max(150).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const packageDraftSchema = z.object({
  name: z.string().trim().max(160).nullable().optional(),
  destination: z.string().trim().max(160).nullable().optional(),
  durationDays: z.preprocess(numericPreprocess, z.number().int().min(1).max(365)).nullable().optional(),
  basePrice: z.preprocess(numericPreprocess, z.number().min(0)).nullable().optional(),
  currency: optionalCurrency.optional(),
  maxParticipants: optionalPositiveInt,
  startDate: z.string().max(30).nullable().optional(),
  endDate: z.string().max(30).nullable().optional(),
  transportType: z.enum(['flight', 'bus', 'train', 'ship', 'mixed', 'none']).nullable().optional(),
  tripType: z.string().trim().max(60).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
});

const departureDraftSchema = z.object({
  packageId: z.string().trim().max(80).nullable().optional(),
  packageName: z.string().trim().max(160).nullable().optional(),
  departAt: z.string().trim().max(60).nullable().optional(),
  returnAt: z.string().trim().max(60).nullable().optional(),
  capacity: z.preprocess(numericPreprocess, z.number().int().min(1).max(1000)).nullable().optional(),
  transportType: z.enum(['flight', 'bus', 'train', 'ship', 'mixed', 'none']).nullable().optional(),
});

const confirmSchema = z.object({
  idempotencyKey: z.string().trim().min(4).max(120),
  editedPayload: z.record(z.string(), z.any()).optional(),
});

export function extractJsonObject(raw: string): any {
  const withoutThink = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();

  const fenced = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : withoutThink;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  const sliced = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;
  return JSON.parse(sliced);
}

function validatePayloadForAction(actionType: ActionType, raw: unknown) {
  if (actionType === 'create_inquiry') return inquiryPayloadSchema.safeParse(raw);
  if (actionType === 'create_quotation_draft') return quotationPayloadSchema.safeParse(raw);
  if (actionType === 'create_package_draft') return packagePayloadSchema.safeParse(raw);
  if (actionType === 'create_departure_draft') return departurePayloadSchema.safeParse(raw);
  return customerPayloadSchema.safeParse(raw);
}

function validateDraftForAction(actionType: ActionType, raw: unknown) {
  if (actionType === 'create_inquiry') return inquiryDraftSchema.safeParse(raw);
  if (actionType === 'create_quotation_draft') return quotationDraftSchema.safeParse(raw);
  if (actionType === 'create_package_draft') return packageDraftSchema.safeParse(raw);
  if (actionType === 'create_departure_draft') return departureDraftSchema.safeParse(raw);
  return customerDraftSchema.safeParse(raw);
}

function requiredRoleForAction(actionType: ActionType): 'agent' | 'manager' {
  if (actionType === 'create_package_draft' || actionType === 'create_departure_draft') return 'manager';
  return 'agent';
}

function computeMissingFields(actionType: ActionType, payload: any): string[] {
  const strict = validatePayloadForAction(actionType, payload);
  if (strict.success) return [];
  const fields = new Set<string>();
  for (const issue of strict.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' || typeof key === 'number') fields.add(String(key));
  }
  return Array.from(fields);
}

function computePayloadHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex').slice(0, 32);
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

    const { actionType, prompt, locale, providerId, modelId } = parsed.data;
    const minRole = requiredRoleForAction(actionType);
    if (!hasAccess(minRole, req.user?.role)) {
      return apiError(res, 403, 'INSUFFICIENT_PERMISSIONS', `Action ${actionType} requires ${minRole} role or higher`);
    }

    let overrideProvider: ResolvedAiProvider | undefined;
    if (providerId) {
      const { data: adminRow } = await supabaseAdmin
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', req.user?.id || '')
        .eq('is_active', true)
        .maybeSingle();
      if (!adminRow) {
        return apiError(res, 403, 'PLATFORM_ADMIN_REQUIRED', 'Only platform administrators can override AI provider routing');
      }
      const { data: pRow } = await supabaseAdmin.from('ai_providers').select('*').eq('id', providerId).single();
      if (!pRow) return apiError(res, 404, 'NOT_FOUND', 'Selected AI provider not found');
      overrideProvider = {
        id: pRow.id,
        scope: pRow.scope,
        providerType: pRow.provider_type,
        protocol: pRow.protocol || 'openai_chat_completions',
        authMethod: pRow.auth_method || 'bearer',
        apiKey: decryptSecret(pRow.encrypted_api_key),
        model: modelId || pRow.default_model,
        fallbackModel: pRow.fallback_model ?? null,
        baseUrl: pRow.base_url ?? null,
        customHeaders: parseEncryptedCustomHeaders(pRow.custom_headers_encrypted),
        timeoutMs: Number(pRow.request_timeout_ms ?? 30000),
      };
    }

    const schemaHint =
      actionType === 'create_inquiry'
        ? '{"contactName":string|null,"phone":string|null,"email":string|null,"destination":string|null,"travelers":number|null,"tripType":"scheduled_group"|"tailor_made"|"corporate"|"other","notes":string|null}'
        : actionType === 'create_quotation_draft'
        ? '{"title":string|null,"currency":"BAM"|"EUR"|"USD","clientNotes":string|null,"items":[{"title":string,"quantity":number|null,"netUnitPrice":number|null,"markupPercent":number|null}]}'
        : actionType === 'create_package_draft'
        ? '{"name":string|null,"destination":string|null,"durationDays":number|null,"basePrice":number|null,"currency":"BAM"|"EUR"|"USD","maxParticipants":number|null,"startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"transportType":"flight"|"bus"|"train"|"ship"|"mixed"|"none"|null,"description":string|null}'
        : actionType === 'create_departure_draft'
        ? '{"packageName":string|null,"departAt":"YYYY-MM-DD"|null,"returnAt":"YYYY-MM-DD"|null,"capacity":number|null,"transportType":"flight"|"bus"|"train"|"ship"|"mixed"|"none"}'
        : '{"fullName":string|null,"phone":string|null,"email":string|null,"notes":string|null}';

    let rawAiPayload: any;
    try {
      const completion = await executeOrgAiCompletion(
        req.orgId!,
        req.user?.id || null,
        `proposal_${actionType}`,
        {
          messages: [
            {
              role: 'system',
              content: [
                'Extract ONLY information explicitly present in the user prompt into a single raw JSON object (no markdown, no explanation, no <think> tags).',
                'For any field NOT mentioned by the user (such as price, email, phone, dates, capacity, or count), set it to null — NEVER invent prices, counts, or names.',
                `Language: ${locale}.`,
                `Target schema: ${schemaHint}`,
              ].join(' '),
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          maxTokens: 1500,
          responseFormat: 'json_object',
        },
        fetch,
        overrideProvider,
        'tools',
      );

      rawAiPayload = extractJsonObject(completion.text);
    } catch (err: any) {
      if (err?.message === 'NO_ACTIVE_AI_PROVIDER') {
        return apiError(res, 503, 'NO_ACTIVE_AI_PROVIDER', 'No active AI provider is configured to generate structured drafts.');
      }
      if (err instanceof SyntaxError) {
        return apiError(res, 422, 'AI_DRAFT_GENERATION_FAILED', 'AI provider did not return valid structured JSON. Please refine your prompt and retry.');
      }
      return apiError(res, 502, 'AI_PROVIDER_ERROR', err?.message || 'AI provider failed while generating draft.');
    }

    const draftCheck = validateDraftForAction(actionType, rawAiPayload);
    if (!draftCheck.success || typeof rawAiPayload !== 'object' || rawAiPayload === null) {
      return apiError(
        res,
        422,
        'AI_DRAFT_INCOMPLETE',
        'Generated draft structure is invalid; please include clearer details in your prompt.',
        draftCheck.success ? undefined : draftCheck.error.issues,
      );
    }

    const draftData: Record<string, any> = { ...draftCheck.data };
    if (actionType === 'create_departure_draft' && !draftData.packageId && draftData.packageName) {
      try {
        const { data: matchedPkg } = await supabaseAdmin
          .from('packages')
          .select('id, name')
          .eq('org_id', req.orgId!)
          .ilike('name', `%${String(draftData.packageName).trim()}%`)
          .limit(1)
          .maybeSingle();
        if (matchedPkg?.id) {
          draftData.packageId = matchedPkg.id;
          draftData.packageName = matchedPkg.name;
        }
      } catch {
        // Non-blocking lookup
      }
    }

    const missingFields = computeMissingFields(actionType, draftData);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const payloadHash = computePayloadHash(draftData);

    const { data, error } = await supabaseAdmin
      .from('ai_action_proposals')
      .insert({
        org_id: req.orgId!,
        created_by: req.user?.id || null,
        action_type: actionType,
        status: 'draft',
        prompt,
        proposed_payload: draftData,
        missing_fields: missingFields,
        expires_at: expiresAt,
        payload_hash: payloadHash,
      })
      .select('*')
      .single();

    if (error) return handleSupabaseError(res, error, 'Failed to save AI proposal draft');
    return res.status(201).json({ ...data, missingFields });
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
    if (!hasAccess(requiredRoleForAction(proposal.action_type), req.user?.role)) {
      return apiError(res, 403, 'INSUFFICIENT_PERMISSIONS', `Executing ${proposal.action_type} requires higher role privileges`);
    }
    if (proposal.status === 'rejected') return apiError(res, 409, 'PROPOSAL_REJECTED', 'Rejected proposal cannot be executed');
    if (proposal.status === 'executed') {
      return res.json({
        executed: true,
        idempotentReplay: true,
        proposal,
        result: proposal.execution_result,
      });
    }
    if (proposal.expires_at && new Date(proposal.expires_at).getTime() < Date.now()) {
      return apiError(res, 410, 'PROPOSAL_EXPIRED', 'This AI proposal has expired. Please generate a fresh draft.');
    }

    const rawPayload = editedPayload || proposal.proposed_payload || {};
    const validated = validatePayloadForAction(proposal.action_type, rawPayload);
    if (!validated.success) {
      return apiError(
        res,
        400,
        'VALIDATION_ERROR',
        'Please complete all required fields before confirming execution.',
        validated.error.issues,
      );
    }

    // Concurrency guard: atomically claim the draft row before creating business records
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('ai_action_proposals')
      .update({
        status: 'executed',
        edited_payload: editedPayload || null,
        idempotency_key: idempotencyKey,
        payload_hash: computePayloadHash(validated.data),
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
            max_participants: b.maxParticipants ?? null,
            start_date: b.startDate ?? null,
            end_date: b.endDate ?? null,
            transport_type: b.transportType ?? null,
            trip_type: b.tripType ?? 'other',
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
      } else if (proposal.action_type === 'create_departure_draft') {
        const { data: pkgOwner, error: pkgLookupErr } = await supabaseAdmin
          .from('packages')
          .select('id, name')
          .eq('id', b.packageId)
          .eq('org_id', orgId)
          .single();
        if (pkgLookupErr || !pkgOwner) throw new Error('Referenced package not found in organization');

        const { data: dep, error: depErr } = await supabaseAdmin
          .from('departures')
          .insert({
            org_id: orgId,
            package_id: pkgOwner.id,
            depart_at: b.departAt.length === 10 ? `${b.departAt}T08:00:00Z` : b.departAt,
            return_at: b.returnAt.length === 10 ? `${b.returnAt}T20:00:00Z` : b.returnAt,
            capacity: b.capacity,
            booked: 0,
            status: 'active',
            transport_type: b.transportType || 'none',
          })
          .select('id, depart_at, capacity, status')
          .single();
        if (depErr || !dep) throw new Error(depErr?.message || 'Departure insert failed');
        await logAuditEntry({
          org_id: orgId,
          user_id: req.user?.id || '00000000-0000-0000-0000-000000000000',
          action: 'CREATE',
          entity: 'departure',
          entity_id: dep.id,
          entity_name: pkgOwner.name,
          metadata: { source: 'ai_proposal', proposalId: proposal.id },
        });
        executionResult = { entityType: 'departure', entityId: dep.id, route: `/departures/${dep.id}`, record: dep };
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
