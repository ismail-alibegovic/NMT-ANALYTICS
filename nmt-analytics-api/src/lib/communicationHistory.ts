import { supabaseAdmin } from './supabase';

export type CommunicationChannel = 'email' | 'sms';
export type CommunicationStatus = 'sent' | 'failed' | 'skipped';

export type CommunicationHistoryEntry = {
  orgId: string;
  channel: CommunicationChannel;
  recipient: string;
  subject?: string | null;
  bodyPreview?: string | null;
  status: CommunicationStatus;
  errorMessage?: string | null;
  relatedDepartureId?: string | null;
  relatedReservationId?: string | null;
  sentAt?: string | Date | null;
};

export type CommunicationHistoryDeps = {
  supabase: typeof supabaseAdmin;
};

function sanitizePreview(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 500) : null;
}

export async function logCommunicationHistory(
  entry: CommunicationHistoryEntry,
  deps: Partial<CommunicationHistoryDeps> = {}
) {
  const supabase = deps.supabase || supabaseAdmin;

  const { data, error } = await supabase
    .from('communication_history')
    .insert({
      org_id: entry.orgId,
      channel: entry.channel,
      recipient: entry.recipient,
      subject: entry.subject ?? null,
      body_preview: sanitizePreview(entry.bodyPreview),
      status: entry.status,
      error_message: entry.errorMessage ?? null,
      related_departure_id: entry.relatedDepartureId ?? null,
      related_reservation_id: entry.relatedReservationId ?? null,
      sent_at: entry.sentAt ? new Date(entry.sentAt).toISOString() : null,
    })
    .select('id, org_id, channel, recipient, status')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
