import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../api/packages', () => ({ getPackages: (...args: any[]) => getPackages(...args) }));
vi.mock('../api/departures', () => ({
  getDepartures: (...args: any[]) => getDepartures(...args),
  getDepartureAccommodationOptions: (...args: any[]) => getDepartureAccommodationOptions(...args),
}));
vi.mock('../api/operations', () => ({ getPackageServices: (...args: any[]) => getPackageServices(...args) }));
vi.mock('../api/customers', () => ({ getCustomers: (...args: any[]) => getCustomers(...args) }));
vi.mock('../api/reservations', () => ({ createReservation: (...args: any[]) => createReservation(...args) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: toastSuccess, error: toastError }) }));

const packageA = {
  id: 'package-a',
  name: 'Traveler Requirements Package',
  destination: 'Sarajevo',
  price: 1000,
  base_price: 1000,
  currency: 'BAM',
  variants: [],
};

const noneRequirements = {
  travelScope: 'domestic',
  documentType: 'none',
  allowFillLater: true,
  requireExpiry: false,
  requireNationality: false,
  requireDateOfBirth: false,
};

const passportFillLater = {
  travelScope: 'international',
  documentType: 'passport',
  allowFillLater: true,
  requireExpiry: true,
  requireNationality: false,
  requireDateOfBirth: false,
};

function departure(overrides: Record<string, any>) {
  const resolvedTravelerRequirements = overrides.resolvedTravelerRequirements || noneRequirements;
  return {
    id: overrides.id || 'departure-a',
    package_id: 'package-a',
    depart_at: '2027-06-10T08:00:00.000Z',
    return_at: '2027-06-17T18:00:00.000Z',
    booked: 0,
    capacity: 50,
    status: 'active',
    transport_type: overrides.transport_type || 'bus',
    resolvedTravelerRequirements,
    capabilities: {
      transportType: overrides.transport_type || 'bus',
      hasBusTransport: overrides.transport_type !== 'flight',
      hasFlight: overrides.transport_type === 'flight',
      hasManagedSeatLayout: false,
      hasAccommodation: false,
      needTravelDocuments: resolvedTravelerRequirements.documentType !== 'none',
      travelerRequirements: resolvedTravelerRequirements,
    },
  };
}

async function renderWizard(departures: any[], initialDepartureId = departures[0].id) {
  getPackages.mockResolvedValue({ data: [packageA] });
  getDepartures.mockResolvedValue({ data: departures });
  render(<NewSaleWizard isOpen onClose={vi.fn()} onCreated={vi.fn()} initialPackageId="package-a" initialDepartureId={initialDepartureId} />);
  expect(await screen.findByText('Traveler Requirements Package')).toBeInTheDocument();
  await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalled());
  await waitFor(() => expect(getPackageServices).toHaveBeenCalledWith('package-a'));
}

async function goToTravelers() {
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByPlaceholderText('Npr. Ahmed Hodžić')).toBeInTheDocument());
}

function fillCustomer() {
  fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Ahmed Hodžić' } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761111111' } });
}

function fillPassenger(index: number, name: string) {
  fireEvent.change(screen.getByPlaceholderText(`Putnik ${index} - puno ime`), { target: { value: name } });
}

function dateInputs() {
  return Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
}

async function continueToReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByText('Ukupan iznos (BAM)')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  await waitFor(() => expect(screen.getByText('Pregled prodaje')).toBeInTheDocument());
}

