import { useState } from "react";
import { formatTimeAgo } from "@repo/shared-utils";
import type { EventDTO } from "@repo/shared-types";
import { useToastStore } from "../store/toastStore";
import { EndEventDialog } from "./EndEventDialog";

export function OverdueBanner({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const showToast = useToastStore((s) => s.show);

  if (!event.isOverdue) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-orange/30 bg-amber-50 px-5 py-3 text-sm">
        <p className="font-medium text-status-orange">
          Ended {formatTimeAgo(event.endsAt)} — will auto-complete shortly.
        </p>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-full border border-status-orange/40 px-3 py-1.5 text-xs font-semibold text-status-orange transition-colors hover:bg-status-orange/10"
        >
          End Event Now
        </button>
      </div>
      {dialogOpen && (
        <EndEventDialog
          eventId={event.id}
          onClose={() => setDialogOpen(false)}
          onConfirmed={() => {
            setDialogOpen(false);
            showToast("Event ended.");
            onChanged();
          }}
        />
      )}
    </>
  );
}
