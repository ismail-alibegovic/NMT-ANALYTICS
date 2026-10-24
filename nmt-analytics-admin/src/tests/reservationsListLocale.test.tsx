import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import Reservations from '../pages/Reservations';
const api = vi.hoisted(() => ({ list: vi.fn(), batch: vi.fn(), error: vi.fn(), success: vi.fn(), role: 'manager', user: { id: 'synthetic-user' } }));
vi.mock('../api/reservations', () => ({ getReservations: api.list, batchUpdateStatus: api.batch, downloadVoucher: vi.fn(), downloadInvoice: vi.fn(), updateReservationStatus: vi.fn(), deleteReservation: vi.fn() }));
vi.mock('../api/departures', () => ({ getDeparture: vi.fn() }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ user: api.user, userContext: { role: api.role }, loading: false }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ error: api.error, success: api.success }) }));
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/payments/PaymentsModal', () => ({ default: () => null }));
vi.mock('../components/reservations/NewSaleWizard', () => ({ default: () => null }));
vi.mock('../components/reservations/EditReservationModal', () => ({ default: () => null }));
vi.mock('../icons', async () => { const actual = await vi.importActual<Record<string, unknown>>('../icons'); return Object.fromEntries(Object.keys(actual).map(key => [key, () => <svg />])); });
const rows = [{ id: 'reservation-bam', customerName: 'BAM client', packageName: 'BAM trip', currency: 'BAM', totalAmount: 100, paidAmount: 50, balanceDue: 50, paymentStatus: 'partially_paid', status: 'confirmed' }, { id: 'reservation-eur', customerName: 'EUR client', packageName: 'EUR trip', currency: 'EUR', totalAmount: 200, paidAmount: 250, balanceDue: -50, paymentStatus: 'paid', status: 'completed' }];
function mount() { render(<I18nProvider><LanguageToggleButton /><MemoryRouter><Reservations /></MemoryRouter></I18nProvider>); }
beforeEach(() => { vi.clearAllMocks(); localStorage.setItem('travline_lang', 'en'); api.role = 'manager'; api.list.mockResolvedValue({ data: rows, total: 21 }); api.batch.mockResolvedValue({ summary: { succeeded: 1, failed: 0 } }); });
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
  fireEvent.click(screen.getByLabelText('Select reservation for EUR client'));
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2041-04-23' } });
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
