import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../api/operations', () => ({
  getPackageServices: (...args: any[]) => getPackageServices(...args),
}));

vi.mock('../api/customers', () => ({
  getCustomers: (...args: any[]) => getCustomers(...args),
}));

vi.mock('../api/reservations', () => ({
  createReservation: (...args: any[]) => createReservation(...args),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

const packageA = {
  id: 'package-a',
  name: 'Antalya Summer 2027',
  destination: 'Antalya',
  price: 1000,
  base_price: 1000,
  currency: 'BAM',
  variants: [],
};

const packageB = {
  id: 'package-b',
  name: 'Istanbul Weekend',
  destination: 'Istanbul',
  price: 800,
  base_price: 800,
  currency: 'BAM',
  variants: [],
};

const departureA = {
  id: 'departure-a',
  package_id: 'package-a',
  depart_at: '2027-06-10T08:00:00.000Z',
  return_at: '2027-06-17T18:00:00.000Z',
  booked: 0,
  capacity: 50,
  status: 'active',
  transport_type: 'flight',
};

const departureB = {
  id: 'departure-b',
  package_id: 'package-b',
  depart_at: '2027-07-10T08:00:00.000Z',
  return_at: '2027-07-12T18:00:00.000Z',
  booked: 0,
  capacity: 30,
  status: 'active',
  transport_type: 'bus',
};

const includedHotel = {
  id: 'service-included-hotel',
  packageId: 'package-a',
  serviceType: 'hotel',
  providerName: 'Included Hotel',
  providerContact: null,
  unitPrice: 300,
  currency: 'BAM',
  quantity: 1,
  totalPrice: 300,
  description: 'Included in package price',
  isOptional: false,
  createdAt: '2027-01-01T00:00:00.000Z',
};

const insurance = {
  id: 'service-insurance',
  packageId: 'package-a',
  serviceType: 'insurance',
  providerName: 'Travel insurance',
  providerContact: null,
  unitPrice: 50,
  currency: 'BAM',
  quantity: 1,
  totalPrice: 50,
  description: 'Medical and baggage coverage',
  isOptional: true,
  createdAt: '2027-01-01T00:00:00.000Z',
};

const transfer = {
  id: 'service-transfer',
  packageId: 'package-a',
  serviceType: 'transport',
  providerName: 'Airport transfer',
  providerContact: null,
  unitPrice: 25,
  currency: 'BAM',
  quantity: 1,
  totalPrice: 25,
  description: 'Airport to hotel transfer',
  isOptional: true,
  createdAt: '2027-01-01T00:00:00.000Z',
};

const excursion = {
  id: 'service-excursion',
  packageId: 'package-b',
  serviceType: 'tour',
  providerName: 'Bosphorus excursion',
  providerContact: null,
  unitPrice: 75,
  currency: 'BAM',
  quantity: 1,
  totalPrice: 75,
  description: 'Optional boat tour',
  isOptional: true,
  createdAt: '2027-01-01T00:00:00.000Z',
};

function servicesForPackage(packageId: string) {
  if (packageId === 'package-a') return [includedHotel, insurance, transfer];
  if (packageId === 'package-b') return [excursion];
  return [];
}

function departuresForPackage(packageId: string) {
  if (packageId === 'package-a') return [departureA];
  if (packageId === 'package-b') return [departureB];
  return [];
}

function renderWizard(initialPackageId = 'package-a', initialDepartureId = 'departure-a') {
  render(
    <NewSaleWizard
      isOpen
      onClose={vi.fn()}
      onCreated={vi.fn()}
      initialPackageId={initialPackageId}
      initialDepartureId={initialDepartureId}
    />,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function goToTravelers() {
  expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
  await waitFor(() => expect(getPackageServices).toHaveBeenCalledWith('package-a'));
  await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
}

async function fillTraveler() {
  await goToTravelers();
  fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
  fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
  fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Amina Hadžić' } });
}

async function goToAddons() {
  await fillTraveler();
  fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
  expect(await screen.findByRole('heading', { name: 'Add-ons' })).toBeInTheDocument();
}

describe('NewSaleWizard — M05.1 optional add-ons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPackages.mockResolvedValue({ data: [packageA, packageB] });
    getDepartures.mockImplementation(({ packageId }: any) => Promise.resolve({ data: departuresForPackage(packageId) }));
    getPackageServices.mockImplementation((packageId: string) => Promise.resolve(servicesForPackage(packageId)));
    getDepartureAccommodationOptions.mockResolvedValue({ departureId: 'departure-a', items: [] });
    getCustomers.mockResolvedValue({ data: [] });
    createReservation.mockResolvedValue({ id: 'reservation-1' });
  });

  it('blocks navigation past the pre-add-ons step while package services are loading', async () => {
    const servicesRequest = deferred<any[]>();
    getPackageServices.mockReturnValue(servicesRequest.promise);
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
    await waitFor(() => expect(getPackageServices).toHaveBeenCalledWith('package-a'));
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Amina Hadžić' } });

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(screen.queryByText('Ukupan iznos (BAM)')).not.toBeInTheDocument();
    expect(screen.getAllByText('Dodatne usluge se još učitavaju...').length).toBeGreaterThan(0);

    await act(async () => {
      servicesRequest.resolve([insurance]);
      await servicesRequest.promise;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByRole('heading', { name: 'Add-ons' })).toBeInTheDocument();
    expect(screen.getByText('Travel insurance')).toBeInTheDocument();
  });

  it('shows a recoverable package-services error before Payment', async () => {
    const failedRequest = deferred<any[]>();
    getPackageServices.mockReturnValueOnce(failedRequest.promise);
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
    await waitFor(() => expect(getPackageServices).toHaveBeenCalledWith('package-a'));

    await act(async () => {
      failedRequest.reject(new Error('network'));
      await failedRequest.promise.catch(() => undefined);
    });

    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Amina Hadžić' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(screen.queryByText('Ukupan iznos (BAM)')).not.toBeInTheDocument();
    expect(screen.getAllByText('Nije moguće učitati dodatne usluge za ovaj paket.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Pokušajte ponovo' })).toBeInTheDocument();

    const retryRequest = deferred<any[]>();
    getPackageServices.mockReturnValueOnce(retryRequest.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Pokušajte ponovo' }));

    await act(async () => {
      retryRequest.resolve([insurance]);
      await retryRequest.promise;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByRole('heading', { name: 'Add-ons' })).toBeInTheDocument();
    expect(screen.getByText('Travel insurance')).toBeInTheDocument();
  });

  it('ignores stale out-of-order package-services responses after package changes', async () => {
    const packageARequest = deferred<any[]>();
    const packageBRequest = deferred<any[]>();
    getPackageServices.mockImplementation((packageId: string) => {
      if (packageId === 'package-a') return packageARequest.promise;
      if (packageId === 'package-b') return packageBRequest.promise;
      return Promise.resolve([]);
    });
    renderWizard();

    expect(await screen.findByText('Antalya Summer 2027')).toBeInTheDocument();
    await waitFor(() => expect(getPackageServices).toHaveBeenCalledWith('package-a'));
    fireEvent.click(screen.getByText('Istanbul Weekend'));
    await waitFor(() => expect(getPackageServices).toHaveBeenCalledWith('package-b'));

    await act(async () => {
      packageBRequest.resolve([excursion]);
      await packageBRequest.promise;
    });
    await act(async () => {
      packageARequest.resolve([insurance]);
      await packageARequest.promise;
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Amina Hadžić' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByRole('heading', { name: 'Add-ons' })).toBeInTheDocument();
    expect(screen.getByText('Bosphorus excursion')).toBeInTheDocument();
    expect(screen.queryByText('Travel insurance')).not.toBeInTheDocument();
  });

  it('scopes selectable add-ons to optional services from the selected package', async () => {
    renderWizard();
    await goToAddons();

    expect(screen.getByText('Travel insurance')).toBeInTheDocument();
    expect(screen.getByText('Airport transfer')).toBeInTheDocument();
    expect(screen.queryByText('Included Hotel')).not.toBeInTheDocument();
    expect(screen.queryByText('Bosphorus excursion')).not.toBeInTheDocument();
  });

  it('shows Add-ons only when the selected package has optional services', async () => {
    getPackageServices.mockResolvedValue([]);
    renderWizard();

    await fillTraveler();
    expect(screen.queryByText('Add-ons')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Ukupan iznos (BAM)')).toBeInTheDocument();
  });

  it('selects and unselects an optional add-on', async () => {
    renderWizard();
    await goToAddons();

    const insuranceCheckbox = screen.getByRole('checkbox', { name: 'Odaberi Travel insurance' });
    expect(insuranceCheckbox).not.toBeChecked();

    fireEvent.click(insuranceCheckbox);
    expect(insuranceCheckbox).toBeChecked();
    expect(screen.getByText('Ukupno 50 BAM')).toBeInTheDocument();

    fireEvent.click(insuranceCheckbox);
    expect(insuranceCheckbox).not.toBeChecked();
    expect(screen.queryByText('Ukupno 50 BAM')).not.toBeInTheDocument();
  });

  it('adds selected add-ons to the displayed total without double-counting included services', async () => {
    renderWizard();
    await goToAddons();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Odaberi Travel insurance' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Odaberi Airport transfer' }));
    fireEvent.change(screen.getAllByDisplayValue('1')[1], { target: { value: '2' } });

    expect(screen.getByText('Add-ons ukupno').parentElement).toHaveTextContent('100 BAM');
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Ukupan iznos (BAM)')).toBeInTheDocument();
    const paymentAddonsRows = screen.getAllByText('Add-ons');
    expect(paymentAddonsRows[paymentAddonsRows.length - 1].parentElement).toHaveTextContent('100 BAM');
    expect(screen.getByText('Ukupno').parentElement).toHaveTextContent('1100 BAM');
  });

  it('shows selected add-ons on Review and keeps createReservation payload unchanged', async () => {
    renderWizard();
    await goToAddons();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Odaberi Travel insurance' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Odaberi Airport transfer' }));
    fireEvent.change(screen.getAllByDisplayValue('1')[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByText('Pregled prodaje')).toBeInTheDocument();
    const reviewAddonsRows = screen.getAllByText('Add-ons');
    expect(reviewAddonsRows[reviewAddonsRows.length - 1].parentElement).toHaveTextContent('Travel insurance × 1 — 50 BAM');
    expect(reviewAddonsRows[reviewAddonsRows.length - 1].parentElement).toHaveTextContent('Airport transfer × 2 — 50 BAM');
    expect(screen.getByText('Add-ons ukupno').parentElement).toHaveTextContent('100 BAM');
    expect(screen.getByText('Ukupno').parentElement).toHaveTextContent('1100 BAM');

    fireEvent.click(screen.getByRole('button', { name: 'Potvrdi prodaju' }));
    await waitFor(() => expect(createReservation).toHaveBeenCalledTimes(1));

    const payload = createReservation.mock.calls[0][0];
    expect(payload.totalAmount).toBe(1000);
    expect(payload.options.total_at_booking).toBe(1000);
    expect(payload.options.optional_addons).toBeUndefined();
    expect(payload.selectedServiceIds).toBeUndefined();
  });

  it('resets selected add-ons when the package changes', async () => {
    renderWizard();
    await goToAddons();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Odaberi Travel insurance' }));
    expect(screen.getByRole('checkbox', { name: 'Odaberi Travel insurance' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }));
    fireEvent.click(screen.getByText('Istanbul Weekend'));

    await waitFor(() => expect(getPackageServices).toHaveBeenCalledWith('package-b'));
    await waitFor(() => expect(getDepartures).toHaveBeenCalledWith({ packageId: 'package-b', limit: 200 }));
    await waitFor(() => expect(getDepartureAccommodationOptions).toHaveBeenCalledWith('departure-b'));
    expect(screen.queryByText('Travel insurance')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));
    fireEvent.change(screen.getByPlaceholderText('Npr. Ahmed Hodžić'), { target: { value: 'Amina Hadžić' } });
    fireEvent.change(screen.getByPlaceholderText('+387 61 234 567'), { target: { value: '+38761100001' } });
    fireEvent.change(screen.getByPlaceholderText('Putnik 1 - puno ime'), { target: { value: 'Amina Hadžić' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dalje' }));

    expect(await screen.findByRole('heading', { name: 'Add-ons' })).toBeInTheDocument();
    expect(screen.getByText('Bosphorus excursion')).toBeInTheDocument();
    expect(screen.queryByText('Travel insurance')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Ukupno 50 BAM')).not.toBeInTheDocument();
  });
});
