import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { bs } from '../lib/i18n/bs';
import { en } from '../lib/i18n/en';
import { I18nProvider } from '../lib/i18n/context';
import { ToastProvider } from '../context/ToastContext';

const apexCaptured = vi.hoisted(() => ({ options: null as any }));

vi.mock('../lib/sentry', () => ({ captureError: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: null }));
vi.mock('../lib/apiClient', () => ({
  default: { post: vi.fn(), get: vi.fn(), defaults: { baseURL: '/api' } },
  get: vi.fn(),
}));
vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../icons');
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mocked[key] = () => <span data-icon={key} />;
  }
  return mocked;
});
vi.mock('react-apexcharts', () => ({
  default: ({ options }: { options: any }) => {
    apexCaptured.options = options;
    return <div data-testid="mock-apex-chart" data-categories={JSON.stringify(options?.xaxis?.categories || [])} />;
  },
}));
vi.mock('../context/SidebarContext', () => ({
  useSidebar: () => ({
    isExpanded: true,
    isMobileOpen: false,
    isHovered: false,
    activeScope: 'operations',
    toggleSidebar: vi.fn(),
    toggleMobileSidebar: vi.fn(),
  }),
}));
vi.mock('../context/QuickCreateContext', () => ({
  useQuickCreate: () => ({ openQuickCreate: vi.fn() }),
}));
vi.mock('../components/header/NotificationDropdown', () => ({ default: () => null }));
vi.mock('../components/header/UserDropdown', () => ({ default: () => null }));
vi.mock('../components/common/ThemeToggleButton', () => ({ ThemeToggleButton: () => null }));
vi.mock('../components/common/GlobalSearch', () => ({ default: () => null }));
vi.mock('../api/packages', () => ({
  getPackages: vi.fn(async () => ({
    data: [{ id: 'pkg-1', name: 'Synthetic Package', destination: 'Mostar', price: 500 }],
  })),
}));
vi.mock('../api/departures', () => ({
  getDepartures: vi.fn(async () => ({
    data: [{
      id: 'dep-1',
      package_id: 'pkg-1',
      depart_at: '2041-04-23T08:00:00Z',
      capacity: 40,
      booked: 12,
      status: 'active',
    }],
  })),
}));
vi.mock('../api/customers', () => ({
  getCustomers: vi.fn(async () => ({ data: [] })),
}));

import ErrorBoundary from '../components/common/ErrorBoundary';
import NotFound from '../pages/OtherPage/NotFound';
import DateRangeFilter from '../components/common/DateRangeFilter';
import LegacyImportModal from '../components/ui/ImportModal';
import AppHeader from '../layout/AppHeader';
import PublicSubAgentPortal from '../pages/PublicSubAgentPortal';
import AnalyticsChart from '../components/charts/AnalyticsChart';
import CreateReservationModal from '../components/reservations/CreateReservationModal';

function ThrowingChild(): never {
  throw new Error('Synthetic render failure');
}

