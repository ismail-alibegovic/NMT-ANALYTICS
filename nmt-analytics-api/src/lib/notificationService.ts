import { supabaseAdmin } from './supabase';

export type NotificationType = 
  | 'new_reservation'
  | 'payment_received'
  | 'departure_reminder'
  | 'payment_overdue'
  | 'system';

interface CreateNotificationParams {
  orgId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, any>;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        org_id: params.orgId,
        user_id: params.userId || null,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Failed to create notification:', err);
    throw err;
  }
}

export async function notifyNewReservation(
  orgId: string,
  customerName: string,
  packageName: string,
  reservationId: string
) {
  return createNotification({
    orgId,
    type: 'new_reservation',
    title: 'Nova rezervacija',
    body: `${customerName} je rezervisao ${packageName}`,
    data: { reservationId, customerName, packageName },
  });
}

export async function notifyPaymentReceived(
  orgId: string,
  customerName: string,
  amount: number,
  currency: string,
  paymentId: string
) {
  return createNotification({
    orgId,
    type: 'payment_received',
    title: 'Uplata primljena',
    body: `${customerName} je uplatio ${amount} ${currency}`,
    data: { paymentId, customerName, amount, currency },
  });
}

export async function notifyDepartureReminder(
  orgId: string,
  packageName: string,
  departureDate: string,
  departureId: string
) {
  return createNotification({
    orgId,
    type: 'departure_reminder',
    title: 'Podsjetnik: Polazak sutra',
    body: `${packageName} polazi ${departureDate}`,
    data: { departureId, packageName, departureDate },
  });
}

export async function notifyPaymentOverdue(
  orgId: string,
  customerName: string,
  amount: number,
  reservationId: string
) {
  return createNotification({
    orgId,
    type: 'payment_overdue',
    title: 'Zakašnjela uplata',
    body: `${customerName} duguje ${amount} BAM`,
    data: { reservationId, customerName, amount },
  });
}
