import { useEffect, useState, type FormEvent } from "react";
import dayjs from "dayjs";
import type {
  AdminCategoryDTO,
  AdminCertificateDTO,
  AdminEventFeedbackDTO,
  AdminEventInput,
  AdminRegistrationDTO,
  AdminSpeakerDTO,
  AdminSpeedDatingRegistrationDTO,
  EventDTO,
} from "@repo/shared-types";
import { validateEventDates } from "@repo/shared-utils";
import { api, ApiRequestError } from "../../../services/api";
import { useToastStore } from "../../../store/toastStore";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { SpeakerFormModal } from "../../../components/SpeakerFormModal";
import { CategoryFormModal } from "../../../components/CategoryFormModal";
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
  categoryId: string;
  categoryName: string;
  location: string;
  venue: string;
  description: string;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  registrationOpensAt: string;
  capacity: string;
  bannerUrl: string;
  thumbnailUrl: string;
  speakers: { id: string; name: string; avatarUrl: string | null }[];
}

function fromEvent(e: EventDTO): FormState {
  return {
    title: e.title,
    subtitle: e.subtitle ?? "",
    categoryId: e.categoryId,
    categoryName: e.category,
    location: e.location,
    venue: e.venue ?? "",
    description: e.description,
    startsAt: toInputDateTime(e.startsAt),
    endsAt: toInputDateTime(e.endsAt),
    registrationDeadline: toInputDateTime(e.registrationDeadline),
    registrationOpensAt: toInputDateTime(e.registrationOpensAt),
    capacity: String(e.capacity),
    bannerUrl: e.bannerUrl ?? "",
    thumbnailUrl: e.thumbnailUrl ?? "",
    speakers: e.speakers.map((s) => ({ id: s.id, name: s.name, avatarUrl: s.avatarUrl })),
  };
}

