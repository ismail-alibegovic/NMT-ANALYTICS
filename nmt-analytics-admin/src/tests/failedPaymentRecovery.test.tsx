import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PaymentsModal from '../components/payments/PaymentsModal';
import { I18nProvider } from '../lib/i18n/context';

const h = vi.hoisted(() => ({ updatePayment: vi.fn().mockResolvedValue({}), success: vi.fn(), error: vi.fn() }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: h.success, error: h.error }) }));
vi.mock('../api/payments', () => ({
  getPayments: vi.fn().mockResolvedValue({ data: [{ id: 'failed-payment', amount: 90, currency: 'BAM', status: 'failed', createdAt: '2026-10-14', paymentDate: null }], pagination: { total: 1 } }),
  updatePayment: h.updatePayment, createPayment: vi.fn(), voidPayment: vi.fn(), refundPayment: vi.fn(),
}));

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe('failed payment recovery action', () => {
  it.each([['en', 'Retry payment'], ['bs', 'Ponovi uplatu']])('shows a working retry action in %s', async (lang, label) => {
    localStorage.setItem('travline_lang', lang);
    const refreshed = vi.fn();
    render(<I18nProvider><PaymentsModal isOpen onClose={() => {}} reservationId="reservation-a" reservationTotal={180} onPaymentCreated={refreshed} /></I18nProvider>);
    fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(h.updatePayment).toHaveBeenCalledWith('failed-payment', { status: 'succeeded' }));
    await waitFor(() => expect(refreshed).toHaveBeenCalled());
    expect(h.error).not.toHaveBeenCalled();
  });
});
