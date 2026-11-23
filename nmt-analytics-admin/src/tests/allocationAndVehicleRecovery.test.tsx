import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { I18nProvider } from '../lib/i18n/context';
import { bs } from '../lib/i18n/bs';
import { en } from '../lib/i18n/en';
import DepartureAccommodationAllotment from '../components/departures/DepartureAccommodationAllotment';
import ManualBusSeating from '../components/operations/ManualBusSeating';
import HotelDetail from '../pages/HotelDetail';

const apiMocks = vi.hoisted(() => ({
  getDepartureAccommodationAllotments: vi.fn(),
  updateDepartureAccommodationAllotment: vi.fn(),
  getDepartureVehicle: vi.fn(),
  updateDepartureVehicle: vi.fn(),
  assignPassengerSeat: vi.fn(),
  lockPassengerSeat: vi.fn(),
  getDeparturePassengers: vi.fn(),
  getAllocationDepartures: vi.fn(),
  getDepartures: vi.fn(),
  getHotel: vi.fn(),
  getHotelRooms: vi.fn(),
  getHotelPackages: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../api/departures', () => ({
  getDepartureAccommodationAllotments: (...args: any[]) => apiMocks.getDepartureAccommodationAllotments(...args),
  updateDepartureAccommodationAllotment: (...args: any[]) => apiMocks.updateDepartureAccommodationAllotment(...args),
  getDepartureVehicle: (...args: any[]) => apiMocks.getDepartureVehicle(...args),
  updateDepartureVehicle: (...args: any[]) => apiMocks.updateDepartureVehicle(...args),
  assignPassengerSeat: (...args: any[]) => apiMocks.assignPassengerSeat(...args),
  lockPassengerSeat: (...args: any[]) => apiMocks.lockPassengerSeat(...args),
  getDeparturePassengers: (...args: any[]) => apiMocks.getDeparturePassengers(...args),
  getAllocationDepartures: (...args: any[]) => apiMocks.getAllocationDepartures(...args),
  getDepartures: (...args: any[]) => apiMocks.getDepartures(...args),
}));

vi.mock('../api/operations', () => ({
  getHotel: (...args: any[]) => apiMocks.getHotel(...args),
  getHotelRooms: (...args: any[]) => apiMocks.getHotelRooms(...args),
}));

vi.mock('../api/packageHotels', () => ({
  getHotelPackages: (...args: any[]) => apiMocks.getHotelPackages(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: apiMocks.toastSuccess, error: apiMocks.toastError }),
}));

const mockAppContext = { user: { id: 'u1', email: 'manager@test.local' }, loading: false };
vi.mock('../context/AppContext', () => ({
  useApp: () => mockAppContext,
}));

const baseAllotment = {
  id: 'alloc-1',
  departureId: 'dep-1',
  hotelId: 'hotel-1',
  packageHotelId: null,
  roomType: 'double',
  roomLabel: 'Double',
  templateRooms: 3,
  departureRooms: 3,
  roomsReserved: 3,
  capacityPerRoom: 2,
  capacity: 6,
  allocated: 1,
  available: 2,
  checkIn: '2026-11-01',
  checkOut: '2026-11-04',
  netPrice: 80,
  sellPrice: 110,
  pricePerNight: 80,
  sortOrder: 0,
  hotel: { id: 'hotel-1', name: 'Hotel Synthetic', destination: 'Sarajevo', stars: 4 },
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const baseVehicle = {
  vehicle: {
    id: 'veh-1',
    departure_id: 'dep-1',
    org_id: 'org-1',
    vehicle_label: 'Sprinter 1',
    registration_number: 'A12-K-345',
    capacity: 4,
    layout_type: 'standard_2_plus_2',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
  seats: [
    { id: 's1', seat_number: 1, seat_label: 'Seat 1', row_number: 1, column_index: 0, side: 'left', is_active: true },
    { id: 's2', seat_number: 2, seat_label: 'Seat 2', row_number: 1, column_index: 1, side: 'left', is_active: true },
    { id: 's3', seat_number: 3, seat_label: 'Seat 3', row_number: 1, column_index: 2, side: 'right', is_active: true },
    { id: 's4', seat_number: 4, seat_label: 'Seat 4', row_number: 1, column_index: 3, side: 'right', is_active: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('travline_lang', 'bs');
  apiMocks.getDeparturePassengers.mockResolvedValue({ manifest: [] });
});

describe('DepartureAccommodationAllotment recovery and localized errors', () => {
  it('offers localized retry on initial load failure and recovers inventory', async () => {
    apiMocks.getDepartureAccommodationAllotments
      .mockRejectedValueOnce({ status: 503, message: 'PRIVATE SQL error' })
      .mockResolvedValueOnce({ departureId: 'dep-1', items: [baseAllotment] });

    render(
      <I18nProvider>
        <DepartureAccommodationAllotment departureId="dep-1" />
      </I18nProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(bs.departure.accommodationAllotment.loadFailed);
    expect(alert.textContent).not.toContain('PRIVATE SQL error');

    const retryBtn = screen.getByRole('button', { name: (bs.departure.accommodationAllotment as any).retry });
    await userEvent.click(retryBtn);

    expect(await screen.findByText('Hotel Synthetic')).toBeInTheDocument();
  });

  it('localizes ROOM_SLOT_OCCUPIED in Bosnian, keeps draft, and blocks same-tick double submit', async () => {
    let release!: () => void;
    apiMocks.getDepartureAccommodationAllotments.mockResolvedValue({ departureId: 'dep-1', items: [baseAllotment] });
    apiMocks.updateDepartureAccommodationAllotment.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          release = () =>
            reject({ code: 'ROOM_SLOT_OCCUPIED', message: 'Cannot reduce room inventory because one of the removed room slots is occupied.' });
        }),
    );

    render(
      <I18nProvider>
        <DepartureAccommodationAllotment departureId="dep-1" />
      </I18nProvider>,
    );

    const input = await screen.findByDisplayValue('3');
    fireEvent.change(input, { target: { value: '1' } });
    const saveBtn = screen.getByRole('button', { name: bs.departure.accommodationAllotment.save });

    // Same-tick double submit
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);
    expect(apiMocks.updateDepartureAccommodationAllotment).toHaveBeenCalledTimes(1);

    release();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('Cannot reduce room inventory');
    expect(alert).toHaveTextContent((bs.departure.accommodationAllotment as any).roomSlotOccupied);
    // Draft stays preserved so operator can adjust and retry
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
  });
});

