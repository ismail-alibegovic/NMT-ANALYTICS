import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ManualBusSeating from "../components/operations/ManualBusSeating";

const t = {
  departure: {
    busSeating: {
      title: "Bus Seating",
      configureVehicle: "Configure Vehicle",
      vehicleLabel: "Vehicle label",
      vehicleLabelPlaceholder: "e.g. Mercedes Sprinter",
      registrationNumber: "Registration number",
      registrationPlaceholder: "e.g. T1234AB",
      capacity: "Capacity",
      assignedPassengers: "Assigned",
      unassignedPassengers: "Unassigned",
      selectPassenger: "Select a passenger",
      selected: "Selected",
      free: "Free",
      occupied: "Occupied",
      locked: "Locked",
      manualAssignment: "Manual",
      inactive: "Inactive",
      allAssigned: "All passengers have assigned seats.",
      move: "Move",
      unassign: "Unassign",
      lock: "Lock",
      unlock: "Unlock",
      lockedBadge: "Locked",
      manualBadge: "Manual",
      saveVehicle: "Save",
      savingVehicle: "Saving...",
      vehicleSaved: "Vehicle updated",
      vehicleSaveFailed: "Failed to update vehicle",
      capacityTooLow: "Capacity too low: {count} passengers are already assigned to seats outside the new capacity.",
      vehicleChangeConflict: "Cannot reduce capacity: seats outside the new capacity are already occupied.",
      seatLockedError: "This seat is locked. Unlock it first before making changes.",
      seatConflictError: "That seat is already assigned to another passenger.",
      seatNotFoundError: "The requested seat was not found.",
      assignmentSuccess: "Seat assigned",
      unassignSuccess: "Seat unassigned",
      lockSuccess: "Seat locked",
      unlockSuccess: "Seat unlocked",
      assignError: "Failed to assign seat",
      unassignError: "Failed to unassign seat",
      lockError: "Failed to update seat lock",
      busOnlyNotice: "Manual bus seating is only available for BUS departures.",
      loading: "Loading...",
      assign: "Assign",
      seat: "Seat",
      legend: {
        free: "Free",
        occupied: "Occupied",
        locked: "Locked",
        manual: "Manual assignment",
        selected: "Selected",
      },
    },
    passengers: "Passengers",
    noSeat: "No seat",
  },
};

