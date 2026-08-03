import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminCategoryDTO, AdminEventInput, AdminSpeakerDTO, EventDTO, SelectionMode } from "@repo/shared-types";
import { validateEventDates } from "@repo/shared-utils";
import { api, ApiRequestError } from "../../services/api";
import { CategoryFormModal } from "../../components/CategoryFormModal";
import { SpeakerFormModal } from "../../components/SpeakerFormModal";
import { ImageUploadField } from "../../components/ImageUploadField";

const FIELD_CLASS =
  "h-10 w-full rounded-lg bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:bg-white focus:ring-2 focus:ring-primary/30";
const TEXTAREA_CLASS = `${FIELD_CLASS} h-24 resize-none py-2`;

const SELECTION_OPTIONS = [
  { value: "FCFS", label: "First-come-first-served", hint: "Registrations are auto-approved up to capacity." },
  { value: "CURATED", label: "Curated (admin shortlists)", hint: "Registrations wait for admin shortlisting." },
] as const;

interface FormState {
  title: string;
  subtitle: string;
  categoryId: string;
  categoryName: string;
  location: string;
  venue: string;
  description: string;
  bannerUrl: string;
  thumbnailUrl: string;
  speakers: { id: string; name: string; avatarUrl: string | null }[];
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationDeadline: string;
  capacity: string;
  selectionMode: SelectionMode;
  showRemainingSeats: boolean;
  waitingListEnabled: boolean;
  hasSpeedDating: boolean;
  enableCertificate: boolean;
  enableFeedback: boolean;
}

const EMPTY: FormState = {
  title: "",
  subtitle: "",
  categoryId: "",
  categoryName: "",
  location: "",
  venue: "",
  description: "",
  bannerUrl: "",
  thumbnailUrl: "",
  speakers: [],
  startsAt: "",
  endsAt: "",
  registrationOpensAt: "",
  registrationDeadline: "",
  capacity: "0",
  selectionMode: "FCFS",
  showRemainingSeats: true,
  waitingListEnabled: true,
  hasSpeedDating: false,
  enableCertificate: true,
  enableFeedback: false,
};

// New-event form only — editing lives in the event workspace's Overview/Settings tabs.
export function EventFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  const [speakerQuery, setSpeakerQuery] = useState("");
  const [speakerResults, setSpeakerResults] = useState<AdminSpeakerDTO[]>([]);
  const [creatingSpeaker, setCreatingSpeaker] = useState(false);

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
    setForm((f) => (f.speakers.some((x) => x.id === s.id) ? f : { ...f, speakers: [...f.speakers, s] }));
    setSpeakerQuery("");
    setSpeakerResults([]);
  }

  function detachSpeaker(id: string) {
    setForm((f) => ({ ...f, speakers: f.speakers.filter((s) => s.id !== id) }));
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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
      const payload: AdminEventInput = {
        title: form.title,
        subtitle: form.subtitle || null,
        categoryId: form.categoryId,
        location: form.location,
        venue: form.venue || null,
        description: form.description,
        bannerUrl: form.bannerUrl || null,
        thumbnailUrl: form.thumbnailUrl || null,
        speakerIds: form.speakers.map((s) => s.id),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        registrationOpensAt: form.registrationOpensAt ? new Date(form.registrationOpensAt).toISOString() : null,
        registrationDeadline: form.registrationDeadline ? new Date(form.registrationDeadline).toISOString() : null,
        capacity: Number(form.capacity) || 0,
        selectionMode: form.selectionMode,
        showRemainingSeats: form.showRemainingSeats,
        waitingListEnabled: form.waitingListEnabled,
        hasSpeedDating: form.hasSpeedDating,
        enableCertificate: form.enableCertificate,
        enableFeedback: form.enableFeedback,
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
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCategory(c)}
                          className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface"
                        >
                          {c.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCreatingCategory(true)}
                        className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50"
                      >
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
              <label className="mb-1 block text-xs font-semibold text-muted">Description</label>
              <textarea required value={form.description} onChange={(e) => set("description", e.target.value)} className={TEXTAREA_CLASS} />
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
              <label className="mb-1 block text-xs font-semibold text-muted">Speakers</label>
              {form.speakers.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {form.speakers.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 text-sm text-ink">
                      {s.avatarUrl ? (
                        <img src={s.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                          {s.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      {s.name}
                      <button
                        type="button"
                        onClick={() => detachSpeaker(s.id)}
                        aria-label={`Remove ${s.name}`}
                        className="text-muted transition-colors hover:text-status-red"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <input
                  value={speakerQuery}
                  onChange={(e) => setSpeakerQuery(e.target.value)}
                  placeholder="Type to search speakers..."
                  className={FIELD_CLASS}
                />
                {speakerQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                    {speakerResults
                      .filter((r) => !form.speakers.some((s) => s.id === r.id))
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => attachSpeaker({ id: r.id, name: r.name, avatarUrl: r.avatarUrl })}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface"
                        >
                          <span className="font-medium">{r.name}</span>
                          {(r.title || r.company) && (
                            <span className="text-xs text-muted">{[r.title, r.company].filter(Boolean).join(", ")}</span>
                          )}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setCreatingSpeaker(true)}
                      className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50"
                    >
                      + Create new speaker &ldquo;{speakerQuery.trim()}&rdquo;
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">Manage the full speaker directory on the Speakers page.</p>
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
          </div>
        </section>

        {/* ③ Behavior */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Behavior</h2>
            <p className="text-xs text-muted">How registration and event modules operate.</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
                <input type="number" min={0} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Selection Mode</label>
              <div className="flex gap-3">
                {SELECTION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex-1 cursor-pointer rounded-lg border p-3 transition ${
                      form.selectionMode === opt.value ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-primary/40"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input type="radio" name="selectionMode" value={opt.value} checked={form.selectionMode === opt.value} onChange={() => set("selectionMode", opt.value)} />
                      <span className="text-sm font-semibold text-ink">{opt.label}</span>
                    </span>
                    <span className="mt-1 block pl-6 text-xs text-muted">{opt.hint}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.showRemainingSeats} onChange={(e) => set("showRemainingSeats", e.target.checked)} />
                Show remaining seat count to participants
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.waitingListEnabled} onChange={(e) => set("waitingListEnabled", e.target.checked)} />
                Enable waiting list when full
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.hasSpeedDating} onChange={(e) => set("hasSpeedDating", e.target.checked)} />
                Enable Speed Dating
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.enableCertificate} onChange={(e) => set("enableCertificate", e.target.checked)} />
                Enable Certificate
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.enableFeedback} onChange={(e) => set("enableFeedback", e.target.checked)} />
                Enable Feedback
              </label>
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create Event"}
        </button>
      </form>

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
    </div>
  );
}