describe('NewSaleWizard — M06.2 traveler readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDepartureAccommodationOptions.mockResolvedValue({ items: [] });
    getPackageServices.mockResolvedValue([]);
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('domestic bus with documentType none shows only traveler names and can book', async () => {
    await renderWizard([departure({ id: 'domestic-bus', resolvedTravelerRequirements: noneRequirements })], 'domestic-bus');
    await goToTravelers();

    expect(screen.queryByPlaceholderText('Broj pasoša')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Broj lične karte')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Datum isteka putnika 1')).not.toBeInTheDocument();

    fillCustomer();
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    await waitFor(() => expect(screen.getByText('Ukupan iznos (BAM)')).toBeInTheDocument());
  });

  it('international bus shows passport fields, requires two traveler names, and allows fill later', async () => {
    await renderWizard([departure({ id: 'international-bus', resolvedTravelerRequirements: passportFillLater })], 'international-bus');
    await goToTravelers();
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } });

    expect(screen.getAllByPlaceholderText('Broj pasoša')).toHaveLength(2);
    expect(dateInputs()).toHaveLength(2);
    expect(screen.getByText('Podatke putnog dokumenta možete dopuniti kasnije.')).toBeInTheDocument();

    fillCustomer();
    fillPassenger(1, 'Ahmed Hodžić');
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Unesite ime putnika 2.')).toBeInTheDocument();

    fillPassenger(2, 'Amina Hodžić');
    await continueToReview();
    expect(screen.getByText(/1 spreman · 2 dopuniti kasnije|0 spremna · 2 dopuniti kasnije/)).toBeInTheDocument();
  });

  it('flight fill-later succeeds with traveler name and blank passport/expiry', async () => {
    await renderWizard([departure({ id: 'flight', transport_type: 'flight', resolvedTravelerRequirements: passportFillLater })], 'flight');
    await goToTravelers();
    fillCustomer();
    fillPassenger(1, 'Ahmed Hodžić');

    await continueToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservation.mock.calls[0][0].passengers).toEqual([
      { full_name: 'Ahmed Hodžić', id_document_type: 'passport', id_document_number: undefined, id_document_expiry: undefined, nationality: undefined, date_of_birth: undefined },
    ]);
  });

  it('required-now passport data blocks until number and expiry are entered', async () => {
    await renderWizard([departure({
      id: 'required-now',
      resolvedTravelerRequirements: { ...passportFillLater, allowFillLater: false },
    })], 'required-now');
    await goToTravelers();
    fillCustomer();
    fillPassenger(1, 'Ahmed Hodžić');

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Nedostaju obavezni putni podaci za putnika 1.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Broj pasoša'), { target: { value: 'P123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    expect(await screen.findByText('Nedostaju obavezni putni podaci za putnika 1.')).toBeInTheDocument();

    fireEvent.change(dateInputs()[0], { target: { value: '2028-06-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    await waitFor(() => expect(screen.getByText('Ukupan iznos (BAM)')).toBeInTheDocument());
  });

  it('selective nationality field follows fill-later behavior and DOB is hidden', async () => {
    await renderWizard([departure({
      id: 'selective',
      resolvedTravelerRequirements: {
        ...passportFillLater,
        requireNationality: true,
        requireDateOfBirth: false,
      },
    })], 'selective');
    await goToTravelers();

    expect(screen.getByPlaceholderText('Državljanstvo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Datum rođenja putnika 1')).not.toBeInTheDocument();

    fillCustomer();
    fillPassenger(1, 'Ahmed Hodžić');
    await continueToReview();
    expect(screen.getByText(/dopuniti kasnije/)).toBeInTheDocument();
  });

  it('id-card requirements show ID-card label and submit id_card payload', async () => {
    await renderWizard([departure({
      id: 'id-card',
      resolvedTravelerRequirements: {
        travelScope: 'domestic',
        documentType: 'id_card',
        allowFillLater: true,
        requireExpiry: false,
        requireNationality: false,
        requireDateOfBirth: false,
      },
    })], 'id-card');
    await goToTravelers();

    expect(screen.getByPlaceholderText('Broj lične karte')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Broj pasoša')).not.toBeInTheDocument();

    fillCustomer();
    fillPassenger(1, 'Ahmed Hodžić');
    fireEvent.change(screen.getByPlaceholderText('Broj lične karte'), { target: { value: 'LK123' } });
    await continueToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservation.mock.calls[0][0].passengers[0]).toMatchObject({
      id_document_type: 'id_card',
      id_document_number: 'LK123',
    });
  });

  it('clears stale passport data when switching to a documentType none departure', async () => {
    const passportDeparture = departure({ id: 'passport-dep', resolvedTravelerRequirements: passportFillLater });
    const domesticDeparture = departure({ id: 'domestic-dep', resolvedTravelerRequirements: noneRequirements });
    await renderWizard([passportDeparture, domesticDeparture], 'passport-dep');

    await goToTravelers();
    fillCustomer();
    fillPassenger(1, 'Ahmed Hodžić');
    fireEvent.change(screen.getByPlaceholderText('Broj pasoša'), { target: { value: 'P123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }));
    const departureButtons = screen.getAllByRole('button').filter((button) => button.textContent?.includes('50 mjesta'));
    fireEvent.click(departureButtons[1]);
    await goToTravelers();

    await continueToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));

    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));
    expect(createReservation.mock.calls[0][0].passengers).toEqual([
      { full_name: 'Ahmed Hodžić' },
    ]);
  });
});
