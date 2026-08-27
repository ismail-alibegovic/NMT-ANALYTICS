import { post } from './client';

export type RecipientChannel = 'email' | 'sms';
export type RecipientTargetType = 'direct' | 'reservation' | 'passenger' | 'group' | 'departure';

export interface ResolvedRecipient {
  contact: string;
  name: string | null;
  passengerId?: string | null;
  reservationId?: string | null;
  departureId?: string | null;
}

export interface SkippedRecipient {
  name: string | null;
  rawContact: string | null;
  reason: 'empty' | 'invalid' | 'duplicate';
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

export interface PreviewInput {
  channel: RecipientChannel;
  targetType: RecipientTargetType;
  targetId?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface SendInput extends PreviewInput {
  subject?: string;
  body: string;
  confirm?: boolean;
}

export interface SendResult {
  success: boolean;
  channel: RecipientChannel;
  targetType: RecipientTargetType;
  sent: number;
  failed: number;
  failures: { contact: string; error: string }[];
  resolution: RecipientResolution;
}

export async function previewRecipients(input: PreviewInput): Promise<RecipientResolution> {
  const { data } = await post<{ success: boolean; resolution: RecipientResolution }>(
    '/communication/recipients/preview',
    input,
  );
  return data.resolution;
}

export async function sendCommunication(input: SendInput): Promise<SendResult> {
  const { data } = await post<SendResult>('/communication/send', input);
  return data;
}
