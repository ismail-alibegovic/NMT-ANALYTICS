import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { I18nProvider, useT } from '../lib/i18n/context';
import { bs } from '../lib/i18n/bs';
import { en } from '../lib/i18n/en';
import OnboardingChecklist from '../components/common/OnboardingChecklist';
import TeamManagementPanel from '../components/settings/TeamManagementPanel';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  role: 'director' as string,
}));

vi.mock('../lib/apiClient', () => ({
  default: {
    get: (...args: any[]) => mocks.apiGet(...args),
    post: (...args: any[]) => mocks.apiPost(...args),
    patch: (...args: any[]) => mocks.apiPatch(...args),
  },
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({
    user: { id: 'dir-1', email: 'director@agency.test' },
    userContext: { role: mocks.role, orgId: 'org-1', userId: 'dir-1' },
    loading: false,
  }),
}));

function LangSwitchButton() {
  const { lang, toggleLang } = useT();
  return (
    <button type="button" data-testid="toggle-lang" onClick={toggleLang}>
      {lang}
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('travline_lang', 'bs');
  mocks.role = 'director';
});

describe('ONBOARD-01: OnboardingChecklist reliability and BS/EN parity', () => {
  it('consumes canonical /onboarding/status steps, links to valid routes (no /admin/packages), and persists skip via POST /onboarding/skip', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        skipped: false,
        completed: 2,
        total: 6,
        percentage: 33,
        isComplete: false,
        steps: [
          { key: 'agency_name', required: true, completed: true },
          { key: 'logo', required: true, completed: true },
          { key: 'first_package', required: true, completed: false },
          { key: 'first_departure', required: true, completed: false },
          { key: 'first_reservation', required: true, completed: false },
          { key: 'team_member', required: false, completed: false },
        ],
      },
    });
    mocks.apiPost.mockResolvedValue({ data: { skipped: true } });

    render(
      <MemoryRouter>
        <I18nProvider>
          <OnboardingChecklist />
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/2 \/ 6/)).toBeInTheDocument();
    const pkgLink = screen.getByRole('link', { name: bs.onboarding.addFirstPackage });
    expect(pkgLink).toHaveAttribute('href', '/packages');
    const depLink = screen.getByRole('link', { name: bs.onboarding.scheduleDeparture });
    expect(depLink).toHaveAttribute('href', '/departures');
    const teamLink = screen.getByRole('link', { name: bs.onboarding.addTeamMember });
    expect(teamLink).toHaveAttribute('href', '/settings#team');

    await userEvent.click(screen.getByRole('button', { name: bs.onboarding.dismiss }));
    expect(mocks.apiPost).toHaveBeenCalledWith('/onboarding/skip');
  });

  it('does not request /onboarding/status for non-director users', () => {
    mocks.role = 'agent';
    const { container } = render(
      <MemoryRouter>
        <I18nProvider>
          <OnboardingChecklist />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(mocks.apiGet).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('fails closed with a localized retry alert instead of rendering an empty 0/0 card on read failure', async () => {
    mocks.apiGet
      .mockRejectedValueOnce({ status: 503, message: 'PRIVATE SQL error' })
      .mockResolvedValueOnce({
        data: {
          skipped: false,
          completed: 1,
          total: 2,
          percentage: 50,
          isComplete: false,
          steps: [
            { key: 'agency_name', required: true, completed: true },
            { key: 'first_package', required: true, completed: false },
          ],
        },
      });

    render(
      <MemoryRouter>
        <I18nProvider>
          <OnboardingChecklist />
        </I18nProvider>
      </MemoryRouter>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(bs.onboarding.loadFailed);
    expect(alert.textContent).not.toContain('PRIVATE SQL error');
    expect(screen.queryByText(/0 \/ 0/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: bs.onboarding.retry }));
    expect(await screen.findByText(/1 \/ 2/)).toBeInTheDocument();
  });
});

describe('ONBOARD-01: TeamManagementPanel fail-closed reads, provisioning, revocation and live BS/EN switching', () => {
  const directorMember = {
    id: 'dir-1',
    email: 'director@agency.test',
    fullName: 'Emir Director',
    role: 'director',
    createdAt: '2026-11-01T00:00:00Z',
    revokedAt: null,
    status: 'active' as const,
  };

  it('fails closed with retry on read error and never exposes blank creation form until loaded', async () => {
    mocks.apiGet
      .mockRejectedValueOnce({ status: 503, message: 'PRIVATE DB error' })
      .mockResolvedValueOnce({ data: { members: [directorMember], smtpRequired: false } });

    render(
      <I18nProvider>
        <TeamManagementPanel />
      </I18nProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(bs.settings.teamManagement.loadFailed);
    expect(alert.textContent).not.toContain('PRIVATE DB error');
    expect(screen.queryByRole('button', { name: bs.settings.teamManagement.createAction })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: bs.settings.teamManagement.retry }));
    expect(await screen.findByText('Emir Director')).toBeInTheDocument();
  });

  it('updates visible USER_EXISTS conflict banner on live BS <-> EN switch while preserving operator draft, blocks same-tick double submit, then provisions with one-time password', async () => {
    let releaseConflict!: () => void;
    mocks.apiGet.mockResolvedValue({ data: { members: [directorMember], smtpRequired: false } });
    mocks.apiPost
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            releaseConflict = () => reject({ response: { data: { code: 'USER_EXISTS' } } });
          }),
      )
      .mockResolvedValueOnce({
        data: {
          member: {
            id: 'staff-1',
            email: 'amina@agency.test',
            fullName: 'Amina Agent',
            role: 'agent',
            createdAt: '2026-11-23T00:00:00Z',
            revokedAt: null,
            status: 'active',
          },
          initialPassword: 'Temp#Pass9911XyZ',
          smtpRequired: false,
        },
      });

    render(
      <I18nProvider>
        <LangSwitchButton />
        <TeamManagementPanel />
      </I18nProvider>,
    );

    await screen.findByText('Emir Director');
    const nameInput = screen.getByLabelText(bs.settings.teamManagement.fullName);
    const emailInput = screen.getByLabelText(bs.settings.teamManagement.email);
    const submitBtn = screen.getByRole('button', { name: bs.settings.teamManagement.createAction });

    await userEvent.type(nameInput, 'Amina Agent');
    await userEvent.type(emailInput, 'amina@agency.test');

    // Same-tick double submit
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);

    releaseConflict();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(bs.settings.teamManagement.errors.USER_EXISTS);
    expect(nameInput).toHaveValue('Amina Agent');
    expect(emailInput).toHaveValue('amina@agency.test');

    // Live BS -> EN switch updates conflict message in place while keeping drafts
    await userEvent.click(screen.getByTestId('toggle-lang'));
    expect(screen.getByRole('alert')).toHaveTextContent(en.settings.teamManagement.errors.USER_EXISTS);
    expect(nameInput).toHaveValue('Amina Agent');
    expect(emailInput).toHaveValue('amina@agency.test');

    // Retry succeeds and shows one-time password banner
    await userEvent.click(screen.getByRole('button', { name: en.settings.teamManagement.createAction }));
    expect(await screen.findByTestId('initial-password-value')).toHaveTextContent('Temp#Pass9911XyZ');
    expect(screen.getByText('Amina Agent')).toBeInTheDocument();
  });

  it('supports role change, revoke, and reactivate while keeping self-revoke disabled', async () => {
    localStorage.setItem('travline_lang', 'en');
    const staffMember = {
      id: 'staff-1',
      email: 'amina@agency.test',
      fullName: 'Amina Agent',
      role: 'agent',
      createdAt: '2026-11-23T00:00:00Z',
      revokedAt: null,
      status: 'active' as const,
    };
    mocks.apiGet.mockResolvedValue({ data: { members: [directorMember, staffMember], smtpRequired: false } });
    mocks.apiPatch.mockResolvedValue({ data: { member: { ...staffMember, role: 'manager' } } });
    mocks.apiPost
      .mockResolvedValueOnce({
        data: { member: { ...staffMember, role: 'manager', revokedAt: '2026-11-23T12:00:00Z', status: 'revoked' } },
      })
      .mockResolvedValueOnce({
        data: { member: { ...staffMember, role: 'manager', revokedAt: null, status: 'active' } },
      });

    render(
      <I18nProvider>
        <TeamManagementPanel />
      </I18nProvider>,
    );

    await screen.findByText('Amina Agent');
    const revokeBtns = screen.getAllByRole('button', { name: en.settings.teamManagement.revokeAction });
    // Director self-revoke button is disabled; staff revoke is enabled
    expect(revokeBtns[0]).toBeDisabled();
    expect(revokeBtns[1]).not.toBeDisabled();

    // Role change agent -> manager
    const staffRoleSelect = screen.getByLabelText(`${en.settings.teamManagement.roleLabel} Amina Agent`);
    await userEvent.selectOptions(staffRoleSelect, 'manager');
    expect(mocks.apiPatch).toHaveBeenCalledWith('/settings/team/staff-1/role', { role: 'manager' });

    // Revoke -> shows Revoked badge + Reactivate button
    await userEvent.click(revokeBtns[1]);
    expect(await screen.findByText(en.settings.teamManagement.statusRevoked)).toBeInTheDocument();

    // Reactivate -> restores Active status
    await userEvent.click(screen.getByRole('button', { name: en.settings.teamManagement.reactivateAction }));
    expect(await screen.findByText(en.settings.teamManagement.memberReactivated)).toBeInTheDocument();
  });
});
