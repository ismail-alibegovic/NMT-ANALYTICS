import { post } from './client';

export type ManualMessagePayload =
  | {
      channel: 'email';
      recipient: string;
      subject: string;
      body: string;
    }
  | {
      channel: 'sms';
      recipient: string;
      body: string;
    };

export async function sendReservationManualMessage(id: string, payload: ManualMessagePayload) {
  const { data } = await post(`/reservations/${id}/manual-message`, payload);
  return data;
}

export async function sendDepartureManualMessage(id: string, payload: ManualMessagePayload) {
  const { data } = await post(`/departures/${id}/manual-message`, payload);
  return data;
}
