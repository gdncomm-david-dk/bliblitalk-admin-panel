import { useEffect, useState, type FormEvent } from "react";
import dayjs from "dayjs";
import type {
  AdminCertificateDTO,
  AdminEventFeedbackDTO,
  AdminEventInput,
  AdminRegistrationDTO,
  AdminSpeedDatingRegistrationDTO,
  EventDTO,
} from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { StatCard } from "./StatCard";
import { FIELD_CLASS, TEXTAREA_CLASS } from "./fieldStyles";

interface Kpis {
  registrations: number;
  checkedIn: number;
  attendanceRate: number;
  certificates: number;
  feedbackResponses: number;
  shortlisted: number;
  speedDating: number | null;
}

function toInputDateTime(iso: string | null): string {
  return iso ? dayjs(iso).format("YYYY-MM-DDTHH:mm") : "";
}

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
  bannerUrl: string;
  thumbnailUrl: string;
}

function fromEvent(e: EventDTO): FormState {
  return {
    title: e.title,
    subtitle: e.subtitle ?? "",
    category: e.category,
    location: e.location,
    venue: e.venue ?? "",
    description: e.description,
    startsAt: toInputDateTime(e.startsAt),
    endsAt: toInputDateTime(e.endsAt),
    registrationDeadline: toInputDateTime(e.registrationDeadline),
    capacity: String(e.capacity),
    bannerUrl: e.bannerUrl ?? "",
    thumbnailUrl: e.thumbnailUrl ?? "",
  };
}

export function OverviewTab({ event, onSaved }: { event: EventDTO; onSaved: () => void }) {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [form, setForm] = useState<FormState>(fromEvent(event));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(fromEvent(event)), [event]);

  useEffect(() => {
    Promise.all([
      api.get<AdminRegistrationDTO[]>(`/admin/events/${event.id}/registrations`),
      api.get<AdminCertificateDTO[]>(`/admin/events/${event.id}/certificates`),
      api.get<AdminEventFeedbackDTO>(`/admin/events/${event.id}/feedback`),
      event.hasSpeedDating
        ? api.get<AdminSpeedDatingRegistrationDTO[]>(`/admin/events/${event.id}/speed-dating`)
        : Promise.resolve(null),
    ]).then(([registrations, certificates, feedback, speedDating]) => {
      const nonCancelled = registrations.filter((r) => r.status !== "CANCELLED");
      const checkedIn = registrations.filter((r) => r.attendance === "PRESENT").length;
      setKpis({
        registrations: nonCancelled.length,
        checkedIn,
        attendanceRate:
          nonCancelled.length > 0 ? Math.round((checkedIn / nonCancelled.length) * 100) : 0,
        certificates: certificates.length,
        feedbackResponses: feedback.responses,
        shortlisted: registrations.filter((r) => r.status === "SHORTLISTED").length,
        speedDating: speedDating ? speedDating.length : null,
      });
    });
  }, [event.id, event.hasSpeedDating]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const payload: Partial<AdminEventInput> = {
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
        bannerUrl: form.bannerUrl || null,
        thumbnailUrl: form.thumbnailUrl || null,
      };
      await api.patch<EventDTO>(`/admin/events/${event.id}`, payload);
      setNotice("Saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registrations" value={kpis?.registrations ?? "…"} />
        <StatCard label="Checked In" value={kpis?.checkedIn ?? "…"} />
        <StatCard label="Attendance Rate" value={kpis ? `${kpis.attendanceRate}%` : "…"} />
        <StatCard label="Certificates" value={kpis?.certificates ?? "…"} />
        <StatCard label="Feedback" value={kpis?.feedbackResponses ?? "…"} />
        <StatCard label="Shortlisted" value={kpis?.shortlisted ?? "…"} />
        {event.hasSpeedDating && (
          <StatCard label="Speed Dating" value={kpis?.speedDating ?? "…"} />
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Event Information</h2>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}
      {notice && <p className="mt-3 text-sm font-medium text-status-green">{notice}</p>}

      <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-2xl border border-line bg-white p-6">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Title</label>
          <input required value={form.title} onChange={(e) => set("title", e.target.value)} className={FIELD_CLASS} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Subtitle</label>
          <input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} className={FIELD_CLASS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
            <input required value={form.category} onChange={(e) => set("category", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Location</label>
            <input required value={form.location} onChange={(e) => set("location", e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Venue</label>
          <input value={form.venue} onChange={(e) => set("venue", e.target.value)} className={FIELD_CLASS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ImageUploadField
            label="Hero Banner"
            value={form.bannerUrl}
            onChange={(url) => set("bannerUrl", url)}
            aspect="16 / 9"
            helpText="Large image shown on the event hero banner."
          />
          <ImageUploadField
            label="Thumbnail"
            value={form.thumbnailUrl}
            onChange={(url) => set("thumbnailUrl", url)}
            aspect="4 / 3"
            helpText="Small image for event lists/cards. Falls back to the hero banner when unset."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Description</label>
          <textarea required value={form.description} onChange={(e) => set("description", e.target.value)} className={TEXTAREA_CLASS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Starts At</label>
            <input required type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Ends At</label>
            <input required type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Registration Deadline</label>
            <input type="datetime-local" value={form.registrationDeadline} onChange={(e) => set("registrationDeadline", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
            <input type="number" min={0} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
