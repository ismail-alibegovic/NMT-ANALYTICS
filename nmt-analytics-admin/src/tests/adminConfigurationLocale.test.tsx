import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import { bs } from '../lib/i18n/bs';
import { en } from '../lib/i18n/en';

const h = vi.hoisted(() => ({
  role: 'director' as 'director' | 'manager' | 'agent' | 'viewer' | 'super_admin',
  orgCurrency: 'BAM',
  stableUser: { id: 'user-1', email: 'director@agency.test' },
  getClient: vi.fn(),
  patchClient: vi.fn(),
  getAuditLogs: vi.fn(),
  updateBranding: vi.fn(),
  submitETurista: vi.fn(),
  getETuristaHistory: vi.fn(),
  analyzeRevenueDrop: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  getTemplates: vi.fn(),
  createTemplate: vi.fn(),
  toastBrandingRefresh: vi.fn(),
  setBranding: vi.fn(),
}));

vi.mock('../api/client', () => ({
  get: (...args: unknown[]) => h.getClient(...args),
  patch: (...args: unknown[]) => h.patchClient(...args),
}));

vi.mock('../lib/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => h.apiGet(...args),
    patch: (...args: unknown[]) => h.apiPatch(...args),
  },
}));

vi.mock('../api/admin', () => ({
  getAuditLogs: (...args: unknown[]) => h.getAuditLogs(...args),
}));

vi.mock('../api/branding', () => ({
  updateBranding: (...args: unknown[]) => h.updateBranding(...args),
}));

vi.mock('../api/eturista', () => ({
  submitETurista: (...args: unknown[]) => h.submitETurista(...args),
  getETuristaHistory: (...args: unknown[]) => h.getETuristaHistory(...args),
}));

vi.mock('../api/ai', () => ({
  analyzeRevenueDrop: (...args: unknown[]) => h.analyzeRevenueDrop(...args),
}));

vi.mock('../api/messageTemplates', () => ({
  getMessageTemplates: (...args: unknown[]) => h.getTemplates(...args),
  createMessageTemplate: (...args: unknown[]) => h.createTemplate(...args),
  updateMessageTemplate: vi.fn(),
  archiveMessageTemplate: vi.fn(),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    success: h.toastSuccess,
    error: h.toastError,
    showSuccess: h.toastSuccess,
    showError: h.toastError,
  }),
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    user: h.stableUser,
    loading: false,
    userContext: {
      role: h.role,
      user: { email: 'director@agency.test' },
      org: { id: 'org-1', name: 'Synthetic Agency', currency: h.orgCurrency },
    },
    refreshUserContext: vi.fn(),
  }),
}));

vi.mock('../components/portal/BrandingProvider', () => ({
  useBranding: () => ({
    branding: {
      display_name: 'Synthetic Agency',
      logo_url: '',
      primary_color: '#1D4ED8',
      accent_color: '#0EA5E9',
    },
    loading: false,
    refresh: h.toastBrandingRefresh,
    setBranding: h.setBranding,
  }),
}));

vi.mock('../components/common/PageMeta', () => ({ default: () => null }));
vi.mock('../icons', () => ({
  DocsIcon: () => null,
  UserCircleIcon: () => null,
}));

import AuditLogs from '../pages/admin/AuditLogs';
import Profile from '../pages/Profile';
import PortalSettings from '../pages/portal/PortalSettings';
import Integrations from '../pages/admin/Integrations';
import Settings from '../pages/admin/Settings';

