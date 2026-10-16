vi.mock('../lib/email/orgEmailProvider', () => ({ resolveOrgEmailProvider: vi.fn(async () => null) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn(async () => undefined);
const logCommunicationHistory = vi.fn(async () => undefined);

vi.mock('../lib/communicationHistory', () => ({
  logCommunicationHistory: (...args: any[]) => (logCommunicationHistory as any)(...args),
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
      errorMessage: 'EMAIL_SEND_FAILED',
      relatedReservationId: 'res-2',
    }));
  });
});


it('does not mark provider-accepted email failed or attempt another send when history is unavailable', async () => {
  EmailService.setProvider({ sendEmail });
  sendEmail.mockClear(); logCommunicationHistory.mockClear();
  logCommunicationHistory.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(EmailService.sendManualMessage({ orgId: 'org-1', to: 'recipient@example.test', subject: 's', body: 'b' }))
    .rejects.toThrow('EMAIL_ACCEPTED_HISTORY_UNAVAILABLE_DO_NOT_RETRY');
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(logCommunicationHistory).toHaveBeenCalledTimes(1);
  expect(logCommunicationHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
});
