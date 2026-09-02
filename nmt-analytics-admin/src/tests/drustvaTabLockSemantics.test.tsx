import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DrustvaTab from "../components/operations/DrustvaTab";
import { I18nProvider } from "../lib/i18n/context";
import {
  addGroupMember,
  deletePassengerGroup,
  removeGroupMember,
  updatePassengerGroup,
} from "../api/departures";

vi.mock("../api/departures", () => ({
  createPassengerGroup: vi.fn(),
  updatePassengerGroup: vi.fn().mockResolvedValue({}),
  deletePassengerGroup: vi.fn().mockResolvedValue(undefined),
  addGroupMember: vi.fn().mockResolvedValue({ added: true }),
  removeGroupMember: vi.fn().mockResolvedValue(undefined),
}));

const mockUpdateGroup = updatePassengerGroup as ReturnType<typeof vi.fn>;
const mockDeleteGroup = deletePassengerGroup as ReturnType<typeof vi.fn>;
const mockAddMember = addGroupMember as ReturnType<typeof vi.fn>;
const mockRemoveMember = removeGroupMember as ReturnType<typeof vi.fn>;

const passengers = [
  { id: "p-1", passengerId: "p-1", fullName: "Ahmed Hodžić", seat: null, seat_number: null },
  { id: "p-2", passengerId: "p-2", fullName: "Lejla Hodžić", seat: null, seat_number: null },
  { id: "p-3", passengerId: "p-3", fullName: "Sara Alić", seat: null, seat_number: null },
] as any[];

const lockedGroup = {
  id: "group-locked",
  name: "Porodica Hodžić",
  color: "#3B82F6",
  seating_preference: "prefer_together",
  accommodation_preference: "no_preference",
  notes: null,
  locked: true,
  primary_passenger_id: "p-1",
  members: [
    { id: "m-1", group_id: "group-locked", passenger_id: "p-1", reservation_id: "r-1", is_primary: true },
    { id: "m-2", group_id: "group-locked", passenger_id: "p-2", reservation_id: "r-2", is_primary: false },
  ],
};

const unlockedGroup = {
  ...lockedGroup,
  id: "group-open",
  name: "Otvorena grupa",
  locked: false,
  members: [
    { id: "m-1", group_id: "group-open", passenger_id: "p-1", reservation_id: "r-1", is_primary: true },
  ],
};

function renderTab(groups = [lockedGroup as any], onRefresh = vi.fn()) {
  return {
    onRefresh,
    ...render(
      <I18nProvider>
        <DrustvaTab departureId="dep-1" passengers={passengers} groups={groups} onRefresh={onRefresh} />
      </I18nProvider>,
    ),
  };
}

async function openEdit(groupName: string) {
  const card = screen.getByText(groupName).closest(".overflow-hidden") as HTMLElement;
  await userEvent.click(within(card).getByTitle("Edit Group"));
}

describe("DrustvaTab group lock semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("travline_lang", "en");
  });

  it("reopens a locked group with the lock control set to Locked", async () => {
    renderTab();

    await openEdit("Porodica Hodžić");

    expect(screen.getByText("This group is locked. Unlock it before changing members.")).toBeInTheDocument();
    expect(screen.getByLabelText("Lock status")).toHaveValue("locked");
  });

  it("disables member selection while locked", async () => {
    renderTab();

    await openEdit("Porodica Hodžić");

    expect(screen.getByLabelText("Sara Alić")).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Sara Alić"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateGroup).toHaveBeenCalledWith(
        "group-locked",
        expect.objectContaining({ locked: true }),
      );
    });
    expect(mockAddMember).not.toHaveBeenCalled();
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("saves Locked to Unlocked through the existing update payload", async () => {
    renderTab();

    await openEdit("Porodica Hodžić");
    await userEvent.selectOptions(screen.getByLabelText("Lock status"), "unlocked");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateGroup).toHaveBeenCalledWith(
        "group-locked",
        expect.objectContaining({ locked: false }),
      );
    });
  });

  it("does not start deletion for a locked group", async () => {
    renderTab();
    const card = screen.getByText("Porodica Hodžić").closest(".overflow-hidden") as HTMLElement;

    const deleteButton = within(card).getByTitle("Unlock the group before deleting it.");
    expect(deleteButton).toBeDisabled();
    await userEvent.click(deleteButton);

    expect(screen.queryByText("Delete group?")).not.toBeInTheDocument();
    expect(mockDeleteGroup).not.toHaveBeenCalled();
  });

  it("keeps normal member and delete behavior for unlocked groups", async () => {
    renderTab([unlockedGroup as any]);

    await openEdit("Otvorena grupa");
    await userEvent.click(screen.getByLabelText("Lejla Hodžić"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockAddMember).toHaveBeenCalledWith("group-open", "p-2");
    });

    const card = screen.getByText("Otvorena grupa").closest(".overflow-hidden") as HTMLElement;
    await userEvent.click(within(card).getByTitle("Delete Group"));
    expect(screen.getByText("Delete group?")).toBeInTheDocument();
  });
});
