import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useT } from '../lib/i18n/context';
import { render } from './renderWithI18n';
import NewSaleWizard from '../components/reservations/NewSaleWizard';

const getPackages = vi.fn();
const getDepartures = vi.fn();
const getDepartureAccommodationOptions = vi.fn();
const getPackageServices = vi.fn();
const getCustomers = vi.fn();
const createReservation = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../components/ui/modal', () => ({
  Modal: ({ isOpen, children, title }: any) => isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

vi.mock('../api/packages', () => ({
  getPackages: (...args: any[]) => getPackages(...args),
}));

vi.mock('../api/departures', () => ({
  getDepartures: (...args: any[]) => getDepartures(...args),
  getDepartureAccommodationOptions: (...args: any[]) => getDepartureAccommodationOptions(...args),
}));

vi.mock('../api/customers', () => ({
  getCustomers: (...args: any[]) => getCustomers(...args),
}));

vi.mock('../api/reservations', () => ({
  createReservation: (...args: any[]) => createReservation(...args),
}));

vi.mock('../api/operations', () => ({
  getPackageServices: (...args: any[]) => getPackageServices(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

const pkg = {
  id: 'package-1',
  name: 'Antalya Summer 2027',
  destination: 'Antalya',
  price: 990,
  base_price: 990,
  currency: 'BAM',
  variants: [],
};

const busDeparture = {
  id: 'departure-1',
  package_id: 'package-1',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 0,
  capacity: 50,
  status: 'active',
  transport_type: 'bus',
};

const accommodationOption = {
  id: 'allocation-double',
  departureId: 'departure-1',
  hotelId: 'hotel-1',
  roomType: 'double',
  roomLabel: 'Double',
  departureRooms: 10,
  reservedRooms: 0,
  availableRooms: 10,
  capacityPerRoom: 2,
  availableGuestCapacity: 20,
  unitSellPrice: 790,
  unitNetPrice: 650,
  checkIn: '2027-06-10',
  checkOut: '2027-06-17',
  hotel: { id: 'hotel-1', name: 'Hotel Azure Antalya', destination: 'Antalya', stars: 5 },
};

function LanguageSwitch() {
  const { toggleLang } = useT();
  return <button onClick={toggleLang}>Switch test language</button>;
}
async function renderWizard() {
  // Finish mocked departure/accommodation/service reads before interacting.
  await act(async () => {
    render(
    <><LanguageSwitch /><NewSaleWizard
      isOpen
      onClose={vi.fn()}
      onCreated={vi.fn()}
      initialPackageId="package-1"
      initialDepartureId="departure-1"
    /></>,
    );
  });
}


beforeEach(() => {
  vi.clearAllMocks(); localStorage.setItem('travline_lang', 'en');
  getPackages.mockResolvedValue({ data: [pkg] });
  getDepartures.mockResolvedValue({ data: [busDeparture] });
  getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [] });
  getPackageServices.mockResolvedValue([]); getCustomers.mockResolvedValue({ data: [] });
  createReservation.mockResolvedValue({ id: 'reservation-1' });
});

it('translates the full simple sale and a visible validation error without clearing its draft', async () => {
  await renderWizard(); await screen.findByText('Antalya Summer 2027');
  expect(screen.getByRole('dialog', { name: 'New sale' })).toBeInTheDocument();
  expect(screen.getByText('Client and travelers')).toBeInTheDocument();
  expect(screen.getByText(/BAM\s*990\.00/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Enter the client name.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch test language' }));
  expect(screen.getByText('Unesite ime klijenta.')).toBeInTheDocument();
  expect(screen.queryByText('Enter the client name.')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Synthetic client' } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Switch test language' }));
  expect(screen.getByPlaceholderText('e.g. Ahmed Hodžić')).toHaveValue('Synthetic client');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Payment plan')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('0.00')).toHaveValue(990);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Sale review')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm sale' }));
  await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
  expect(createReservation.mock.calls[0][0]).toMatchObject({
    customerName: 'Synthetic client', customerPhone: '+38761000000', totalAmount: 990,
    partySize: 1, source: 'agent', status: 'pending', departureId: 'departure-1',
    options: { package_id: 'package-1', payment_plan: 'full', base_total_at_booking: 990, total_at_booking: 990 },
  });
});

it('localizes conditional accommodation/add-ons, mandatory documents and the review without changing payload identifiers', async () => {
  getDepartures.mockResolvedValue({ data: [{ ...busDeparture, resolvedTravelerRequirements: { documentType: 'id_card', allowFillLater: false, requireExpiry: true, requireNationality: true, requireDateOfBirth: true } }] });
  getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [accommodationOption] });
  getPackageServices.mockResolvedValue([{ id: 'insurance', packageId: 'package-1', serviceType: 'insurance', providerName: 'Synthetic Insurance', unitPrice: 20, currency: 'BAM', isOptional: true }]);
  await renderWizard(); await screen.findByText('Antalya Summer 2027');
  await waitFor(() => expect(screen.getByText('Accommodation')).toBeInTheDocument());
  expect(screen.getByText('Add-ons')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByPlaceholderText('e.g. Ahmed Hodžić'), { target: { value: 'Synthetic client' } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761000000' } });
  fireEvent.change(screen.getByPlaceholderText('Traveler 1 - full name'), { target: { value: 'Synthetic traveler' } });
  fireEvent.change(screen.getByLabelText('Identity card number for traveler 1'), { target: { value: 'SYNTHETIC-ID' } });
  fireEvent.change(screen.getByLabelText('Expiry date for traveler 1'), { target: { value: '2045-12-31' } });
  fireEvent.change(screen.getByLabelText('Nationality for traveler 1'), { target: { value: 'BA' } });
  fireEvent.change(screen.getByLabelText('Date of birth for traveler 1'), { target: { value: '1990-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Hotel Azure Antalya');
  fireEvent.click(screen.getByText('Hotel Azure Antalya').closest('button')!);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Synthetic Insurance');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Synthetic Insurance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Sale review');
  expect(screen.getByText('Travel documents')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch test language' }));
  await screen.findByText('Pregled prodaje');
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));
  await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
  expect(createReservation.mock.calls[0][0]).toMatchObject({
    totalAmount: 1800,
    selectedAddons: [{ serviceId: 'insurance', quantity: 1 }],
    accommodationRequirements: [{ hotelAllocationId: 'allocation-double', roomCount: 1, guestsExpected: 1, passengerIndexes: [0] }],
    passengers: [{ full_name: 'Synthetic traveler', id_document_type: 'id_card', id_document_number: 'SYNTHETIC-ID', nationality: 'BA' }],
    options: { package_id: 'package-1', payment_plan: 'full', addons_total_at_booking: 20 },
  });
});

it('uses a localized fallback for unrecognized API failures', async () => {
  createReservation.mockRejectedValue(new Error('server-only diagnostic'));
  await renderWizard(); await screen.findByText('Antalya Summer 2027');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByPlaceholderText('e.g. Ahmed Hodžić'), { target: { value: 'Synthetic client' } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' })); fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm sale' }));
  await waitFor(() => expect(toastError).toHaveBeenCalledWith('The reservation could not be created. Please retry.'));
  expect(toastError).not.toHaveBeenCalledWith('server-only diagnostic');
});
