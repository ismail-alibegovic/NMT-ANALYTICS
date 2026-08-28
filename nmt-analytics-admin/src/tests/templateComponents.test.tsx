import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { getMessageTemplates } from '../api/messageTemplates';

vi.mock('../api/messageTemplates', () => ({
  getMessageTemplates: vi.fn(),
  createMessageTemplate: vi.fn(),
  updateMessageTemplate: vi.fn(),
  deleteMessageTemplate: vi.fn(),
  duplicateMessageTemplate: vi.fn(),
}));

vi.mock('../lib/i18n/context', () => {
  const t = {
    communication: {
      templates: {
        title: 'Templates',
        searchPlaceholder: 'Search…',
        filterAll: 'All',
        filterEmail: 'Email',
        filterSms: 'SMS',
        newTemplate: 'New template',
        emptyTitle: 'No templates yet',
        emptyDesc: 'Create your first template.',
        noResults: 'No templates match your search.',
        noResultsDesc: 'Try adjusting your search or filter.',
        loading: 'Loading…',
        loadError: 'Failed to load templates.',
        retry: 'Retry',
        active: 'Active',
        inactive: 'Inactive',
        edit: 'Edit',
        duplicate: 'Duplicate',
        delete: 'Delete',
        deleteConfirmTitle: 'Delete this template?',
        deleteConfirmDesc: 'Delete {name}?',
        cancel: 'Cancel',
        deleteConfirm: 'Delete',
        saving: 'Saving…',
        saved: 'Template saved.',
        saveError: 'Failed to save.',
        duplicated: 'Template duplicated.',
        deleted: 'Template deleted.',
        deleting: 'Deleting…',
        editTitle: 'Edit template',
        createTitle: 'New template',
        save: 'Save',
        create: 'Create',
        singlePart: 'single part',
        form: {
          name: 'Name',
          namePlaceholder: 'Template name',
          nameRequired: 'Name is required.',
          channel: 'Channel',
          channelEmail: 'Email',
          channelSms: 'SMS',
          subject: 'Subject',
          subjectPlaceholder: 'Email subject line',
          subjectRequired: 'Subject is required.',
          subjectNotAllowed: 'SMS templates do not use a subject.',
          body: 'Message',
          bodyPlaceholder: 'Write your message…',
          bodyRequired: 'Message is required.',
          bodyTooLong: 'SMS body must be 320 chars or less.',
          variables: 'Insert variable',
          variablesTitle: 'Variables',
          variablesHint: 'Click a variable to insert it.',
          unsupportedPlaceholder: 'This message contains an unsupported variable.',
          previewEmpty: 'No content to preview.',
          preview: 'Preview',
          characters: 'characters',
          save: 'Save',
          saving: 'Saving…',
          create: 'Create',
        },
        variables: {},
      },
      automation: { title: 'Automation', comingSoon: 'Coming soon' },
      campaigns: { title: 'Campaigns', comingSoon: 'Coming soon' },
      overview: { title: 'Overview', comingSoon: 'Coming soon' },
      send: { contextLabel: 'Context', noContext: 'No context' },
    },
  };
  return { useT: () => ({ t, lang: 'en', setLang: vi.fn(), toggleLang: vi.fn() }) };
});

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return { CopyIcon: stub, PencilIcon: stub, PlusIcon: stub, TrashBinIcon: stub, MailIcon: stub, ChevronDownIcon: stub };
});

import TemplatesTab from '../components/communications/TemplatesTab';
import TemplateEditorModal from '../components/communications/TemplateEditorModal';

const mockTemplate = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: 'org-1',
  name: 'Welcome Email',
  channel: 'email' as const,
  subject: 'Welcome to {{agencyName}}',
  body: 'Dear {{customerName}}, thank you for booking.',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockSmsTemplate = {
  id: '22222222-2222-4222-8222-222222222222',
  org_id: 'org-1',
  name: 'SMS Reminder',
  channel: 'sms' as const,
  subject: null,
  body: 'Reminder: {{reservationId}} departs {{departureDate}}.',
  is_active: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TemplatesTab', () => {
  it('renders loading skeleton initially', () => {
    (getMessageTemplates as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<TemplatesTab />);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
    expect(screen.getByText('New template')).toBeInTheDocument();
  });

  it('renders template list', async () => {
    (getMessageTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([mockTemplate, mockSmsTemplate]);
    render(<TemplatesTab />);
    await waitFor(() => {
      expect(screen.getByText('Welcome Email')).toBeInTheDocument();
    });
    expect(screen.getByText('SMS Reminder')).toBeInTheDocument();
  });

  it('renders empty state when no templates', async () => {
    (getMessageTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<TemplatesTab />);
    await waitFor(() => {
      expect(screen.getByText('No templates yet')).toBeInTheDocument();
    });
  });

  it('renders error state with retry button', async () => {
    (getMessageTemplates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    render(<TemplatesTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load templates.')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('filters templates by channel', async () => {
    (getMessageTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([mockTemplate, mockSmsTemplate]);
    render(<TemplatesTab />);
    await waitFor(() => {
      expect(screen.getByText('Welcome Email')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('SMS')[0]);
    expect(screen.queryByText('Welcome Email')).not.toBeInTheDocument();
    expect(screen.getByText('SMS Reminder')).toBeInTheDocument();
  });
});

describe('TemplateEditorModal', () => {
  it('renders editor fields', () => {
    render(<TemplateEditorModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} template={null} />);
    expect(screen.getByPlaceholderText('Template name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write your message…')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    render(<TemplateEditorModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} template={null} />);
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(screen.getByText('Name is required.')).toBeInTheDocument();
    });
  });

  it('renders variables panel', () => {
    render(<TemplateEditorModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} template={null} />);
    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByText('{{customerName}}')).toBeInTheDocument();
  });
});
