import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AutomationTab from '../components/communications/AutomationTab';
import AutomationEditorModal from '../components/communications/AutomationEditorModal';

const getAutomationRules = vi.fn();
const createAutomationRule = vi.fn();
const updateAutomationRule = vi.fn();
const deleteAutomationRule = vi.fn();
const toggleAutomationRule = vi.fn();
const getMessageTemplates = vi.fn();

vi.mock('../api/automationRules', () => ({
  getAutomationRules: (...args: any[]) => getAutomationRules(...args),
  getAutomationRule: vi.fn(),
  createAutomationRule: (...args: any[]) => createAutomationRule(...args),
  updateAutomationRule: (...args: any[]) => updateAutomationRule(...args),
  deleteAutomationRule: (...args: any[]) => deleteAutomationRule(...args),
  toggleAutomationRule: (...args: any[]) => toggleAutomationRule(...args),
}));

vi.mock('../api/messageTemplates', () => ({
  getMessageTemplates: (...args: any[]) => getMessageTemplates(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return {
    PencilIcon: stub,
    PlusIcon: stub,
    TrashBinIcon: stub,
    ChevronDownIcon: stub,
  };
});

vi.mock('../lib/i18n/context', () => {
  const t = {
    communication: {
      automation: {
        title: 'Automation',
        description: 'Automation rules',
        search: 'Search rules',
        allChannels: 'All channels',
        channelEmail: 'Email',
        channelSms: 'SMS',
        newRule: 'New automation',
        empty: 'No automation rules yet.',
        noMatches: 'No rules match your search.',
        loadError: 'Failed to load automation rules.',
        filterAll: 'All',
        filterActive: 'Active',
        filterInactive: 'Inactive',
        active: 'Active',
        inactive: 'Inactive',
        enabled: 'Enabled',
        disabled: 'Disabled',
        enable: 'Enable',
        disable: 'Disable',
        toggleError: 'Failed to update rule.',
        delete: 'Delete',
        deleting: 'Deleting…',
        deleteTitle: 'Delete automation rule',
        deleteConfirm: 'This will permanently delete this automation rule.',
        deleteSuccess: 'Rule deleted.',
        deleteError: 'Failed to delete rule.',
        cancel: 'Cancel',
        newTitle: 'New automation',
        editTitle: 'Edit automation',
        name: 'Name',
        namePlaceholder: 'e.g. Departure reminder',
        channel: 'Channel',
        trigger: 'Trigger',
        triggers: {
          before_departure: 'Before departure',
          after_reservation: 'After reservation created',
          before_payment_due: 'Before payment due',
        },
        offsetValue: 'Offset',
        offsetUnit: 'Unit',
        days: 'days',
        hours: 'hours',
        template: 'Template',
        templateNone: 'No template',
        templatePlaceholder: 'Select a template',
        loadingTemplates: 'Loading templates…',
        noCompatibleTemplates: 'No active templates available.',
        summaryTimed: 'Send "{template}" by {channel} {offset} {trigger}.',
        summaryAfterReservation: 'Send "{template}" by {channel} {trigger}.',
        activeLabel: 'Active',
        save: 'Save automation',
        saving: 'Saving…',
        saved: 'Automation saved.',
        saveError: 'Failed to save automation.',
        create: 'Create automation',
        created: 'Automation created.',
        errors: {
          nameRequired: 'Name is required.',
          templateRequired: 'Select a template.',
          invalidTiming: 'Offset must be a positive number.',
        },
        subtitle: 'Create and manage automated message rules.',
      },
    },
  };
  return { useT: () => ({ t, lang: 'en', setLang: vi.fn(), toggleLang: vi.fn() }) };
});

const rules = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    org_id: 'org-1',
    name: 'Departure reminder',
    is_active: true,
    channel: 'email',
    template_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    trigger_type: 'before_departure',
    timing: { value: 3, unit: 'days' },
    human_trigger: '3 days before departure',
    created_at: '2026-08-28T10:00:00.000Z',
    updated_at: '2026-08-28T11:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    org_id: 'org-1',
    name: 'Welcome SMS',
    is_active: false,
    channel: 'sms',
    template_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    trigger_type: 'after_reservation',
    timing: { value: 0, unit: 'days' },
    human_trigger: 'immediately after reservation',
    created_at: '2026-08-28T10:00:00.000Z',
    updated_at: '2026-08-28T11:00:00.000Z',
  },
];

const templates = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    org_id: 'org-1',
    name: 'Departure Reminder',
    channel: 'email',
    subject: 'Reminder',
    body: 'Hello {{customerName}}',
    is_active: true,
    created_at: '2026-08-28T10:00:00.000Z',
    updated_at: '2026-08-28T10:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getAutomationRules.mockResolvedValue(rules);
  getMessageTemplates.mockResolvedValue(templates);
  createAutomationRule.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });
  updateAutomationRule.mockResolvedValue({});
  deleteAutomationRule.mockResolvedValue({ success: true });
  toggleAutomationRule.mockResolvedValue({});
});

describe('AutomationTab', () => {
  it('renders the rule list with channel and active state', async () => {
    render(<AutomationTab />);
    expect(await screen.findByText('Departure reminder')).toBeInTheDocument();
    expect(screen.getByText('Welcome SMS')).toBeInTheDocument();
    expect(screen.getAllByText('Email').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('SMS').length).toBeGreaterThanOrEqual(1);
  });

  it('opens the editor when New automation is clicked', async () => {
    render(<AutomationTab />);
    await screen.findByText('Departure reminder');
    fireEvent.click(screen.getAllByText('New automation')[0]);
    expect(await screen.findByText('Trigger')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('toggles active state via enable/disable', async () => {
    render(<AutomationTab />);
    await screen.findByText('Departure reminder');
    const rows = screen.getAllByRole('button');
    const enableButton = rows.find((r) => r.textContent?.includes('Enable'));
    if (enableButton) {
      fireEvent.click(enableButton);
      await waitFor(() => expect(toggleAutomationRule).toHaveBeenCalled());
    }
  });

  it('shows delete confirmation', async () => {
    render(<AutomationTab />);
    await screen.findByText('Departure reminder');
    const deleteButtons = screen.getAllByRole('button').filter(
      (b) => !b.textContent && b.querySelector('svg')
    );
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(deleteButtons[0]);
    expect(await screen.findByText('Delete automation rule')).toBeInTheDocument();
  });
});

describe('AutomationEditorModal', () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    rule: null as any,
  };

  it('renders trigger, channel and template selectors', async () => {
    render(<AutomationEditorModal {...baseProps} />);
    expect(await screen.findByText('Trigger')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
  });

  it('shows trigger options', async () => {
    render(<AutomationEditorModal {...baseProps} />);
    await screen.findByText('Trigger');
    expect(screen.getByText('Before departure')).toBeInTheDocument();
    expect(screen.getByText('After reservation created')).toBeInTheDocument();
    expect(screen.getByText('Before payment due')).toBeInTheDocument();
  });

  it('renders a human-readable summary', async () => {
    render(<AutomationEditorModal {...baseProps} />);
    await screen.findByText('Trigger');
    const summaryText = screen.getByText(/Send ".*" by Email \d+ days before departure\./);
    expect(summaryText).toBeInTheDocument();
  });

  it('submits a new rule', async () => {
    const onSaved = vi.fn();
    render(<AutomationEditorModal {...baseProps} onSaved={onSaved} />);
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My rule' } });
    fireEvent.click(screen.getByText('Create automation'));
    await waitFor(() => expect(createAutomationRule).toHaveBeenCalled());
  });
});
