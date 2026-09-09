import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import DepartureDetail from "../pages/DepartureDetail";
import { en } from "../lib/i18n/en";

const {
  mockGetDeparture,
  mockGetSegments,
  mockGetProfitability,
  appState,
} = vi.hoisted(() => ({
  mockGetDeparture: vi.fn(),
  mockGetSegments: vi.fn(),
  mockGetProfitability: vi.fn(),
  appState: { role: "manager" as string },
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
  getDepartureProfitability: (...args: any[]) => mockGetProfitability(...args),
  createDepartureCostItem: vi.fn(),
  updateDepartureCostItem: vi.fn(),
  deleteDepartureCostItem: vi.fn(),
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

vi.mock("../context/AppContext", () => ({
  useApp: () => ({ userContext: { role: appState.role }, user: { id: "user-1" }, loading: false }),
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

vi.mock("../components/ui/EmptyState", () => ({ default: ({ title, description }: any) => <div><span>{title}</span><span>{description}</span></div> }));
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

function renderDetail(path = "/departures/d1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/departures/:id" element={<DepartureDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("M13.2 — DepartureDetail canonical flight configuration UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appState.role = "manager";
    mockGetProfitability.mockResolvedValue({
      departureId: "d1",
      currency: "BAM",
      revenue: 1000,
      collected: 300,
      outstanding: 700,
      supplierCosts: 250,
      estimatedGrossProfit: 750,
      marginPct: 75,
      reservationCount: 1,
      costItems: [],
      costBreakdown: [],
      warnings: [],
    });
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

  it("renders the Finance tab with canonical profitability KPIs and empty cost state", async () => {
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "bus",
      destination: "Test",
      packageName: "Antalya",
      packages: { currency: "BAM" },
      capacity: 50,
      status: "active",
      capabilities: { hasBusTransport: true },
    });
    mockGetSegments.mockResolvedValue([]);

    renderDetail();
    const financeTab = await screen.findByRole("button", { name: en.departure.finance.title });
    fireEvent.click(financeTab);

    expect(await screen.findByText(en.departure.finance.grossProfit)).toBeInTheDocument();
    const text = document.body.textContent || "";
    expect(text).toContain("1.000,00");
    expect(text).toContain("300,00");
    expect(text).toContain("700,00");
    expect(screen.getByText(en.departure.finance.emptyCostsTitle)).toBeInTheDocument();
  });

  it.each(["manager", "director"])("shows Finance tab for %s users", async (role) => {
    appState.role = role;
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "bus",
      destination: "Test",
      packageName: "Antalya",
      packages: { currency: "BAM" },
      capacity: 50,
      status: "active",
      capabilities: { hasBusTransport: true },
    });
    mockGetSegments.mockResolvedValue([]);

    renderDetail();

    expect(await screen.findByRole("button", { name: en.departure.finance.title })).toBeInTheDocument();
  });

  it.each(["agent", "viewer"])("hides Finance tab for %s users", async (role) => {
    appState.role = role;
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "bus",
      destination: "Test",
      packageName: "Antalya",
      packages: { currency: "BAM" },
      capacity: 50,
      status: "active",
      capabilities: { hasBusTransport: true },
    });
    mockGetSegments.mockResolvedValue([]);

    renderDetail();

    await screen.findByText("Antalya");
    expect(screen.queryByRole("button", { name: en.departure.finance.title })).not.toBeInTheDocument();
  });

  it("does not activate Finance or call profitability for unauthorized finance deep-link", async () => {
    appState.role = "agent";
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "bus",
      destination: "Test",
      packageName: "Antalya",
      packages: { currency: "BAM" },
      capacity: 50,
      status: "active",
      capabilities: { hasBusTransport: true },
    });
    mockGetSegments.mockResolvedValue([]);

    renderDetail("/departures/d1?tab=finance");

    await screen.findByText("Antalya");
    await waitFor(() => expect(mockGetProfitability).not.toHaveBeenCalled());
    expect(screen.queryByText(en.departure.finance.grossProfit)).not.toBeInTheDocument();
  });

  it("activates Finance and calls profitability for authorized manager deep-link", async () => {
    appState.role = "manager";
    mockGetDeparture.mockResolvedValue({
      id: "d1",
      transport_type: "bus",
      destination: "Test",
      packageName: "Antalya",
      packages: { currency: "BAM" },
      capacity: 50,
      status: "active",
      capabilities: { hasBusTransport: true },
    });
    mockGetSegments.mockResolvedValue([]);

    renderDetail("/departures/d1?tab=finance");

    expect(await screen.findByText(en.departure.finance.grossProfit)).toBeInTheDocument();
    expect(mockGetProfitability).toHaveBeenCalledWith("d1");
  });
});
