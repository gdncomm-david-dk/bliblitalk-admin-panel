import { useEffect, useState } from "react";
import type { SpeedDatingSettingsDTO } from "@repo/shared-types";
import { DEFAULT_SPEED_DATING_SETTINGS } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { FIELD_CLASS, TEXTAREA_CLASS } from "../events/workspace/fieldStyles";

export function SpeedDatingSettingsPage() {
  const [settings, setSettings] = useState<SpeedDatingSettingsDTO>(DEFAULT_SPEED_DATING_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SpeedDatingSettingsDTO>("/admin/settings/speed-dating")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await api.put<SpeedDatingSettingsDTO>("/admin/settings/speed-dating", settings);
      setSettings(saved);
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mt-1 text-sm text-muted">
        Defaults applied to every event with Speed Dating enabled. Per-event participants and sessions live in
        that event's workspace (Event Management → open an event → Speed Dating tab).
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-6 max-w-lg rounded-2xl border border-line bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Round duration (minutes)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={settings.roundDurationMinutes}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, roundDurationMinutes: Number(e.target.value) || 1 }))
                }
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Group size</label>
              <input
                type="number"
                min={2}
                max={20}
                value={settings.groupSize}
                onChange={(e) => setSettings((s) => ({ ...s, groupSize: Number(e.target.value) || 2 }))}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-muted">Intro message (optional)</label>
            <textarea
              value={settings.introMessage ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, introMessage: e.target.value || null }))}
              placeholder="Shown to participants when they opt in to Speed Dating"
              className={TEXTAREA_CLASS}
            />
          </div>

          {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}
          {notice && <p className="mt-3 text-sm font-medium text-status-green">{notice}</p>}

          <button
            onClick={onSave}
            disabled={saving}
            className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
