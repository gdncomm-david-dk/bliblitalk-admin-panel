import { useState } from "react";
import { allowedFrom, EventStatus } from "@repo/shared-types";
import type { EventDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { useToastStore } from "../store/toastStore";
import { EndEventDialog } from "./EndEventDialog";

const TARGET_LABEL: Partial<Record<EventStatus, string>> = {
  [EventStatus.PUBLISHED]: "Publish",
  [EventStatus.REGISTRATION_OPEN]: "Open Registration",
  [EventStatus.REGISTRATION_CLOSED]: "Close Registration",
  [EventStatus.ONGOING]: "Start Event",
  [EventStatus.CANCELLED]: "Cancel",
  [EventStatus.COMPLETED]: "End Event",
  [EventStatus.ARCHIVED]: "Archive",
};

const SUCCESS_MESSAGE: Partial<Record<EventStatus, string>> = {
  [EventStatus.PUBLISHED]: "Event published.",
  [EventStatus.REGISTRATION_OPEN]: "Registration opened.",
  [EventStatus.REGISTRATION_CLOSED]: "Registration closed.",
  [EventStatus.ONGOING]: "Event started.",
  [EventStatus.CANCELLED]: "Event cancelled.",
  [EventStatus.ARCHIVED]: "Event archived.",
};

// Cancel and Archive are irreversible with no dedicated confirm-modal pattern in this
// codebase (Delete fires immediately with none at all) — a plain window.confirm() is
// the lightest guard that's still better than firing on the first click. End Event
// (-> COMPLETED) always opens the fuller EndEventDialog instead, since it has an
// optional reason field worth a proper modal.
const CONFIRM_TARGETS: EventStatus[] = [EventStatus.CANCELLED, EventStatus.ARCHIVED];

export function LifecycleActionBar({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [endEventOpen, setEndEventOpen] = useState(false);
  const showToast = useToastStore((s) => s.show);

  async function fire(to: EventStatus) {
    setBusy(true);
    try {
      await api.post(`/admin/events/${event.id}/transition`, { to });
      showToast(SUCCESS_MESSAGE[to] ?? "Event updated.");
      onChanged();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        const now = (err.apiError.details as { from?: string } | undefined)?.from;
        showToast(`This event already moved to ${now ?? "a different status"} — refreshed.`, "error");
        onChanged();
      } else {
        showToast(err instanceof ApiRequestError ? err.apiError.message : "Failed to update event status.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  function onClickTarget(to: EventStatus) {
    if (to === EventStatus.COMPLETED) {
      setEndEventOpen(true);
      return;
    }
    if (CONFIRM_TARGETS.includes(to) && !window.confirm(`${TARGET_LABEL[to]} this event?`)) return;
    fire(to);
  }

  // allowedFrom is the same table transitionEvent() enforces server-side — COMPLETED
  // only ever appears here when event.status is ONGOING, since that's the only state
  // with COMPLETED as a legal target. No extra "only from ONGOING" guard needed.
  const targets = allowedFrom(event.status);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {targets.map((to) => (
          <button
            key={to}
            onClick={() => onClickTarget(to)}
            disabled={busy}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {TARGET_LABEL[to] ?? to}
          </button>
        ))}
      </div>
      {endEventOpen && (
        <EndEventDialog
          eventId={event.id}
          onClose={() => setEndEventOpen(false)}
          onConfirmed={() => {
            setEndEventOpen(false);
            showToast("Event ended.");
            onChanged();
          }}
        />
      )}
    </>
  );
}
