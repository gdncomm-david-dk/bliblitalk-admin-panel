import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { AdminRegistrationDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { StatCard } from "./StatCard";

export function ShortlistTab({ eventId }: { eventId: string }) {
  const [registrations, setRegistrations] = useState<AdminRegistrationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    api
      .get<AdminRegistrationDTO[]>(`/admin/events/${eventId}/registrations`)
      .then((rows) => setRegistrations(rows.filter((r) => r.status !== "CANCELLED")))
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load candidates.");
      });
  };

  useEffect(load, [eventId]);

  async function toggleShortlist(r: AdminRegistrationDTO, checked: boolean) {
    setError(null);
    setBusyId(r.id);
    try {
      const action = checked ? "shortlist" : "waitlist";
      const updated = await api.post<AdminRegistrationDTO>(`/admin/registrations/${r.id}/${action}`);
      setRegistrations((prev) => prev?.map((row) => (row.id === r.id ? updated : row)) ?? prev);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (registrations === null) {
    return <p className="text-sm text-muted">Loading candidates…</p>;
  }

  const totalRegistered = registrations.length;
  const shortlisted = registrations.filter((r) => r.status === "SHORTLISTED").length;
  const reviewed = registrations.filter((r) => r.status === "SHORTLISTED" || r.status === "REJECTED").length;
  const pending = totalRegistered - reviewed;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div>
        {error && <p className="mb-3 text-sm font-medium text-status-red">{error}</p>}
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="w-12 px-4 py-3">Shortlist</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {registrations.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={4}>
                    No candidates yet.
                  </td>
                </tr>
              ) : (
                registrations.map((r) => (
                  <tr key={r.id} className="hover:bg-surface">
                    <td className="px-4 py-3">
                      {r.status === "REJECTED" ? (
                        <span className="text-xs font-semibold text-status-red">Rejected</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={r.status === "SHORTLISTED"}
                          disabled={busyId === r.id}
                          onChange={(e) => toggleShortlist(r, e.target.checked)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{r.userName}</td>
                    <td className="px-4 py-3 text-muted">{r.userEmail}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {dayjs(r.createdAt).format("D MMM YYYY")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <StatCard label="Total Registered" value={totalRegistered} />
        <StatCard label="Reviewed" value={reviewed} />
        <StatCard label="Shortlisted" value={shortlisted} />
        <StatCard label="Pending" value={pending} />
      </div>
    </div>
  );
}
