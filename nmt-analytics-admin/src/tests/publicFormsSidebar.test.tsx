import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const appState = vi.hoisted(() => ({ role: 'manager' as string, modules: ['customers', 'packages', 'reservations'] as string[] }));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    user: { id: 'u1' },
    userContext: { role: appState.role, modules: appState.modules, capabilities: [], agencyProfileConfigured: false },
    loading: false,
  }),
}));

vi.mock('../context/SidebarContext', () => ({
  useSidebar: () => ({ isExpanded: true, isHovered: false, isMobileOpen: false, setActiveScope: vi.fn() }),
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

describe('AppSidebar — Public Forms product integration', () => {
  beforeEach(() => {
    appState.role = 'manager';
    appState.modules = ['customers', 'packages', 'reservations'];
  });

  it('shows the Settings entry in the System section', () => {
    renderSidebar('/settings');
    const settingsLink = screen.getByText('Settings').closest('a');
    expect(settingsLink).toBeTruthy();
    expect(settingsLink!.getAttribute('href')).toBe('/settings');
  });

  it('shows the Public Forms entry in the Sales section near Inquiries', () => {
    renderSidebar('/inquiries');
    const formsLink = screen.getByText('Public Forms').closest('a');
    expect(formsLink).toBeTruthy();
    expect(formsLink!.getAttribute('href')).toBe('/settings/public-forms');

    const salesGroup = formsLink!.closest('ul');
    const linkTexts = Array.from(salesGroup?.querySelectorAll('a span.menu-item-text') || []).map(
      (el) => el.textContent,
    );
    const inquiriesIndex = linkTexts.indexOf('Inquiries');
    const formsIndex = linkTexts.indexOf('Public Forms');
    expect(inquiriesIndex).toBeGreaterThanOrEqual(0);
    expect(formsIndex).toBe(inquiriesIndex + 1);
  });

  it('shows Public Forms for agent (read-capable) users', () => {
    appState.role = 'agent';
    renderSidebar('/inquiries');
    expect(screen.getByText('Public Forms')).toBeTruthy();
  });

  it('marks the Public Forms entry active on the Public Forms route', () => {
    renderSidebar('/settings/public-forms');
    const link = screen.getByText('Public Forms').closest('a');
    expect(link?.className).toContain('menu-item-active');
  });

  it('hides Settings from viewer users per role convention', () => {
    appState.role = 'viewer';
    renderSidebar('/dashboard');
    expect(screen.queryByText('Settings')).toBeNull();
  });
});