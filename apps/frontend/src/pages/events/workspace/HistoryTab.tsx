import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { EventStatusHistoryDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { StatusBadge } from "../../../components/StatusBadge";

export function HistoryTab({ eventId }: { eventId: string }) {
  const [history, setHistory] = useState<EventStatusHistoryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EventStatusHistoryDTO[]>(`/admin/events/${eventId}/history`)
      .then(setHistory)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load status history.");
      });
  }, [eventId]);

  if (error) return <p className="text-sm font-medium text-status-red">{error}</p>;
  if (!history) return <p className="text-sm text-muted">Loading history…</p>;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-sm font-semibold text-ink">Status History</p>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No status changes yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-line">
          {history.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-2">
                {h.fromStatus && <StatusBadge status={h.fromStatus} />}
                {h.fromStatus && <span className="text-xs text-muted">→</span>}
                <StatusBadge status={h.toStatus} />
                <span className="text-xs text-muted">{h.actorType === "ADMIN" ? "by admin" : "by system"}</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">{dayjs(h.createdAt).format("D MMM YYYY · HH:mm")}</p>
                {h.reason && <p className="mt-0.5 text-xs text-ink/70">&ldquo;{h.reason}&rdquo;</p>}
                {(h.sideEffectsStatus === "PENDING" || h.sideEffectsStatus === "FAILED") && (
                  <p className="mt-0.5 text-xs text-status-orange">
                    side effects: {h.sideEffectsStatus.toLowerCase()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
