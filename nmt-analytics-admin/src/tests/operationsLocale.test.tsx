import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import Excursions from '../pages/operations/Excursions';
import CommissionRules from '../pages/operations/CommissionRules';
import SubAgents from '../pages/operations/SubAgents';
import Departures from '../pages/admin/Departures';
import Hotels from '../pages/operations/Hotels';
import SeatMap from '../components/operations/SeatMap';
import DepartureDetail from '../pages/DepartureDetail';

const mocks = vi.hoisted(() => ({
  getExcursionPassengers: vi.fn(),
  createExcursionPassenger: vi.fn(),
  deleteExcursionPassenger: vi.fn(),
  downloadBusListPDF: vi.fn(),
  downloadRumingListPDF: vi.fn(),
  getCommissionRules: vi.fn(),
  createCommissionRule: vi.fn(),
  updateCommissionRule: vi.fn(),
  deleteCommissionRule: vi.fn(),
  previewCommission: vi.fn(),
  getSubAgents: vi.fn(),
  createSubAgent: vi.fn(),
  deleteSubAgent: vi.fn(),
  issueSubAgentPortalToken: vi.fn(),
  revokeSubAgentPortalToken: vi.fn(),
  getHotels: vi.fn(),
  createHotel: vi.fn(),
  deleteHotel: vi.fn(),
  getHotelRooms: vi.fn(),
  createHotelRoom: vi.fn(),
  deleteHotelRoom: vi.fn(),
  createHotelAllocation: vi.fn(),
  getReservations: vi.fn(),
  getDepartures: vi.fn(),
  getAllocationDepartures: vi.fn(),
  getDeparture: vi.fn(),
  getDeparturePassengers: vi.fn(),
  getDepartureGroups: vi.fn(),
  getPassengerGroups: vi.fn(),
  getDepartureProfitability: vi.fn(),
  createDeparture: vi.fn(),
  updateDeparture: vi.fn(),
  deleteDeparture: vi.fn(),
  getPackages: vi.fn(),
  updatePassengerSeat: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../api/operations', () => ({
  getExcursionPassengers: (...args: any[]) => mocks.getExcursionPassengers(...args),
  createExcursionPassenger: (...args: any[]) => mocks.createExcursionPassenger(...args),
  deleteExcursionPassenger: (...args: any[]) => mocks.deleteExcursionPassenger(...args),
  downloadBusListPDF: (...args: any[]) => mocks.downloadBusListPDF(...args),
  downloadRumingListPDF: (...args: any[]) => mocks.downloadRumingListPDF(...args),
  getCommissionRules: (...args: any[]) => mocks.getCommissionRules(...args),
  createCommissionRule: (...args: any[]) => mocks.createCommissionRule(...args),
  updateCommissionRule: (...args: any[]) => mocks.updateCommissionRule(...args),
  deleteCommissionRule: (...args: any[]) => mocks.deleteCommissionRule(...args),
  previewCommission: (...args: any[]) => mocks.previewCommission(...args),
  getSubAgents: (...args: any[]) => mocks.getSubAgents(...args),
  createSubAgent: (...args: any[]) => mocks.createSubAgent(...args),
  deleteSubAgent: (...args: any[]) => mocks.deleteSubAgent(...args),
  issueSubAgentPortalToken: (...args: any[]) => mocks.issueSubAgentPortalToken(...args),
  revokeSubAgentPortalToken: (...args: any[]) => mocks.revokeSubAgentPortalToken(...args),
  getHotels: (...args: any[]) => mocks.getHotels(...args),
  createHotel: (...args: any[]) => mocks.createHotel(...args),
  deleteHotel: (...args: any[]) => mocks.deleteHotel(...args),
  getHotelRooms: (...args: any[]) => mocks.getHotelRooms(...args),
  createHotelRoom: (...args: any[]) => mocks.createHotelRoom(...args),
  deleteHotelRoom: (...args: any[]) => mocks.deleteHotelRoom(...args),
  createHotelAllocation: (...args: any[]) => mocks.createHotelAllocation(...args),
}));

vi.mock('../api/reservations', () => ({
  getReservations: (...args: any[]) => mocks.getReservations(...args),
}));

