import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DepartureAccommodationPanel from '../components/departures/DepartureAccommodationPanel';

const roomingWorkspace = vi.fn();

vi.mock('../components/departures/DepartureAccommodationAllotment', () => ({
  default: ({ departureId }: { departureId: string }) => (
    <div data-testid="inventory-view">Inventory for {departureId}</div>
  ),
}));

vi.mock('../components/operations/RoomingWorkspace', () => ({
  default: (props: any) => {
    roomingWorkspace(props);
    return <div data-testid="rooming-view">Rooming for {props.departureId}</div>;
  },
}));

vi.mock('../lib/i18n/context', () => ({
  useT: () => ({
    t: {
      departure: {
        accommodationAllotment: {
          inventoryTab: 'Inventory',
          roomingTab: 'Rooming',
        },
      },
    },
  }),
}));

const passengers = [
  {
    id: 'passenger-1',
    passengerId: 'passenger-1',
    reservationId: 'reservation-1',
    fullName: 'Amina Hodzic',
  },
];

describe('DepartureAccommodationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders inventory by default and keeps RoomingWorkspace reachable with the existing props', () => {
    render(<DepartureAccommodationPanel departureId="departure-1" passengers={passengers as any} />);

    expect(screen.getByTestId('inventory-view')).toHaveTextContent('Inventory for departure-1');
    expect(screen.queryByTestId('rooming-view')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rooming' }));

    expect(screen.getByTestId('rooming-view')).toHaveTextContent('Rooming for departure-1');
    expect(roomingWorkspace).toHaveBeenCalledWith({
      departureId: 'departure-1',
      passengers,
    });
  });
});
