import { useState, type FormEvent } from "react";
import type { AdminSpeakerDTO, CreateSpeakerInput } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { ImageUploadField } from "./ImageUploadField";
import { FIELD_CLASS, TEXTAREA_CLASS } from "../pages/events/workspace/fieldStyles";

interface SpeakerFormModalProps {
  /** null = create mode; a speaker = edit mode. */
  speaker: AdminSpeakerDTO | null;
  onClose: () => void;
  onSaved: (speaker: AdminSpeakerDTO) => void;
}

interface FormState {
  name: string;
  title: string;
  company: string;
  bioShort: string;
  bioLong: string;
  credentials: string; // comma-separated in the UI, string[] on the wire
  avatarUrl: string;
  featured: boolean;
}

function fromSpeaker(s: AdminSpeakerDTO | null): FormState {
  return {
    name: s?.name ?? "",
    title: s?.title ?? "",
    company: s?.company ?? "",
    bioShort: s?.bioShort ?? "",
    bioLong: s?.bioLong ?? "",
    credentials: s?.credentials.join(", ") ?? "",
    avatarUrl: s?.avatarUrl ?? "",
    featured: s?.featured ?? false,
  };
}

export function SpeakerFormModal({ speaker, onClose, onSaved }: SpeakerFormModalProps) {
  const [form, setForm] = useState<FormState>(fromSpeaker(speaker));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: CreateSpeakerInput = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        company: form.company.trim() || null,
        bioShort: form.bioShort.trim() || null,
        bioLong: form.bioLong.trim() || null,
        credentials: form.credentials
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        avatarUrl: form.avatarUrl || null,
        featured: form.featured,
      };
      const saved = speaker
        ? await api.patch<AdminSpeakerDTO>(`/admin/speakers/${speaker.id}`, payload)
        : await api.post<AdminSpeakerDTO>("/admin/speakers", payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save speaker.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">{speaker ? "Edit Speaker" : "Add Speaker"}</h2>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <ImageUploadField
            label="Photo"
            value={form.avatarUrl}
            onChange={(url) => set("avatarUrl", url)}
            aspect="1 / 1"
            helpText="Square headshot shown on event pages."
          />
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Title</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} className={FIELD_CLASS} placeholder="VP Engineering" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Company</label>
              <input value={form.company} onChange={(e) => set("company", e.target.value)} className={FIELD_CLASS} placeholder="Blibli" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Short Bio</label>
            <input value={form.bioShort} onChange={(e) => set("bioShort", e.target.value)} className={FIELD_CLASS} placeholder="One-line intro shown on cards" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Long Bio</label>
            <textarea value={form.bioLong} onChange={(e) => set("bioLong", e.target.value)} className={TEXTAREA_CLASS} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Credentials</label>
            <input value={form.credentials} onChange={(e) => set("credentials", e.target.value)} className={FIELD_CLASS} placeholder="Comma-separated, e.g. 10y engineering, TEDx speaker" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} />
            Featured speaker
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-5 py-2 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Speaker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
