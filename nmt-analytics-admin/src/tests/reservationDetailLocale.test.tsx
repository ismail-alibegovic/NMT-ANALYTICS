import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import ReservationDetail from '../pages/ReservationDetail';
const api = vi.hoisted(() => ({ reservation: vi.fn(), contracts: vi.fn(), create: vi.fn(), toast: vi.fn(), org: 'org-a', accommodation: vi.fn(), manifest: vi.fn(), schedule: vi.fn() }));
vi.mock('../api/reservations', () => ({ downloadVoucher: vi.fn(), downloadInvoice: vi.fn(), formatReservationCurrency: (v: number) => String(v), formatReservationDate: (v: string) => v, reservationPaymentStatusBadge: () => 'Partial', getReservation: api.reservation, getReservationAccommodation: api.accommodation }));
vi.mock('../api/departures', () => ({ getDeparturePassengers: api.manifest }));
vi.mock('../api/manualMessaging', () => ({ sendReservationManualMessage: vi.fn() }));
vi.mock('../api/contracts', () => ({ getContracts: api.contracts, createContract: api.create }));
vi.mock('../api/installments', () => ({ getReservationInstallmentSchedule: api.schedule }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ user: { id: 'synthetic-user' }, userContext: { role: 'manager', org: { id: api.org } } }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showError: api.toast, showSuccess: api.toast }) }));
vi.mock('../icons', async () => { const actual = await vi.importActual<Record<string, unknown>>('../icons'); return Object.fromEntries(Object.keys(actual).map(key => [key, () => <svg />])); });
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../components/reservations/EditReservationModal', () => ({ default: () => null }));
vi.mock('../components/payments/AddPaymentModal', () => ({ default: () => null }));
vi.mock('../components/communications/ManualMessageComposer', () => ({ default: () => null }));
vi.mock('../components/communications/CommunicationHistoryPanel', () => ({ default: () => null }));
const reservation = { id: 'reservation-a', customerName: 'Synthetic client', status: 'confirmed', departureId: 'departure-a', totalAmount: 300, paidAmount: 100, currency: 'EUR', reservationAt: '2041-04-23', partySize: 2, options: { booking_snapshot_version: 1, transport_type: 'bus', base_total_at_booking: 200, total_at_booking: 300, selected_addons: [{ provider_name: 'Synthetic insurance', unit_price: 25, quantity: 1, currency: 'EUR' }] } };
function NextReservation() { const navigate = useNavigate(); return <button onClick={() => navigate('/reservations/reservation-b')}>Next fixture reservation</button>; }
function mount() { render(<I18nProvider><LanguageToggleButton /><MemoryRouter initialEntries={['/reservations/reservation-a']}><NextReservation /><Routes><Route path='/reservations/:id' element={<ReservationDetail />} /></Routes></MemoryRouter></I18nProvider>); }
beforeEach(() => { vi.resetAllMocks(); api.org = 'org-a'; localStorage.setItem('travline_lang', 'en'); api.reservation.mockResolvedValue(reservation); api.accommodation.mockResolvedValue([{ hotel: { name: 'Synthetic hotel' }, roomCount: 1, guestsExpected: 2 }]); api.manifest.mockResolvedValue({ manifest: [{ reservationId: 'reservation-a', fullName: 'Synthetic traveler', id_document_type: 'passport', id_document_number: 'TEST', id_document_expiry: '2045-12-31', date_of_birth: '2000-04-23', documentReadinessStatus: 'ready' }, { reservationId: 'other', fullName: 'Other reservation fixture', documentReadinessStatus: 'missing' }] }); api.schedule.mockResolvedValue({ installments: [{ id: 'installment-a', status: 'pending', installmentNumber: 1, amount: 200, currency: 'EUR', dueDate: '2041-04-23' }] }); api.contracts.mockResolvedValue({ data: [{ id: 'contract-a', contractNumber: 'SYNTHETIC', status: 'signed' }] }); api.create.mockResolvedValue({ id: 'contract-b', contractNumber: 'NEW-SYNTHETIC' }); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllEnvs(); });
it('translates overview and preserves calendar dates and source currency across live switching without refetch', async () => {
  vi.stubEnv('TZ', 'America/Los_Angeles'); mount(); await screen.findByText('Synthetic client');
  expect(screen.getByRole('button', { name: 'Payments' })).toBeInTheDocument();
  expect(screen.getByText('Confirmed')).toBeInTheDocument();
  expect(screen.getByText('Partial')).toBeInTheDocument();
  expect(screen.getByText('23/04/2041')).toBeInTheDocument();
  expect(screen.getByText('€300.00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  expect(screen.getByText('23.04.2041.')).toBeInTheDocument();
  expect(screen.getByText(/300,00\s*€/)).toBeInTheDocument();
  expect(screen.getByText('Djelimično plaćeno')).toBeInTheDocument();
  expect(api.reservation).toHaveBeenCalledTimes(1);
});
it('translates passengers, installments and sold-service tabs while preserving selected tab and canonical data', async () => {
  mount(); await screen.findByText('Synthetic client');
  fireEvent.click(screen.getByRole('button', { name: 'Passengers' }));
  expect(screen.getByText('Passport: TEST')).toBeInTheDocument();
  expect(screen.getByText('31/12/2045')).toBeInTheDocument();
  expect(screen.queryByText('Other reservation fixture')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  expect(screen.getByText('Installment 1 · €200.00')).toBeInTheDocument();
  expect(screen.getByText('Due: 23/04/2041')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Services' }));
  expect(screen.getByText('Bus')).toBeInTheDocument();
  expect(screen.getByText(/Synthetic hotel/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  expect(screen.getByText('Prodane usluge')).toBeInTheDocument();
  expect(screen.getByText('Autobus')).toBeInTheDocument();
  expect(api.reservation).toHaveBeenCalledTimes(1);
});
it('translates the contract dialog and preserves generation payload', async () => {
  mount(); await screen.findByText('Synthetic client');
  fireEvent.click(screen.getByRole('button', { name: 'Contract' }));
  expect(screen.getByText('Signed')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  await screen.findByText('Contract generated successfully');
  expect(api.create).toHaveBeenCalledWith({ reservationId: 'reservation-a' });
  expect(screen.getByText('NEW-SYNTHETIC')).toBeInTheDocument();
});

it('reports a localized contract failure without exposing a raw service diagnostic', async () => {
  api.create.mockRejectedValue(new Error('INTERNAL_SYNTHETIC_DIAGNOSTIC'));
  mount(); await screen.findByText('Synthetic client');
  fireEvent.click(screen.getByRole('button', { name: 'Contract' }));
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  await waitFor(() => expect(api.toast).toHaveBeenCalledWith('The contract could not be generated.'));
  expect(api.toast).not.toHaveBeenCalledWith('INTERNAL_SYNTHETIC_DIAGNOSTIC');
  expect(api.create).toHaveBeenCalledWith({ reservationId: 'reservation-a' });
});

it('distinguishes core transport failure from not-found and retries', async () => {
  api.reservation.mockRejectedValueOnce({ status: 503 }); mount();
  await screen.findByRole('alert');
  expect(screen.queryByText('Reservation not found')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Synthetic client');
});
it('keeps genuine missing reservations distinct from transport failures', async () => {
  api.reservation.mockRejectedValueOnce({ status: 404 }); mount();
  await screen.findByText('Reservation not found');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('does not present failed passenger reads as an empty manifest', async () => {
  api.manifest.mockRejectedValueOnce(new Error('SYNTHETIC_MANIFEST_FAILURE')); mount();
  await screen.findByText('Synthetic client');
  fireEvent.click(screen.getByRole('button', { name: 'Passengers' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('No passengers')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Passport: TEST');
  expect(api.reservation).toHaveBeenCalledTimes(1);
});
it('blocks schedule-dependent payment actions until a failed schedule read recovers', async () => {
  api.schedule.mockRejectedValueOnce(new Error('SYNTHETIC_SCHEDULE_FAILURE')); mount();
  await screen.findByText('Synthetic client');
  fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
  expect(screen.queryByText('No installment schedule is defined for this reservation.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Installment 1 · €200.00');
  expect(screen.getByRole('button', { name: 'Record payment' })).toBeEnabled();
});
it('does not treat failed contract history as permission to silently generate another contract', async () => {
  api.contracts.mockRejectedValueOnce(new Error('SYNTHETIC_CONTRACT_READ_FAILURE')); mount();
  await screen.findByText('Synthetic client');
  fireEvent.click(screen.getByRole('button', { name: 'Contract' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(/^SYNTHETIC/);
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  expect(api.create).not.toHaveBeenCalled();
});

it('never lets a superseded core read replace the current reservation', async () => {
  let finishOld!: (value: unknown) => void;
  api.reservation.mockImplementation((id: string) => id === 'reservation-a' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ ...reservation, id, customerName: 'Current route client' }));
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Next fixture reservation' }));
  await screen.findByText('Current route client');
  await act(async () => { finishOld(reservation); });
  expect(screen.getByText('Current route client')).toBeInTheDocument();
  expect(screen.queryByText('Synthetic client')).not.toBeInTheDocument();
  expect(api.accommodation).toHaveBeenCalledTimes(1);
  expect(api.accommodation).toHaveBeenCalledWith('reservation-b');
});
it('ignores a superseded passenger response after changing reservation routes', async () => {
  let finishOld!: (value: unknown) => void;
  api.reservation.mockImplementation((id: string) => Promise.resolve({ ...reservation, id, customerName: id === 'reservation-a' ? 'Old route client' : 'Current route client', departureId: id === 'reservation-a' ? 'departure-a' : 'departure-b' }));
  api.manifest.mockImplementation((id: string) => id === 'departure-a' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ manifest: [{ reservationId: 'reservation-b', fullName: 'Current route traveler' }] }));
  mount(); await waitFor(() => expect(api.manifest).toHaveBeenCalledWith('departure-a'));
  fireEvent.click(screen.getByRole('button', { name: 'Next fixture reservation' }));
  await screen.findByText('Current route client');
  await act(async () => { finishOld({ manifest: [{ reservationId: 'reservation-a', fullName: 'Stale route traveler' }] }); });
  fireEvent.click(screen.getByRole('button', { name: 'Passengers' }));
  expect(screen.getByText('Current route traveler')).toBeInTheDocument();
  expect(screen.queryByText('Stale route traveler')).not.toBeInTheDocument();
});

it('removes a previous organization view when the active context changes', async () => {
  mount(); await screen.findByText('Synthetic client');
  api.reservation.mockRejectedValueOnce({ status: 404 });
  api.org = 'org-b';
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Bosnian' }));
  await screen.findByText('Rezervacija nije pronađena');
  expect(screen.queryByText('Synthetic client')).not.toBeInTheDocument();
  expect(api.reservation).toHaveBeenCalledTimes(2);
});
