import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import DepartureDetail from '../pages/DepartureDetail';
import { en } from '../lib/i18n/en';
import { bs } from '../lib/i18n/bs';

let currentLang = 'bs';

vi.mock('../lib/i18n/context', () => ({
  useTranslation: () => (currentLang === 'bs' ? bs : en),
  useT: () => ({ t: currentLang === 'bs' ? bs : en, lang: currentLang, setLang: vi.fn() }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../icons');
  const stub = () => <svg data-testid="icon" />;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) out[key] = stub;
  return out;
});

vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/operations/ManualBusSeating', () => ({ default: () => null }));
vi.mock('../components/operations/AutoSeatingPanel', () => ({ default: () => null }));
vi.mock('../components/departures/DepartureAccommodationPanel', () => ({ default: () => null }));
vi.mock('../components/operations/DrustvaTab', () => ({ default: () => null }));
vi.mock('../components/communications/CommunicationHistoryPanel', () => ({ default: () => null }));
vi.mock('../components/communications/ManualMessageComposer', () => ({ default: () => null }));
vi.mock('../components/departures/SupplierPayablesPanel', () => ({ default: () => null }));
vi.mock('../api/suppliers', () => ({ getSuppliers: vi.fn(async () => []) }));

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    success: mockShowSuccess,
    error: mockShowError,
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ userContext: { role: 'manager' }, user: { id: 'user-1' }, loading: false }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('../api/manualMessaging', () => ({
  sendDepartureManualMessage: vi.fn(),
}));

vi.mock('../api/hotels', () => ({
  getHotels: vi.fn(async () => ({ data: [], total: 0 })),
}));

vi.mock('../api/reservations', () => ({
  getReservations: vi.fn(async () => ({ data: [], total: 0, pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } })),
}));

vi.mock('../api/flights', () => ({
  getFlights: vi.fn(async () => []),
  getDepartureFlightSegments: vi.fn(async () => []),
  linkFlightToDeparture: vi.fn(),
  unlinkFlightFromDeparture: vi.fn(),
  reorderFlightSegments: vi.fn(),
}));

const mockDownloadManifestPdf = vi.fn();
const mockDownloadManifestCsv = vi.fn();
const mockDownloadRoomingPdf = vi.fn();
const mockDownloadRoomingCsv = vi.fn();
const mockDownloadBusPdf = vi.fn();
const mockDownloadBusCsv = vi.fn();
const mockDownloadVouchersPdf = vi.fn();

const departureData = {
  id: 'dep-123',
  packageName: 'Istanbul Tura',
  destination: 'Istanbul',
  depart_at: '2026-05-01T08:00:00Z',
  return_at: '2026-05-06T18:00:00Z',
  capacity: 45,
  booked: 20,
  transport_type: 'bus',
  status: 'active',
  currency: 'BAM',
  hotelAllocations: [],
  packageHotels: [],
  capabilities: {
    hasBusTransport: true,
    hasFlight: false,
    hasAccommodation: true,
    hasManagedSeatLayout: true,
    needTravelDocuments: true,
  },
};

vi.mock('../api/departures', () => ({
  getDeparture: vi.fn(async () => departureData),
  getDeparturePassengers: vi.fn(async () => ({ manifest: [], summary: {} })),
  getDepartureGroups: vi.fn(async () => ({ byHotel: [], byAgent: [] })),
  getPassengerGroups: vi.fn(async () => []),
  getDepartureProfitability: vi.fn(async () => null),
  createDeparturePassenger: vi.fn(),
  deleteDeparturePassenger: vi.fn(),
  updateDeparturePassenger: vi.fn(),
  updateDeparture: vi.fn(),
  downloadDepartureManifestPdf: (...args: any[]) => mockDownloadManifestPdf(...args),
  downloadDepartureManifestCsv: (...args: any[]) => mockDownloadManifestCsv(...args),
  downloadDepartureRoomingListPdf: (...args: any[]) => mockDownloadRoomingPdf(...args),
  downloadDepartureRoomingListCsv: (...args: any[]) => mockDownloadRoomingCsv(...args),
  downloadDepartureBusSeatingPdf: (...args: any[]) => mockDownloadBusPdf(...args),
  downloadDepartureBusSeatingCsv: (...args: any[]) => mockDownloadBusCsv(...args),
  downloadDepartureVouchersBatchPdf: (...args: any[]) => mockDownloadVouchersPdf(...args),
}));

