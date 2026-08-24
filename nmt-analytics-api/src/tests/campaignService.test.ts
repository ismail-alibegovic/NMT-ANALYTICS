import { describe, expect, it, vi } from 'vitest';
import { previewCampaignAudience, sendCampaign, type CampaignRecord } from '../lib/campaigns';

const baseCampaign: CampaignRecord = {
  id: 'camp-1',
  org_id: 'org-1',
  name: 'Launch',
  channel: 'email',
  subject: 'Hello',
  body: 'Body',
  status: 'draft',
  created_at: '2026-08-24T00:00:00.000Z',
  sent_at: null,
};

describe('campaign service', () => {
  it('deduplicates recipients and skips invalid ones', async () => {
    const preview = await previewCampaignAudience(
      'org-1',
      'email',
      { audienceType: 'reservations', reservationIds: ['res-1', 'res-2', 'res-3'] },
      {
        fetchReservationContacts: async () => ([
          { recipient: 'guest@example.com', relatedReservationId: 'res-1', relatedDepartureId: 'dep-1' },
          { recipient: 'Guest@example.com', relatedReservationId: 'res-2', relatedDepartureId: 'dep-1' },
          { recipient: 'not-an-email', relatedReservationId: 'res-3', relatedDepartureId: 'dep-1' },
          { recipient: '', relatedReservationId: 'res-4', relatedDepartureId: 'dep-1' },
        ]),
      }
    );

    expect(preview.sendableRecipients).toBe(1);
    expect(preview.skippedDuplicates).toBe(1);
    expect(preview.skippedInvalid).toBe(1);
    expect(preview.skippedEmpty).toBe(1);
    expect(preview.sampleRecipients).toEqual(['guest@example.com']);
  });

  it('sends an email campaign and marks it completed', async () => {
    const sendEmail = vi.fn(async () => undefined);
    const logHistory = vi.fn(async () => ({ id: 'log-1', org_id: 'org-1', channel: 'email' as const, recipient: 'test@example.com', status: 'sent' as const }));
    const updateCampaign = vi.fn(async () => undefined);

    const result = await sendCampaign(
      baseCampaign,
      { audienceType: 'customers', customerIds: ['cust-1'] },
      {
        fetchCustomerContacts: async () => ([{ recipient: 'guest@example.com' }]),
        sendEmail,
        logHistory,
        updateCampaign,
      }
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
    expect(result.sentCount).toBe(1);
    expect(updateCampaign).toHaveBeenNthCalledWith(1, 'camp-1', 'org-1', { status: 'sending', sent_at: null });
    expect(updateCampaign).toHaveBeenNthCalledWith(2, 'camp-1', 'org-1', { status: 'completed', sent_at: result.sentAt });
    expect(logHistory).not.toHaveBeenCalled();
  });

  it('sends an SMS campaign', async () => {
    const sendSms = vi.fn(async () => undefined);

    const result = await sendCampaign(
      { ...baseCampaign, channel: 'sms', subject: null, body: 'SMS body' },
      { audienceType: 'customers', customerIds: ['cust-1'] },
      {
        fetchCustomerContacts: async () => ([{ recipient: '+38761111222' }]),
        sendSms,
        updateCampaign: async () => undefined,
      }
    );

    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
  });

  it('logs skipped invalid recipients', async () => {
    const logHistory = vi.fn(async () => ({ id: 'log-1', org_id: 'org-1', channel: 'email' as const, recipient: 'test@example.com', status: 'sent' as const }));

    const result = await sendCampaign(
      baseCampaign,
      { audienceType: 'customers', customerIds: ['cust-1', 'cust-2'] },
      {
        fetchCustomerContacts: async () => ([
          { recipient: '' },
          { recipient: 'bad-email' },
          { recipient: 'valid@example.com' },
        ]),
        sendEmail: async () => undefined,
        logHistory,
        updateCampaign: async () => undefined,
      }
    );

    expect(result.skippedCount).toBe(2);
    expect(logHistory).toHaveBeenCalledTimes(2);
    expect(logHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', errorMessage: 'empty_recipient' }));
    expect(logHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', errorMessage: 'invalid_recipient' }));
  });

  it('marks campaign failed on partial provider failures', async () => {
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('smtp_down'));

    const result = await sendCampaign(
      baseCampaign,
      { audienceType: 'customers', customerIds: ['cust-1', 'cust-2'] },
      {
        fetchCustomerContacts: async () => ([
          { recipient: 'a@example.com' },
          { recipient: 'b@example.com' },
        ]),
        sendEmail,
        updateCampaign: async () => undefined,
      }
    );

    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.status).toBe('failed');
  });
});
