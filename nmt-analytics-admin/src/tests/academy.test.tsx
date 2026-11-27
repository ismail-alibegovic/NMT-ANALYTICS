import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { I18nProvider, useT } from '../lib/i18n/context';
import Academy from '../pages/Academy';

function LangToggleWrapper() {
  const { setLang } = useT();
  return (
    <div>
      <button type="button" onClick={() => setLang('bs')}>
        set-bs
      </button>
      <button type="button" onClick={() => setLang('en')}>
        set-en
      </button>
      <Academy />
    </div>
  );
}

function renderAcademy() {
  return render(
    <HelmetProvider>
      <I18nProvider>
        <MemoryRouter>
          <LangToggleWrapper />
        </MemoryRouter>
      </I18nProvider>
    </HelmetProvider>,
  );
}

describe('Travline Academy', () => {
  it('renders localized guides and switches cleanly between BS and EN', () => {
    renderAcademy();
    fireEvent.click(screen.getByRole('button', { name: 'set-bs' }));
    expect(screen.getByRole('heading', { name: /Travline Akademija/i })).toBeInTheDocument();
    expect(screen.getByText(/1\. Postavljanje agencije/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'set-en' }));
    expect(screen.getByRole('heading', { name: /Travline Academy/i })).toBeInTheDocument();
    expect(screen.getByText(/1\. Agency Setup, Branding & PDF Templates/i)).toBeInTheDocument();
  });

  it('filters guides by role, search query, and resets empty state', () => {
    renderAcademy();
    fireEvent.click(screen.getByRole('button', { name: 'set-en' }));

    const searchInput = screen.getByPlaceholderText(/Search guides/i);
    fireEvent.change(searchInput, { target: { value: 'PU-YYYY-XXXX' } });
    expect(screen.getByText(/5\. Payments, Payment Receipts/i)).toBeInTheDocument();
    expect(screen.queryByText(/1\. Agency Setup/i)).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'nonexistent-xyz-query' } });
    expect(screen.getByText(/No guides found/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    expect(screen.getByText(/1\. Agency Setup/i)).toBeInTheDocument();
  });
});
