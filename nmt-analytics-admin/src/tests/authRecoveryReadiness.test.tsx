import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import ResetPasswordForm from '../components/auth/ResetPasswordForm';
const h = vi.hoisted(() => ({ reset: vi.fn(), update: vi.fn(), signOut: vi.fn(), getSession: vi.fn(), callback: null as any, clear: vi.fn(), navigate: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {
  resetPasswordForEmail: h.reset, updateUser: h.update, signOut: h.signOut, getSession: h.getSession,
  onAuthStateChange: (cb: any) => { h.callback = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
} } }));
vi.mock('../lib/authSession', () => ({ clearLocalAuthStorage: h.clear }));
vi.mock('react-router', async importOriginal => ({ ...(await importOriginal<typeof import('react-router')>()), useNavigate: () => h.navigate }));
function show() { return render(<MemoryRouter><I18nProvider><ResetPasswordForm /></I18nProvider></MemoryRouter>); }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.setItem('travline_lang', 'en'); window.history.replaceState(null, '', '/auth/reset-password');
  h.getSession.mockResolvedValue({ data: { session: null } });
  h.reset.mockResolvedValue({ error: null }); h.update.mockResolvedValue({ error: null }); h.signOut.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); localStorage.clear(); });
describe('recovery provider readiness', () => {
  it('uses the current approved origin and canonical public recovery route', async () => {
    show(); fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'pilot@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(h.reset).toHaveBeenCalledWith('pilot@example.test', { redirectTo: window.location.origin + '/auth/reset-password' }));
    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
  });
  it('does not trust a recovery hash without a session', async () => {
    window.history.replaceState(null, '', '/auth/reset-password#type=recovery'); show();
    expect(await screen.findByText(/invalid or expired/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument();
    expect(h.update).not.toHaveBeenCalled();
  });
  it.each(['en', 'bs'])('shows a safe expired-link state in %s', async lang => {
    localStorage.setItem('travline_lang', lang);
    window.history.replaceState(null, '', '/auth/reset-password#error=access_denied&error_description=secret-token'); show();
    expect(screen.queryByText(/secret-token/)).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(h.update).not.toHaveBeenCalled();
  });
  it('signs out and clears local auth after a verified recovery password update', async () => {
    window.history.replaceState(null, '', '/auth/reset-password#type=recovery');
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'isolated' } } }); show();
    fireEvent.change(await screen.findByLabelText(/^New password/), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(h.clear).toHaveBeenCalled(); expect(h.navigate).toHaveBeenCalledWith('/auth/signin?reset=1', { replace: true });
  });
});
