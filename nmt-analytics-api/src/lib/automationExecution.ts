import { supabaseAdmin } from './supabase';
import { sendManualEmailForOrg, sendManualSmsForOrg } from './manualMessaging';
import { logCommunicationHistory } from './communicationHistory';
import {
  loadTemplateContextForScope,
  resolveMessagePerRecipient,
} from './placeholderResolver';
import {
  resolveRecipients,
  RecipientTargetNotFoundError,
  type ResolvedRecipient,
} from './recipientResolver';
import { extractPlaceholders } from './templatePlaceholders';

export type AutomationTrigger = 'before_departure' | 'after_reservation' | 'before_payment_due';
export type AutomationChannel = 'email' | 'sms';
export type AutomationEntityType = 'departure' | 'reservation' | 'payment';

type AutomationRuleRecord = {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  channel: AutomationChannel;
  template_id: string | null;
  trigger_type: AutomationTrigger;
  timing_offset: number;
  timing_unit: 'hours' | 'days';
  created_at: string;
};

type TemplateRecord = {
  id: string;
  org_id: string;
  channel: AutomationChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
};

export type AutomationDeps = {
  sendEmail?: typeof sendManualEmailForOrg;
  sendSms?: typeof sendManualSmsForOrg;
  logHistory?: typeof logCommunicationHistory;
  now?: () => Date;
};