describe('Batch D shared/public/remaining localization', () => {
  const originalConsoleError = console.error;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
    apexCaptured.options = null;
  });

  afterEach(() => {
    cleanup();
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('renders ErrorBoundary outside I18nProvider in Bosnian and English and tolerates throwing storage', () => {
    console.error = vi.fn();

    localStorage.setItem('travline_lang', 'bs');
    const bsView = render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText(bs.errorBoundary.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: bs.errorBoundary.refreshPage })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: bs.errorBoundary.goToLogin })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: bs.errorBoundary.tryAgain })).toBeInTheDocument();
    bsView.unmount();

    localStorage.setItem('travline_lang', 'en');
    const enView = render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText(en.errorBoundary.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.errorBoundary.refreshPage })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.errorBoundary.goToLogin })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.errorBoundary.tryAgain })).toBeInTheDocument();
    enView.unmount();

    const storageSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    try {
      document.documentElement.lang = 'en';
      render(
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>,
      );
      expect(screen.getByText(en.errorBoundary.title)).toBeInTheDocument();
    } finally {
      storageSpy.mockRestore();
    }
  });

  it.each([
    ['bs', bs],
    ['en', en],
  ] as const)('localizes NotFound, DateRangeFilter, legacy ImportModal, and AppHeader in %s', (lang, copy) => {
    localStorage.setItem('travline_lang', lang);

    const { rerender } = render(
      <MemoryRouter>
        <I18nProvider>
          <ToastProvider>
            <AppHeader />
            <DateRangeFilter onRangeChange={vi.fn()} />
            <NotFound />
            <LegacyImportModal
              isOpen={true}
              onClose={vi.fn()}
              entity="customers"
              fields={[{ key: 'name', label: 'Name', required: true }]}
            />
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: copy.nav.toggleSidebar })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.nav.openHeaderMenu })).toBeInTheDocument();

    expect(screen.getByLabelText(copy.dateRangeFilter.from)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.dateRangeFilter.to)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.dateRangeFilter.granularity)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: copy.dateRangeFilter.daily })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: copy.dateRangeFilter.weekly })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: copy.dateRangeFilter.monthly })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: copy.notFound.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.notFound.description)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.notFound.backHome })).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: copy.legacyImportModal.close })).toBeInTheDocument();
    expect(screen.getByText(copy.legacyImportModal.clickOrDrag)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.legacyImportModal.cancel })).toBeInTheDocument();

    rerender(<div />);
  });

  it.each([
    ['bs', bs, 'bs-BA', '23. apr'],
    ['en', en, 'en-GB', '23 Apr'],
  ] as const)('localizes AnalyticsChart and CreateReservationModal in %s', async (lang, copy, locale, expectedCategory) => {
    localStorage.setItem('travline_lang', lang);

    const { rerender } = render(
      <I18nProvider>
        <ToastProvider>
          <AnalyticsChart title="Sales" subtitle="Daily" data={[]} />
          <CreateReservationModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />
        </ToastProvider>
      </I18nProvider>,
    );

    expect(screen.getByText(copy.analyticsChart.noData)).toBeInTheDocument();

    const pkgOption = await screen.findByRole('option', { name: 'Synthetic Package - Mostar' });
    fireEvent.change(pkgOption.parentElement as HTMLSelectElement, { target: { value: 'pkg-1' } });

    await waitFor(() => {
      const formattedDate = new Date('2041-04-23T08:00:00Z').toLocaleDateString(locale);
      expect(screen.getByRole('option', { name: `${formattedDate} — 12/40 ${copy.reservations.bookedShort}` })).toBeInTheDocument();
    });

    rerender(
      <I18nProvider>
        <ToastProvider>
          <AnalyticsChart
            title="Sales"
            subtitle="Daily"
            data={[{ date: '2041-04-23', value: 1234.5 }]}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    expect(screen.getByTestId('mock-apex-chart')).toHaveAttribute(
      'data-categories',
      JSON.stringify([expectedCategory]),
    );
    expect(apexCaptured.options?.yaxis?.labels?.formatter?.(1234.5)).toBe((1234.5).toLocaleString(locale));
  });

  it.each([
    ['bs', bs, 'bs-BA'],
    ['en', en, 'en-GB'],
  ] as const)('localizes PublicSubAgentPortal doc types, fallbacks, and locale formatting in %s', async (lang, copy, locale) => {
    localStorage.setItem('travline_lang', lang);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/portal/me')) {
        return new Response(
          JSON.stringify({
            data: {
              name: null,
              partnerType: 'gold',
              commissionRate: 10,
              lastSeenAt: '2041-04-23T10:30:00Z',
              expiresAt: '2041-05-01T10:30:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'sale-1',
              reservation_id: 'res-1',
              commission_amount: 125.5,
              created_at: '2041-04-23T10:00:00Z',
              documents_generated: [
                { type: 'najava', url: '/doc-najava.pdf' },
                { type: 'ugovor', url: '/doc-ugovor.pdf' },
                { type: 'faktura', url: '/doc-faktura.pdf' },
              ],
              reservations: {
                customer_name: null,
                total_amount: 1255,
                currency: 'EUR',
                status: 'confirmed',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    render(
      <I18nProvider>
        <PublicSubAgentPortal />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: copy.operations.subagents.portal.agentFallback })).toBeInTheDocument();
    });

    expect(screen.getByText(new RegExp(`^${copy.operations.subagents.portal.tier}:`))).toBeInTheDocument();
    const tbody = screen.getByRole('table').querySelector('tbody');
    expect(tbody).not.toBeNull();
    expect(within(tbody!).getByText(copy.operations.subagents.portal.customerFallback)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.operations.subagents.portal.docTypes.najava })).toHaveAttribute('href', '/doc-najava.pdf');
    expect(screen.getByRole('link', { name: copy.operations.subagents.portal.docTypes.ugovor })).toHaveAttribute('href', '/doc-ugovor.pdf');
    expect(screen.getByRole('link', { name: copy.operations.subagents.portal.docTypes.faktura })).toHaveAttribute('href', '/doc-faktura.pdf');

    const expectedAmount = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(1255).replace(/\s/g, ' ');
    const matchingAmounts = screen.getAllByText((_, el) => el?.textContent?.replace(/\s/g, ' ') === expectedAmount);
    expect(matchingAmounts.length).toBeGreaterThan(0);
  });
});
