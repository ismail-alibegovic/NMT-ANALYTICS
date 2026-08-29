import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CampaignsTab from '../components/communications/CampaignsTab';
import CampaignEditorModal from '../components/communications/CampaignEditorModal';

const getCampaigns = vi.fn();
const createCampaign = vi.fn();
const updateCampaign = vi.fn();
const deleteCampaign = vi.fn();
const launchCampaign = vi.fn();
const previewCampaignAudience = vi.fn();
const getMessageTemplates = vi.fn();
const getDepartures = vi.fn();
const getReservations = vi.fn();

vi.mock('../api/campaigns', () => ({
  getCampaigns: (...args: any[]) => getCampaigns(...args),
  getCampaign: vi.fn(),
  createCampaign: (...args: any[]) => createCampaign(...args),
  updateCampaign: (...args: any[]) => updateCampaign(...args),
  deleteCampaign: (...args: any[]) => deleteCampaign(...args),
  launchCampaign: (...args: any[]) => launchCampaign(...args),
  previewCampaignAudience: (...args: any[]) => previewCampaignAudience(...args),
  scheduleCampaign: vi.fn(),
  rescheduleCampaign: vi.fn(),
  cancelSchedule: vi.fn(),
}));

vi.mock('../api/messageTemplates', () => ({
  getMessageTemplates: (...args: any[]) => getMessageTemplates(...args),
}));

vi.mock('../api/departures', () => ({
  getDepartures: (...args: any[]) => getDepartures(...args),
}));