vi.mock('../api/departures', () => ({
  getDepartures: (...args: any[]) => mocks.getDepartures(...args),
  getAllocationDepartures: (...args: any[]) => mocks.getAllocationDepartures(...args),
  getDeparture: (...args: any[]) => mocks.getDeparture(...args),
  getDeparturePassengers: (...args: any[]) => mocks.getDeparturePassengers(...args),
  getDepartureGroups: (...args: any[]) => mocks.getDepartureGroups(...args),
  getPassengerGroups: (...args: any[]) => mocks.getPassengerGroups(...args),
  getDepartureProfitability: (...args: any[]) => mocks.getDepartureProfitability(...args),
  createDeparture: (...args: any[]) => mocks.createDeparture(...args),
  updateDeparture: (...args: any[]) => mocks.updateDeparture(...args),
  deleteDeparture: (...args: any[]) => mocks.deleteDeparture(...args),
  createDeparturePassenger: vi.fn(),
  deleteDeparturePassenger: vi.fn(),
  updateDeparturePassenger: vi.fn(),
  createDepartureCostItem: vi.fn(),
  updateDepartureCostItem: vi.fn(),
  deleteDepartureCostItem: vi.fn(),
  setCostItemConfirmation: vi.fn(),
  getSupplierConfirmationEvents: vi.fn(async () => []),
  updatePassengerSeat: (...args: any[]) => mocks.updatePassengerSeat(...args),
  downloadDepartureManifestPdf: vi.fn(),
  downloadDepartureManifestCsv: vi.fn(),
  downloadDepartureRoomingListPdf: vi.fn(),
  downloadDepartureRoomingListCsv: vi.fn(),
  downloadDepartureBusSeatingPdf: vi.fn(),
  downloadDepartureBusSeatingCsv: vi.fn(),
  downloadDepartureVouchersBatchPdf: vi.fn(),
}));

vi.mock('../api/packages', () => ({
  getPackages: (...args: any[]) => mocks.getPackages(...args),
}));

vi.mock('../api/flights', () => ({
  getFlights: vi.fn(async () => ({ data: [] })),
  getDepartureFlightSegments: vi.fn(async () => []),
  linkFlightToDeparture: vi.fn(),
  unlinkFlightFromDeparture: vi.fn(),
  reorderFlightSegments: vi.fn(),
}));

vi.mock('../api/suppliers', () => ({
  getSuppliers: vi.fn(async () => []),
}));

vi.mock('../api/manualMessaging', () => ({
  sendDepartureManualMessage: vi.fn(),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    user: { id: 'user-1' },
    userContext: { role: 'director' },
    loading: false,
  }),
}));

vi.mock('../icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../icons');
  const stub = () => <svg data-testid="icon" />;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) out[key] = stub;
  return out;
});

vi.mock('../components/common/PageMeta', () => ({ default: () => null }));

vi.mock('../components/operations/ManualBusSeating', () => ({ default: () => <div data-testid="manual-bus" /> }));
vi.mock('../components/operations/AutoSeatingPanel', () => ({ default: () => <div data-testid="auto-bus" /> }));
vi.mock('../components/departures/DepartureAccommodationPanel', () => ({ default: () => <div data-testid="dep-acc" /> }));
vi.mock('../components/operations/DrustvaTab', () => ({ default: () => <div data-testid="drustva-tab" /> }));
vi.mock('../components/communications/CommunicationHistoryPanel', () => ({ default: () => <div data-testid="comm-hist" /> }));
vi.mock('../components/communications/ManualMessageComposer', () => ({ default: () => <div data-testid="comm-comp" /> }));
vi.mock('../components/departures/SupplierPayablesPanel', () => ({ default: () => <div data-testid="sup-pay" /> }));
vi.mock('../components/departures/DepartureCalendarView', () => ({
  default: () => <div data-testid="dep-calendar" />,
}));

