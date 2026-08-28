import { supabaseAdmin } from './supabase';

export type RecipientChannel = 'email' | 'sms';
export type RecipientTargetType = 'direct' | 'reservation' | 'passenger' | 'group' | 'departure';

export interface ResolvedRecipient {
  contact: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  passengerId?: string | null;
  reservationId?: string | null;
  departureId?: string | null;
}

export type SkipReason = 'empty' | 'invalid' | 'duplicate';

export interface SkippedRecipient {
  name: string | null;
  rawContact: string | null;
  reason: SkipReason;
  passengerId?: string | null;
  reservationId?: string | null;
}

export interface RecipientResolution {
  targetType: RecipientTargetType;
  channel: RecipientChannel;
  totalCandidates: number;
  sendableRecipients: number;
  skippedEmpty: number;
  skippedInvalid: number;
  skippedDuplicates: number;
  recipients: ResolvedRecipient[];
  skipped: SkippedRecipient[];
  relatedReservationId: string | null;
  relatedDepartureId: string | null;
}

export interface ResolveInput {
  orgId: string;
  channel: RecipientChannel;
  targetType: RecipientTargetType;
  targetId?: string | null;
  email?: string | null;
  phone?: string | null;
}

export class RecipientTargetNotFoundError extends Error {
  constructor(message = 'Target not found') {
    super(message);
    this.name = 'RecipientTargetNotFoundError';
  }
}

// A raw candidate before validation/normalization/dedup.
interface Candidate {
  name: string | null;
  email: string | null;
  phone: string | null;
  passengerId?: string | null;
  reservationId?: string | null;
  departureId?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let trimmed = raw.trim().replace(/[\s\-()]/g, '');
  if (!trimmed) return null;
  if (trimmed.startsWith('00')) trimmed = `+${trimmed.slice(2)}`;
  return E164_RE.test(trimmed) ? trimmed : null;
}

export function isBulkTarget(targetType: RecipientTargetType): boolean {
  return targetType === 'group' || targetType === 'departure';
}

function buildResolution(
  input: ResolveInput,
  candidates: Candidate[],
  related: { reservationId: string | null; departureId: string | null },
): RecipientResolution {
  const recipients: ResolvedRecipient[] = [];
  const skipped: SkippedRecipient[] = [];
  const seen = new Set<string>();
  let skippedEmpty = 0;
  let skippedInvalid = 0;
  let skippedDuplicates = 0;

  for (const c of candidates) {
    const rawContact = input.channel === 'email' ? c.email : c.phone;
    if (!rawContact || !rawContact.trim()) {
      skippedEmpty += 1;
      skipped.push({ name: c.name, rawContact: rawContact ?? null, reason: 'empty', passengerId: c.passengerId ?? null, reservationId: c.reservationId ?? null });
      continue;
    }
    const normalized = input.channel === 'email' ? normalizeEmail(rawContact) : normalizePhone(rawContact);
    if (!normalized) {
      skippedInvalid += 1;
      skipped.push({ name: c.name, rawContact, reason: 'invalid', passengerId: c.passengerId ?? null, reservationId: c.reservationId ?? null });
      continue;
    }
    if (seen.has(normalized)) {
      skippedDuplicates += 1;
      skipped.push({ name: c.name, rawContact: normalized, reason: 'duplicate', passengerId: c.passengerId ?? null, reservationId: c.reservationId ?? null });
      continue;
    }
    seen.add(normalized);
    recipients.push({
      contact: normalized,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      passengerId: c.passengerId ?? null,
      reservationId: c.reservationId ?? null,
      departureId: c.departureId ?? null,
    });
  }

  return {
    targetType: input.targetType,
    channel: input.channel,
    totalCandidates: candidates.length,
    sendableRecipients: recipients.length,
    skippedEmpty,
    skippedInvalid,
    skippedDuplicates,
    recipients,
    skipped,
    relatedReservationId: related.reservationId,
    relatedDepartureId: related.departureId,
  };
}

