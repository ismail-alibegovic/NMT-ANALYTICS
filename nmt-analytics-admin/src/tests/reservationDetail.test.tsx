import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("../components/common/PageMeta", () => ({
  default: ({ title }: any) => <title>{title}</title>,
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../api/reservations", () => ({
  getReservation: vi.fn(),
  downloadVoucher: vi.fn(),
  downloadInvoice: vi.fn(),
  formatReservationCurrency: (v: any, _c?: string) => `${Number(v || 0).toFixed(0)} BAM`,
  formatReservationDate: (v: any) => v || "",
  reservationPaymentStatusBadge: vi.fn(() => "Plaćeno"),
}));

vi.mock("../api/contracts", () => ({
  createContract: vi.fn(),
  getContracts: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../api/manualMessaging", () => ({
  sendReservationManualMessage: vi.fn(),
}));

vi.mock("../components/reservations/EditReservationModal", () => ({
  default: ({ isOpen, onClose, onSuccess, reservationId }: any) =>
    isOpen ? (
      <div data-testid="edit-modal">
        <span>Editing {reservationId}</span>
        <button data-testid="edit-save" onClick={onSuccess}>Save</button>
        <button data-testid="edit-close" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock("../components/communications/CommunicationHistoryPanel", () => ({
  default: () => <div data-testid="comm-history" />,
}));

vi.mock("../components/communications/ManualMessageComposer", () => ({
  default: () => <div data-testid="manual-composer" />,
}));

vi.mock("../api/departures", () => ({
  getDeparturePassengers: vi.fn().mockResolvedValue({ manifest: [] }),
}));

vi.mock("../icons", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../icons");
  const stub = () => <svg />;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) out[key] = stub;
  return out;
});

import { getReservation } from "../api/reservations";
import { getDeparturePassengers } from "../api/departures";
import ReservationDetail from "../pages/ReservationDetail";

const mockGetReservation = getReservation as ReturnType<typeof vi.fn>;
const mockGetDeparturePassengers = getDeparturePassengers as ReturnType<typeof vi.fn>;

const BASE_RESERVATION = {
  id: "res-abc12345",
  status: "confirmed",
  customerId: "cust-1",
  customerName: "Ahmed Hodžić",
  customerPhone: "+387 61 234 567",
  packageName: "Antalya Summer",
  packageId: "pkg-1",
  departureName: "10.09.2027 — Autobus",
  departureId: "dep-1",
  reservationAt: "2027-08-01",
  partySize: 2,
  participants: 2,
  totalAmount: 1100,
  paidAmount: 500,
  balanceDue: 600,
  remainingAmount: 600,
  paymentStatus: "partially_paid" as const,
  currency: "BAM",
  bookingDate: "2027-08-01",
  notes: "Vegetarijanska ishrana",
  options: {},
  createdAt: "2027-08-01T10:00:00.000Z",
  updatedAt: "2027-08-02T10:00:00.000Z",
};

function renderPage(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/reservations/${id}`]}>
      <Routes>
        <Route path="/reservations/:id" element={<ReservationDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ReservationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders package and departure links when IDs are present", async () => {
    mockGetReservation.mockResolvedValue(BASE_RESERVATION);
    renderPage("res-abc12345");
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument();
    });
    const pkgLink = screen.getByText("Antalya Summer");
    expect(pkgLink.closest("a")).toBeTruthy();
    const depLink = screen.getByText("10.09.2027 — Autobus");
    expect(depLink.closest("a")).toBeTruthy();
  });

  it("renders sold accommodation from top-level options, ignoring nested server snapshot", async () => {
    mockGetReservation.mockResolvedValue({
      ...BASE_RESERVATION,
      options: {
        booking_snapshot_version: 1,
        variant_name: "Standard",
        transport_type: "bus",
        accommodation: [
          { hotel_name: "Hotel Azur", room_type: "Double", room_label: "Double", room_count: 1, guests_expected: 2 },
        ],
        base_total_at_booking: 800,
        accommodation_total_at_booking: 200,
        total_at_booking: 1000,
        booking_snapshot: {
          version: 1,
          services: [],
          accommodation: [
            { hotelName: "Wrong package snapshot hotel", roomType: "Single", roomsBooked: 9 },
          ],
        },
      },
    });
    renderPage("res-abc12345");
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Usluge"));
    await waitFor(() => { const dds = document.querySelectorAll("dd.text-gray-900"); expect(Array.from(dds).some(dd => (dd.textContent || "").includes("Hotel Azur"))).toBe(true); });
    expect(screen.getByText(/1 soba/)).toBeInTheDocument();
    expect(screen.getByText(/2 putnika/)).toBeInTheDocument();
    expect(screen.getByText("Autobus")).toBeInTheDocument();
    expect(screen.queryByText(/Wrong package snapshot hotel/)).not.toBeInTheDocument();
  });

  it("renders purchased add-ons from selected_addons", async () => {
    mockGetReservation.mockResolvedValue({
      ...BASE_RESERVATION,
      options: {
        booking_snapshot_version: 1,
        booking_snapshot: {
          base_total_at_booking: 800,
          total_at_booking: 1000,
        },
        selected_addons: [
          { provider_name: "Travel insurance", service_type: "insurance", unit_price: 50, currency: "BAM", quantity: 1, line_total: 50 },
          { provider_name: "Airport transfer", description: "VIP airport lounge", unit_price: 25, currency: "BAM", quantity: 2, line_total: 50 },
        ],
        addons_total_at_booking: 100,
      },
    });
    renderPage("res-abc12345");
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Usluge"));
    expect(await screen.findByText("Travel insurance", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText("Airport transfer")).toBeInTheDocument();
    expect(screen.getByText(/VIP/)).toBeInTheDocument();
  });

  it("shows price breakdown from top-level options", async () => {
    mockGetReservation.mockResolvedValue({
      ...BASE_RESERVATION,
      options: {
        booking_snapshot_version: 1,
        base_total_at_booking: 800,
        accommodation_total_at_booking: 200,
        addons_total_at_booking: 100,
        total_at_booking: 1100,
      },
    });
    renderPage("res-abc12345");
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Usluge"));
    await waitFor(() => {
      expect(screen.getByText("Cijena pri booking-u")).toBeInTheDocument();
    });
    expect(screen.getByText("800 BAM")).toBeInTheDocument();
    expect(screen.getByText("200 BAM")).toBeInTheDocument();
    expect(screen.getByText("100 BAM")).toBeInTheDocument();
    expect(screen.getByText("1100 BAM")).toBeInTheDocument();
  });

  it("does not crash for old reservation without booking_snapshot", async () => {
    mockGetReservation.mockResolvedValue({
      ...BASE_RESERVATION,
      options: {},
    });
    renderPage("res-abc12345");
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Usluge"));
    await waitFor(() => {
      expect(screen.getByText("Nema snimljenih usluga za ovu rezervaciju.")).toBeInTheDocument();
    });
  });

  it("opens EditReservationModal when Uredi is clicked", async () => {
    mockGetReservation.mockResolvedValue(BASE_RESERVATION);
    renderPage("res-abc12345");
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Uredi rezervaciju"));
    await waitFor(() => {
      expect(screen.getByTestId("edit-modal")).toBeInTheDocument();
    });
    expect(screen.getByText("Editing res-abc12345")).toBeInTheDocument();
  });

  it("reloads reservation after successful edit", async () => {
    let callCount = 0;
    mockGetReservation.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ...BASE_RESERVATION,
        customerName: callCount === 1 ? "Ahmed Hodžić" : "Ahmed Hodžić (uređeno)",
      });
    });
    renderPage("res-abc12345");
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Uredi rezervaciju"));
    await waitFor(() => {
      expect(screen.getByTestId("edit-modal")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("edit-save"));
    await waitFor(() => {
      expect(screen.getByText("Ahmed Hodžić (uređeno)")).toBeInTheDocument();
    });
    expect(callCount).toBe(2);
  });
  describe("Putnici — traveler readiness", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockGetReservation.mockResolvedValue(BASE_RESERVATION);
    });

    function paxFixture(overrides: Record<string, any>) {
      return {
        reservation_id: "res-abc12345",
        full_name: "Ahmed Hodžić",
        ...overrides,
      };
    }

    it("shows ready passenger with readiness badge and summary", async () => {
      mockGetDeparturePassengers.mockResolvedValue({
        manifest: [paxFixture({ documentReadinessStatus: "ready" })],
      });
      renderPage("res-abc12345");
      await waitFor(() => { expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument(); });
      fireEvent.click(screen.getByText("Putnici"));
      expect(await screen.findByText("Spremno")).toBeInTheDocument();
      expect(screen.getByText(/Putni podaci:/)).toBeInTheDocument();
      expect(screen.getByText(/1 spreman/)).toBeInTheDocument();
    });

    it("shows missing passenger with attention summary and departure link", async () => {
      mockGetDeparturePassengers.mockResolvedValue({
        manifest: [paxFixture({ documentReadinessStatus: "missing" })],
      });
      renderPage("res-abc12345");
      await waitFor(() => { expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument(); });
      fireEvent.click(screen.getByText("Putnici"));
      expect(await screen.findByText("Dopuniti podatke")).toBeInTheDocument();
      expect(screen.getByText(/zahtijeva pažnju/)).toBeInTheDocument();
      const depLink = screen.getByText("Otvori polazak");
      expect(depLink.closest("a")).toBeTruthy();
      expect(depLink.getAttribute("href")).toBe("/departures/dep-1");
    });

    it("shows expired_before_departure passenger with correct badge", async () => {
      mockGetDeparturePassengers.mockResolvedValue({
        manifest: [paxFixture({ documentReadinessStatus: "expired_before_departure" })],
      });
      renderPage("res-abc12345");
      await waitFor(() => { expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument(); });
      fireEvent.click(screen.getByText("Putnici"));
      expect(await screen.findByText("Ističe prije polaska")).toBeInTheDocument();
    });

    it("shows no readiness warning when all passengers are not_required", async () => {
      mockGetDeparturePassengers.mockResolvedValue({
        manifest: [paxFixture({ documentReadinessStatus: "not_required" })],
      });
      renderPage("res-abc12345");
      await waitFor(() => { expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument(); });
      fireEvent.click(screen.getByText("Putnici"));
      expect(await screen.findByText("Nije potrebno")).toBeInTheDocument();
      expect(screen.queryByText(/Putni podaci:/)).not.toBeInTheDocument();
      expect(screen.queryByText("Otvori polazak")).not.toBeInTheDocument();
    });

    it("ignores passengers from another reservation", async () => {
      mockGetDeparturePassengers.mockResolvedValue({
        manifest: [
          paxFixture({ documentReadinessStatus: "ready", full_name: "Ahmed Hodžić" }),
          { ...paxFixture({ documentReadinessStatus: "missing", full_name: "Other Person" }), reservation_id: "other-res-999" },
        ],
      });
      renderPage("res-abc12345");
      await waitFor(() => { expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument(); });
      fireEvent.click(screen.getByText("Putnici"));
      await waitFor(() => { expect(screen.getByText("Spremno")).toBeInTheDocument(); });
      expect(screen.queryByText("Other Person")).not.toBeInTheDocument();
      expect(screen.queryByText("Dopuniti podatke")).not.toBeInTheDocument();
    });

    it("is safe when there are no passengers", async () => {
      mockGetDeparturePassengers.mockResolvedValue({ manifest: [] });
      renderPage("res-abc12345");
      await waitFor(() => { expect(screen.getByText("Ahmed Hodžić")).toBeInTheDocument(); });
      fireEvent.click(screen.getByText("Putnici"));
      await waitFor(() => { expect(screen.getByText("Nema putnika")).toBeInTheDocument(); });
      expect(screen.queryByText(/Putni podaci:/)).not.toBeInTheDocument();
      expect(screen.queryByText("Otvori polazak")).not.toBeInTheDocument();
    });
  });

});
