import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { EventReminderDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { FIELD_CLASS, TEXTAREA_CLASS } from "./fieldStyles";
import { TrashIcon } from "../../../components/icons";

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-amber-50 text-status-orange",
  SENT: "bg-green-50 text-status-green",
  FAILED: "bg-red-50 text-status-red",
};

export function RemindersTab({ eventId }: { eventId: string }) {
  const [reminders, setReminders] = useState<EventReminderDTO[] | null>(null);
  const [sendAt, setSendAt] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .get<EventReminderDTO[]>(`/admin/events/${eventId}/reminders`)
      .then(setReminders)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load reminders.");
      });
  };

  useEffect(load, [eventId]);

  async function onCreate() {
    if (!sendAt || !subject.trim() || !bodyHtml.trim()) return;
    setError(null);
    setCreating(true);
    try {
      await api.post(`/admin/events/${eventId}/reminders`, {
        sendAt: new Date(sendAt).toISOString(),
        subject,
        bodyHtml,
      });
      setSendAt("");
      setSubject("");
      setBodyHtml("");
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to schedule reminder.");
    } finally {
      setCreating(false);
    }
  }

  async function onCancel(reminderId: string) {
    setError(null);
    try {
      await api.delete(`/admin/events/${eventId}/reminders/${reminderId}`);
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to cancel reminder.");
    }
  }

  return (
    <div>
      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="text-sm font-semibold text-ink">Schedule a Reminder</p>
        <p className="mt-1 text-xs text-muted">
          Sent by email to everyone still actively registered (not cancelled or rejected) at the scheduled time.
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Send at</label>
            <input
              type="datetime-local"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-muted">Message (HTML)</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            className={`${TEXTAREA_CLASS} h-24`}
            placeholder="<p>Don't forget — our event starts soon!</p>"
          />
        </div>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        <button
          onClick={onCreate}
          disabled={creating || !sendAt || !subject.trim() || !bodyHtml.trim()}
          className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {creating ? "Scheduling…" : "Schedule Reminder"}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Send At</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Delivered / Failed</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {reminders === null ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  Loading reminders…
                </td>
              </tr>
            ) : reminders.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  No reminders scheduled for this event yet.
                </td>
              </tr>
            ) : (
              reminders.map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {dayjs(r.sendAt).format("D MMM YYYY, HH:mm")}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-ink">{r.subject}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.status === "SENT" ? `${r.sentCount} / ${r.failedCount}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "PENDING" && (
                      <button
                        onClick={() => onCancel(r.id)}
                        className="text-muted transition-colors hover:text-status-red"
                        aria-label="Cancel reminder"
                      >
                        <TrashIcon width={14} height={14} />
                      </button>
                    )}
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
