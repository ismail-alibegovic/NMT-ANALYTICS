import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import DepartureDetail from "../pages/DepartureDetail";
import { en } from "../lib/i18n/en";

const {
  mockGetDeparture,
  mockGetSegments,
} = vi.hoisted(() => ({
  mockGetDeparture: vi.fn(),
  mockGetSegments: vi.fn(),
}));

vi.mock("../lib/i18n/context", () => ({
  useTranslation: () => en,
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../api/departures", () => ({
  getDeparture: (...args: any[]) => mockGetDeparture(...args),
  getDeparturePassengers: vi.fn(async () => ({ manifest: [], summary: {} })),
  createDeparturePassenger: vi.fn(),
  deleteDeparturePassenger: vi.fn(),
  getDepartureGroups: vi.fn(async () => ({ byHotel: [], byAgent: [] })),
  getPassengerGroups: vi.fn(async () => []),
  updateDeparture: vi.fn(),
  updateDeparturePassenger: vi.fn(),
}));

vi.mock("../api/flights", () => ({
  getFlights: vi.fn(async () => ({ data: [], total: 0 })),
  getDepartureFlightSegments: (...args: any[]) => mockGetSegments(...args),
  linkFlightToDeparture: vi.fn(),
  unlinkFlightFromDeparture: vi.fn(),
  reorderFlightSegments: vi.fn(),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

vi.mock("../api/reservations", () => ({
  getReservations: vi.fn(async () => ({ data: [], total: 0, pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } })),
}));

vi.mock("../api/manualMessaging", () => ({
  sendDepartureManualMessage: vi.fn(),
}));

vi.mock("../components/operations/ManualBusSeating", () => ({ default: () => null }));
vi.mock("../components/operations/AutoSeatingPanel", () => ({ default: () => null }));
vi.mock("../components/operations/DrustvaTab", () => ({ default: () => null }));
vi.mock("../components/communications/CommunicationHistoryPanel", () => ({ default: () => null }));

vi.mock("../components/ui/EmptyState", () => ({ default: () => null }));
vi.mock("../components/ui/modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => children,
  FormModal: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../components/departures/DepartureAccommodationPanel", () => ({ default: () => null }));
vi.mock("../components/communications/ManualMessageComposer", () => ({ default: () => null }));
vi.mock("../components/common/PageMeta", () => ({ default: () => null }));

vi.mock("../icons", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../icons");
  const stub = () => <svg />;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) out[key] = stub;
  return out;
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/departures/d1"]}>
      <Routes>
        <Route path="/departures/:id" element={<DepartureDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("M13.2 — DepartureDetail canonical flight configuration UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT show "Flight not configured" when canonical flightSegments exist (flightConfigured = true)', async () => {
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "flight",
      destination: "Test Flight",
      linkedFlight: null,
      capabilities: {
        hasFlight: true,
        flightConfigured: true,
      },
    });
    mockGetSegments.mockResolvedValue([
      { id: "s1", departure_id: "d1", segmentOrder: 0, direction: "outbound", flight: null },
    ]);

    renderDetail();
    await waitFor(() => {
      expect(screen.queryByText(en.departure.flightNotConfigured)).not.toBeInTheDocument();
    });
  });

  it('shows "Flight not configured" when canonical itinerary is empty (flightConfigured = false)', async () => {
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "flight",
      destination: "Test Flight",
      linkedFlight: null,
      capabilities: {
        hasFlight: true,
        flightConfigured: false,
      },
    });
    mockGetSegments.mockResolvedValue([]);

    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(en.departure.flightNotConfigured)).toBeInTheDocument();
    });
  });

  it('shows Flight configured status when canonical segments exist but no legacy linkedFlight', async () => {
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "flight",
      destination: "Test Flight",
      linkedFlight: null,
      capabilities: {
        hasFlight: true,
        flightConfigured: true,
      },
    });
    mockGetSegments.mockResolvedValue([
      { id: "s1", departure_id: "d1", segmentOrder: 0, direction: "outbound", flight: null },
    ]);

    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(en.departure.flightReady)).toBeInTheDocument();
    });
  });
});
