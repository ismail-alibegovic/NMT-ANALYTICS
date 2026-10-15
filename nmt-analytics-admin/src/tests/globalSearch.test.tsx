import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GlobalSearch from '../components/common/GlobalSearch';
import { en } from '../lib/i18n/en';
import { bs } from '../lib/i18n/bs';

const currentLang = { lang: 'en', t: en };

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({
    lang: currentLang.lang,
    t: currentLang.t,
    setLang: vi.fn(),
    toggleLang: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/customers', () => ({
  getCustomers: vi.fn().mockResolvedValue({
    data: [
      { id: 'c-1', full_name: 'Adnan Catic', email: 'adnan@example.com', phone: '+38761111222' },
    ],
  }),
}));

vi.mock('../api/departures', () => ({
  getDepartures: vi.fn().mockResolvedValue({
    data: [
      { id: 'dep-1', packageName: 'Istanbul Weekend', depart_at: '2026-11-01', booked: 35, capacity: 40 },
    ],
  }),
  searchDeparturePassengers: vi.fn().mockResolvedValue([
    {
      id: 'p-1',
      reservation_id: 'res-100',
      departure_id: 'dep-1',
      full_name: 'Dino Merlin',
      id_document_number: 'P0998877',
      phone: '+38761555666',
    },
  ]),
}));

vi.mock('../api/reservations', () => ({
  getReservations: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'res-100',
        customerName: 'Dino Merlin',
        packageName: 'Istanbul Weekend',
        departureName: 'Polazak 01.11.',
        status: 'confirmed',
        balanceDue: 0,
        currency: 'BAM',
      },
    ],
  }),
}));

vi.mock('../api/packages', () => ({
  getPackages: vi.fn().mockResolvedValue({
    data: [
      { id: 'pkg-1', name: 'Istanbul Classic', destination: 'Turkey', price: 499, currency: 'EUR' },
    ],
  }),
}));

vi.mock('../api/operations', () => ({
  getHotels: vi.fn().mockResolvedValue([
    { id: 'hotel-1', name: 'Grand Hotel Sarajevo', destination: 'Sarajevo', stars: 5 },
  ]),
}));

vi.mock('../api/inquiries', () => ({
  getInquiries: vi.fn().mockResolvedValue([
    { id: 'inq-1', contactName: 'Amra Silajdzic', destination: 'Rome', stage: 'new' },
  ]),
}));

vi.mock('../api/quotations', () => ({
  getQuotations: vi.fn().mockResolvedValue([
    { id: 'quote-1', title: 'Corporate Rome 2026', reference: 'Q-2026-001', status: 'sent', sellTotal: 4500, currency: 'EUR' },
  ]),
}));

vi.mock('../api/suppliers', () => ({
  getSuppliers: vi.fn().mockResolvedValue([
    { id: 'sup-1', name: 'Bosna Tours Bus Fleet', city: 'Sarajevo', country: 'Bosnia', category: 'transport' },
  ]),
}));

vi.mock('../api/contracts', () => ({
  getContracts: vi.fn().mockResolvedValue({
    data: [
      { id: 'con-1', contractNumber: 'U-2026-01', travelerName: 'Adnan Catic', status: 'active', contractDate: '2026-10-01' },
    ],
  }),
}));

describe('GlobalSearch Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentLang.lang = 'en';
    currentLang.t = en;
  });

  it('renders correctly when open and displays localized search placeholder', () => {
    render(
      <MemoryRouter>
        <GlobalSearch isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText(en.globalSearch.placeholder)).toBeTruthy();
  });

  it('executes broad search across entities and deep-links directly to detail views', async () => {
    render(
      <MemoryRouter>
        <GlobalSearch isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(en.globalSearch.placeholder);
    fireEvent.change(input, { target: { value: 'Istanbul' } });

    // Wait for debounced search execution
    await waitFor(() => {
      expect(screen.getByText('Dino Merlin')).toBeTruthy();
    });

    // Check passenger category with passport details
    expect(screen.getByText(/Passport: P0998877/)).toBeTruthy();

    // Check reservation deep-link href: clicking reservation navigates to /reservations/res-100
    const reservationItem = screen.getByText('Dino Merlin — Istanbul Weekend').closest('button');
    expect(reservationItem).toBeTruthy();
    fireEvent.click(reservationItem!);
    expect(mockNavigate).toHaveBeenCalledWith('/reservations/res-100');

    // Check package deep-link href: /packages/pkg-1
    const packageItem = screen.getByText('Istanbul Classic').closest('button');
    expect(packageItem).toBeTruthy();
    fireEvent.click(packageItem!);
    expect(mockNavigate).toHaveBeenCalledWith('/packages/pkg-1');

    // Check hotel deep-link href: /operations/hotels/hotel-1
    const hotelItem = screen.getByText('Grand Hotel Sarajevo').closest('button');
    expect(hotelItem).toBeTruthy();
    fireEvent.click(hotelItem!);
    expect(mockNavigate).toHaveBeenCalledWith('/operations/hotels/hotel-1');

    // Check quotation deep-link href: /quotations/quote-1
    const quotationItem = screen.getByText(/Corporate Rome 2026/).closest('button');
    expect(quotationItem).toBeTruthy();
    fireEvent.click(quotationItem!);
    expect(mockNavigate).toHaveBeenCalledWith('/quotations/quote-1');
  });

  it('renders category badges with complete Bosnian translations when lang is bs', async () => {
    currentLang.lang = 'bs';
    currentLang.t = bs;

    render(
      <MemoryRouter>
        <GlobalSearch isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(bs.globalSearch.placeholder);
    fireEvent.change(input, { target: { value: 'Istanbul' } });

    await waitFor(() => {
      expect(screen.getByText('Dino Merlin')).toBeTruthy();
    });

    // Check Bosnian category badges
    expect(screen.getByText(bs.globalSearch.categories.passenger)).toBeTruthy();
    expect(screen.getByText(bs.globalSearch.categories.reservation)).toBeTruthy();
    expect(screen.getByText(bs.globalSearch.categories.hotel)).toBeTruthy();
    expect(screen.getByText(bs.globalSearch.categories.package)).toBeTruthy();
  });
});
