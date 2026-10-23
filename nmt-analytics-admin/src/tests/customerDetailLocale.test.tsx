import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import CustomerDetail from '../pages/CustomerDetail';

const api = vi.hoisted(() => ({ customer: vi.fn(), reservations: vi.fn(), timeline: vi.fn(), error: vi.fn() }));
vi.mock('../api/customers', () => ({ getCustomer: api.customer, getCustomerTimeline: api.timeline }));
vi.mock('../api/reservations', () => ({ getReservations: api.reservations }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ error: api.error }) }));
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
const customer = { id: 'customer-a', full_name: 'Synthetic client', email: '', phone: '+38761000000', status: 'active', created_at: '2041-04-23T12:00:00Z' };
const rows = [
  { id: 'bam', packageName: 'BAM trip', departureName: 'BAM departure', totalAmount: 100, paidAmount: 40, balanceDue: 60, currency: 'BAM', status: 'confirmed', bookingDate: '2041-04-23' },
  { id: 'eur', packageName: 'EUR trip', departureName: 'EUR departure', totalAmount: 200, paidAmount: 150, balanceDue: 50, currency: 'EUR', status: 'confirmed', bookingDate: '2041-04-23' },
];
function NextCustomer() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/customers/customer-b')}>Next test customer</button>;
}
function mount() {
  return render(<I18nProvider><MemoryRouter initialEntries={['/customers/customer-a']}>
    <LanguageToggleButton /><NextCustomer />
    <Routes><Route path="/customers/:id" element={<CustomerDetail />} /></Routes>
  </MemoryRouter></I18nProvider>);
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.setItem('travline_lang', 'en');
  api.customer.mockResolvedValue(customer); api.reservations.mockResolvedValue({ data: rows, total: 62 }); api.timeline.mockResolvedValue([]);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllEnvs(); });

it('shows currency-separated loaded subtotals and discloses pagination', async () => {
  mount(); await screen.findByRole('heading', { name: 'Synthetic client' });
  expect(screen.getByText(/BAM\s*100\.00/)).toBeInTheDocument();
  expect(screen.getByText('€200.00')).toBeInTheDocument();
  expect(screen.queryByText(/BAM\s*300\.00/)).not.toBeInTheDocument();
  expect(screen.getByText('Loaded reservations: 2 of 62. Monetary subtotals cover loaded records only.')).toBeInTheDocument();
});
it('switches all screen labels and money without refetching customer data', async () => {
  mount(); await screen.findByRole('heading', { name: 'Synthetic client' });
  expect(screen.getByText('Customer Summary')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  expect(screen.getByText('Pregled klijenta')).toBeInTheDocument();
  expect(screen.getByText('Telefon')).toBeInTheDocument();
  expect(screen.getByText(/100,00\s*KM/)).toBeInTheDocument();
  expect(screen.queryByText('Customer Summary')).not.toBeInTheDocument();
  expect(api.customer).toHaveBeenCalledTimes(1);
});
it('does not assign BAM to missing currency or aggregate unknown money', async () => {
  api.reservations.mockResolvedValue({ data: [{ ...rows[0], currency: null }], total: 1 });
  mount(); await screen.findByRole('heading', { name: 'Synthetic client' });
  expect(screen.getByText('Reservations with no currency: 1. Their amounts are excluded from monetary subtotals.')).toBeInTheDocument();
  expect(screen.queryByText(/BAM|KM/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Reservations/ }));
  expect(screen.getAllByText('Unknown currency').length).toBeGreaterThan(0);
});
it('uses the source currency and translated action in reservation timeline entries', async () => {
  api.timeline.mockResolvedValue([{ id: 'timeline-eur', type: 'reservation', action: 'reservation_created', entity: 'reservation', createdAt: '2041-04-23T12:00:00Z', details: { totalAmount: 200, currency: 'EUR', status: 'confirmed' } }]);
  mount(); await screen.findByRole('heading', { name: 'Synthetic client' });
  fireEvent.click(screen.getByRole('button', { name: /Activity/ }));
  expect(screen.getByText(/€200\.00/)).toBeInTheDocument();
  expect(screen.getByText('Reservation created')).toBeInTheDocument();
  expect(screen.queryByText(/200,00\s*KM/)).not.toBeInTheDocument();
});
it('keeps date-only booking dates on their calendar day west of UTC', async () => {
  vi.stubEnv('TZ', 'America/Los_Angeles');
  mount(); await screen.findByRole('heading', { name: 'Synthetic client' });
  fireEvent.click(screen.getByRole('button', { name: /Reservations/ }));
  expect(screen.getAllByText('23/04/2041')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  expect(screen.getAllByText('23.04.2041.')).toHaveLength(2);
});
it('shows a retryable localized read error instead of a false not-found result', async () => {
  api.customer.mockRejectedValueOnce(new Error('Synthetic transport failure'));
  mount(); await screen.findByRole('alert');
  expect(screen.queryByText('Customer not found')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('heading', { name: 'Synthetic client' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('retains the genuine not-found state for a 404', async () => {
  api.customer.mockRejectedValue({ response: { status: 404 } });
  mount(); await screen.findByText('Customer not found');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('never lets a superseded customer request overwrite the current route', async () => {
  let resolveOld!: (value: unknown) => void;
  api.customer.mockImplementation((id: string) => id === 'customer-a' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ ...customer, id, full_name: 'Current client' }));
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Next test customer' }));
  await screen.findByRole('heading', { name: 'Current client' });
  await act(async () => { resolveOld(customer); });
  expect(screen.getByRole('heading', { name: 'Current client' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Synthetic client' })).not.toBeInTheDocument();
});

it('does not mislabel a child-read 404 as a missing customer', async () => {
  api.timeline.mockRejectedValue({ response: { status: 404 } });
  mount(); await screen.findByRole('alert');
  expect(screen.queryByText('Customer not found')).not.toBeInTheDocument();
});
it('keeps incomplete monetary fields unavailable instead of manufacturing zero', async () => {
  api.reservations.mockResolvedValue({ data: [{ ...rows[0], totalAmount: null, paidAmount: ' ' }], total: 1 });
  mount(); await screen.findByRole('heading', { name: 'Synthetic client' });
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  expect(screen.queryByText(/BAM\s*0\.00/)).not.toBeInTheDocument();
});
