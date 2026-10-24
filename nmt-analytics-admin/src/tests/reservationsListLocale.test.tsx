import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import { dataEvents } from '../lib/events';
import Reservations from '../pages/Reservations';
const api = vi.hoisted(() => ({ list: vi.fn(), batch: vi.fn(), error: vi.fn(), success: vi.fn(), role: 'manager', org: 'org-a', user: { id: 'synthetic-user' } }));
vi.mock('../api/reservations', () => ({ getReservations: api.list, batchUpdateStatus: api.batch, downloadVoucher: vi.fn(), downloadInvoice: vi.fn(), updateReservationStatus: vi.fn(), deleteReservation: vi.fn() }));
vi.mock('../api/departures', () => ({ getDeparture: vi.fn() }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ user: api.user, userContext: { role: api.role, org: { id: api.org } }, loading: false }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ error: api.error, success: api.success }) }));
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/payments/PaymentsModal', () => ({ default: () => null }));
vi.mock('../components/reservations/NewSaleWizard', () => ({ default: () => null }));
vi.mock('../components/reservations/EditReservationModal', () => ({ default: () => null }));
vi.mock('../icons', async () => { const actual = await vi.importActual<Record<string, unknown>>('../icons'); return Object.fromEntries(Object.keys(actual).map(key => [key, () => <svg />])); });
const rows = [{ id: 'reservation-bam', customerName: 'BAM client', packageName: 'BAM trip', currency: 'BAM', totalAmount: 100, paidAmount: 50, balanceDue: 50, paymentStatus: 'partially_paid', status: 'confirmed' }, { id: 'reservation-eur', customerName: 'EUR client', packageName: 'EUR trip', currency: 'EUR', totalAmount: 200, paidAmount: 250, balanceDue: -50, paymentStatus: 'paid', status: 'completed' }];
function mount() { render(<I18nProvider><LanguageToggleButton /><MemoryRouter><Reservations /></MemoryRouter></I18nProvider>); }
beforeEach(() => { vi.resetAllMocks(); localStorage.setItem('travline_lang', 'en'); api.role = 'manager'; api.org = 'org-a'; api.list.mockResolvedValue({ data: rows, total: 21 }); api.batch.mockResolvedValue({ summary: { succeeded: 1, failed: 0 } }); });
afterEach(() => { cleanup(); localStorage.clear(); });
it('displays row source currencies, backend credit and translated pagination', async () => {
  mount(); await screen.findByText('EUR client');
  const eur = within(screen.getByText('EUR client').closest('tr')!);
  expect(eur.getByText('€200.00')).toBeInTheDocument();
  expect(eur.getByText('€250.00')).toBeInTheDocument();
  expect(eur.getByTitle('Overpaid (credit)')).toHaveTextContent('€50.00');
  expect(eur.getByText('(credit)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  expect(eur.getByText(/200,00\s*€/)).toBeInTheDocument();
  expect(screen.getByText('Prikazano 1–10 od 21 rezultata')).toBeInTheDocument();
});
it('retains selection and filter input values when switching without refetching', async () => {
  mount(); await screen.findByText('EUR client');
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2041-04-23' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, dateFrom: '2041-04-23' }));
  await screen.findByText('EUR client');
  fireEvent.click(screen.getByLabelText('Select reservation for EUR client'));
  const reads = api.list.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  expect(screen.getByLabelText('Odaberi rezervaciju za EUR client')).toBeChecked();
  expect(screen.getByLabelText('Od datuma')).toHaveValue('2041-04-23');
  expect(screen.getByText('Odabrano: 1')).toBeInTheDocument();
  expect(api.list).toHaveBeenCalledTimes(reads);
});
it('sends original batch status identifiers and localizes success', async () => {
  mount(); await screen.findByText('EUR client');
  fireEvent.click(screen.getByLabelText('Select reservation for EUR client'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(api.batch).toHaveBeenCalledWith(['reservation-eur'], 'confirmed'));
  expect(api.success).toHaveBeenCalledWith('Reservations updated: 1. Status: Confirmed.');
});
it('preserves Agent finance restrictions and paging filters', async () => {
  api.role = 'agent'; mount(); await screen.findByText('EUR client');
  expect(screen.queryByRole('button', { name: 'Payments' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Invoice' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'My clients' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(api.list).toHaveBeenCalledWith({ page: 2, limit: 10 }));
});

it('loads changed status/date filters and reloads when they are cleared', async () => {
  mount(); await screen.findByText('EUR client');
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, status: 'pending' }));
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2041-04-23' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, status: 'pending', dateFrom: '2041-04-23' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10 }));
});
it('retains search during data invalidation', async () => {
  mount(); await screen.findByText('EUR client');
  fireEvent.change(screen.getByPlaceholderText('Search client or phone...'), { target: { value: 'EUR' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, search: 'EUR' }));
  act(() => dataEvents.emit('reservations'));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, search: 'EUR' }));
});
it('shows a retryable read failure rather than a false empty result', async () => {
  api.list.mockRejectedValueOnce(new Error('SYNTHETIC_NETWORK_FAILURE'));
  mount(); await screen.findByRole('alert');
  expect(screen.queryByText('No reservations')).not.toBeInTheDocument();
  expect(screen.queryByText('SYNTHETIC_NETWORK_FAILURE')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('EUR client');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('does not let a superseded search response replace newer results', async () => {
  let resolveOld!: (value: unknown) => void;
  api.list.mockImplementation((query: { search?: string }) => query.search === 'old' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ data: query.search === 'new' ? [{ ...rows[0], customerName: 'Newest client' }] : rows, total: 1 }));
  mount(); await screen.findByText('EUR client');
  fireEvent.change(screen.getByPlaceholderText('Search client or phone...'), { target: { value: 'old' } });
  fireEvent.change(screen.getByPlaceholderText('Search client or phone...'), { target: { value: 'new' } });
  await screen.findByText('Newest client');
  await act(async () => { resolveOld({ data: [{ ...rows[0], customerName: 'Stale client' }], total: 1 }); });
  expect(screen.getByText('Newest client')).toBeInTheDocument();
  expect(screen.queryByText('Stale client')).not.toBeInTheDocument();
});
it('clears bulk selection when the displayed query changes', async () => {
  mount(); await screen.findByText('EUR client');
  fireEvent.click(screen.getByLabelText('Select reservation for EUR client'));
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, status: 'pending' }));
  await waitFor(() => expect(screen.queryByText('Selected: 1')).not.toBeInTheDocument());
  expect(api.batch).not.toHaveBeenCalled();
});