function wrap(ui: React.ReactNode, initialEntry = '/') {
  return render(
    <HelmetProvider>
      <I18nProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LanguageToggleButton />
          {ui}
        </MemoryRouter>
      </I18nProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('travline_lang', 'bs');
  mocks.getReservations.mockResolvedValue({
    data: [{ id: 'res-1', customerName: 'Synthetic Traveler', packageName: 'Mostar Tour', partySize: 2 }],
  });
  mocks.getPackages.mockResolvedValue({
    data: [{ id: 'pkg-1', name: 'Mostar Tour', destination: 'Mostar', currency: 'BAM' }],
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Batch C Operations BS/EN, locale & fail-closed recovery', () => {
  it('Excursions: fails closed with Retry on read error, formats locale money, and switches BS <-> EN cleanly', async () => {
    mocks.getExcursionPassengers.mockRejectedValueOnce(new Error('Synthetic private DB error'));
    wrap(<Excursions />);

    await screen.findByText('Mostar Tour', { exact: false });
    const select = screen.getByLabelText('Rezervacija');
    fireEvent.change(select, { target: { value: 'res-1' } });

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Putnike za ekskurziju nije moguće učitati');
    expect(screen.queryByText('Nema putnika')).not.toBeInTheDocument();

    mocks.getExcursionPassengers.mockResolvedValueOnce([
      {
        id: 'ex-1',
        reservationId: 'res-1',
        fullName: 'Amina Test',
        phone: '+38761111222',
        idDocument: 'B123',
        seatNumber: 4,
        paidAmount: 150,
        totalAmount: 200,
        debtAmount: 50,
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Ponovo učitaj putnike' }));
    await screen.findByText('Amina Test');
    expect(screen.getByText('Pristanak putnika')).toBeInTheDocument();
    expect(screen.getAllByText(/^150,00\s*KM$/).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
    expect(screen.getByText('Passenger consent')).toBeInTheDocument();
    expect(screen.getByText('Outstanding debt')).toBeInTheDocument();
    expect(screen.getAllByText(/^BAM\s*150\.00$/).length).toBeGreaterThanOrEqual(2);
  });

  it('CommissionRules: translates all UI copy, fails closed with Retry, and keeps preview inputs on language switch', async () => {
    mocks.getCommissionRules.mockRejectedValueOnce(new Error('SQL fail'));
    wrap(<CommissionRules />);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Pravila provizije nije moguće učitati');

    mocks.getCommissionRules.mockResolvedValueOnce([
      { id: 'r-1', partnerType: 'gold', serviceType: 'hotel', commissionPct: 12, markupPct: 5, isActive: true, priority: 10 },
    ]);
    mocks.previewCommission.mockResolvedValueOnce({
      matchedRule: { id: 'r-1', partnerType: 'gold', serviceType: 'hotel', commissionPct: 12, markupPct: 5, isActive: true, priority: 10 },
      commissionAmount: 120,
      finalAmount: 1120,
      breakdown: {},
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ponovo učitaj pravila' }));
    await screen.findByText('Aktivno');

    fireEvent.change(screen.getByLabelText('Iznos'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Izračunaj' }));
    await screen.findByText(/^120,00\s*KM$/);

    fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
    expect(screen.getByLabelText('Amount')).toHaveValue(1234);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/^BAM\s*120\.00$/)).toBeInTheDocument();
    expect(mocks.getCommissionRules).toHaveBeenCalledTimes(2);
  });

  it('SubAgents: translates headers, KPIs, badges and fails closed with Retry on read failure', async () => {
    mocks.getSubAgents.mockRejectedValueOnce(new Error('Internal trace'));
    wrap(<SubAgents />);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Subagente nije moguće učitati');
    expect(screen.queryByText('Nema sub agenata')).not.toBeInTheDocument();

    mocks.getSubAgents.mockResolvedValueOnce([
      {
        id: 'sa-1',
        name: 'Partner Adriatic',
        phone: '+38761000999',
        email: 'partner@test.invalid',
        commissionRate: 8,
        partnerType: 'gold',
        isActive: true,
        portalTokenExpiresAt: '2026-12-31T00:00:00Z',
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Ponovo učitaj subagente' }));
    await screen.findByText('Partner Adriatic');
    expect(screen.getByText('Ukupno')).toBeInTheDocument();
    expect(screen.getByText('Zlatni')).toBeInTheDocument();
    expect(screen.getByText('Aktivan')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(2);
  });

  it('Departures & DepartureFormModal: fails closed with Retry, translates labels, and retains modal draft on BS <-> EN switch', async () => {
    mocks.getDepartures.mockRejectedValueOnce(new Error('DB down'));
    wrap(<Departures />);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Polasci nisu učitani');

    mocks.getDepartures.mockResolvedValue({
      data: [
        {
          id: 'dep-1',
          package_id: 'pkg-1',
          packageName: 'Mostar Tour',
          destination: 'Mostar',
          depart_at: '2026-06-15T08:00:00Z',
          return_at: '2026-06-18T18:00:00Z',
          capacity: 40,
          booked: 10,
          status: 'active',
          transport_type: 'bus',
        },
      ],
      total: 1,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ponovo učitaj polaske' }));
    await screen.findByText('Mostar Tour');
    expect(screen.getByText('Dostupno')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj polazak' }));
    const capInput = await screen.findByLabelText(/Kapacitet/);
    fireEvent.change(capInput, { target: { value: '55' } });

    fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Capacity/)).toHaveValue(55);
    });
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('Hotels & SeatMap: translate room summary counts and seat map UI across BS and EN', async () => {
    mocks.getHotels.mockResolvedValue([
      {
        id: 'h-1',
        name: 'Hotel Evropa',
        destination: 'Sarajevo',
        address: 'Vladislava Skarića 5',
        contact: '+38733555666',
        rooms: [{ id: 'rm-1', roomType: 'Double', capacity: 2, total: 5, available: 4, basePrice: 120, currency: 'BAM' }],
        allocations: [],
      },
    ]);
    wrap(<Hotels />);
    await screen.findByText('Hotel Evropa');
    expect(screen.getByText('1 tip')).toBeInTheDocument();
    expect(screen.getByText('4 / 5 slobodno')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
    expect(screen.getByText('1 type')).toBeInTheDocument();
    expect(screen.getByText('4 / 5 available')).toBeInTheDocument();
  });

  it('SeatMap: renders BS and EN seat map controls and unavailable state', () => {
    wrap(
      <div>
        <SeatMap
          capacity={8}
          transportType="bus"
          editable
          passengers={[
            { id: 'p-1', passengerId: 'p-1', fullName: 'Merima Test', seat: null } as any,
          ]}
        />
        <SeatMap capacity={0} transportType="none" passengers={[]} />
      </div>,
    );

    expect(screen.getByText('Naprijed / Vozač')).toBeInTheDocument();
    expect(screen.getByText('Nedodijeljeni putnici')).toBeInTheDocument();
    expect(screen.getByText('Dodijeli sjedište')).toBeInTheDocument();
    expect(screen.getByText('Raspored sjedišta nije dostupan za ovaj tip prijevoza.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
    expect(screen.getByText('Front / Driver')).toBeInTheDocument();
    expect(screen.getByText('Unassigned passengers')).toBeInTheDocument();
    expect(screen.getByText('Assign seat')).toBeInTheDocument();
    expect(screen.getByText('Seat map not available for this transport type.')).toBeInTheDocument();
  });

  it('DepartureDetail: renders Trip Summary, readiness labels, grouping tab, and locale currency in BS and EN', async () => {
    mocks.getDeparture.mockResolvedValue({
      id: 'dep-99',
      package_id: 'pkg-1',
      packageName: 'Istanbul Proljeće',
      destination: 'Istanbul',
      depart_at: '2026-05-01T08:00:00Z',
      return_at: '2026-05-06T18:00:00Z',
      capacity: 40,
      booked: 2,
      status: 'active',
      transport_type: 'bus',
      capabilities: {
        hasBusTransport: true,
        hasFlight: false,
        hasAccommodation: false,
        hasManagedSeatLayout: false,
        needTravelDocuments: false,
      },
    });
    mocks.getDeparturePassengers.mockResolvedValue({
      manifest: [
        {
          id: 'p-1',
          fullName: 'Emir Putnik',
          phone: '+38761000111',
          reservationId: 'res-1',
          paidAmount: 250,
          debtAmount: 50,
          reservationStatus: 'confirmed',
        },
      ],
      summary: {
        totalGuests: 1,
        confirmedGuests: 1,
        totalPaid: 250,
        totalDebt: 50,
        currency: 'BAM',
        totalReservations: 1,
      },
    });
    mocks.getDepartureGroups.mockResolvedValue({ byHotel: [], byAgent: [] });
    mocks.getPassengerGroups.mockResolvedValue([]);
    mocks.getDepartureProfitability.mockResolvedValue(null);

    wrap(
      <Routes>
        <Route path="/departures/:id" element={<DepartureDetail />} />
      </Routes>,
      '/departures/dep-99',
    );

    await screen.findByRole('heading', { name: 'Istanbul Proljeće' });
    expect(screen.getByText('Sažetak putovanja')).toBeInTheDocument();
    expect(screen.getByText('Aktivan')).toBeInTheDocument();
    expect(screen.getByText(/^250,00\s*KM$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
    expect(screen.getByText('Trip summary')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/^BAM\s*250\.00$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Grouping/ }));
    expect(screen.getByText('Passengers grouped by hotel.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'By hotel' })).toBeInTheDocument();
  });
});
