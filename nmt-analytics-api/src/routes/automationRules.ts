import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import { SUPPORTED_PLACEHOLDERS } from '../lib/templatePlaceholders';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUTOMATION_SELECT = `
  id, org_id, name, is_active, channel, template_id,
  trigger_type, timing_offset, timing_unit,
  created_at, updated_at
`;

const TRIGGER_TYPES = ['before_departure', 'after_reservation', 'before_payment_due'] as const;
const TIMING_UNITS = ['hours', 'days'] as const;

const listQuerySchema = z.object({
  channel: z.enum(['email', 'sms']).optional(),
  activeOnly: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
});

const timingSchema = z
  .object({
    value: z.coerce.number().int().min(0),
    unit: z.enum(TIMING_UNITS),
  })
  .superRefine((data, ctx) => {
    if (data.unit === 'hours' && data.value > 72) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Hourly offsets over 72 hours are not supported',
      });
    }
    if (data.unit === 'days' && data.value > 30) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Daily offsets over 30 days are not supported',
      });
    }
  });

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  is_active: z.boolean().optional(),
  channel: z.enum(['email', 'sms']),
  template_id: z.string().uuid().nullable().optional(),
  trigger_type: z.enum(TRIGGER_TYPES),
  timing: timingSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
  channel: z.enum(['email', 'sms']).optional(),
  template_id: z.string().uuid().nullable().optional(),
  trigger_type: z.enum(TRIGGER_TYPES).optional(),
  timing: timingSchema.optional(),
});

