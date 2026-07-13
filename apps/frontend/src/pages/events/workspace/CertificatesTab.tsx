import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { AdminCertificateDTO, EventDTO, GenerateCertificatesResult } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";

export function CertificatesTab({ event }: { event: EventDTO }) {
  const [certificates, setCertificates] = useState<AdminCertificateDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    api
      .get<AdminCertificateDTO[]>(`/admin/events/${event.id}/certificates`)
      .then(setCertificates)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load certificates.");
      });
  };

  useEffect(load, [event.id]);

  async function onGenerate() {
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const result = await api.post<GenerateCertificatesResult>(`/admin/events/${event.id}/certificates/generate`);
      setCertificates(result.certificates);
      setNotice(
        result.generated > 0
          ? `Issued ${result.generated} new certificate${result.generated === 1 ? "" : "s"}.`
          : "No new certificates to issue — every present attendee already has one.",
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to generate certificates.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {certificates?.length ?? 0} generated. {event.enableFeedback && "Feedback must be submitted before a participant can download."}
        </p>
        <button
          onClick={onGenerate}
          disabled={!event.enableCertificate || generating}
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generating ? "Generating…" : "Generate All"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}
      {notice && <p className="mt-3 text-sm font-medium text-status-green">{notice}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Verification Code</th>
              <th className="px-4 py-3">Issued</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {certificates === null ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  Loading certificates…
                </td>
              </tr>
            ) : certificates.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  No certificates issued yet for this event.
                </td>
              </tr>
            ) : (
              certificates.map((c) => (
                <tr key={c.id} className="hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{c.userName}</td>
                  <td className="px-4 py-3 text-muted">{c.userEmail}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{c.verificationCode}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{dayjs(c.issuedAt).format("D MMM YYYY")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
