import { useEffect, useState } from "react";
import type { CertificateSettingsDTO } from "@repo/shared-types";
import { DEFAULT_CERTIFICATE_SETTINGS } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { FIELD_CLASS, TEXTAREA_CLASS } from "../events/workspace/fieldStyles";

export function CertificateSettingsPage() {
  const [settings, setSettings] = useState<CertificateSettingsDTO>(DEFAULT_CERTIFICATE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CertificateSettingsDTO>("/admin/settings/certificate")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await api.put<CertificateSettingsDTO>("/admin/settings/certificate", settings);
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
        Customize the certificate template issued to attendees. Per-event issuance lives in that event's
        workspace (Event Management → open an event → Certificates tab).
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-6 max-w-lg rounded-2xl border border-line bg-white p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Headline</label>
            <input
              value={settings.headline}
              onChange={(e) => setSettings((s) => ({ ...s, headline: e.target.value }))}
              className={FIELD_CLASS}
            />
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-muted">Accent color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) => setSettings((s) => ({ ...s, accentColor: e.target.value }))}
                className="h-10 w-14 shrink-0 rounded-lg border border-line"
              />
              <input
                value={settings.accentColor}
                onChange={(e) => setSettings((s) => ({ ...s, accentColor: e.target.value }))}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Signatory name (optional)</label>
              <input
                value={settings.signatoryName ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, signatoryName: e.target.value || null }))}
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Signatory title (optional)</label>
              <input
                value={settings.signatoryTitle ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, signatoryTitle: e.target.value || null }))}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-muted">Footer note (optional)</label>
            <textarea
              value={settings.footerNote ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, footerNote: e.target.value || null }))}
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