async function candidatesForReservation(orgId: string, reservationId: string): Promise<{ candidates: Candidate[]; related: { reservationId: string | null; departureId: string | null } }> {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('id, org_id, departure_id, customer_name, customer_phone, customers (id, full_name, phone, email)')
    .eq('id', reservationId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new RecipientTargetNotFoundError('Reservation not found');

  const customer = Array.isArray((data as any).customers) ? (data as any).customers[0] : (data as any).customers;
  const candidate: Candidate = {
    name: customer?.full_name || (data as any).customer_name || null,
    email: customer?.email ?? null,
    phone: customer?.phone ?? (data as any).customer_phone ?? null,
    reservationId: data.id,
    departureId: (data as any).departure_id ?? null,
  };
  return { candidates: [candidate], related: { reservationId: data.id, departureId: (data as any).departure_id ?? null } };
}

async function candidatesForPassenger(orgId: string, passengerId: string): Promise<{ candidates: Candidate[]; related: { reservationId: string | null; departureId: string | null } }> {
  const { data, error } = await supabaseAdmin
    .from('departure_passengers')
    .select('id, org_id, departure_id, reservation_id, full_name, email, phone')
    .eq('id', passengerId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new RecipientTargetNotFoundError('Passenger not found');

  const candidate: Candidate = {
    name: (data as any).full_name ?? null,
    email: (data as any).email ?? null,
    phone: (data as any).phone ?? null,
    passengerId: data.id,
    reservationId: (data as any).reservation_id ?? null,
    departureId: (data as any).departure_id ?? null,
  };
  return { candidates: [candidate], related: { reservationId: (data as any).reservation_id ?? null, departureId: (data as any).departure_id ?? null } };
}

async function passengerCandidates(orgId: string, passengerIds: string[], departureId: string | null): Promise<Candidate[]> {
  if (passengerIds.length === 0) return [];
  let query = supabaseAdmin
    .from('departure_passengers')
    .select('id, org_id, departure_id, reservation_id, full_name, email, phone')
    .eq('org_id', orgId)
    .in('id', passengerIds);

  if (departureId) {
    query = query.eq('departure_id', departureId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map((p: any) => ({
    name: p.full_name ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    passengerId: p.id,
    reservationId: p.reservation_id ?? null,
    departureId: p.departure_id ?? departureId ?? null,
  }));
}

async function candidatesForGroup(orgId: string, groupId: string): Promise<{ candidates: Candidate[]; related: { reservationId: string | null; departureId: string | null } }> {
  const { data: group, error: groupError } = await supabaseAdmin
    .from('trip_passenger_groups')
    .select('id, org_id, departure_id')
    .eq('id', groupId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group) throw new RecipientTargetNotFoundError('Passenger group not found');

  const { data: members, error: membersError } = await supabaseAdmin
    .from('trip_passenger_group_members')
    .select('passenger_id')
    .eq('group_id', groupId);

  if (membersError) throw membersError;

  const passengerIds = (members || []).map((m: any) => m.passenger_id).filter(Boolean);
  const candidates = await passengerCandidates(orgId, passengerIds, (group as any).departure_id ?? null);
  return { candidates, related: { reservationId: null, departureId: (group as any).departure_id ?? null } };
}

async function candidatesForDeparture(orgId: string, departureId: string): Promise<{ candidates: Candidate[]; related: { reservationId: string | null; departureId: string | null } }> {
  const { data: departure, error: departureError } = await supabaseAdmin
    .from('departures')
    .select('id, org_id')
    .eq('id', departureId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (departureError) throw departureError;
  if (!departure) throw new RecipientTargetNotFoundError('Departure not found');

  const { data, error } = await supabaseAdmin
    .from('departure_passengers')
    .select('id, org_id, departure_id, reservation_id, full_name, email, phone')
    .eq('org_id', orgId)
    .eq('departure_id', departureId);

  if (error) throw error;

  const candidates: Candidate[] = (data || []).map((p: any) => ({
    name: p.full_name ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    passengerId: p.id,
    reservationId: p.reservation_id ?? null,
    departureId: p.departure_id ?? departureId,
  }));
  return { candidates, related: { reservationId: null, departureId } };
}

export async function resolveRecipients(input: ResolveInput): Promise<RecipientResolution> {
  if (input.targetType === 'direct') {
    const candidate: Candidate = {
      name: null,
      email: input.channel === 'email' ? input.email ?? null : null,
      phone: input.channel === 'sms' ? input.phone ?? null : null,
    };
    return buildResolution(input, [candidate], { reservationId: null, departureId: null });
  }

  if (!input.targetId) {
    throw new RecipientTargetNotFoundError('Target id is required');
  }

  let result: { candidates: Candidate[]; related: { reservationId: string | null; departureId: string | null } };
  switch (input.targetType) {
    case 'reservation':
      result = await candidatesForReservation(input.orgId, input.targetId);
      break;
    case 'passenger':
      result = await candidatesForPassenger(input.orgId, input.targetId);
      break;
    case 'group':
      result = await candidatesForGroup(input.orgId, input.targetId);
      break;
    case 'departure':
      result = await candidatesForDeparture(input.orgId, input.targetId);
      break;
    default:
      throw new RecipientTargetNotFoundError('Unsupported target type');
  }

  return buildResolution(input, result.candidates, result.related);
}
