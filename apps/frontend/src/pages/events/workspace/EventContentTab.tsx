import { useState } from "react";
import type { AdminEventInput, EventDTO, LearningPointDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { useToastStore } from "../../../store/toastStore";
import { FIELD_CLASS } from "./fieldStyles";

export function EventContentTab({ event, onSaved }: { event: EventDTO; onSaved: () => void }) {
  const [learningPoints, setLearningPoints] = useState<LearningPointDTO[]>(event.learningPoints);
  const [galleryImages, setGalleryImages] = useState<string[]>(event.galleryImages);
  const [recordingUrl, setRecordingUrl] = useState(event.recordingUrl ?? "");
  const [presentationUrl, setPresentationUrl] = useState(event.presentationUrl ?? "");
  const [pastEvent, setPastEvent] = useState(event.displayConfig.pastEvent);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showToast = useToastStore((s) => s.show);

  function addTakeaway() {
    setLearningPoints((prev) => [...prev, { icon: "check", title: "", description: "" }]);
  }
  function updateTakeaway(i: number, title: string) {
    setLearningPoints((prev) => prev.map((lp, idx) => (idx === i ? { ...lp, title } : lp)));
  }
  function removeTakeaway(i: number) {
    setLearningPoints((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addImage() {
    setGalleryImages((prev) => [...prev, ""]);
  }
  function updateImage(i: number, url: string) {
    setGalleryImages((prev) => prev.map((v, idx) => (idx === i ? url : v)));
  }
  function removeImage(i: number) {
    setGalleryImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const payload: Partial<AdminEventInput> = {
        learningPoints: learningPoints.filter((lp) => lp.title.trim().length > 0),
        galleryImages: galleryImages.filter((url) => url.trim().length > 0),
        recordingUrl: recordingUrl || null,
        presentationUrl: presentationUrl || null,
        displayConfig: { pastEvent },
      };
      await api.patch<EventDTO>(`/admin/events/${event.id}`, payload);
      showToast("Event content saved successfully.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save event content.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <label className="flex items-center justify-between rounded-2xl border border-line bg-white p-5">
        <span className="text-sm font-semibold text-ink">Show in Past Events?</span>
        <input type="checkbox" checked={pastEvent} onChange={(e) => setPastEvent(e.target.checked)} />
      </label>

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Key Takeaways</p>
          <button onClick={addTakeaway} className="text-xs font-semibold text-primary hover:underline">
            + Add
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {learningPoints.length === 0 && <p className="text-sm text-muted">No takeaways yet.</p>}
          {learningPoints.map((lp, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={lp.title}
                onChange={(e) => updateTakeaway(i, e.target.value)}
                placeholder="e.g. Practical frameworks you can apply immediately"
                className={FIELD_CLASS}
              />
              <button onClick={() => removeTakeaway(i)} className="px-2 text-sm text-status-red">
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Gallery</p>
          <button onClick={addImage} className="text-xs font-semibold text-primary hover:underline">
            + Add
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {galleryImages.length === 0 && <p className="text-sm text-muted">No images yet.</p>}
          {galleryImages.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={url}
                onChange={(e) => updateImage(i, e.target.value)}
                placeholder="https://…"
                className={FIELD_CLASS}
              />
              <button onClick={() => removeImage(i)} className="px-2 text-sm text-status-red">
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Video (YouTube URL)</label>
          <input value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="https://youtube.com/…" className={FIELD_CLASS} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Presentation (PDF URL)</label>
          <input value={presentationUrl} onChange={(e) => setPresentationUrl(e.target.value)} placeholder="https://…" className={FIELD_CLASS} />
        </div>
      </div>

      {error && <p className="text-sm font-medium text-status-red">{error}</p>}

      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