export type AutomationRunResult = {
  rulesExamined: number;
  entitiesFound: number;
  completed: number;
  failed: number;
  skipped: number;
  alreadyProcessed: number;
  messagesSent: number;
  messagesFailed: number;
  messagesSkipped: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function offsetToMs(offset: number, unit: 'hours' | 'days'): number {
  return unit === 'hours' ? offset * HOUR_MS : offset * DAY_MS;
}

async function loadRuleTemplate(
  rule: AutomationRuleRecord,
): Promise<TemplateRecord | null> {
  if (!rule.template_id) return null;

  const { data, error } = await supabaseAdmin
    .from('message_templates')
    .select('id, org_id, channel, subject, body, is_active')
    .eq('id', rule.template_id)
    .eq('org_id', rule.org_id)
    .maybeSingle();

  if (error || !data) return null;

  const template = data as TemplateRecord;
  if (!template.is_active) return null;
  if (template.channel !== rule.channel) return null;

  return template;
}

async function fetchActiveRules(): Promise<AutomationRuleRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('automation_rules')
    .select('id, org_id, name, is_active, channel, template_id, trigger_type, timing_offset, timing_unit, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as AutomationRuleRecord[];
}

async function fetchDueDepartures(rule: AutomationRuleRecord, now: Date): Promise<any[]> {
  const offsetMs = offsetToMs(rule.timing_offset, rule.timing_unit);
  const upperBound = new Date(now.getTime() + offsetMs).toISOString();
  const lowerBound = now.toISOString();

  const { data, error } = await supabaseAdmin
    .from('departures')
    .select('id, org_id, depart_at')
    .eq('org_id', rule.org_id)
    .eq('status', 'active')
    .lte('depart_at', upperBound)
    .gt('depart_at', lowerBound);

  if (error) throw error;
  return data || [];
}

async function fetchDueReservations(rule: AutomationRuleRecord, now: Date): Promise<any[]> {
  const offsetMs = offsetToMs(rule.timing_offset, rule.timing_unit);
  const upperBound = new Date(now.getTime() - offsetMs).toISOString();

  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('id, org_id, created_at, departure_id')
    .eq('org_id', rule.org_id)
    .gte('created_at', rule.created_at)
    .lte('created_at', upperBound);

  if (error) throw error;
  return data || [];
}

async function fetchDuePayments(rule: AutomationRuleRecord, now: Date): Promise<any[]> {
  const offsetMs = offsetToMs(rule.timing_offset, rule.timing_unit);
  const upperBound = new Date(now.getTime() + offsetMs).toISOString();
  const lowerBound = now.toISOString();

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('id, org_id, reservation_id, due_date, status')
    .eq('org_id', rule.org_id)
    .eq('status', 'pending')
    .not('installment_number', 'is', null)
    .not('due_date', 'is', null)
    .lte('due_date', upperBound)
    .gt('due_date', lowerBound);

  if (error) throw error;
  return data || [];
}

// Atomically claim an execution occurrence. Returns true when this worker
// acquired the occurrence, false when another worker (or a previous run)
// already claimed it. Relies on the UNIQUE (rule_id, entity_type, entity_id)
// constraint on automation_executions.
async function claimExecution(
  rule: AutomationRuleRecord,
  entityType: AutomationEntityType,
  entityId: string,
  scheduledFor: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('automation_executions')
    .insert({
      org_id: rule.org_id,
      rule_id: rule.id,
      entity_type: entityType,
      entity_id: entityId,
      scheduled_for: scheduledFor,
      status: 'pending',
    });

  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function completeExecution(
  entityType: AutomationEntityType,
  entityId: string,
  ruleId: string,
  status: 'completed' | 'failed' | 'skipped',
  errorMsg?: string,
): Promise<void> {
  const completedAt = status === 'completed' ? new Date().toISOString() : new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('automation_executions')
    .update({
      status,
      completed_at: completedAt,
      error: errorMsg ?? null,
    })
    .eq('rule_id', ruleId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  if (error) {
    console.error('Failed to finalize automation execution', error);
  }
}

type SendOutcome = {
  sent: number;
  failed: number;
  skipped: number;
};

async function sendToRecipients(
  rule: AutomationRuleRecord,
  template: TemplateRecord,
  recipients: ResolvedRecipient[],
  deps: AutomationDeps,
): Promise<SendOutcome> {
  const sendEmail = deps.sendEmail || sendManualEmailForOrg;
  const sendSms = deps.sendSms || sendManualSmsForOrg;
  const logHistory = deps.logHistory || logCommunicationHistory;

  const hasPlaceholders =
    extractPlaceholders(`${template.subject ?? ''}\n${template.body}`).length > 0;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    let subject = template.subject;
    let body = template.body;

    if (hasPlaceholders) {
      const context = await loadTemplateContextForScope(rule.org_id, {
        relatedReservationId: recipient.reservationId ?? null,
        relatedDepartureId: recipient.departureId ?? null,
      });

      const resolved = resolveMessagePerRecipient(
        template.subject,
        template.body,
        recipient,
        context,
      );

      if (resolved.unresolved.length > 0) {
        skipped += 1;
        await logHistory({
          orgId: rule.org_id,
          channel: rule.channel,
          recipient: recipient.contact,
          subject: rule.channel === 'email' ? resolved.subject : null,
          bodyPreview: resolved.body,
          status: 'skipped',
          errorMessage: `unresolved_placeholders:${resolved.unresolved.join(',')}`,
          relatedDepartureId: recipient.departureId ?? null,
          relatedReservationId: recipient.reservationId ?? null,
        });
        continue;
      }

      subject = resolved.subject;
      body = resolved.body;
    }

    try {
      if (rule.channel === 'email') {
        await sendEmail({
          channel: 'email',
          recipient: recipient.contact,
          subject: subject || '',
          body,
          orgId: rule.org_id,
          relatedDepartureId: recipient.departureId ?? null,
          relatedReservationId: recipient.reservationId ?? null,
        });
      } else {
        await sendSms({
          channel: 'sms',
          recipient: recipient.contact,
          body,
          orgId: rule.org_id,
          relatedDepartureId: recipient.departureId ?? null,
          relatedReservationId: recipient.reservationId ?? null,
        });
      }

      sent += 1;
      await logHistory({
        orgId: rule.org_id,
        channel: rule.channel,
        recipient: recipient.contact,
        subject: rule.channel === 'email' ? subject : null,
        bodyPreview: body,
        status: 'sent',
        relatedDepartureId: recipient.departureId ?? null,
        relatedReservationId: recipient.reservationId ?? null,
        sentAt: new Date().toISOString(),
      });
    } catch {
      failed += 1;
    }
  }

  return { sent, failed, skipped };
}

async function processEntity(
  rule: AutomationRuleRecord,
  template: TemplateRecord,
  entityType: AutomationEntityType,
  entityId: string,
  targetId: string,
  targetType: 'departure' | 'reservation',
  deps: AutomationDeps,
): Promise<SendOutcome> {
  let resolution;
  try {
    resolution = await resolveRecipients({
      orgId: rule.org_id,
      channel: rule.channel,
      targetType,
      targetId,
    });
  } catch (err) {
    if (err instanceof RecipientTargetNotFoundError) {
      return { sent: 0, failed: 0, skipped: 0 };
    }
    throw err;
  }

  return sendToRecipients(rule, template, resolution.recipients, deps);
}

export async function processDueAutomationRules(
  deps: AutomationDeps = {},
): Promise<AutomationRunResult> {
  const now = deps.now ? deps.now() : new Date();

  const result: AutomationRunResult = {
    rulesExamined: 0,
    entitiesFound: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    alreadyProcessed: 0,
    messagesSent: 0,
    messagesFailed: 0,
    messagesSkipped: 0,
  };

  let rules: AutomationRuleRecord[];
  try {
    rules = await fetchActiveRules();
  } catch (err) {
    console.error('Failed to fetch active automation rules', err);
    return result;
  }

  result.rulesExamined = rules.length;

  for (const rule of rules) {
    const template = await loadRuleTemplate(rule);
    if (!template) {
      // No compatible, active template → nothing to send for this rule.
      continue;
    }

    let dueEntities: { id: string; targetId: string; scheduledFor: string }[] = [];
    let entityType: AutomationEntityType;
    let targetType: 'departure' | 'reservation';

    try {
      if (rule.trigger_type === 'before_departure') {
        const departures = await fetchDueDepartures(rule, now);
        entityType = 'departure';
        targetType = 'departure';
        dueEntities = departures.map((d) => ({
          id: d.id,
          targetId: d.id,
          scheduledFor: d.depart_at,
        }));
      } else if (rule.trigger_type === 'after_reservation') {
        const reservations = await fetchDueReservations(rule, now);
        entityType = 'reservation';
        targetType = 'reservation';
        dueEntities = reservations.map((r) => ({
          id: r.id,
          targetId: r.id,
          scheduledFor: r.created_at,
        }));
      } else {
        const payments = await fetchDuePayments(rule, now);
        entityType = 'payment';
        targetType = 'reservation';
        dueEntities = payments
          .filter((p: any) => p.reservation_id)
          .map((p: any) => ({
            id: p.id,
            targetId: p.reservation_id,
            scheduledFor: p.due_date,
          }));
      }
    } catch (err) {
      console.error(`Failed to resolve due entities for rule ${rule.id}`, err);
      continue;
    }

    for (const entity of dueEntities) {
      result.entitiesFound += 1;

      let claimed = false;
      try {
        claimed = await claimExecution(rule, entityType, entity.id, entity.scheduledFor);
      } catch (err) {
        console.error(`Failed to claim execution for rule ${rule.id}`, err);
        continue;
      }

      if (!claimed) {
        result.alreadyProcessed += 1;
        continue;
      }

      try {
        const outcome = await processEntity(rule, template, entityType, entity.id, entity.targetId, targetType, deps);

        result.messagesSent += outcome.sent;
        result.messagesFailed += outcome.failed;
        result.messagesSkipped += outcome.skipped;

        if (outcome.sent > 0) {
          result.completed += 1;
          await completeExecution(entityType, entity.id, rule.id, 'completed');
        } else if (outcome.failed > 0) {
          result.failed += 1;
          await completeExecution(entityType, entity.id, rule.id, 'failed', 'No messages could be sent');
        } else {
          result.skipped += 1;
          await completeExecution(entityType, entity.id, rule.id, 'skipped', 'No sendable recipients');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.failed += 1;
        await completeExecution(entityType, entity.id, rule.id, 'failed', message);
      }
    }
  }

  return result;
}
