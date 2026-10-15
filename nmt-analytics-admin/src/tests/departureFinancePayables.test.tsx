import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import DepartureDetail from '../pages/DepartureDetail';
import { en } from '../lib/i18n/en';
import { bs } from '../lib/i18n/bs';

let currentLang = 'en';

vi.mock('../lib/i18n/context', () => ({
  useTranslation: () => (currentLang === 'bs' ? bs : en),
  useT: () => ({ t: currentLang === 'bs' ? bs : en, lang: currentLang, setLang: vi.fn() }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../icons');
  const stub = () => <svg />;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) out[key] = stub;
  return out;
});

vi.mock('../components/ui/modal', () => ({
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));

vi.mock('../api/suppliers', () => ({ getSuppliers: vi.fn(async () => []) }));
vi.mock('../components/departures/SupplierPayablesPanel', () => ({ default: () => null }));
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/operations/ManualBusSeating', () => ({ default: () => null }));
vi.mock('../components/operations/AutoSeatingPanel', () => ({ default: () => null }));
vi.mock('../components/departures/DepartureAccommodationPanel', () => ({ default: () => null }));
vi.mock('../components/operations/DrustvaTab', () => ({ default: () => null }));
vi.mock('../components/communications/CommunicationHistoryPanel', () => ({ default: () => null }));
vi.mock('../components/communications/ManualMessageComposer', () => ({ default: () => null }));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ userContext: { role: 'manager' }, user: { id: 'user-1' }, loading: false }),
}));

vi.mock('../api/reservations', () => ({
  getReservations: vi.fn(async () => ({ data: [], total: 0, pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } })),
}));

vi.mock('../api/manualMessaging', () => ({
  sendDepartureManualMessage: vi.fn(),
}));

const mockGetDeparture = vi.fn();
const mockGetDepartureProfitability = vi.fn();

vi.mock('../api/departures', () => ({
  getDeparture: (...args: any[]) => mockGetDeparture(...args),
  getDeparturePassengers: vi.fn(async () => ({ manifest: [], summary: {} })),
  createDeparturePassenger: vi.fn(),
  deleteDeparturePassenger: vi.fn(),
  getDepartureGroups: vi.fn(async () => ({ byHotel: [], byAgent: [] })),
  getPassengerGroups: vi.fn(async () => []),
  getDepartureProfitability: (...args: any[]) => mockGetDepartureProfitability(...args),
  createDepartureCostItem: vi.fn(),
  updateDepartureCostItem: vi.fn(),
  deleteDepartureCostItem: vi.fn(),
  updateDeparture: vi.fn(),
  updateDeparturePassenger: vi.fn(),
}));

vi.mock('../api/flights', () => ({
  getFlights: vi.fn(async () => ({ data: [], total: 0 })),
  getDepartureFlightSegments: vi.fn(async () => []),
  linkFlightToDeparture: vi.fn(),
  unlinkFlightFromDeparture: vi.fn(),
  reorderFlightSegments: vi.fn(),
}));

vi.mock('../api/hotels', () => ({
  getHotels: vi.fn(async () => ({ data: [], total: 0 })),
}));

describe('DepartureDetail finance supplier payables integration', () => {
  beforeEach(() => {
    currentLang = 'en';
    mockGetDeparture.mockResolvedValue({
      id: 'd1',
      packageName: 'Antalya Summer',
      destination: 'Antalya',
      status: 'scheduled',
      currency: 'BAM',
      depart_at: '2026-10-20',
      return_at: '2026-10-27',
      packages: {
        id: 'pkg-1',
        name: 'Antalya Summer',
        currency: 'BAM',
        transport_type: 'bus',
      },
    });

    mockGetDepartureProfitability.mockResolvedValue({
      departureId: 'd1',
      currency: 'BAM',
      revenue: 10000,
      collected: 8000,
      outstanding: 2000,
      supplierCosts: 6000,
      estimatedGrossProfit: 4000,
      marginPct: 40,
      supplierObligationsIssued: 6000,
      supplierPaid: 3500,
      supplierOutstanding: 2500,
      realizedCashProfit: 4500, // 8000 collected - 3500 paid
      reservationCount: 5,
      costItems: [],
      costBreakdown: [],
      warnings: [],
    });
  });

  function renderView() {
    return render(
      <MemoryRouter initialEntries={['/departures/d1']}>
        <Routes>
          <Route path="/departures/:id" element={<DepartureDetail />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders complete customer and supplier financial cards including payables and realized cash in EN', async () => {
    currentLang = 'en';
    renderView();

    await screen.findByText('Antalya Summer');

    // Click on Finance tab
    const financeTab = await screen.findByRole('button', { name: en.departure.finance.title });
    fireEvent.click(financeTab);

    // Wait for profitability cards to load
    await screen.findByText(en.departure.finance.supplierPaid);

    expect(screen.getByText(en.departure.finance.revenue)).toBeInTheDocument();
    expect(screen.getAllByText(en.departure.finance.collected).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(en.departure.finance.outstanding).length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(en.departure.finance.supplierCosts)).toBeInTheDocument();
    expect(screen.getByText(en.departure.finance.supplierPaid)).toBeInTheDocument();
    expect(screen.getByText(en.departure.finance.supplierOutstanding)).toBeInTheDocument();

    expect(screen.getByText(en.departure.finance.grossProfit)).toBeInTheDocument();
    expect(screen.getByText(en.departure.finance.margin)).toBeInTheDocument();
    expect(screen.getByText(en.departure.finance.realizedCash)).toBeInTheDocument();
  });

  it('renders complete customer and supplier financial cards in BS', async () => {
    currentLang = 'bs';
    renderView();

    await screen.findByText('Antalya Summer');

    // Click on Finance tab
    const financeTab = await screen.findByRole('button', { name: bs.departure.finance.title });
    fireEvent.click(financeTab);

    // Wait for profitability cards to load
    await screen.findByText(bs.departure.finance.supplierPaid);

    expect(screen.getByText(bs.departure.finance.revenue)).toBeInTheDocument();
    expect(screen.getAllByText(bs.departure.finance.collected).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(bs.departure.finance.outstanding).length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(bs.departure.finance.supplierCosts)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.finance.supplierPaid)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.finance.supplierOutstanding)).toBeInTheDocument();

    expect(screen.getByText(bs.departure.finance.grossProfit)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.finance.margin)).toBeInTheDocument();
    expect(screen.getByText(bs.departure.finance.realizedCash)).toBeInTheDocument();
  });
});
