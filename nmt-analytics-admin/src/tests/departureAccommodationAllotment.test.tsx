import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DepartureAccommodationAllotment from '../components/departures/DepartureAccommodationAllotment';

const getDepartureAccommodationAllotments = vi.fn();
const updateDepartureAccommodationAllotment = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const useTMock = vi.hoisted(() =>
  vi.fn(() => ({
    t: {
      departure: {
        accommodationAllotment: {
          loading: 'Loading accommodation inventory…',
          loadFailed: 'Failed to load departure accommodation.',
          emptyTitle: 'No accommodation inventory',
          emptyDescription: 'This departure does not have package accommodation materialized yet.',
          unknownHotel: 'Hotel',
          templateRooms: 'Package/template',
          departureRooms: 'This departure',
          capacity: 'Capacity',
          allocated: 'Allocated',
          available: 'Available',
          pricing: 'Net / Sell',
          save: 'Save',
          saving: 'Saving…',
          saveSuccess: 'Accommodation inventory updated',
          saveFailed: 'Failed to update accommodation inventory',
          invalidRooms: 'Room count must be zero or greater',
        },
      },
    },
  })),
);

vi.mock('../api/departures', () => ({
  getDepartureAccommodationAllotments: (...args: any[]) => getDepartureAccommodationAllotments(...args),
  updateDepartureAccommodationAllotment: (...args: any[]) => updateDepartureAccommodationAllotment(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

vi.mock('../lib/i18n/context', () => ({
  useT: () => useTMock(),
}));

const allotment = {
  id: 'allocation-1',
  departureId: 'departure-1',
  hotelId: 'hotel-1',
  packageHotelId: 'package-hotel-1',
  roomType: 'double',
  roomLabel: 'Double',
  templateRooms: 20,
  departureRooms: 20,
  roomsReserved: 20,
  capacityPerRoom: 2,
  capacity: 40,
  allocated: 0,
  available: 20,
  checkIn: '2026-09-10',
  checkOut: '2026-09-17',
  netPrice: 80,
  sellPrice: 110,
  pricePerNight: 80,
  sortOrder: 1,
  hotel: { id: 'hotel-1', name: 'Hotel Grand', destination: 'Istanbul', stars: 5 },
  createdAt: '2026-08-30T12:00:00.000Z',
  updatedAt: '2026-08-30T12:00:00.000Z',
};

describe('DepartureAccommodationAllotment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTMock.mockReturnValue({
      t: {
        departure: {
          accommodationAllotment: {
            loading: 'Loading accommodation inventory…',
            loadFailed: 'Failed to load departure accommodation.',
            emptyTitle: 'No accommodation inventory',
            emptyDescription: 'This departure does not have package accommodation materialized yet.',
            unknownHotel: 'Hotel',
            templateRooms: 'Package/template',
            departureRooms: 'This departure',
            capacity: 'Capacity',
            allocated: 'Allocated',
            available: 'Available',
            pricing: 'Net / Sell',
            save: 'Save',
            saving: 'Saving…',
            saveSuccess: 'Accommodation inventory updated',
            saveFailed: 'Failed to update accommodation inventory',
            invalidRooms: 'Room count must be zero or greater',
          },
        },
      },
    });
    getDepartureAccommodationAllotments.mockResolvedValue({ departureId: 'departure-1', items: [allotment] });
    updateDepartureAccommodationAllotment.mockImplementation(async (_departureId, _itemId, roomCount) => ({
      ...allotment,
      departureRooms: roomCount,
      roomsReserved: roomCount,
      capacity: roomCount * allotment.capacityPerRoom,
      available: roomCount,
    }));
  });

  it('renders departure-specific accommodation inventory from the allotment API', async () => {
    render(<DepartureAccommodationAllotment departureId="departure-1" />);

    expect(await screen.findByText('Hotel Grand')).toBeInTheDocument();
    expect(screen.getByText('Istanbul')).toBeInTheDocument();
    expect(screen.getByText('Double')).toBeInTheDocument();
    expect(screen.getByText('Package/template')).toBeInTheDocument();
    expect(screen.getByText('This departure')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(getDepartureAccommodationAllotments).toHaveBeenCalledWith('departure-1');
  });

  it('persists only the edited departure room quantity', async () => {
    render(<DepartureAccommodationAllotment departureId="departure-1" />);

    const card = await screen.findByText('Hotel Grand');
    const section = card.closest('section')!;
    const input = within(section).getByDisplayValue('20');

    fireEvent.change(input, { target: { value: '18' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateDepartureAccommodationAllotment).toHaveBeenCalledWith('departure-1', 'allocation-1', 18);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Accommodation inventory updated');
    expect(await within(section).findByDisplayValue('18')).toBeInTheDocument();
  });

  it('keeps API failures visible when an override save fails', async () => {
    updateDepartureAccommodationAllotment.mockRejectedValueOnce(new Error('Cannot save allotment'));
    render(<DepartureAccommodationAllotment departureId="departure-1" />);

    const card = await screen.findByText('Hotel Grand');
    const section = card.closest('section')!;
    fireEvent.change(within(section).getByDisplayValue('20'), { target: { value: '18' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Cannot save allotment')).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith('Cannot save allotment');
  });

  it('renders fallback load failure text instead of crashing when translations are missing', async () => {
    useTMock.mockReturnValue({ t: { departure: {} } } as any);
    getDepartureAccommodationAllotments.mockRejectedValueOnce(new Error());

    render(<DepartureAccommodationAllotment departureId="departure-1" />);

    expect(await screen.findByText('Failed to load departure accommodation.')).toBeInTheDocument();
  });
});
