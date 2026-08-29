import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import PublicForms from '../pages/admin/PublicForms';
import PublicFormRenderer from '../pages/PublicFormRenderer';

const getForms = vi.fn();
const createForm = vi.fn();
const updateForm = vi.fn();
const deleteForm = vi.fn();
const getFormSubmissions = vi.fn();
const getPackages = vi.fn();
const getDepartures = vi.fn();
const apiGet = vi.fn();
const apiPost = vi.fn();

const mockState = vi.hoisted(() => ({
  currentLang: 'en' as 'en' | 'bs',
}));

vi.mock('../api/forms', () => ({
  getForms: (...args: any[]) => getForms(...args),
  createForm: (...args: any[]) => createForm(...args),
  updateForm: (...args: any[]) => updateForm(...args),
  deleteForm: (...args: any[]) => deleteForm(...args),
  getFormSubmissions: (...args: any[]) => getFormSubmissions(...args),
}));

vi.mock('../api/packages', () => ({
  getPackages: (...args: any[]) => getPackages(...args),
}));

vi.mock('../api/departures', () => ({
  getDepartures: (...args: any[]) => getDepartures(...args),
}));

vi.mock('../api/client', () => ({
  get: (...args: any[]) => apiGet(...args),
  post: (...args: any[]) => apiPost(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../icons', () => {
  const stub = () => null;
  return {
    CopyIcon: stub,
    EyeIcon: stub,
    PencilIcon: stub,
    PlusIcon: stub,
    TrashBinIcon: stub,
  };
});

vi.mock('../components/common/PageMeta', () => ({
  default: () => null,
}));

vi.mock('../lib/i18n/context', () => {
  return {
    useT: () => ({
      lang: mockState.currentLang,
      t: {
        publicForms: {
          title: 'Public Forms',
          description: 'Manage forms',
          searchPlaceholder: 'Search forms',
          newForm: 'New form',
          createTitle: 'Create public form',
          editTitle: 'Edit public form',
          create: 'Create form',
          save: 'Save form',
          edit: 'Edit',
          duplicate: 'Duplicate',
          preview: 'Preview',
          copyLink: 'Copy link',
          viewSubmissions: 'Submissions',
          activate: 'Activate',
          deactivate: 'Deactivate',
          created: 'Form created.',
          updated: 'Form updated.',
          duplicated: 'Form duplicated.',
          activated: 'Form activated.',
          deactivated: 'Form deactivated.',
          deleted: 'Form deleted.',
          saveError: 'Failed to save form.',
          deleteError: 'Failed to delete form.',
          loadError: 'Failed to load forms.',
          deleteTitle: 'Delete form?',
          deleteDescription: 'Delete {name}',
          emptyTitle: 'No public forms yet',
          emptyDescription: 'Create your first form.',
          emptyFilteredTitle: 'No forms match this search',
          emptyFilteredDescription: 'Try a different search.',
          statusActive: 'Active',
          statusInactive: 'Inactive',
          copySuffix: '(Copy)',
          linkCopied: 'Public link copied.',
          linkCopyError: 'Failed to copy link.',
          settingsCardTitle: 'Public Forms',
          settingsCardDescription: 'Manage forms',
          settingsCardAction: 'Open Forms',
          table: { form: 'Form', status: 'Status', context: 'Context', fields: 'Fields', updated: 'Updated' },
          fields: { title: 'Title', slug: 'Slug', description: 'Description', thankYouMessage: 'Thank-you message', active: 'Form is active' },
          placeholders: { title: 'Form title', slug: 'form-title', description: 'Description', thankYouMessage: 'Thanks' },
          context: { title: 'Trip context', description: 'Context description', none: 'No specific trip', package: 'Package', departure: 'Departure' },
          builder: {
            title: 'Form builder',
            description: 'Build fields',
            addField: 'Add field',
            emptyTitle: 'No fields yet',
            emptyDescription: 'Add your first field.',
            fieldLabel: 'Field {index}',
            label: 'Label',
            labelPlaceholder: 'Full name',
            fieldId: 'Field ID',
            fieldIdPlaceholder: 'full_name',
            type: 'Type',
            mapTo: 'CRM mapping',
            required: 'Required field',
            options: 'Options',
            optionsPlaceholder: 'One option per line',
            moveUp: 'Move up',
            moveDown: 'Move down',
          },
          fieldTypes: {
            short_text: 'Short text',
            long_text: 'Long text',
            email: 'Email',
            phone: 'Phone',
            number: 'Number',
            date: 'Date',
            select: 'Select',
            multiselect: 'Multi-select',
            checkbox: 'Checkbox',
          },
          crmMappings: {
            none: 'Do not map',
            contactName: 'Contact name',
            email: 'Email',
            phone: 'Phone',
            destination: 'Destination',
            travelStart: 'Travel start',
            travelEnd: 'Travel end',
            travelers: 'Travelers',
            budget: 'Budget',
            tripType: 'Trip type',
          },
          previewCard: { title: 'Summary', slug: 'Public URL:', slugPlaceholder: 'new-form', fields: 'Fields:', status: 'Status:' },
          validation: {
            titleRequired: 'Title is required.',
            slugRequired: 'Slug is required.',
            labelRequired: 'Label is required.',
            fieldIdRequired: 'Field ID is required.',
            fieldIdInvalid: 'Field ID must be snake_case.',
            fieldIdDuplicate: 'Field ID must be unique.',
            optionsRequired: 'At least one option is required.',
            optionsDuplicate: 'Options must be unique.',
          },
          submissions: {
            title: 'Submissions — {name}',
            loadError: 'Failed to load submissions.',
            emptyTitle: 'No submissions yet',
            emptyDescription: 'Submissions will appear here.',
            openInquiry: 'Open inquiry',
            noInquiry: 'No linked inquiry',
          },
          public: {
            notFound: mockState.currentLang === 'bs' ? 'Obrazac nije pronađen.' : 'Form not found.',
            loadError: mockState.currentLang === 'bs' ? 'Obrazac nije moguće učitati.' : 'Failed to load form.',
            unavailableTitle: mockState.currentLang === 'bs' ? 'Obrazac nije dostupan' : 'Form unavailable',
            successTitle: mockState.currentLang === 'bs' ? 'Hvala' : 'Thank you',
            successFallback: mockState.currentLang === 'bs' ? 'Vaša prijava je zaprimljena.' : 'Your submission has been received.',
            required: mockState.currentLang === 'bs' ? '{label} je obavezno.' : '{label} is required.',
            invalidEmail: mockState.currentLang === 'bs' ? 'Unesite ispravnu email adresu.' : 'Enter a valid email address.',
            invalidPhone: mockState.currentLang === 'bs' ? 'Unesite ispravan broj telefona.' : 'Enter a valid phone number.',
            invalidNumber: mockState.currentLang === 'bs' ? 'Unesite ispravan broj.' : 'Enter a valid number.',
            selectPlaceholder: mockState.currentLang === 'bs' ? 'Odaberite opciju' : 'Select an option',
            submit: mockState.currentLang === 'bs' ? 'Pošalji' : 'Submit',
            submitting: mockState.currentLang === 'bs' ? 'Slanje…' : 'Submitting…',
            submitError: mockState.currentLang === 'bs' ? 'Slanje nije uspjelo.' : 'Submission failed.',
            requiredHint: mockState.currentLang === 'bs' ? '{count} obavezno/ih polja' : '{count} required field(s)',
          },
        },
        common: {
          actions: 'Actions',
          cancel: 'Cancel',
          delete: 'Delete',
          deleting: 'Deleting…',
          saving: 'Saving…',
          yes: 'Yes',
          no: 'No',
        },
      },
      setLang: vi.fn(),
      toggleLang: vi.fn(),
    }),
  };
});

const forms = [
  {
    id: 'form-1',
    orgId: 'org-1',
    title: 'Umrah Inquiry',
    description: 'Lead form',
    slug: 'umrah-inquiry',
    active: true,
    fields: [{ id: 'full_name', label: 'Full name', type: 'short_text', required: true }],
    thankYouMessage: 'We will contact you.',
    packageId: null,
    departureId: null,
    createdBy: null,
    createdAt: '2026-08-29T10:00:00.000Z',
    updatedAt: '2026-08-29T10:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockState.currentLang = 'en';
  getForms.mockResolvedValue(forms);
  getPackages.mockResolvedValue({ data: [], total: 0, page: 1, limit: 200, totalPages: 1 });
  getDepartures.mockResolvedValue({ data: [], total: 0, page: 1, limit: 200, totalPages: 1 });
  getFormSubmissions.mockResolvedValue([
    {
      id: 'sub-1',
      formId: 'form-1',
      inquiryId: 'inq-1',
      answers: { full_name: 'Test User', destination: 'Makkah' },
      submittedAt: '2026-08-29T10:00:00.000Z',
    },
  ]);
});

describe('PublicForms admin page', () => {
  it('renders existing forms', async () => {
    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Umrah Inquiry')).toBeInTheDocument();
    expect(screen.getByText('Submissions')).toBeInTheDocument();
  });

  it('validates duplicate field ids in builder', async () => {
    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('New form'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Form' } });
    fireEvent.click(screen.getByText('Add field'));
    fireEvent.click(screen.getByText('Add field'));

    const fieldIdInputs = screen.getAllByLabelText('Field ID');
    fireEvent.change(fieldIdInputs[0], { target: { value: 'same_id' } });
    fireEvent.change(fieldIdInputs[1], { target: { value: 'same_id' } });

    fireEvent.click(screen.getByText('Create form'));

    expect(await screen.findByText('Field ID must be unique.')).toBeInTheDocument();
    expect(createForm).not.toHaveBeenCalled();
  });

  it('loads submissions modal with inquiry link', async () => {
    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('Submissions'));

    expect(await screen.findByText('Open inquiry')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });
});

describe('PublicFormRenderer', () => {
  it('renders public form and validates required/email fields', async () => {
    apiGet.mockResolvedValue({
      data: {
        title: 'Contact us',
        description: 'Tell us about your trip',
        fields: [
          { id: 'email', label: 'Email', type: 'email', required: true },
        ],
        thankYouMessage: 'Done',
      },
    });

    render(
      <MemoryRouter initialEntries={['/public/forms/contact-us']}>
        <Routes>
          <Route path="/public/forms/:slug" element={<PublicFormRenderer />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Contact us')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit'));
    expect(await screen.findByText('Email is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'bad' } });
    fireEvent.click(screen.getByText('Submit'));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('shows localized unavailable state', async () => {
    mockState.currentLang = 'bs';
    apiGet.mockRejectedValue({ response: { status: 404 } });

    render(
      <MemoryRouter initialEntries={['/public/forms/nema']}>
        <Routes>
          <Route path="/public/forms/:slug" element={<PublicFormRenderer />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Obrazac nije dostupan')).toBeInTheDocument();
      expect(screen.getByText('Obrazac nije pronađen.')).toBeInTheDocument();
    });
  });
});