it('refreshes the current query when an earlier batch finishes after the operator changes filters', async () => {
  let finish!: (value: unknown) => void;
  api.batch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mount(); await screen.findByText('EUR client');
  fireEvent.click(screen.getByLabelText('Select reservation for EUR client'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.change(screen.getByPlaceholderText('Search client or phone...'), { target: { value: 'new query' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, search: 'new query' }));
  await act(async () => { finish({ summary: { succeeded: 1, failed: 0 } }); });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, search: 'new query' }));
  await screen.findByText('EUR client');
});

it('does not retain another organization list when the active context changes', async () => {
  mount(); await screen.findByText('EUR client');
  api.list.mockResolvedValueOnce({ data: [], total: 0 });
  api.org = 'org-b';
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  await screen.findByText('Nema rezervacija');
  expect(screen.queryByText('EUR client')).not.toBeInTheDocument();
  expect(api.list).toHaveBeenCalledTimes(2);
});

it('does not restore old filters when clearing and typing before the router commits', async () => {
  mount(); await screen.findByText('EUR client');
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2041-04-23' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, dateFrom: '2041-04-23' }));
  await screen.findByText('EUR client');
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.change(screen.getByPlaceholderText('Search client or phone...'), { target: { value: 'EUR' } });
  });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, search: 'EUR' }));
  expect(screen.getByLabelText('From date')).toHaveValue('');
});
