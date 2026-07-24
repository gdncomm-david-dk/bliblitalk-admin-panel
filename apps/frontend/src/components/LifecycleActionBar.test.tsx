import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventStatus } from "@repo/shared-types";
import type { EventDTO } from "@repo/shared-types";
import { LifecycleActionBar } from "./LifecycleActionBar";
import { api, ApiRequestError } from "../services/api";

vi.mock("../services/api", async () => {
  const actual = await vi.importActual<typeof import("../services/api")>("../services/api");
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});

function makeEvent(status: EventStatus): EventDTO {
  return { id: "evt_1", status } as unknown as EventDTO;
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LifecycleActionBar", () => {
  it("renders exactly the buttons allowed from the current status", () => {
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={vi.fn()} />);
    // DRAFT -> [PUBLISHED, CANCELLED] per ALLOWED_TRANSITIONS
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Registration" })).not.toBeInTheDocument();
  });

  it("fires the transition and reports success for a non-confirm target", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const onChanged = vi.fn();
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/events/evt_1/transition", { to: EventStatus.PUBLISHED }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("does not fire when the user cancels a confirm-guarded target", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("fires when the user confirms a confirm-guarded target", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({});
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/events/evt_1/transition", { to: EventStatus.CANCELLED }));
  });

  it("opens EndEventDialog instead of firing immediately for the COMPLETED target", () => {
    render(<LifecycleActionBar event={makeEvent(EventStatus.ONGOING)} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "End Event" }));

    expect(screen.getByText("End Event Now?")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("on a 409 conflict, shows the actual status and still calls onChanged", async () => {
    const onChanged = vi.fn();
    vi.mocked(api.post).mockRejectedValue(
      new ApiRequestError(409, { code: "CONFLICT", message: "conflict", details: { from: "CANCELLED" } }),
    );
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
