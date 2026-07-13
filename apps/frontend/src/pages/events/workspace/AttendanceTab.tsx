import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { AdminRegistrationDTO, EventDTO, GenerateCertificatesResult } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";

export function AttendanceTab({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const [registrations, setRegistrations] = useState<AdminRegistrationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    api
      .get<AdminRegistrationDTO[]>(`/admin/events/${event.id}/registrations`)
      .then((rows) => setRegistrations(rows.filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED")))
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load attendees.");
      });
  };

  useEffect(load, [event.id]);

  async function toggleAttendance(r: AdminRegistrationDTO, present: boolean) {
    setError(null);
    setBusyId(r.id);
    try {
      const action = present ? "check-in" : "mark-absent";
      const updated = await api.post<AdminRegistrationDTO>(`/admin/registrations/${r.id}/${action}`);
      setRegistrations((prev) => prev?.map((row) => (row.id === r.id ? updated : row)) ?? prev);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onGenerateCertificates() {
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const result = await api.post<GenerateCertificatesResult>(`/admin/events/${event.id}/certificates/generate`);
      setNotice(
        result.generated > 0
          ? `Issued ${result.generated} new certificate${result.generated === 1 ? "" : "s"}.`
          : "No new certificates to issue — every present attendee already has one.",
      );
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to generate certificates.");
    } finally {
      setGenerating(false);
    }
  }

  const attendanceComplete = registrations !== null && registrations.every((r) => r.attendance !== "PENDING");

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Check in attendees, then generate certificates once complete.</p>
        <button
          onClick={onGenerateCertificates}
          disabled={!event.enableCertificate || !attendanceComplete || generating}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          title={!event.enableCertificate ? "Certificates are disabled for this event" : undefined}
        >
          {generating ? "Generating…" : "Generate Certificate"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}
      {notice && <p className="mt-3 text-sm font-medium text-status-green">{notice}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="w-16 px-4 py-3">Present</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {registrations === null ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  Loading attendees…
                </td>
              </tr>
            ) : registrations.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  No attendees to check in yet.
                </td>
              </tr>
            ) : (
              registrations.map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={r.attendance === "PRESENT"}
                      disabled={busyId === r.id}
                      onChange={(e) => toggleAttendance(r, e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{r.userName}</td>
                  <td className="px-4 py-3 text-muted">{r.userEmail}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{dayjs(r.createdAt).format("D MMM YYYY")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
