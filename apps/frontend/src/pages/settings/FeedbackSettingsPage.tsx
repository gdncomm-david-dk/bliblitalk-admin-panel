import { useEffect, useState } from "react";
import type { FeedbackSettingsDTO } from "@repo/shared-types";
import { DEFAULT_FEEDBACK_SETTINGS } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";

export function FeedbackSettingsPage() {
  const [settings, setSettings] = useState<FeedbackSettingsDTO>(DEFAULT_FEEDBACK_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FeedbackSettingsDTO>("/admin/settings/feedback")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateQuestion(key: string, patch: Partial<{ label: string; enabled: boolean }>) {
    setSettings((s) => ({
      ...s,
      questions: s.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)),
    }));
  }

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await api.put<FeedbackSettingsDTO>("/admin/settings/feedback", settings);
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
      <h1 className="text-xl font-bold text-ink">Reviews & Feedback Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Edit the question text shown on the portal's post-event feedback form, or turn a question off
        entirely. Per-event feedback results live in that event's workspace (Event Management → open an
        event → Feedback tab).
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-6 max-w-3xl space-y-3">
          {settings.questions.map((q) => (
            <div key={q.key} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <input
                  value={q.label}
                  onChange={(e) => updateQuestion(q.key, { label: e.target.value })}
                  className={FIELD_CLASS}
                />
                <label className="flex shrink-0 items-center gap-2 pt-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={q.enabled}
                    onChange={(e) => updateQuestion(q.key, { enabled: e.target.checked })}
                  />
                  Shown
                </label>
              </div>
              <p className="mt-1.5 text-xs text-muted">{q.key}</p>
            </div>
          ))}

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
      )}
    </div>
  );
}
