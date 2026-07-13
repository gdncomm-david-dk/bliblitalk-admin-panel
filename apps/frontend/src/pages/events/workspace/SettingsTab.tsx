import { useState } from "react";
import type { AdminEventInput, EventDisplayConfig, EventDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { FIELD_CLASS } from "./fieldStyles";

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
  const [shortlistRequired, setShortlistRequired] = useState(!event.showRemainingSeats);
  const [enableCertificate, setEnableCertificate] = useState(event.enableCertificate);
  const [enableFeedback, setEnableFeedback] = useState(event.enableFeedback);
  const [displayConfig, setDisplayConfig] = useState<EventDisplayConfig>(event.displayConfig);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingRegistration, setTogglingRegistration] = useState(false);

  function toggleDisplay(key: keyof EventDisplayConfig, value: boolean) {
    setDisplayConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const payload: Partial<AdminEventInput> = {
        capacity: Number(capacity) || 0,
        waitingListEnabled,
        showRemainingSeats: !shortlistRequired,
        enableCertificate,
        enableFeedback,
        displayConfig,
      };
      await api.patch<EventDTO>(`/admin/events/${event.id}`, payload);
      setNotice("Saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleRegistration() {
    setError(null);
    setTogglingRegistration(true);
    try {
      const action = event.status === "REGISTRATION_CLOSED" ? "open-registration" : "close-registration";
      await api.post(`/admin/events/${event.id}/${action}`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to update registration status.");
    } finally {
      setTogglingRegistration(false);
    }
  }

  const canToggleRegistration = event.status === "PUBLISHED" || event.status === "REGISTRATION_CLOSED";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Registration</p>
            <p className="text-xs text-muted">
              {event.status === "REGISTRATION_CLOSED" ? "Registration is closed." : "Registration is open."}
            </p>
          </div>
          <button
            onClick={onToggleRegistration}
            disabled={!canToggleRegistration || togglingRegistration}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-40"
          >
            {event.status === "REGISTRATION_CLOSED" ? "Reopen Registration" : "Close Registration"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
            <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={waitingListEnabled} onChange={(e) => setWaitingListEnabled(e.target.checked)} />
            Waitlist enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={shortlistRequired} onChange={(e) => setShortlistRequired(e.target.checked)} />
            Shortlist required (hides remaining-seats counter, every registrant waits for review)
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
      {notice && <p className="text-sm font-medium text-status-green">{notice}</p>}

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
