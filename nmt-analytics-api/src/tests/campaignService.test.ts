import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationRows: Record<string, any> = {};
const reservationRows: Record<string, any> = {};
const departureRows: Record<string, any> = {};
const packageRows: Record<string, any> = {};

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((column: string, value: string) => ({
          eq: vi.fn((column2: string, value2: string) => ({
            maybeSingle: async () => {
              if (table === 'organizations' && column === 'id') return { data: organizationRows[value] ?? null, error: null };
              if (table === 'departures' && column === 'id') return { data: departureRows[value] ?? null, error: null };
              if (table === 'packages' && column === 'id') return { data: packageRows[value] ?? null, error: null };
              if (table === 'reservations' && ((column === 'id' && column2 === undefined) || column === 'id')) {
                return { data: reservationRows[value] ?? null, error: null };
              }
              return { data: null, error: null };
            },
          })),
          maybeSingle: async () => {
            if (table === 'organizations' && column === 'id') return { data: organizationRows[value] ?? null, error: null };
            if (table === 'departures' && column === 'id') return { data: departureRows[value] ?? null, error: null };
            if (table === 'packages' && column === 'id') return { data: packageRows[value] ?? null, error: null };
            if (table === 'reservations' && column === 'id') return { data: reservationRows[value] ?? null, error: null };
            return { data: null, error: null };
          },
        })),
      })),
    })),
  },
}));

import { previewCampaignAudience, sendCampaign, type CampaignRecord } from '../lib/campaigns';

const baseCampaign: CampaignRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: 'org-1',
  name: 'Launch',
  channel: 'email',
  template_id: null,
  subject: 'Hello {{customerName}}',
  body: 'Trip {{packageName}} for {{customerName}} on {{departureDate}}',
  status: 'sending',
  audience: { audienceType: 'all' },
  recipient_count: 0,
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
  scheduled_at: null,
  sent_at: null,
};

describe('campaign service', () => {
  beforeEach(() => {
    organizationRows['org-1'] = { name: 'Travelmania' };
    reservationRows['res-1'] = { id: 'res-1', status: 'confirmed', departure_id: 'dep-1' };
    reservationRows['res-2'] = { id: 'res-2', status: 'pending', departure_id: 'dep-2' };
    departureRows['dep-1'] = { id: 'dep-1', depart_at: '2026-09-01T00:00:00.000Z', return_at: '2026-09-08T00:00:00.000Z', package_id: 'pkg-1' };
    departureRows['dep-2'] = { id: 'dep-2', depart_at: '2026-09-15T00:00:00.000Z', return_at: '2026-09-20T00:00:00.000Z', package_id: 'pkg-2' };
    packageRows['pkg-1'] = { name: 'Antalya Escape', destination: 'Antalya' };
    packageRows['pkg-2'] = { name: 'Istanbul City', destination: 'Istanbul' };
  });

  it('deduplicates recipients and skips invalid ones', async () => {
    const preview = await previewCampaignAudience(
      'org-1',
      'email',
      { audienceType: 'customers', customerIds: ['00000000-0000-4000-8000-000000000001'] },
      {
        fetchCustomerContacts: async () => ([
          { recipient: 'guest@example.com', relatedReservationId: 'res-1', relatedDepartureId: 'dep-1' },
          { recipient: 'Guest@example.com', relatedReservationId: 'res-2', relatedDepartureId: 'dep-2' },
          { recipient: 'not-an-email', relatedReservationId: 'res-3', relatedDepartureId: 'dep-1' },
          { recipient: '', relatedReservationId: 'res-4', relatedDepartureId: 'dep-1' },
        ]),
      },
    );

    expect(preview.sendableRecipients).toBe(1);
    expect(preview.skippedDuplicates).toBe(1);
    expect(preview.skippedInvalid).toBe(1);
    expect(preview.skippedEmpty).toBe(1);
  });

  it('renders placeholders per recipient before sending', async () => {
    const sendEmail = vi.fn(async () => undefined);

    const result = await sendCampaign(
      baseCampaign,
      { audienceType: 'customers', customerIds: ['00000000-0000-4000-8000-000000000001'] },
      {
        fetchCustomerContacts: async () => ([
          {
            recipient: 'amina@example.com',
            name: 'Amina',
            email: 'amina@example.com',
            relatedReservationId: 'res-1',
            relatedDepartureId: 'dep-1',
          },
          {
            recipient: 'ismail@example.com',
            name: 'Ismail',
            email: 'ismail@example.com',
            relatedReservationId: 'res-2',
            relatedDepartureId: 'dep-2',
          },
        ]),
        sendEmail,
        updateCampaign: async () => undefined,
      },
    );

    expect(sendEmail).toHaveBeenNthCalledWith(1, expect.objectContaining({
      subject: 'Hello Amina',
      body: 'Trip Antalya Escape for Amina on 01.09.2026',
    }));
    expect(sendEmail).toHaveBeenNthCalledWith(2, expect.objectContaining({
      subject: 'Hello Ismail',
      body: 'Trip Istanbul City for Ismail on 15.09.2026',
    }));
    expect(result.sentCount).toBe(2);
  });

  it('does not send unresolved placeholders and records them as skipped', async () => {
    const sendEmail = vi.fn(async () => undefined);
    const logHistory = vi.fn(async () => ({
      id: 'history-1',
      org_id: 'org-1',
      channel: 'email',
      recipient: 'amina@example.com',
      status: 'skipped',
    }));

    const result = await sendCampaign(
      {
        ...baseCampaign,
        body: 'Trip {{packageName}} for {{customerName}} from {{customerPhone}}',
      },
      { audienceType: 'customers', customerIds: ['00000000-0000-4000-8000-000000000001'] },
      {
        fetchCustomerContacts: async () => ([
          {
            recipient: 'amina@example.com',
            name: 'Amina',
            email: 'amina@example.com',
            phone: null,
            relatedReservationId: 'res-1',
            relatedDepartureId: 'dep-1',
          },
        ]),
        sendEmail,
        logHistory,
        updateCampaign: async () => undefined,
      },
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(logHistory).toHaveBeenCalledWith(expect.objectContaining({
      status: 'skipped',
      recipient: 'amina@example.com',
      errorMessage: 'unresolved_placeholders:customerPhone',
      bodyPreview: 'Trip Antalya Escape for Amina from {{customerPhone}}',
    }));
    expect(result.sentCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.status).toBe('failed');
  });

  it('keeps provider failures in the messaging history pipeline', async () => {
    const sendSms = vi.fn(async () => undefined);

    const result = await sendCampaign(
      {
        ...baseCampaign,
        channel: 'sms',
        subject: null,
        body: 'Hello {{customerName}}',
      },
      { audienceType: 'all' },
      {
        fetchAllCustomersContacts: async () => ([
          { recipient: '+38761111222', name: 'Amina', phone: '+38761111222', relatedReservationId: 'res-1', relatedDepartureId: 'dep-1' },
        ]),
        sendSms,
        updateCampaign: async () => undefined,
      },
    );

    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({
      recipient: '+38761111222',
      body: 'Hello Amina',
    }));
    expect(result.status).toBe('completed');
  });
});