beforeEach(() => {
  localStorage.clear();
  h.role = 'director';
  h.orgCurrency = 'BAM';
  h.getClient.mockReset();
  h.patchClient.mockReset();
  h.getAuditLogs.mockReset();
  h.updateBranding.mockReset();
  h.submitETurista.mockReset();
  h.getETuristaHistory.mockReset();
  h.analyzeRevenueDrop.mockReset();
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
  h.apiGet.mockReset();
  h.apiPatch.mockReset();
  h.getTemplates.mockReset();
  h.createTemplate.mockReset();
  h.toastBrandingRefresh.mockReset();
  h.setBranding.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Admin Configuration BS/EN localization & fail-closed recovery', () => {
  it.each(['bs', 'en'] as const)('AuditLogs fails closed on load error, retries cleanly, and formats date in %s', async (lang) => {
    const t = lang === 'bs' ? bs : en;
    localStorage.setItem('travline_lang', lang);

    h.getAuditLogs.mockRejectedValueOnce(new Error('RAW_INTERNAL_DB_FAILURE'));
    h.getAuditLogs.mockResolvedValueOnce({
      data: [{
        id: 'log-1',
        org_id: 'org-1',
        user_id: 'u-1',
        action: 'create',
        entity: 'reservations',
        entity_id: '12345678-abcd-ef00',
        details: {},
        created_at: '2026-10-15T12:00:00Z',
        profiles: { full_name: 'Amina Test', email: 'amina@agency.test' },
      }],
      total: 1,
      page: 1,
      limit: 15,
      totalPages: 1,
    });

    render(<MemoryRouter><I18nProvider><LanguageToggleButton /><AuditLogs /></I18nProvider></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(t.auditLogs.loadError);
    expect(screen.queryByText('RAW_INTERNAL_DB_FAILURE')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.auditLogs.retry }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Amina Test')).toBeInTheDocument();
    expect(within(table).getByText(t.auditLogs.entities.reservations)).toBeInTheDocument();
    expect(within(table).getByText(t.auditLogs.actions.create.toUpperCase())).toBeInTheDocument();
  });

  it('Profile blocks blank form on load error, retries, preserves draft and re-localizes save alert on BS <-> EN', async () => {
    localStorage.setItem('travline_lang', 'bs');
    h.getClient.mockRejectedValueOnce(new Error('PRIVATE_PROFILE_SQL_ERROR'));
    h.getClient.mockResolvedValueOnce({
      data: {
        profile: { id: 'user-1', role: 'director', full_name: 'Initial User' },
        organization: { id: 'org-1', name: 'Synthetic Agency', slug: 'synthetic-agency' },
      },
    });

    render(<MemoryRouter><I18nProvider><LanguageToggleButton /><Profile /></I18nProvider></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent(bs.profile.loadError);
    expect(screen.queryByText('PRIVATE_PROFILE_SQL_ERROR')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: bs.profile.saveChanges })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: bs.profile.retry }));
    const input = await screen.findByLabelText(bs.profile.fullName);
    expect(input).toHaveValue('Initial User');
    expect(screen.getByText(bs.profile.roles.director)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Edited Draft Name' } });
    h.patchClient.mockRejectedValueOnce(new Error('PRIVATE_PATCH_FAILURE'));
    fireEvent.click(screen.getByRole('button', { name: bs.profile.saveChanges }));

    expect(await screen.findByRole('alert')).toHaveTextContent(bs.profile.updateError);
    expect(screen.queryByText('PRIVATE_PATCH_FAILURE')).not.toBeInTheDocument();
    expect(screen.getByLabelText(bs.profile.fullName)).toHaveValue('Edited Draft Name');

    // Switch BS -> EN while alert is visible: error banner & role re-localize without wiping draft
    fireEvent.click(screen.getByRole('button', { name: bs.common.switchToEnglish }));
    expect(screen.getByRole('alert')).toHaveTextContent(en.profile.updateError);
    expect(screen.getByLabelText(en.profile.fullName)).toHaveValue('Edited Draft Name');
    expect(screen.getByText(en.profile.roles.director)).toBeInTheDocument();
  });

  it('PortalSettings re-localizes validation errors live on BS <-> EN while preserving typed branding draft', async () => {
    localStorage.setItem('travline_lang', 'en');
    render(<MemoryRouter><I18nProvider><LanguageToggleButton /><PortalSettings /></I18nProvider></MemoryRouter>);

    const logoInput = screen.getByLabelText(en.portal.settings.logoUrl);
    fireEvent.change(logoInput, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: en.portal.settings.save }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en.portal.settings.invalidLogoUrl);
    expect(h.updateBranding).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: en.common.switchToBosnian }));
    expect(screen.getByRole('alert')).toHaveTextContent(bs.portal.settings.invalidLogoUrl);
    expect(screen.getByLabelText(bs.portal.settings.logoUrl)).toHaveValue('javascript:alert(1)');
    expect(screen.getByText(bs.profile.roles.director)).toBeInTheDocument();
  });

  it.each(['bs', 'en'] as const)('Integrations renders all 4 cards inside grid and localizes Copilot & eTurista in %s', async (lang) => {
    const t = lang === 'bs' ? bs : en;
    localStorage.setItem('travline_lang', lang);
    h.getETuristaHistory.mockResolvedValueOnce([
      { id: 'et-1', submittedAt: '2026-10-12T10:00:00Z', guestCount: 4, responseStatus: 'success' },
    ]);

    render(<MemoryRouter><I18nProvider><Integrations /></I18nProvider></MemoryRouter>);

    expect(screen.getByRole('heading', { name: t.integrations.pageTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: t.integrations.cards.aiAssistantTitle })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: t.integrations.cards.eTuristaTitle })).toBeInTheDocument();
    expect(await screen.findByText(t.integrations.eTurista.statusSuccess)).toBeInTheDocument();
  });

  it.each(['bs', 'en'] as const)('Settings localizes Message Templates and currency labels in %s', async (lang) => {
    const t = lang === 'bs' ? bs : en;
    localStorage.setItem('travline_lang', lang);
    h.apiGet.mockImplementation(async (url: string) => {
      if (url === '/settings') return { data: { name: 'Synthetic Agency', slug: 'synthetic-agency', currency: 'BAM', timezone: 'Europe/Sarajevo' } };
      if (url === '/settings/plan') return { data: { plan: 'trial', planLabel: 'Trial', entitledModules: ['dashboard'], tiers: [] } };
      if (url === '/settings/agency-profile') return { data: { profiles: ['retail_agency'], capabilities: [], configured: true } };
      return { data: {} };
    });
    h.getTemplates.mockRejectedValueOnce(new Error('RAW_TEMPLATE_DB_ERR'));

    render(<MemoryRouter><I18nProvider><Settings /></I18nProvider></MemoryRouter>);

    expect(await screen.findByText(t.settings.messageTemplates.title)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(t.settings.messageTemplates.loadError);
    expect(screen.queryByText('RAW_TEMPLATE_DB_ERR')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: t.settings.currencies.BAM })).toBeInTheDocument();
  });
});