export function OverviewTab({ event, onSaved }: { event: EventDTO; onSaved: () => void }) {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [form, setForm] = useState<FormState>(fromEvent(event));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showToast = useToastStore((s) => s.show);

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

  const [speakerQuery, setSpeakerQuery] = useState("");
  const [speakerResults, setSpeakerResults] = useState<AdminSpeakerDTO[]>([]);
  const [creatingSpeaker, setCreatingSpeaker] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryResults, setCategoryResults] = useState<AdminCategoryDTO[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    if (!categoryQuery.trim()) {
      setCategoryResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<AdminCategoryDTO[]>(`/admin/categories?q=${encodeURIComponent(categoryQuery.trim())}`)
        .then(setCategoryResults)
        .catch(() => setCategoryResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [categoryQuery]);

  function selectCategory(c: { id: string; name: string }) {
    set("categoryId", c.id);
    set("categoryName", c.name);
    setCategoryQuery("");
    setCategoryResults([]);
  }

  useEffect(() => {
    if (!speakerQuery.trim()) {
      setSpeakerResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<AdminSpeakerDTO[]>(`/admin/speakers?q=${encodeURIComponent(speakerQuery.trim())}`)
        .then(setSpeakerResults)
        .catch(() => setSpeakerResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [speakerQuery]);

  function attachSpeaker(s: { id: string; name: string; avatarUrl: string | null }) {
    setForm((f) =>
      f.speakers.some((x) => x.id === s.id) ? f : { ...f, speakers: [...f.speakers, s] },
    );
    setSpeakerQuery("");
    setSpeakerResults([]);
  }

  function detachSpeaker(id: string) {
    setForm((f) => ({ ...f, speakers: f.speakers.filter((s) => s.id !== id) }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const dateError = validateEventDates({
      registrationOpensAt: form.registrationOpensAt,
      registrationDeadline: form.registrationDeadline,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
    });
    if (dateError) {
      setError(dateError);
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<AdminEventInput> = {
        title: form.title,
        subtitle: form.subtitle || null,
        categoryId: form.categoryId,
        location: form.location,
        venue: form.venue || null,
        description: form.description,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        registrationDeadline: form.registrationDeadline
          ? new Date(form.registrationDeadline).toISOString()
          : null,
        registrationOpensAt: form.registrationOpensAt ? new Date(form.registrationOpensAt).toISOString() : null,
        capacity: Number(form.capacity) || 0,
        bannerUrl: form.bannerUrl || null,
        thumbnailUrl: form.thumbnailUrl || null,
        speakerIds: form.speakers.map((s) => s.id),
      };
      await api.patch<EventDTO>(`/admin/events/${event.id}`, payload);
      showToast("Event saved successfully.");
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

      {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        {/* ① Identity */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Identity</h2>
            <p className="text-xs text-muted">What the event is and its content.</p>
          </div>
          <div className="space-y-4">
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
                <div className="relative">
                  <input
                    required
                    value={categoryQuery || form.categoryName}
                    onChange={(e) => {
                      setCategoryQuery(e.target.value);
                      set("categoryName", "");
                      set("categoryId", "");
                    }}
                    placeholder="Type to search categories..."
                    className={FIELD_CLASS}
                  />
                  {categoryQuery.trim() && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                      {categoryResults.map((c) => (
                        <button key={c.id} type="button" onClick={() => selectCategory(c)} className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface">
                          {c.name}
                        </button>
                      ))}
                      <button type="button" onClick={() => setCreatingCategory(true)} className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50">
                        + Create new category &ldquo;{categoryQuery.trim()}&rdquo;
                      </button>
                    </div>
                  )}
                </div>
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
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Speakers</label>
              {form.speakers.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {form.speakers.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 text-sm text-ink">
                      {s.avatarUrl ? (
                        <img src={s.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">{s.name.charAt(0).toUpperCase()}</span>
                      )}
                      {s.name}
                      <button type="button" onClick={() => detachSpeaker(s.id)} aria-label={`Remove ${s.name}`} className="text-muted transition-colors hover:text-status-red">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <input value={speakerQuery} onChange={(e) => setSpeakerQuery(e.target.value)} placeholder="Type to search speakers..." className={FIELD_CLASS} />
                {speakerQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                    {speakerResults
                      .filter((r) => !form.speakers.some((s) => s.id === r.id))
                      .map((r) => (
                        <button key={r.id} type="button" onClick={() => attachSpeaker({ id: r.id, name: r.name, avatarUrl: r.avatarUrl })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface">
                          <span className="font-medium">{r.name}</span>
                          {(r.title || r.company) && <span className="text-xs text-muted">{[r.title, r.company].filter(Boolean).join(", ")}</span>}
                        </button>
                      ))}
                    <button type="button" onClick={() => setCreatingSpeaker(true)} className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50">
                      + Create new speaker &ldquo;{speakerQuery.trim()}&rdquo;
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">Manage the full speaker directory on the Speakers page.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ImageUploadField label="Hero Banner" value={form.bannerUrl} onChange={(url) => set("bannerUrl", url)} recommendedWidth={1280} recommendedHeight={720} helpText="Shown on the event detail hero and in event cards." />
              <ImageUploadField label="Thumbnail" value={form.thumbnailUrl} onChange={(url) => set("thumbnailUrl", url)} recommendedWidth={800} recommendedHeight={600} helpText="Small image for event lists/cards. Falls back to the hero banner when unset." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Description</label>
              <textarea required value={form.description} onChange={(e) => set("description", e.target.value)} className={TEXTAREA_CLASS} />
            </div>
          </div>
        </section>

        {/* ② Schedule */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Schedule</h2>
            <p className="text-xs text-muted">When the event happens and when registration is open.</p>
          </div>
          <div className="space-y-4">
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
                <label className="mb-1 block text-xs font-semibold text-muted">Registration Opens At</label>
                <input type="datetime-local" value={form.registrationOpensAt} onChange={(e) => set("registrationOpensAt", e.target.value)} className={FIELD_CLASS} />
                <p className="mt-1 text-xs text-muted">When registration auto-opens after publishing. Leave blank to open immediately on publish.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Registration Deadline</label>
                <input type="datetime-local" value={form.registrationDeadline} onChange={(e) => set("registrationDeadline", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
                <input type="number" min={0} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
          </div>
        </section>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {creatingSpeaker && (
        <SpeakerFormModal
          speaker={null}
          onClose={() => setCreatingSpeaker(false)}
          onSaved={(s) => {
            setCreatingSpeaker(false);
            attachSpeaker({ id: s.id, name: s.name, avatarUrl: s.avatarUrl });
          }}
        />
      )}

      {creatingCategory && (
        <CategoryFormModal
          category={null}
          initialName={categoryQuery.trim()}
          onClose={() => setCreatingCategory(false)}
          onSaved={(c) => {
            setCreatingCategory(false);
            selectCategory(c);
          }}
        />
      )}
    </div>
  );
}