vi.mock("../lib/i18n/context", () => ({
  useTranslation: () => ({ t, lang: "en", setLang: vi.fn() }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const toastMock = { success: vi.fn(), error: vi.fn() };
vi.mock("../context/ToastContext", () => ({
  useToast: () => toastMock,
}));

vi.mock("../api/departures", () => ({
  getDepartureVehicle: vi.fn(),
  updateDepartureVehicle: vi.fn(),
  assignPassengerSeat: vi.fn(),
  lockPassengerSeat: vi.fn(),
}));

const { getDepartureVehicle, updateDepartureVehicle, assignPassengerSeat, lockPassengerSeat } = await import("../api/departures");

const fakeVehicleSeats = [
  { id: "s1", seat_number: 1, seat_label: "1A", row_number: 1, column_index: 0, side: "left", is_active: true },
  { id: "s2", seat_number: 2, seat_label: "1B", row_number: 1, column_index: 1, side: "right", is_active: true },
  { id: "s3", seat_number: 3, seat_label: "2A", row_number: 2, column_index: 0, side: "left", is_active: true },
  { id: "s4", seat_number: 4, seat_label: "2B", row_number: 2, column_index: 1, side: "right", is_active: true },
  { id: "s5", seat_number: 5, seat_label: "3A", row_number: 3, column_index: 0, side: "left", is_active: false },
];

const defaultVehicle = {
  vehicle: {
    id: "v1",
    departure_id: "dep-1",
    org_id: "org-1",
    vehicle_label: "Sprinter",
    registration_number: "T1234AB",
    capacity: 5,
    layout_type: "2+2",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  seats: fakeVehicleSeats,
};

const basePassenger = (overrides: Record<string, unknown> = {}) => ({
  id: "p-1",
  passengerId: "p-1",
  fullName: "Ahmed Hodžić",
  seat_number: null,
  seat_is_manual: false,
  seat_locked: false,
  group_name: null,
  group_color: null,
  ...overrides,
});

const baseProps = {
  departureId: "dep-1",
  transportType: "bus" as const,
  passengers: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe("ManualBusSeating", () => {
  it("renders physical vehicle seats from vehicle API", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[basePassenger()]} />);
    await waitFor(() => screen.getByText("1A"));
    expect(screen.getByText("1A")).toBeInTheDocument();
    expect(screen.getByText("1B")).toBeInTheDocument();
    expect(screen.getByText("2A")).toBeInTheDocument();
    expect(screen.getByText("2B")).toBeInTheDocument();
    expect(screen.getByText("3A")).toBeInTheDocument();
  });

  it("assigns an unassigned passenger to a free seat", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const unassigned = basePassenger({ seat_number: null });
    render(<ManualBusSeating {...baseProps} passengers={[unassigned]} />);
    await waitFor(() => screen.getByText("1A"));

    const passenger = screen.getByText("Ahmed Hodžić");
    await userEvent.click(passenger);

    const seat1 = screen.getByText("1A");
    await userEvent.click(seat1);

    const assignBtn = screen.getByRole("button", { name: /Assign/i });
    await userEvent.click(assignBtn);

    expect(assignPassengerSeat).toHaveBeenCalledWith("p-1", 1);
  });

  it("moves an assigned unlocked passenger to a free seat", async () => {
    const assignedPax = basePassenger({ seat_number: 1, seat_is_manual: true, seat_locked: false });
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[assignedPax]} />);
    await waitFor(() => screen.getByText("1A"));

    // Click on the seat that is currently occupied (seat 1) to select the passenger
    const seat1 = screen.getByText("1A");
    await userEvent.click(seat1);

    // Click on a free seat (seat 3)
    const seat3 = screen.getByText("2A");
    await userEvent.click(seat3);

    const moveBtn = screen.getByText("Move");
    await userEvent.click(moveBtn);

    expect(assignPassengerSeat).toHaveBeenCalledWith("p-1", 3);
  });

  it("unassigns an unlocked passenger", async () => {
    const assignedPax = basePassenger({ seat_number: 1, seat_locked: false });
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[assignedPax]} />);
    await waitFor(() => screen.getByText("1A"));

    const seat1 = screen.getByText("1A");
    await userEvent.click(seat1);

    const unassignBtn = screen.getByText("Unassign");
    await userEvent.click(unassignBtn);

    expect(assignPassengerSeat).toHaveBeenCalledWith("p-1", null);
  });

  it("locks a seat assignment", async () => {
    const assignedPax = basePassenger({ seat_number: 1, seat_is_manual: true, seat_locked: false });
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({ locked: true });

    render(<ManualBusSeating {...baseProps} passengers={[assignedPax]} />);
    await waitFor(() => screen.getByText("1A"));

    const seat1 = screen.getByText("1A");
    await userEvent.click(seat1);

    const lockBtn = screen.getByText("Lock");
    await userEvent.click(lockBtn);

    expect(lockPassengerSeat).toHaveBeenCalledWith("p-1", true);
  });

  it("unlocks a seat assignment", async () => {
    const assignedPax = basePassenger({ seat_number: 1, seat_locked: true });
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({ locked: false });

    render(<ManualBusSeating {...baseProps} passengers={[assignedPax]} />);
    await waitFor(() => screen.getByText("1A"));

    const seat1 = screen.getByText("1A");
    await userEvent.click(seat1);

    const unlockBtn = screen.getByText("Unlock");
    await userEvent.click(unlockBtn);

    expect(lockPassengerSeat).toHaveBeenCalledWith("p-1", false);
  });

  it("does not allow locked passenger to be moved or unassigned", async () => {
    const lockedPax = basePassenger({ seat_number: 1, seat_locked: true });
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[lockedPax]} />);
    await waitFor(() => screen.getByText("1A"));

    const seat1 = screen.getByText("1A");
    await userEvent.click(seat1);

    expect(screen.queryByText("Move")).toBeNull();
    expect(screen.queryByText("Unassign")).toBeNull();
    expect(screen.getByText("Unlock")).toBeInTheDocument();
  });

  it("shows real API error code from SEAT_LOCKED", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockRejectedValue({ code: "SEAT_LOCKED", message: "This seat is locked" });
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const assignedPax = basePassenger({ seat_number: 1, seat_locked: false });
    render(<ManualBusSeating {...baseProps} passengers={[assignedPax]} />);
    await waitFor(() => screen.getByText("1A"));

    const seat1 = screen.getByText("1A");
    await userEvent.click(seat1);

    const seat3 = screen.getByText("2A");
    await userEvent.click(seat3);

    const moveBtn = screen.getByText("Move");
    await userEvent.click(moveBtn);

    await waitFor(() => screen.getByText(/SEAT_LOCKED/));
    expect(toastMock.error).toHaveBeenCalledWith("This seat is locked. Unlock it first before making changes.");
  });

  it("renders vehicle creation form when no vehicle exists", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue({ vehicle: null, seats: [] });
    (updateDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[]} />);
    await waitFor(() => screen.getByText("Configure Vehicle"));

    expect(screen.getByText("Vehicle label")).toBeInTheDocument();
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("creates vehicle through PUT when no vehicle exists", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue({ vehicle: null, seats: [] });
    (updateDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[]} />);
    await waitFor(() => screen.getByText("Configure Vehicle"));

    // Set capacity
    const capacityInput = screen.getByLabelText("Capacity");
    await userEvent.clear(capacityInput);
    await userEvent.type(capacityInput, "12");

    const saveBtn = screen.getByText("Save");
    await userEvent.click(saveBtn);

    expect(updateDepartureVehicle).toHaveBeenCalledWith("dep-1", expect.objectContaining({ capacity: 12 }));
  });

  it("shows capacity conflict when vehicle update returns VEHICLE_CHANGE_CONFLICT", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (updateDepartureVehicle as ReturnType<typeof vi.fn>).mockRejectedValue({ code: "VEHICLE_CHANGE_CONFLICT", message: "Cannot reduce capacity" });
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[]} />);
    await waitFor(() => screen.getByText("Sprinter"));

    const saveBtn = screen.getByText("Save");
    await userEvent.click(saveBtn);

    await waitFor(() => screen.getByText(/Cannot reduce capacity/));
    expect(toastMock.error).toHaveBeenCalledWith("Cannot reduce capacity: seats outside the new capacity are already occupied.");
  });

  it("does not render bus seating workspace for non-bus departures", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} transportType="flight" passengers={[]} />);
    // Should not render any bus seating content
    expect(screen.queryByText("Bus Seating")).toBeNull();
    expect(screen.queryByText("Configure Vehicle")).toBeNull();
  });

  it("does not expose Auto Assign / Group Auto Assign / Clear All", async () => {
    (getDepartureVehicle as ReturnType<typeof vi.fn>).mockResolvedValue(defaultVehicle);
    (assignPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (lockPassengerSeat as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<ManualBusSeating {...baseProps} passengers={[]} />);
    await waitFor(() => screen.getByText("Sprinter"));

    expect(screen.queryByText(/Auto Assign/i)).toBeNull();
    expect(screen.queryByText(/Group Auto Assign/i)).toBeNull();
    expect(screen.queryByText(/Clear All/i)).toBeNull();
  });
});
