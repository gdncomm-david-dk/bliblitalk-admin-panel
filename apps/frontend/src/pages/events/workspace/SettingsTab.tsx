import { useState } from "react";
import type { AdminEventInput, EventDisplayConfig, EventDTO, SelectionMode } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { useToastStore } from "../../../store/toastStore";
import { FIELD_CLASS } from "./fieldStyles";

const SELECTION_OPTIONS = [
  { value: "FCFS", label: "First-come-first-served", hint: "Registrations are auto-approved up to capacity." },
  { value: "CURATED", label: "Curated (admin shortlists)", hint: "Registrations wait for admin shortlisting." },
] as const;

const DISPLAY_TOGGLES: { key: keyof EventDisplayConfig; label: string }[] = [
  { key: "pastEvent", label: "Display as Past Event" },
  { key: "speaker", label: "Display Speaker" },
  { key: "gallery", label: "Display Gallery" },
  { key: "keyTakeaways", label: "Display Key Takeaways" },
  { key: "recording", label: "Display Recording" },
  { key: "certificate", label: "Display Certificate" },
];

export function SettingsTab({ event, onSaved }: { event: EventDTO; onSaved: () => void }) {
  const [capacity, setCapacity] = useState(String(event.capacity));
  const [waitingListEnabled, setWaitingListEnabled] = useState(event.waitingListEnabled);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(event.selectionMode);
  const [showRemainingSeats, setShowRemainingSeats] = useState(event.showRemainingSeats);
  const [enableCertificate, setEnableCertificate] = useState(event.enableCertificate);
  const [enableFeedback, setEnableFeedback] = useState(event.enableFeedback);
  const [displayConfig, setDisplayConfig] = useState<EventDisplayConfig>(event.displayConfig);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showToast = useToastStore((s) => s.show);

  function toggleDisplay(key: keyof EventDisplayConfig, value: boolean) {
    setDisplayConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const payload: Partial<AdminEventInput> = {
        capacity: Number(capacity) || 0,
        waitingListEnabled,
        showRemainingSeats,
        selectionMode,
        enableCertificate,
        enableFeedback,
        displayConfig,
      };
      await api.patch<EventDTO>(`/admin/events/${event.id}`, payload);
      showToast("Settings saved successfully.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-muted">Selection Mode</label>
          <div className="flex gap-3">
            {SELECTION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex-1 cursor-pointer rounded-lg border p-3 transition ${
                  selectionMode === opt.value ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-primary/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="selectionMode" value={opt.value} checked={selectionMode === opt.value} onChange={() => setSelectionMode(opt.value)} />
                  <span className="text-sm font-semibold text-ink">{opt.label}</span>
                </span>
                <span className="mt-1 block pl-6 text-xs text-muted">{opt.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={waitingListEnabled} onChange={(e) => setWaitingListEnabled(e.target.checked)} />
            Waitlist enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={showRemainingSeats} onChange={(e) => setShowRemainingSeats(e.target.checked)} />
            Show remaining seat count to participants
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={enableCertificate} onChange={(e) => setEnableCertificate(e.target.checked)} />
            Certificate enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={enableFeedback} onChange={(e) => setEnableFeedback(e.target.checked)} />
            Feedback enabled (required before certificate download)
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="text-sm font-semibold text-ink">Display in Past Events</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DISPLAY_TOGGLES.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={displayConfig[t.key]}
                onChange={(e) => toggleDisplay(t.key, e.target.checked)}
              />
              {t.label}
            </label>
          ))}
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
