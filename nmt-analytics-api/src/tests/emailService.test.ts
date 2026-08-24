import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn(async () => undefined);
const logCommunicationHistory = vi.fn(async () => undefined);

vi.mock('../lib/communicationHistory', () => ({
  logCommunicationHistory: (entry: any) => logCommunicationHistory(entry),
}));

import { EmailService } from '../lib/email/EmailService';

describe('EmailService communication history', () => {
  beforeEach(() => {
    sendEmail.mockClear();
    logCommunicationHistory.mockClear();
    EmailService.setProvider({ sendEmail });
  });

  it('logs a successful booking confirmation email with reservation and departure context', async () => {
    await EmailService.sendBookingConfirmation({
      id: 'res-1',
      org_id: 'org-1',
      departure_id: 'dep-1',
      customer_email: 'guest@example.ba',
      customer_name: 'Guest User',
      departures: { id: 'dep-1', packages: { name: 'Istanbul' } },
    }, Buffer.from('pdf'));

    expect(logCommunicationHistory).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-1',
      channel: 'email',
      recipient: 'guest@example.ba',
      status: 'sent',
      relatedReservationId: 'res-1',
      relatedDepartureId: 'dep-1',
    }));
  });

  it('logs a failed payment confirmation email and rethrows', async () => {
    sendEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(
      EmailService.sendPaymentConfirmation({
        orgId: 'org-2',
        reservationId: 'res-2',
        customerEmail: 'payer@example.ba',
        customerName: 'Payer',
        amount: 120,
        currency: 'BAM',
        paymentId: 'pay-2',
      })
    ).rejects.toThrow('SMTP unavailable');

    expect(logCommunicationHistory).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-2',
      channel: 'email',
      recipient: 'payer@example.ba',
      status: 'failed',
      errorMessage: 'SMTP unavailable',
      relatedReservationId: 'res-2',
    }));
  });
});