vi.mock('../api/reservations', () => ({
  getReservations: (...args: any[]) => getReservations(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return {
    ListIcon: stub,
    PencilIcon: stub,
    PlusIcon: stub,
    PaperPlaneIcon: stub,
    TrashBinIcon: stub,
    ChevronDownIcon: stub,
    CalenderIcon: stub,
  };
});

vi.mock('../lib/i18n/context', () => {
  const t = {
    communication: {
      templates: {
        channelEmail: 'Email',
        channelSms: 'SMS',
      },
      campaigns: {
        title: 'Campaigns',
        description: 'Campaign drafts',
        searchPlaceholder: 'Search campaigns',
        filterAll: 'All',
        filterEmail: 'Email',
        filterSms: 'SMS',
        newCampaign: 'New campaign',
        emptyTitle: 'No campaigns yet',
        emptyDesc: 'Create your first campaign draft.',
        noResults: 'No campaigns match your search.',
        noResultsDesc: 'Try a different search term or channel filter.',
        loadError: 'Failed to load campaigns.',
        retry: 'Retry',
        statusDraft: 'Draft',
        statusSending: 'Sending',
        statusCompleted: 'Completed',
        statusFailed: 'Failed',
        recipientCount: '{count} recipients',
        updatedAt: 'Updated {date}',
        launch: 'Launch campaign',
        launching: 'Launching…',
        launchConfirm: 'Launch now',
        launchConfirmTitle: 'Launch this campaign?',
        launchConfirmDesc: '{name} will send real messages to the resolved audience.',
        launchWarning: 'This sends real messages immediately. Review the recipient count before launching.',
        launchSuccess: 'Campaign launched.',
        launchError: 'Failed to launch campaign.',
        launchSummaryTitle: 'Launch summary',
        launchSummaryDesc: '{name} finished processing.',
        close: 'Close',
        launchFields: {
          name: 'Campaign',
          channel: 'Channel',
          sendable: 'Sendable recipients',
          skipped: 'Skipped recipients',
          sent: 'Sent',
          failed: 'Failed',
          finalStatus: 'Final status',
        },
        edit: 'Edit',
        delete: 'Delete',
        cancel: 'Cancel',
        deleteConfirm: 'Delete',
        deleteConfirmTitle: 'Delete this campaign?',
        deleteConfirmDesc: '{name} will be removed permanently.',
        deleting: 'Deleting…',
        created: 'Campaign created.',
        updated: 'Campaign updated.',
        deleted: 'Campaign deleted.',
        saveError: 'Failed to save campaign.',
        deleteError: 'Failed to delete campaign.',
        templateNone: 'No template',
        untitledDeparture: 'Untitled departure',
        statusScheduled: 'Scheduled',
        scheduledAt: 'Scheduled for {date}',
        schedule: 'Schedule',
        scheduleTitle: 'Schedule campaign',
        scheduleDesc: 'Set a future date and time when this campaign should send automatically.',
        scheduleDate: 'Date and time',
        schedulePast: 'Scheduled time must be in the future.',
        scheduleButton: 'Schedule',
        reschedule: 'Reschedule',
        cancelSchedule: 'Cancel schedule',
        cancelScheduleConfirm: 'Cancel schedule for this campaign?',
        cancelScheduleConfirmDesc: '{name} will return to draft status.',
        cancelScheduleSuccess: 'Schedule cancelled. Campaign is now a draft.',
        scheduledSuccess: 'Campaign scheduled.',
        rescheduledSuccess: 'Campaign re-scheduled.',
        audiences: {
          all: 'All customers',
          departure: 'Customers from a departure',
          reservations: 'Selected reservation',
          customers: 'Selected customer',
        },
        form: {
          createTitle: 'New campaign',
          editTitle: 'Edit campaign',
          name: 'Name',
          namePlaceholder: 'Campaign name',
          nameRequired: 'Name is required.',
          channel: 'Channel',
          template: 'Template',
          subject: 'Subject',
          subjectPlaceholder: 'Email subject line',
          subjectRequired: 'Subject is required for email.',
          body: 'Message',
          bodyPlaceholder: 'Write your campaign…',
          bodyRequired: 'Message is required.',
          bodyTooLong: 'SMS campaign body must be 320 characters or less.',
          unsupportedPlaceholder: 'This campaign contains an unsupported variable.',
          audienceType: 'Audience',
          audienceValue: 'Source',
          audienceRequired: 'Choose an audience before previewing.',
          previewRequired: 'Preview recipients before saving.',
          create: 'Create draft',
          save: 'Save draft',
          saving: 'Saving…',
        },
        preview: {
          title: 'Recipient preview',
          description: 'Resolve recipients before saving the draft.',
          action: 'Preview',
          loading: 'Resolving…',
          recipientCount: 'Sendable recipients',
          totalCandidates: 'Total candidates',
          invalidRecipients: 'Missing or invalid contacts',
          duplicates: 'Duplicates removed',
          sampleRecipients: 'Sample recipients',
          emptyTitle: 'No preview yet',
          emptyDesc: 'Choose an audience and preview the recipients.',
        },
      },
    },
  };
  return { useT: () => ({ t, lang: 'en', setLang: vi.fn(), toggleLang: vi.fn() }) };
});

beforeEach(() => {
  vi.clearAllMocks();
  getCampaigns.mockResolvedValue([
    {
      id: '11111111-1111-4111-8111-111111111111',
      org_id: 'org-1',
      name: 'Welcome blast',
      channel: 'email',
      template_id: null,
      subject: 'Hello',
      body: 'Body',
      audience: { audienceType: 'all' },
      status: 'draft',
      recipient_count: 12,
      created_at: '2026-08-28T10:00:00.000Z',
      updated_at: '2026-08-28T11:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      org_id: 'org-1',
      name: 'SMS blast',
      channel: 'sms',
      template_id: null,
      subject: null,
      body: 'SMS',
      audience: { audienceType: 'all' },
      status: 'draft',
      recipient_count: 4,
      created_at: '2026-08-28T10:00:00.000Z',
      updated_at: '2026-08-28T11:00:00.000Z',
    },
  ]);
  getMessageTemplates.mockResolvedValue([
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      org_id: 'org-1',
      name: 'Email template',
      channel: 'email',
      subject: 'Welcome {{customerName}}',
      body: 'Hello {{customerName}}',
      is_active: true,
      created_at: '2026-08-28T10:00:00.000Z',
      updated_at: '2026-08-28T10:00:00.000Z',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      org_id: 'org-1',
      name: 'SMS template',
      channel: 'sms',
      subject: null,
      body: 'SMS {{customerName}}',
      is_active: true,
      created_at: '2026-08-28T10:00:00.000Z',
      updated_at: '2026-08-28T10:00:00.000Z',
    },
  ]);
  getDepartures.mockResolvedValue({
    data: [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        packageName: 'Antalya',
        destination: 'Antalya',
        depart_at: '2026-09-01T00:00:00.000Z',
      },
    ],
  });
  getReservations.mockResolvedValue({
    data: [
      {
        id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
        customerName: 'Amina',
        packageName: 'Antalya',
      },
    ],
  });
  previewCampaignAudience.mockResolvedValue({
    audienceType: 'all',
    totalCandidates: 5,
    uniqueRecipients: 4,
    sendableRecipients: 4,
    skippedEmpty: 1,
    skippedInvalid: 0,
    skippedDuplicates: 0,
    sampleRecipients: ['first@example.com'],
  });
  launchCampaign.mockResolvedValue({
    status: 'completed',
    sentCount: 4,
    failedCount: 0,
    skippedCount: 1,
    totalRecipients: 4,
    sentAt: '2026-08-29T00:00:00.000Z',
    preview: {
      audienceType: 'all',
      totalCandidates: 5,
      uniqueRecipients: 4,
      sendableRecipients: 4,
      skippedEmpty: 1,
      skippedInvalid: 0,
      skippedDuplicates: 0,
      sampleRecipients: ['first@example.com'],
    },
  });
});