describe('Departure Operational Documents UI (M15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentLang = 'bs';

    // Mock URL.createObjectURL and revokeObjectURL
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();

    const dummyBlob = new Blob(['dummy content'], { type: 'application/pdf' });
    mockDownloadManifestPdf.mockResolvedValue(dummyBlob);
    mockDownloadManifestCsv.mockResolvedValue(new Blob(['csv content'], { type: 'text/csv' }));
    mockDownloadRoomingPdf.mockResolvedValue(dummyBlob);
    mockDownloadRoomingCsv.mockResolvedValue(new Blob(['csv content'], { type: 'text/csv' }));
    mockDownloadBusPdf.mockResolvedValue(dummyBlob);
    mockDownloadBusCsv.mockResolvedValue(new Blob(['csv content'], { type: 'text/csv' }));
    mockDownloadVouchersPdf.mockResolvedValue(dummyBlob);
  });

  it('renders Documents menu button and toggles options', async () => {
    render(
      <MemoryRouter initialEntries={['/departures/dep-123']}>
        <Routes>
          <Route path="/departures/:id" element={<DepartureDetail />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for departure to load
    expect(await screen.findByText('Istanbul Tura')).toBeInTheDocument();

    // Find the Documents dropdown button
    const docsBtn = screen.getByText(bs.departure.documentsMenu.title);
    expect(docsBtn).toBeInTheDocument();

    // Click to open dropdown
    fireEvent.click(docsBtn);

    // Verify all menu options appear
    expect(screen.getByText(bs.departure.documentsMenu.manifestPdf)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.documentsMenu.manifestCsv)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.documentsMenu.roomingPdf)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.documentsMenu.roomingCsv)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.documentsMenu.busSeatingPdf)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.documentsMenu.busSeatingCsv)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.documentsMenu.vouchersBatchPdf)).toBeInTheDocument();
  });

  it('triggers Manifest PDF download from dropdown', async () => {
    render(
      <MemoryRouter initialEntries={['/departures/dep-123']}>
        <Routes>
          <Route path="/departures/:id" element={<DepartureDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Istanbul Tura')).toBeInTheDocument();

    const docsBtn = screen.getByText(bs.departure.documentsMenu.title);
    fireEvent.click(docsBtn);

    const manifestPdfBtn = screen.getByText(bs.departure.documentsMenu.manifestPdf);
    fireEvent.click(manifestPdfBtn);

    await waitFor(() => {
      expect(mockDownloadManifestPdf).toHaveBeenCalledWith('dep-123');
      expect(mockShowSuccess).toHaveBeenCalledWith(bs.departure.documentsMenu.downloadSuccess);
    });
  });

  it('triggers Manifest CSV download from dropdown', async () => {
    render(
      <MemoryRouter initialEntries={['/departures/dep-123']}>
        <Routes>
          <Route path="/departures/:id" element={<DepartureDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Istanbul Tura')).toBeInTheDocument();

    const docsBtn = screen.getByText(bs.departure.documentsMenu.title);
    fireEvent.click(docsBtn);

    const manifestCsvBtn = screen.getByText(bs.departure.documentsMenu.manifestCsv);
    fireEvent.click(manifestCsvBtn);

    await waitFor(() => {
      expect(mockDownloadManifestCsv).toHaveBeenCalledWith('dep-123');
      expect(mockShowSuccess).toHaveBeenCalledWith(bs.departure.documentsMenu.downloadSuccess);
    });
  });

  it('triggers Rooming List and Bus Seating downloads', async () => {
    render(
      <MemoryRouter initialEntries={['/departures/dep-123']}>
        <Routes>
          <Route path="/departures/:id" element={<DepartureDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Istanbul Tura')).toBeInTheDocument();

    const docsBtn = screen.getByText(bs.departure.documentsMenu.title);
    fireEvent.click(docsBtn);

    const roomingPdfBtn = screen.getByText(bs.departure.documentsMenu.roomingPdf);
    fireEvent.click(roomingPdfBtn);

    await waitFor(() => {
      expect(mockDownloadRoomingPdf).toHaveBeenCalledWith('dep-123');
    });

    // Open menu again for bus seating
    fireEvent.click(docsBtn);
    const busPdfBtn = screen.getByText(bs.departure.documentsMenu.busSeatingPdf);
    fireEvent.click(busPdfBtn);

    await waitFor(() => {
      expect(mockDownloadBusPdf).toHaveBeenCalledWith('dep-123');
    });
  });

  it('renders quick manifest export buttons in the passengers tab', async () => {
    render(
      <MemoryRouter initialEntries={['/departures/dep-123?tab=passengers']}>
        <Routes>
          <Route path="/departures/:id" element={<DepartureDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Manifest (PDF)')).toBeInTheDocument();
    expect(screen.getByText('CSV / Excel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Manifest (PDF)'));
    await waitFor(() => {
      expect(mockDownloadManifestPdf).toHaveBeenCalledWith('dep-123');
    });

    fireEvent.click(screen.getByText('CSV / Excel'));
    await waitFor(() => {
      expect(mockDownloadManifestCsv).toHaveBeenCalledWith('dep-123');
    });
  });
});
