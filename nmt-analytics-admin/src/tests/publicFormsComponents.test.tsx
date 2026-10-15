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
    PlugInIcon: stub,
    PlusIcon: stub,
    TrashBinIcon: stub,
  };
});

vi.mock('../components/common/PageMeta', () => ({
  default: () => null,
}));

const appState = vi.hoisted(() => ({ role: 'manager' as string }));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ userContext: { role: appState.role }, user: { id: 'u1' }, loading: false }),
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
          readOnlyNotice: 'Read-only access',
          packagesLoadError: 'Packages unavailable',
          departuresLoadError: 'Departures unavailable',
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
          embed: 'Embed',
          embedModal: {
            title: 'Embed form on website',
            description: 'Copy the iframe snippet and place it on your website.',
            iframeCode: 'Iframe embed code',
            directLink: 'Direct form link',
            copied: 'Copied to clipboard!',
            copyCode: 'Copy code',
            previewHint: 'The form automatically adapts its height and is responsive on mobile devices.',
          },
          public: {
            notFound: mockState.currentLang === 'bs' ? 'Obrazac nije pronađen.' : 'Form not found.',
            loadError: mockState.currentLang === 'bs' ? 'Obrazac nije moguće učitati.' : 'Failed to load form.',
            unavailableTitle: mockState.currentLang === 'bs' ? 'Obrazac nije dostupan' : 'Form unavailable',
            successTitle: mockState.currentLang === 'bs' ? 'Hvala' : 'Thank you',
            successFallback: mockState.currentLang === 'bs' ? 'Vaša prijava je zaprimljena.' : 'Your submission has been received.',
            tripDetails: 'Trip details',
            departureDate: 'Departure date',
            selectDeparture: 'Select departure date',
            availableSpots: '{count} spots available',
            spotsLeft: 'spots available',
            soldOut: 'Sold out',
            priceFrom: 'Price from',
            duration: 'Duration',
            days: 'days',
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
          close: 'Close',
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
  appState.role = 'manager';
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

  it('manager sees write actions and can open the editor', async () => {
    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('New form'));
    expect(await screen.findByText('Form builder')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(await screen.findByText('Deactivate')).toBeInTheDocument();
    expect(screen.queryByText('Activate')).not.toBeInTheDocument();
  });

  it('read-only user does not see write actions', async () => {
    appState.role = 'viewer';

    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Umrah Inquiry')).toBeInTheDocument();
    expect(screen.queryByText('New form')).not.toBeInTheDocument();
    expect(screen.getByText('Read-only access')).toBeInTheDocument();
    expect(screen.queryByText('Activate')).not.toBeInTheDocument();
    expect(screen.getByText('Submissions')).toBeInTheDocument();
  });

  it('packages API failure does not break forms management', async () => {
    getPackages.mockRejectedValue(new Error('packages down'));

    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Umrah Inquiry')).toBeInTheDocument();
    expect(await screen.findByText('Packages unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submissions'));
    expect(await screen.findByText('Open inquiry')).toBeInTheDocument();
  });

  it('departures API failure does not break forms management', async () => {
    getDepartures.mockRejectedValue(new Error('departures down'));

    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Umrah Inquiry')).toBeInTheDocument();
    expect(await screen.findByText('Departures unavailable')).toBeInTheDocument();
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

  it('renders trip details, fixed departure availability, and submits payload', async () => {
    mockState.currentLang = 'en';
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');

    apiGet.mockResolvedValue({
      data: {
        title: 'Istanbul Booking',
        description: 'Book your trip',
        fields: [
          { id: 'full_name', label: 'Full name', type: 'short_text', required: true },
        ],
        thankYouMessage: 'Thank you for booking!',
        package: {
          id: 'pkg-1',
          name: 'Istanbul Express',
          destination: 'Istanbul, Turkey',
          basePrice: 650,
          currency: 'EUR',
          durationDays: 5,
        },
        departure: {
          id: 'dep-1',
          departAt: '2026-06-10T10:00:00Z',
          returnAt: '2026-06-15T18:00:00Z',
          capacity: 40,
          booked: 28,
          available: 12,
          status: 'active',
        },
      },
    });

    apiPost.mockResolvedValue({ data: { ok: true, inquiryId: 'inq-99' } });

    render(
      <MemoryRouter initialEntries={['/public/forms/istanbul-booking?embed=1']}>
        <Routes>
          <Route path="/public/forms/:slug" element={<PublicFormRenderer />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Istanbul Booking')).toBeInTheDocument();
    expect(screen.getByText(/Istanbul Express — Istanbul, Turkey/)).toBeInTheDocument();
    expect(screen.getByText(/12 spots available/)).toBeInTheDocument();
    expect(screen.getByText('650 EUR')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Kemal Malic' } });
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/public/forms/istanbul-booking', {
        full_name: 'Kemal Malic',
        departureId: 'dep-1',
        packageId: 'pkg-1',
      });
      expect(screen.getByText('Thank you for booking!')).toBeInTheDocument();
      expect(postMessageSpy).toHaveBeenCalledWith({ type: 'travline-form-submitted', slug: 'istanbul-booking' }, '*');
    });

    postMessageSpy.mockRestore();
  });

  it('renders selectable departures when multiple dates are available', async () => {
    mockState.currentLang = 'en';

    apiGet.mockResolvedValue({
      data: {
        title: 'Rome Tours',
        description: 'Choose your date',
        fields: [
          { id: 'full_name', label: 'Full name', type: 'short_text', required: true },
        ],
        package: {
          id: 'pkg-2',
          name: 'Rome Weekend',
          destination: 'Rome, Italy',
          basePrice: 400,
          currency: 'EUR',
        },
        availableDepartures: [
          {
            id: 'dep-a',
            departAt: '2026-07-01T08:00:00Z',
            returnAt: '2026-07-05T18:00:00Z',
            capacity: 30,
            booked: 10,
            available: 20,
            status: 'active',
          },
          {
            id: 'dep-b',
            departAt: '2026-08-01T08:00:00Z',
            returnAt: '2026-08-05T18:00:00Z',
            capacity: 30,
            booked: 30,
            available: 0,
            status: 'active',
          },
        ],
      },
    });

    apiPost.mockResolvedValue({ data: { ok: true } });

    render(
      <MemoryRouter initialEntries={['/public/forms/rome-tours']}>
        <Routes>
          <Route path="/public/forms/:slug" element={<PublicFormRenderer />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Rome Tours')).toBeInTheDocument();
    expect(screen.getByText('Select departure date')).toBeInTheDocument();

    const selector = screen.getByLabelText('Select departure date');
    fireEvent.change(selector, { target: { value: 'dep-a' } });

    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Amina S' } });
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/public/forms/rome-tours', {
        full_name: 'Amina S',
        departureId: 'dep-a',
        packageId: 'pkg-2',
      });
    });
  });
});

describe('PublicForms Embed Modal', () => {
  it('opens embed modal and displays copyable iframe code snippet', async () => {
    mockState.currentLang = 'en';
    getForms.mockResolvedValue([
      {
        id: 'f-1',
        title: 'Dubai Summer Form',
        slug: 'dubai-summer',
        active: true,
        fields: [{ id: 'name', label: 'Name', type: 'short_text', required: true }],
        updatedAt: '2026-08-01T12:00:00Z',
      },
    ]);
    getPackages.mockResolvedValue({ data: [] });
    getDepartures.mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <PublicForms />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Dubai Summer Form')).toBeInTheDocument();

    const embedBtn = screen.getByTitle('Embed');
    fireEvent.click(embedBtn);

    expect(await screen.findByText('Embed form on website')).toBeInTheDocument();
    expect(screen.getByText('Iframe embed code')).toBeInTheDocument();
    expect(screen.getByText(/<iframe src=".*\/public\/forms\/dubai-summer\?embed=1"/)).toBeInTheDocument();
  });
});
