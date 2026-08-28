import { describe, expect, it, vi } from 'vitest';
import { previewCampaignAudience, sendCampaign, type CampaignRecord } from '../lib/campaigns';

const baseCampaign: CampaignRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: 'org-1',
  name: 'Launch',
  channel: 'email',
  template_id: null,
  subject: 'Hello',
  body: 'Body',
  status: 'draft',
  audience: { audienceType: 'all' },
  recipient_count: 0,
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
  sent_at: null,
};

describe('campaign service', () => {
  it('deduplicates recipients and skips invalid ones', async () => {
    const preview = await previewCampaignAudience(
      'org-1',
      'email',
      { audienceType: 'customers', customerIds: ['00000000-0000-4000-8000-000000000001'] },
      {
        fetchCustomerContacts: async () => ([
          { recipient: 'guest@example.com', relatedReservationId: 'res-1', relatedDepartureId: 'dep-1' },
          { recipient: 'Guest@example.com', relatedReservationId: 'res-2', relatedDepartureId: 'dep-1' },
          { recipient: 'not-an-email', relatedReservationId: 'res-3', relatedDepartureId: 'dep-1' },
          { recipient: '', relatedReservationId: 'res-4', relatedDepartureId: 'dep-1' },
        ]),
      },
    );

    expect(preview.sendableRecipients).toBe(1);
    expect(preview.skippedDuplicates).toBe(1);
    expect(preview.skippedInvalid).toBe(1);
    expect(preview.skippedEmpty).toBe(1);
    expect(preview.sampleRecipients).toEqual(['guest@example.com']);
  });

  it('supports all-customers audience', async () => {
    const preview = await previewCampaignAudience(
      'org-1',
      'sms',
      { audienceType: 'all' },
      {
        fetchAllCustomersContacts: async () => ([
          { recipient: '+38761111222' },
          { recipient: '+38761111333' },
        ]),
      },
    );

    expect(preview.audienceType).toBe('all');
    expect(preview.sendableRecipients).toBe(2);
  });

  it('sends an email campaign and marks it completed', async () => {
    const sendEmail = vi.fn(async () => undefined);
    const logHistory = vi.fn(async () => ({
      id: 'log-1',
      org_id: 'org-1',
      channel: 'email' as const,
      recipient: 'guest@example.com',
      status: 'sent' as const,
    }));
    const updateCampaign = vi.fn(async () => undefined);

    const result = await sendCampaign(
      baseCampaign,
      { audienceType: 'customers', customerIds: ['00000000-0000-4000-8000-000000000001'] },
      {
        fetchCustomerContacts: async () => ([{ recipient: 'guest@example.com' }]),
        sendEmail,
        logHistory,
        updateCampaign,
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
    expect(result.sentCount).toBe(1);
    expect(updateCampaign).toHaveBeenNthCalledWith(1, baseCampaign.id, 'org-1', { status: 'sending', sent_at: null });
    expect(updateCampaign).toHaveBeenNthCalledWith(2, baseCampaign.id, 'org-1', { status: 'completed', sent_at: result.sentAt });
    expect(logHistory).not.toHaveBeenCalled();
  });

  it('sends an SMS campaign', async () => {
    const sendSms = vi.fn(async () => undefined);

    const result = await sendCampaign(
      { ...baseCampaign, channel: 'sms', subject: null, body: 'SMS body' },
      { audienceType: 'customers', customerIds: ['00000000-0000-4000-8000-000000000001'] },
      {
        fetchCustomerContacts: async () => ([{ recipient: '+38761111222' }]),
        sendSms,
        updateCampaign: async () => undefined,
      },
    );

    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
  });

  it('logs skipped invalid recipients', async () => {
    const logHistory = vi.fn(async () => ({
      id: 'log-1',
      org_id: 'org-1',
      channel: 'email' as const,
      recipient: 'guest@example.com',
      status: 'skipped' as const,
    }));

    const result = await sendCampaign(
      baseCampaign,
      { audienceType: 'customers', customerIds: ['00000000-0000-4000-8000-000000000001'] },
      {
        fetchCustomerContacts: async () => ([
          { recipient: '' },
          { recipient: 'bad-email' },
          { recipient: 'valid@example.com' },
        ]),
        sendEmail: async () => undefined,
        logHistory,
        updateCampaign: async () => undefined,
      },
    );

    expect(result.skippedCount).toBe(2);
    expect(logHistory).toHaveBeenCalledTimes(2);
    expect(logHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', errorMessage: 'empty_recipient' }));
    expect(logHistory).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped', errorMessage: 'invalid_recipient' }));
  });
});