type TemplateRecord = {
  id: string;
  org_id: string;
  channel: 'email' | 'sms';
  is_active: boolean;
};

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function mapRule(row: any) {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    is_active: row.is_active,
    channel: row.channel,
    template_id: row.template_id ?? null,
    trigger_type: row.trigger_type,
    timing: {
      value: row.timing_offset ?? 0,
      unit: row.timing_unit ?? 'days',
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureTemplateCompatible(
  orgId: string,
  templateId: string | null | undefined,
  channel: 'email' | 'sms',
) {
  if (!templateId) return { ok: true as const };
  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('id, org_id, channel, is_active')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .single();

  if (error || !data) {
    return { ok: false as const, status: 404, code: 'NOT_FOUND', message: 'Template not found' };
  }
  const template = data as TemplateRecord;
  if (!template.is_active) {
    return { ok: false as const, status: 400, code: 'INVALID_TEMPLATE', message: 'Template must be active' };
  }
  if (template.channel !== channel) {
    return {
      ok: false as const,
      status: 400,
      code: 'TEMPLATE_CHANNEL_MISMATCH',
      message: 'Template channel does not match rule channel',
    };
  }
  return { ok: true as const, template };
}

function humanTriggerLabel(triggerType: string, timing: { value: number; unit: string }) {
  const unitLabel = timing.unit === 'days' ? 'days' : 'hours';
  if (triggerType === 'before_departure') {
    return `${timing.value} ${unitLabel} before departure`;
  }
  if (triggerType === 'after_reservation') {
    if (timing.value === 0) return 'immediately after reservation';
    return `${timing.value} ${unitLabel} after reservation`;
  }
  if (triggerType === 'before_payment_due') {
    return `${timing.value} ${unitLabel} before payment due`;
  }
  return `${triggerType} · ${timing.value} ${unitLabel}`;
}

router.use(authenticateToken, requireOrgContext, requireMinimumRole('director'));

router.get('/automation-rules', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid query', parsed.error.issues);
  }

  const orgId = req.orgId!;
  let query = supabaseAdmin
    .from('automation_rules')
    .select(AUTOMATION_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (parsed.data.channel) query = query.eq('channel', parsed.data.channel);
  if (parsed.data.activeOnly) query = query.eq('is_active', true);
  if (parsed.data.search) {
    query = query.ilike('name', `%${parsed.data.search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return apiError(res, 500, 'FETCH_FAILED', 'Failed to fetch automation rules', error.message);
  }

  return res.json({
    data: (data || []).map(mapRule).map((item: any) => ({
      ...item,
      human_trigger: humanTriggerLabel(item.trigger_type, item.timing),
    })),
  });
});

router.get('/automation-rules/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid rule ID format');
  }

  const orgId = req.orgId!;
  const { data, error } = await supabaseAdmin
    .from('automation_rules')
    .select(AUTOMATION_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (error || !data) {
    return apiError(res, 404, 'NOT_FOUND', 'Automation rule not found');
  }

  const mapped = mapRule(data);
  return res.json({
    ...mapped,
    human_trigger: humanTriggerLabel(mapped.trigger_type, mapped.timing),
  });
});

router.post('/automation-rules', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid payload', parsed.error.issues);
  }

  const orgId = req.orgId!;
  const compatibility = await ensureTemplateCompatible(
    orgId,
    parsed.data.template_id,
    parsed.data.channel,
  );
  if (!compatibility.ok) {
    return apiError(res, compatibility.status, compatibility.code, compatibility.message);
  }

  const payload = {
    org_id: orgId,
    name: parsed.data.name,
    is_active: parsed.data.is_active ?? true,
    channel: parsed.data.channel,
    template_id: parsed.data.template_id ?? null,
    trigger_type: parsed.data.trigger_type,
    timing_offset: parsed.data.timing.value,
    timing_unit: parsed.data.timing.unit,
  };

  const { data, error } = await supabaseAdmin
    .from('automation_rules')
    .insert(payload)
    .select(AUTOMATION_SELECT)
    .single();

  if (error) {
    return apiError(res, 500, 'CREATE_FAILED', 'Failed to create automation rule', error.message);
  }

  const mapped = mapRule(data);
  return res.status(201).json({
    ...mapped,
    human_trigger: humanTriggerLabel(mapped.trigger_type, mapped.timing),
  });
});

router.patch('/automation-rules/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid rule ID format');
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid payload', parsed.error.issues);
  }

  const orgId = req.orgId!;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('automation_rules')
    .select('id, org_id, channel, template_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .single();

  if (existingError || !existing) {
    return apiError(res, 404, 'NOT_FOUND', 'Automation rule not found');
  }

  const nextChannel = (parsed.data.channel ?? existing.channel) as 'email' | 'sms';
  const nextTemplateId =
    parsed.data.template_id !== undefined ? parsed.data.template_id : existing.template_id;

  const compatibility = await ensureTemplateCompatible(orgId, nextTemplateId, nextChannel);
  if (!compatibility.ok) {
    return apiError(res, compatibility.status, compatibility.code, compatibility.message);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
  if (parsed.data.channel !== undefined) updates.channel = parsed.data.channel;
  if (parsed.data.template_id !== undefined) updates.template_id = parsed.data.template_id;
  if (parsed.data.trigger_type !== undefined) updates.trigger_type = parsed.data.trigger_type;
  if (parsed.data.timing) {
    updates.timing_offset = parsed.data.timing.value;
    updates.timing_unit = parsed.data.timing.unit;
  }

  const { data, error } = await supabaseAdmin
    .from('automation_rules')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId)
    .select(AUTOMATION_SELECT)
    .single();

  if (error) {
    return apiError(res, 500, 'UPDATE_FAILED', 'Failed to update automation rule', error.message);
  }

  const mapped = mapRule(data);
  return res.json({
    ...mapped,
    human_trigger: humanTriggerLabel(mapped.trigger_type, mapped.timing),
  });
});

router.delete('/automation-rules/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid rule ID format');
  }

  const orgId = req.orgId!;

  const { error } = await supabaseAdmin
    .from('automation_rules')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) {
    return apiError(res, 500, 'DELETE_FAILED', 'Failed to delete automation rule', error.message);
  }

  return res.json({ success: true });
});

router.patch('/automation-rules/:id/toggle', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidUuid(id)) {
    return apiError(res, 400, 'INVALID_UUID', 'Invalid rule ID format');
  }

  const orgId = req.orgId!;
  const active = req.body?.is_active === true;

  const { data, error } = await supabaseAdmin
    .from('automation_rules')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select(AUTOMATION_SELECT)
    .single();

  if (error || !data) {
    return apiError(res, 404, 'NOT_FOUND', 'Automation rule not found');
  }

  const mapped = mapRule(data);
  return res.json({
    ...mapped,
    human_trigger: humanTriggerLabel(mapped.trigger_type, mapped.timing),
  });
});

export default router;
