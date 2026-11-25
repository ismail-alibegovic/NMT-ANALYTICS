import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '../components/ui/modal';
import { I18nProvider } from '../lib/i18n/context';

vi.mock('../api/departures', () => ({
  createPassengerGroup: vi.fn(),
  updatePassengerGroup: vi.fn(),
  deletePassengerGroup: vi.fn(),
  replacePassengerGroupMembers: vi.fn(),
}));

import DrustvaTab from '../components/operations/DrustvaTab';

const twoUnseatedPassengers: any[] = [
  { id: 'p1', passengerId: 'p1', fullName: 'Amina Test', seat: null },
  { id: 'p2', passengerId: 'p2', fullName: 'Emir Test', seat: null },
];

const sampleGroup: any = {
  id: 'grp-1',
  departure_id: 'dep-1',
  org_id: 'org-1',
  name: 'Porodica Test',
  color: '#3B82F6',
  primary_passenger_id: 'p1',
  seat_preference: 'keep_together',
  accommodation_preference: 'same_room',
  is_locked: false,
  members: [
    { id: 'm1', group_id: 'grp-1', passenger_id: 'p1', org_id: 'org-1', passenger: { id: 'p1', full_name: 'Amina Test', seat: null } },
    { id: 'm2', group_id: 'grp-1', passenger_id: 'p2', org_id: 'org-1', passenger: { id: 'p2', full_name: 'Emir Test', seat: null } },
  ],
};

describe('Standardized Modal component', () => {
  it('renders dialog semantics, description, outline-none focus ring guard, and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <Modal isOpen={true} onClose={onClose} title="Add Expense" description="Record departure cost">
          <div className="p-6">Body</div>
        </Modal>
      </I18nProvider>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('outline-none');
    expect(dialog.className).toContain('rounded-2xl');
    expect(screen.getByText('Add Expense')).toBeInTheDocument();
    expect(screen.getByText('Record departure cost')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DrustvaTab standardized modal & localized seat status', () => {
  it('renders localized BS seat status badges and opens standardized New Group dialog', () => {
    localStorage.setItem('travline_lang', 'bs');
    render(
      <I18nProvider>
        <DrustvaTab
          departureId="dep-1"
          passengers={twoUnseatedPassengers}
          groups={[sampleGroup]}
          onRefresh={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('Neraspoređeni')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nova grupa/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('rounded-2xl');
  });

  it('renders localized EN seat status badges without Bosnian leakage', () => {
    localStorage.setItem('travline_lang', 'en');
    render(
      <I18nProvider>
        <DrustvaTab
          departureId="dep-1"
          passengers={twoUnseatedPassengers}
          groups={[sampleGroup]}
          onRefresh={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.queryByText('Neraspoređeni')).not.toBeInTheDocument();
  });
});
