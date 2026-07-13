import { useEffect, useState } from "react";
import type { AdminSpeedDatingRegistrationDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { StatusBadge } from "../../../components/StatusBadge";

export function SpeedDatingTab({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<AdminSpeedDatingRegistrationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminSpeedDatingRegistrationDTO[]>(`/admin/events/${eventId}/speed-dating`)
      .then(setRows)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load speed dating sign-ups.");
      });
  }, [eventId]);

  return (
    <div>
      <p className="text-sm text-muted">Registrants who opted into speed dating for this event.</p>

      {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows === null ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  Loading sign-ups…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  No one has joined speed dating for this event yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{r.userName}</td>
                  <td className="px-4 py-3 text-muted">{r.userEmail}</td>
                  <td className="px-4 py-3 text-muted">{r.sessionInfo ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
