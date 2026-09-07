import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewSaleWizard from '../components/reservations/NewSaleWizard';

const getPackages = vi.fn();
const getDepartures = vi.fn();
const getDepartureAccommodationOptions = vi.fn();
const getPackageServices = vi.fn();
const getCustomers = vi.fn();
const createReservation = vi.fn();
const createReservationInstallmentSchedule = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const onCreated = vi.fn();
const onClose = vi.fn();

vi.mock('../components/ui/modal', () => ({
  Modal: ({ isOpen, children, title }: any) => isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

vi.mock('../api/packages', () => ({ getPackages: (...args: any[]) => getPackages(...args) }));
vi.mock('../api/departures', () => ({
  getDepartures: (...args: any[]) => getDepartures(...args),
  getDepartureAccommodationOptions: (...args: any[]) => getDepartureAccommodationOptions(...args),
}));
vi.mock('../api/operations', () => ({ getPackageServices: (...args: any[]) => getPackageServices(...args) }));
vi.mock('../api/customers', () => ({ getCustomers: (...args: any[]) => getCustomers(...args) }));
vi.mock('../api/reservations', () => ({ createReservation: (...args: any[]) => createReservation(...args) }));
vi.mock('../api/installments', () => ({
  createReservationInstallmentSchedule: (...args: any[]) => createReservationInstallmentSchedule(...args),
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: toastSuccess, error: toastError }) }));

const pkg = {
  id: 'package-1',
  name: 'Dubai Escape 2027',
  destination: 'Dubai',
  price: 1200,
  base_price: 1200,
  currency: 'BAM',
  variants: [],
};

const departure = {
  id: 'departure-1',
  package_id: 'package-1',
  depart_at: '2027-05-15T04:00:00.000Z',
  return_at: '2027-05-22T14:00:00.000Z',
  booked: 0,
  capacity: 30,
  status: 'active',
  transport_type: 'flight',
  resolvedTravelerRequirements: {
    travelScope: 'international',
    documentType: 'passport',
    allowFillLater: true,
    requireExpiry: false,
    requireNationality: false,
    requireDateOfBirth: false,
  },
  capabilities: {
    transportType: 'flight',
    hasFlight: true,
    hasBusTransport: false,
    hasManagedSeatLayout: false,
    hasAccommodation: false,
    needTravelDocuments: true,
    travelerRequirements: {
      travelScope: 'international',
      documentType: 'passport',
      allowFillLater: true,
      requireExpiry: false,
      requireNationality: false,
      requireDateOfBirth: false,
    },
  },
};

async function renderWizard() {
  render(
    <NewSaleWizard
      isOpen
      onClose={onClose}
      onCreated={onCreated}
      initialPackageId="package-1"
      initialDepartureId="departure-1"
    />,
  );
  expect(await screen.findByText('Dubai Escape 2027')).toBeInTheDocument();
  await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-1'));
}

async function fillRequiredSaleFields() {
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByPlaceholderText('Npr. Ahmed Hodžić')).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
  fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Amina Hadžić' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByText('Ukupan iznos (BAM)')).toBeInTheDocument());
}

async function submitSale() {
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByText('Pregled prodaje')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));
}

describe('NewSaleWizard — M14.1 canonical installment schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [pkg] });
    getDepartures.mockResolvedValue({ data: [departure] });
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-1', items: [] });
    getPackageServices.mockResolvedValue([]);
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
    createReservationInstallmentSchedule.mockResolvedValue({ reservationId: 'reservation-1', installments: [] });
  });

  it('creates canonical installment schedule after reservation creation when Rate is selected', async () => {
    await renderWizard();
    await fillRequiredSaleFields();

    fireEvent.click(screen.getByRole('button', { name: 'Rate' }));
    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '4' } });
    await submitSale();

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createReservationInstallmentSchedule).toHaveBeenCalledTimes(1));
    expect(createReservationInstallmentSchedule).toHaveBeenCalledWith('reservation-1', 4);
    expect(toastSuccess).toHaveBeenCalledWith('Rezervacija kreirana');
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('does not create an installment schedule for full payment selection', async () => {
    await renderWizard();
    await fillRequiredSaleFields();
    await submitSale();

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservationInstallmentSchedule).not.toHaveBeenCalled();
  });
});
