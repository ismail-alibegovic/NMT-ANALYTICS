import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Flights from '../pages/operations/Flights'

const { mockFlights } = vi.hoisted(() => ({
  mockFlights: [
  {
    id: 'f1', orgId: 'o1', airline: 'Turkish Airlines', flightNumber: 'TK101',
    departureAirport: 'SJJ', arrivalAirport: 'IST',
    departureTime: '2026-09-10T08:00:00Z', arrivalTime: '2026-09-10T11:30:00Z',
    capacity: 180, basePrice: 250, currency: 'KM', notes: null, active: true,
    linkedDepartureCount: 2,
    linkedDepartures: [{ id: 'd1', direction: 'outbound', departAt: '2026-09-12T08:00:00Z' }],
  },
  {
    id: 'f2', orgId: 'o1', airline: 'Pegasus', flightNumber: 'PC221',
    departureAirport: 'SJJ', arrivalAirport: 'ADB',
    departureTime: '2026-09-11T06:00:00Z', arrivalTime: '2026-09-11T08:00:00Z',
    capacity: 186, basePrice: 180, currency: 'KM', notes: null, active: false,
    linkedDepartureCount: 0, linkedDepartures: [],
  },
  ],
}))

vi.mock('../api/flights', () => ({
  getFlights: vi.fn(async () => ({ data: mockFlights, total: 2 })),
  getFlight: vi.fn(async (id: string) => mockFlights.find((f: { id: string }) => f.id === id) || mockFlights[0]),
  createFlight: vi.fn(async () => ({})),
  updateFlight: vi.fn(async () => ({})),
  toggleFlightActive: vi.fn(async () => ({})),
  deleteFlight: vi.fn(async () => undefined),
}))

vi.mock('../api/operations', async () => {
  const actual = await vi.importActual<typeof import('../api/operations')>('../api/operations')
  return { ...actual, getDepartures: vi.fn(async () => []) }
})

vi.mock('../components/common/PageMeta', () => ({
  default: () => null,
}));

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u1', org_id: 'org1' }, loading: false }),
}));

vi.mock('../lib/i18n/context', async () => {
  const { en } = await import('../lib/i18n/en')
  return {
    useT: () => ({ lang: 'en', t: en, toggleLang: vi.fn(), setLang: vi.fn() }),
  }
})

vi.mock('../components/ui/modal', () => ({
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));

vi.mock('../components/common/PageBreadCrumb', () => ({ default: () => null }))
vi.mock('../context/SidebarContext', () => ({
  useSidebar: () => ({ isMobileOpen: false, toggleMobileSidebar: () => {}, isSidebarOpen: true, toggleSidebar: () => {} }),
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))

vi.mock('../components/ui/PageToolbar', () => ({
  default: ({ searchValue, onSearchChange }: { searchValue?: string; onSearchChange?: (v: string) => void }) => (
    <div>
      <input aria-label="search" value={searchValue} onChange={(e) => onSearchChange?.(e.target.value)} />
    </div>
  ),
}))

vi.mock('../components/ui/DataTable', () => ({
  DataTable: ({ data, columns }: { data: unknown[]; columns: Array<{ key: string; header: string; render?: (v: unknown, row: unknown) => unknown }> }) => (
    <table>
      <thead><tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
      <tbody>
        {data.map((row: unknown) => (
          <tr key={(row as { id: string }).id} data-testid={`row-${(row as { id: string }).id}`}>
            {columns.map((c) => (
              <td key={c.key}>{c.render ? (c.render((row as Record<string, unknown>)[c.key], row) as any) : ((row as Record<string, unknown>)[c.key] as any)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}))

vi.mock('../components/ui', () => ({
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  EmptyState: ({ description }: { description?: string }) => <div>{description}</div>,
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
  ConfirmDialog: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="confirm" /> : null),
  Skeleton: ({ className = '' }: { className?: string }) => <div className={className} />,
}))

vi.mock('../icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../icons')
  const stub = () => <svg />
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(actual)) out[key] = stub
  return out
})

describe('Flights page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders flight rows with route and capacity', async () => {
    render(<MemoryRouter><Flights /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('row-f1')).toBeTruthy())
    expect(screen.getByTestId('row-f2')).toBeTruthy()
  })

  it('sends search param to API', async () => {
    render(<MemoryRouter><Flights /></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText('search')))
    const { getFlights } = await import('../api/flights')
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'turkish' } })
    await waitFor(() => expect(getFlights).toHaveBeenCalledWith(expect.objectContaining({ search: 'turkish' })))
  })

  it('opens edit modal with flight data', async () => {
    render(<MemoryRouter><Flights /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('row-f1')).toBeTruthy())
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await waitFor(() => expect(screen.getByTestId('modal')).toBeTruthy())
  })
})