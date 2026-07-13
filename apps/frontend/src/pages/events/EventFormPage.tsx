import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminEventInput, EventDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";

const FIELD_CLASS =
  "h-10 w-full rounded-lg bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:bg-white focus:ring-2 focus:ring-primary/30";
const TEXTAREA_CLASS = `${FIELD_CLASS} h-24 resize-none py-2`;

interface FormState {
  title: string;
  subtitle: string;
  category: string;
  location: string;
  venue: string;
  description: string;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  capacity: string;
  showRemainingSeats: boolean;
  hasSpeedDating: boolean;
  enableCertificate: boolean;
  enableFeedback: boolean;
  waitingListEnabled: boolean;
}

const EMPTY: FormState = {
  title: "",
  subtitle: "",
  category: "",
  location: "",
  venue: "",
  description: "",
  startsAt: "",
  endsAt: "",
  registrationDeadline: "",
  capacity: "0",
  showRemainingSeats: true,
  hasSpeedDating: false,
  enableCertificate: true,
  enableFeedback: false,
  waitingListEnabled: true,
};

// New-event form only — editing lives in the event workspace's Overview/Settings tabs.
export function EventFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: AdminEventInput = {
        title: form.title,
        subtitle: form.subtitle || null,
        category: form.category,
        location: form.location,
        venue: form.venue || null,
        description: form.description,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        registrationDeadline: form.registrationDeadline
          ? new Date(form.registrationDeadline).toISOString()
          : null,
        capacity: Number(form.capacity) || 0,
        showRemainingSeats: form.showRemainingSeats,
        hasSpeedDating: form.hasSpeedDating,
        enableCertificate: form.enableCertificate,
        enableFeedback: form.enableFeedback,
        waitingListEnabled: form.waitingListEnabled,
        tags: [],
      };
      const created = await api.post<EventDTO>("/admin/events", payload);
      navigate(`/events/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-ink">New Event</h1>

      {error && <p className="mt-4 text-sm font-medium text-status-red">{error}</p>}

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-line bg-white p-6">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Subtitle</label>
          <input
            value={form.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
            <input
              required
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Location</label>
            <input
              required
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Venue</label>
          <input
            value={form.venue}
            onChange={(e) => set("venue", e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Description</label>
          <textarea
            required
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className={TEXTAREA_CLASS}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Starts At</label>
            <input
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Ends At</label>
            <input
              required
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Registration Deadline</label>
            <input
              type="datetime-local"
              value={form.registrationDeadline}
              onChange={(e) => set("registrationDeadline", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
            <input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.showRemainingSeats}
              onChange={(e) => set("showRemainingSeats", e.target.checked)}
            />
            Show remaining seats (unchecked = shortlist-only registration)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.hasSpeedDating}
              onChange={(e) => set("hasSpeedDating", e.target.checked)}
            />
            Enable Speed Dating
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.enableCertificate}
              onChange={(e) => set("enableCertificate", e.target.checked)}
            />
            Enable Certificate
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.enableFeedback}
              onChange={(e) => set("enableFeedback", e.target.checked)}
            />
            Enable Feedback
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create Event"}
        </button>
      </form>
    </div>
  );
}
