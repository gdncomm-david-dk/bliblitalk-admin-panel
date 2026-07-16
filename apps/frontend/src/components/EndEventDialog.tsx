import { useState, type FormEvent } from "react";
import { EventStatus } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { TEXTAREA_CLASS } from "../pages/events/workspace/fieldStyles";

interface EndEventDialogProps {
  eventId: string;
  onClose: () => void;
  onConfirmed: () => void;
}

export function EndEventDialog({ eventId, onClose, onConfirmed }: EndEventDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/admin/events/${eventId}/transition`, {
        to: EventStatus.COMPLETED,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to end the event.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-ink">End Event Now?</h2>
        <p className="mt-1 text-sm text-muted">
          This marks the event as completed immediately, before its scheduled end time.
        </p>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={TEXTAREA_CLASS}
              placeholder="e.g. Speaker had to leave early"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-5 py-2 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Ending…" : "End Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