describe('HotelDetail complete counted departures lookup', () => {
  it('loads linked departures via getAllocationDepartures rather than truncated getDepartures(200)', async () => {
    apiMocks.getHotel.mockResolvedValue({
      id: 'hotel-1',
      orgId: 'org-1',
      name: 'Hotel Paginated',
      destination: 'Mostar',
      address: null,
      contact: null,
      totalRooms: 10,
      createdAt: '2026-11-01T00:00:00Z',
      rooms: [],
      allocations: [
        { id: 'alloc-201', departureId: 'dep-201', hotelId: 'hotel-1', roomType: 'double', roomsReserved: 2, checkIn: '2026-12-01', checkOut: '2026-12-03', pricePerNight: 50 },
      ],
    });
    apiMocks.getHotelRooms.mockResolvedValue([]);
    apiMocks.getHotelPackages.mockResolvedValue([]);
    apiMocks.getAllocationDepartures.mockResolvedValue([
      { id: 'dep-201', packageName: 'Departure #201', depart_at: '2026-12-01T08:00:00Z' },
    ]);

    render(
      <HelmetProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/operations/hotels/hotel-1']}>
            <Routes>
              <Route path="/operations/hotels/:id" element={<HotelDetail />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </HelmetProvider>,
    );

    expect(await screen.findByText('Departure #201')).toBeInTheDocument();
    expect(apiMocks.getAllocationDepartures).toHaveBeenCalledTimes(1);
    expect(apiMocks.getDepartures).not.toHaveBeenCalled();
  });
});

describe('ManualBusSeating fail-closed read and vehicle edit/reload recovery', () => {
  it('fails closed with retry on initial vehicle read error instead of showing blank creation form', async () => {
    localStorage.setItem('travline_lang', 'en');
    apiMocks.getDepartureVehicle
      .mockRejectedValueOnce({ status: 503, message: 'PRIVATE vehicle read failure' })
      .mockResolvedValueOnce(baseVehicle);

    render(
      <I18nProvider>
        <ManualBusSeating departureId="dep-1" transportType="bus" passengers={[]} />
      </I18nProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent((en.departure.busSeating as any).vehicleLoadFailed);
    expect(screen.queryByRole('button', { name: en.departure.busSeating.saveVehicle })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: (en.departure.busSeating as any).retryLoad }));
    expect(await screen.findByText('Sprinter 1')).toBeInTheDocument();
  });

  it('clears registration, syncs saved vehicle state, blocks same-tick double save, and maps vehicle error cleanly', async () => {
    localStorage.setItem('travline_lang', 'en');
    apiMocks.getDepartureVehicle.mockResolvedValue(baseVehicle);
    let release!: () => void;
    apiMocks.updateDepartureVehicle
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            release = () => reject({ code: 'INTERNAL_ERROR', message: 'PRIVATE DB failure' });
          }),
      )
      .mockResolvedValueOnce({
        vehicle: { ...baseVehicle.vehicle, vehicle_label: 'Sprinter Clean', registration_number: null, capacity: 5 },
        seats: [
          ...baseVehicle.seats,
          { id: 's5', seat_number: 5, seat_label: 'Seat 5', row_number: 2, column_index: 0, side: 'left', is_active: true },
        ],
      });

    render(
      <I18nProvider>
        <ManualBusSeating departureId="dep-1" transportType="bus" passengers={[]} />
      </I18nProvider>,
    );

    await screen.findByText('Sprinter 1');
    const labelInput = screen.getByLabelText(en.departure.busSeating.vehicleLabel);
    const regInput = screen.getByLabelText(en.departure.busSeating.registrationNumber);
    const capInput = screen.getByLabelText(en.departure.busSeating.capacity);
    const saveBtn = screen.getByRole('button', { name: en.departure.busSeating.saveVehicle });

    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, 'Sprinter Clean');
    await userEvent.clear(regInput);
    await userEvent.clear(capInput);
    await userEvent.type(capInput, '5');

    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);
    expect(apiMocks.updateDepartureVehicle).toHaveBeenCalledTimes(1);

    release();

    // Error must show vehicleSaveFailed (NOT assignError), and preserve draft
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.departure.busSeating.vehicleSaveFailed);
    expect(alert.textContent).not.toContain(en.departure.busSeating.assignError);
    expect(labelInput).toHaveValue('Sprinter Clean');
    expect(regInput).toHaveValue('');

    // Retry succeeds, shows success toast, and syncs state
    await userEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByText('Sprinter Clean')).toBeInTheDocument());
    expect(apiMocks.toastSuccess).toHaveBeenCalledWith(en.departure.busSeating.vehicleSaved);
    expect(regInput).toHaveValue('');
    expect(capInput).toHaveValue(5);
  });
});
