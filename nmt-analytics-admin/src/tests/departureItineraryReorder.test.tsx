import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import DepartureDetail from "../pages/DepartureDetail";
import { en } from "../lib/i18n/en";

const {
  mockReorder,
  mockGetSegments,
  mockGetDeparture,
} = vi.hoisted(() => ({
  mockReorder: vi.fn(),
  mockGetSegments: vi.fn(),
  mockGetDeparture: vi.fn(),
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
  getDepartureProfitability: vi.fn(async () => ({
    departureId: "d1",
    currency: "BAM",
    revenue: 0,
    collected: 0,
    outstanding: 0,
    supplierCosts: 0,
    estimatedGrossProfit: 0,
    marginPct: null,
    reservationCount: 0,
    costItems: [],
    costBreakdown: [],
    warnings: [],
  })),
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
  reorderFlightSegments: (...args: any[]) => mockReorder(...args),
}));

vi.mock("../api/reservations", () => ({
  getReservations: vi.fn(async () => ({ data: [], total: 0, pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } })),
}));

vi.mock("../api/manualMessaging", () => ({
  sendDepartureManualMessage: vi.fn(),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

vi.mock("../icons", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../icons");
  const stub = () => <svg />;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) out[key] = stub;
  return out;
});

vi.mock("../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("../components/operations/ManualBusSeating", () => ({ default: () => null }));
vi.mock("../components/operations/AutoSeatingPanel", () => ({ default: () => null }));
vi.mock("../components/departures/DepartureAccommodationPanel", () => ({ default: () => null }));
vi.mock("../components/operations/DrustvaTab", () => ({ default: () => null }));
vi.mock("../components/communications/CommunicationHistoryPanel", () => ({ default: () => null }));
vi.mock("../components/communications/ManualMessageComposer", () => ({ default: () => null }));
vi.mock("../components/ui/modal", () => ({
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));

const flight = (id: string, airline: string, number: string) => ({
  id,
  airline,
  flightNumber: number,
  departureAirport: "SJJ",
  arrivalAirport: "VIE",
  departureTime: "2026-09-10T08:00:00Z",
  arrivalTime: "2026-09-10T09:30:00Z",
  capacity: 180,
  active: true,
});

// Mirrors the M13.1 example: A outbound 1, B outbound 2, C outbound 3, D return 1.
const baseSegments = [
  { id: "seg-a", flightId: "fa", direction: "outbound" as const, segmentOrder: 1, flight: flight("fa", "Alpha", "A100") },
  { id: "seg-b", flightId: "fb", direction: "outbound" as const, segmentOrder: 2, flight: flight("fb", "Bravo", "B200") },
  { id: "seg-c", flightId: "fc", direction: "outbound" as const, segmentOrder: 3, flight: flight("fc", "Charlie", "C300") },
  { id: "seg-d", flightId: "fd", direction: "return" as const, segmentOrder: 1, flight: flight("fd", "Delta", "D400") },
];

const departure = {
  id: "dep-1",
  package_id: "pkg-1",
  depart_at: "2026-09-10T08:00:00Z",
  return_at: null,
  capacity: 180,
  name: "Vienna Tour",
  transport_type: "flight",
  linkedFlight: null,
  capabilities: {
    transportType: "flight",
    hasBusTransport: false,
    hasFlight: true,
    hasManagedSeatLayout: false,
    hasAccommodation: false,
  },
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/departures/dep-1"]}>
      <Routes>
        <Route path="/departures/:id" element={<DepartureDetail />} />
      </Routes>
    </MemoryRouter>,
  );

/** Finds the move-down button inside the itinerary card that shows the given flight number. */
const moveDownInCard = (flightNumber: string) => {
  const label = screen.getByText(new RegExp(`\\b${flightNumber}\\b`));
  const card = label.closest("div.rounded-xl");
  if (!card) throw new Error(`itinerary card for ${flightNumber} not found`);
  const btn = Array.from(card.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === en.operations.flights.moveDown,
  );
  if (!btn) throw new Error(`move down button for ${flightNumber} not found`);
  return btn;
};

describe("M13.1 flight itinerary reorder (DepartureDetail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeparture.mockResolvedValue(departure);
    mockGetSegments.mockResolvedValue(baseSegments);
    mockReorder.mockResolvedValue(undefined);
  });

  it("sends the COMPLETE segment set on move, swapping only the two intended orders", async () => {
    const user = userEvent.setup();
    renderPage();

    // Wait for itinerary cards to render.
    await screen.findByText(/B200/);

    await user.click(moveDownInCard("B200"));

    await waitFor(() => expect(mockReorder).toHaveBeenCalledTimes(1));

    const sent = mockReorder.mock.calls[0][1] as Array<{
      id: string;
      direction: string;
      segmentOrder: number;
    }>;

    // Complete set: all four segments, including the other direction.
    expect(sent).toHaveLength(4);
    expect(sent.map((s) => s.id).sort()).toEqual(["seg-a", "seg-b", "seg-c", "seg-d"]);

    // Only the intended two orders swap: B (2 -> 3) and C (3 -> 2).
    const byId = Object.fromEntries(sent.map((s) => [s.id, s]));
    expect(byId["seg-a"]).toMatchObject({ direction: "outbound", segmentOrder: 1 });
    expect(byId["seg-b"]).toMatchObject({ direction: "outbound", segmentOrder: 3 });
    expect(byId["seg-c"]).toMatchObject({ direction: "outbound", segmentOrder: 2 });

    // Other-direction segment is unchanged.
    expect(byId["seg-d"]).toMatchObject({ direction: "return", segmentOrder: 1 });
  });

  it("reloads the itinerary after a successful reorder", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/B200/);
    expect(mockGetSegments).toHaveBeenCalledTimes(1);

    // Reordered set returned on reload.
    const reordered = baseSegments.map((s) =>
      s.id === "seg-b" ? { ...s, segmentOrder: 3 } : s.id === "seg-c" ? { ...s, segmentOrder: 2 } : s,
    );
    mockGetSegments.mockResolvedValue(reordered);

    await user.click(moveDownInCard("B200"));

    await waitFor(() => expect(mockGetSegments).toHaveBeenCalledTimes(2));
    expect(mockReorder).toHaveBeenCalledTimes(1);

    // Reloaded order reflects the swap: C (order 2) renders before B (order 3).
    await waitFor(() => {
      const cards = Array.from(document.querySelectorAll("div.rounded-xl"));
      const cIdx = cards.findIndex((el) => el.textContent?.includes("C300"));
      const bIdx = cards.findIndex((el) => el.textContent?.includes("B200"));
      expect(cIdx).toBeGreaterThan(-1);
      expect(bIdx).toBeGreaterThan(cIdx);
    });
  });

  it("keeps the error visible and does not reload on failure", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/B200/);

    mockReorder.mockRejectedValueOnce({
      response: { data: { message: "Segment set does not match this departure itinerary" } },
    });

    await user.click(moveDownInCard("B200"));

    const errorEl = await screen.findByText("Segment set does not match this departure itinerary");

    // Error remains visible (not auto-dismissed/replaced).
    await new Promise((r) => setTimeout(r, 50));
    expect(errorEl).toBeInTheDocument();

    // No reload on failure: segments stayed at the initial load only.
    expect(mockGetSegments).toHaveBeenCalledTimes(1);
  });
});
