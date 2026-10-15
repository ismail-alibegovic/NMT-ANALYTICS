import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const appState = vi.hoisted(() => ({
  role: 'agent' as string,
  modules: ['customers', 'packages', 'reservations', 'departures', 'travel_core'] as string[],
  capabilities: ['scheduled_departures', 'customer_sales'] as string[],
  agencyProfileConfigured: true,
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    user: { id: 'u1' },
    userContext: {
      role: appState.role,
      modules: appState.modules,
      capabilities: appState.capabilities,
      agencyProfileConfigured: appState.agencyProfileConfigured,
    },
    loading: false,
  }),
}));

vi.mock('../context/SidebarContext', () => ({
  useSidebar: () => ({ isExpanded: true, isHovered: false, isMobileOpen: false, setActiveScope: vi.fn(), activeScope: 'all' }),
}));

vi.mock('../lib/i18n/context', async () => {
  const { en } = await import('../lib/i18n/en');
  return { useT: () => ({ lang: 'en', t: en, setLang: vi.fn(), toggleLang: vi.fn() }) };
});

vi.mock('../icons', () => {
  const stub = () => null;
  const icons = new Set([
    'CalenderIcon', 'ChevronDownIcon', 'DollarLineIcon', 'GridIcon', 'HorizontaLDots',
    'PieChartIcon', 'ShootingStarIcon', 'TimeIcon', 'UserCircleIcon', 'PlugInIcon',
    'LockIcon', 'PaperPlaneIcon', 'MailIcon', 'FileIcon', 'SettingsIcon',
    'CloseIcon', 'TrashBinIcon', 'BoxIcon', 'CheckCircleIcon', 'AlertIcon',
  ]);
  const mod: Record<string, unknown> = {};
  icons.forEach((name) => { mod[name] = stub; });
  return mod;
});

import AppSidebar from '../layout/AppSidebar';

function renderSidebar(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppSidebar />
    </MemoryRouter>,
  );
}

describe('AppSidebar — Capability-aware navigation audit', () => {
  beforeEach(() => {
    appState.role = 'agent';
    appState.modules = ['customers', 'packages', 'reservations', 'departures', 'travel_core'];
    appState.capabilities = ['scheduled_departures', 'customer_sales'];
    appState.agencyProfileConfigured = true;
  });

  it('shows Departures when scheduled_departures capability is present', () => {
    renderSidebar();
    const departuresLink = screen.getByText('Departures').closest('a');
    expect(departuresLink).toBeTruthy();
    expect(departuresLink!.getAttribute('href')).toBe('/departures');
  });

  it('hides Departures when agency profile is configured without scheduled_departures', () => {
    appState.capabilities = ['tailor_made_itineraries', 'customer_sales'];
    renderSidebar();
    const departuresLink = screen.queryByText('Departures');
    expect(departuresLink).toBeNull();
  });

  it('shows Quotations when tailor_made_itineraries capability is present', () => {
    appState.capabilities = ['tailor_made_itineraries', 'customer_sales'];
    renderSidebar();
    const quotationsLink = screen.getByText('Quotations').closest('a');
    expect(quotationsLink).toBeTruthy();
    expect(quotationsLink!.getAttribute('href')).toBe('/quotations');
  });

  it('hides Quotations when tailor_made_itineraries capability is omitted', () => {
    appState.capabilities = ['scheduled_departures', 'customer_sales'];
    renderSidebar();
    const quotationsLink = screen.queryByText('Quotations');
    expect(quotationsLink).toBeNull();
  });
});
