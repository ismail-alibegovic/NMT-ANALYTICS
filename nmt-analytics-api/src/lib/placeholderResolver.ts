import { supabaseAdmin } from './supabase';
import { SUPPORTED_PLACEHOLDERS, extractPlaceholders } from './templatePlaceholders';
import type { ResolvedRecipient, RecipientResolution } from './recipientResolver';

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

export interface TemplateContext {
  agencyName: string | null;
  reservationStatus: string | null;
  packageName: string | null;
  destination: string | null;
  departureDate: string | null;
  returnDate: string | null;
}

export interface ResolvedMessage {
  subject: string | null;
  body: string;
  unresolved: string[];
}

export interface RecipientTemplateScope {
  relatedReservationId?: string | null;
  relatedDepartureId?: string | null;
}

function formatDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

async function fetchDepartureAndPackage(
  ctx: TemplateContext,
  departureId: string | null,
): Promise<void> {
  if (!departureId) return;

  const { data: dep } = await supabaseAdmin
    .from('departures')
    .select('id, depart_at, return_at, package_id')
    .eq('id', departureId)
    .maybeSingle();

  if (!dep) return;

  ctx.departureDate = formatDate((dep as any).depart_at);
  ctx.returnDate = formatDate((dep as any).return_at);

  const packageId = (dep as any).package_id;
  if (!packageId) return;

  const { data: pkg } = await supabaseAdmin
    .from('packages')
    .select('name, destination')
    .eq('id', packageId)
    .maybeSingle();

  if (pkg) {
    ctx.packageName = (pkg as any).name ?? null;
    ctx.destination = (pkg as any).destination ?? null;
  }
}

export async function loadTemplateContextForScope(
  orgId: string,
  scope: RecipientTemplateScope,
): Promise<TemplateContext> {
  const ctx: TemplateContext = {
    agencyName: null,
    reservationStatus: null,
    packageName: null,
    destination: null,
    departureDate: null,
    returnDate: null,
  };

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();
  ctx.agencyName = org?.name ?? null;

  let departureId = scope.relatedDepartureId ?? null;

  if (scope.relatedReservationId) {
    const { data: reservation } = await supabaseAdmin
      .from('reservations')
      .select('id, status, departure_id')
      .eq('id', scope.relatedReservationId)
      .maybeSingle();

    if (reservation) {
      ctx.reservationStatus = (reservation as any).status ?? null;
      if (!departureId) {
        departureId = (reservation as any).departure_id ?? null;
      }
    }
  }

  await fetchDepartureAndPackage(ctx, departureId);

  return ctx;
}

export async function loadTemplateContext(
  orgId: string,
  resolution: RecipientResolution,
): Promise<TemplateContext> {
  return loadTemplateContextForScope(orgId, {
    relatedReservationId: resolution.relatedReservationId,
    relatedDepartureId: resolution.relatedDepartureId,
  });
}

export function resolveForRecipient(
  template: string,
  recipient: ResolvedRecipient,
  context: TemplateContext,
): { rendered: string; unresolved: string[] } {
  const usedNames = extractPlaceholders(template);
  const unresolved: string[] = [];

  const values: Record<string, string | null> = {
    customerName: recipient.name,
    customerPhone: recipient.phone,
    customerEmail: recipient.email,
    reservationId: recipient.reservationId ?? null,
    reservationStatus: context.reservationStatus,
    packageName: context.packageName,
    destination: context.destination,
    departureDate: context.departureDate,
    returnDate: context.returnDate,
    agencyName: context.agencyName,
  };

  for (const name of usedNames) {
    if (!SUPPORTED_PLACEHOLDERS.includes(name as any)) continue;
    const value = values[name];
    if (value == null || value === '') {
      unresolved.push(name);
    }
  }

  const rendered = template.replace(
    PLACEHOLDER_RE,
    (_, name) => (values[name] != null && values[name] !== '' ? values[name]! : `{{${name}}}`),
  );

  return { rendered, unresolved };
}

export function resolveMessagePerRecipient(
  subject: string | null,
  body: string,
  recipient: ResolvedRecipient,
  context: TemplateContext,
): ResolvedMessage {
  const subjectResult = subject
    ? resolveForRecipient(subject, recipient, context)
    : null;

  const bodyResult = resolveForRecipient(body, recipient, context);

  const unresolved = [
    ...(subjectResult?.unresolved ?? []),
    ...bodyResult.unresolved,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return {
    subject: subjectResult?.rendered ?? null,
    body: bodyResult.rendered,
    unresolved,
  };
}