describe('CampaignsTab', () => {
  it('renders campaign list and channel filter', async () => {
    render(<CampaignsTab />);
    await waitFor(() => expect(screen.getByText('Welcome blast')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('SMS')[0]);
    expect(screen.queryByText('Welcome blast')).not.toBeInTheDocument();
    expect(screen.getByText('SMS blast')).toBeInTheDocument();
  });

  it('opens delete confirmation and deletes campaign', async () => {
    deleteCampaign.mockResolvedValue(undefined);
    render(<CampaignsTab />);
    await waitFor(() => expect(screen.getByText('Welcome blast')).toBeInTheDocument());

    const firstCard = screen.getByText('Welcome blast').closest('.rounded-xl') as HTMLElement | null;
    if (!firstCard) throw new Error('Campaign card not found');

    fireEvent.click(within(firstCard).getByText('Delete'));
    expect(screen.getByText('Delete this campaign?')).toBeInTheDocument();

    const modalDeleteButtons = screen.getAllByText('Delete');
    fireEvent.click(modalDeleteButtons[modalDeleteButtons.length - 1]);
    await waitFor(() =>
      expect(deleteCampaign).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'),
    );
  });

  it('launches a draft campaign through confirmation flow', async () => {
    render(<CampaignsTab />);
    await waitFor(() => expect(screen.getByText('Welcome blast')).toBeInTheDocument());

    const firstCard = screen.getByText('Welcome blast').closest('.rounded-xl') as HTMLElement | null;
    if (!firstCard) throw new Error('Campaign card not found');

    fireEvent.click(within(firstCard).getByText('Launch campaign'));
    expect(screen.getByText('Launch this campaign?')).toBeInTheDocument();
    expect(screen.getByText('This sends real messages immediately. Review the recipient count before launching.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Launch now'));

    await waitFor(() =>
      expect(launchCampaign).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'),
    );
    expect(screen.getByText('Launch summary')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });
});

describe('CampaignEditorModal', () => {
  it('renders create form', async () => {
    render(<CampaignEditorModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} campaign={null} />);
    expect(screen.getByPlaceholderText('Campaign name')).toBeInTheDocument();
    expect(screen.getByText('Create draft')).toBeInTheDocument();
  });

  it('selecting template fills subject and body', async () => {
    render(<CampaignEditorModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} campaign={null} />);

    await waitFor(() => expect(getMessageTemplates).toHaveBeenCalled());
    await screen.findByRole('option', { name: 'Email template' });
    fireEvent.change(screen.getByLabelText('Template'), {
      target: { value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });

    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Welcome {{customerName}}');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hello {{customerName}}');
  });

  it('audience selection previews recipients', async () => {
    render(<CampaignEditorModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} campaign={null} />);

    await waitFor(() => expect(getDepartures).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Audience'), { target: { value: 'departure' } });
    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() =>
      expect(previewCampaignAudience).toHaveBeenCalledWith({
        channel: 'email',
        audience: {
          audienceType: 'departure',
          departureId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        },
        template_id: null,
      }),
    );
    expect(screen.getByText('Sendable recipients')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
