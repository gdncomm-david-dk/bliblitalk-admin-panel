import { useEffect, useState } from "react";
import type { AdminSpeakerDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { useToastStore } from "../../store/toastStore";
import { SpeakerFormModal } from "../../components/SpeakerFormModal";
import { SearchIcon, PlusIcon, EditIcon, TrashIcon } from "../../components/icons";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";

export function SpeakersPage() {
  const [speakers, setSpeakers] = useState<AdminSpeakerDTO[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; speaker: AdminSpeakerDTO | null }>({
    open: false,
    speaker: null,
  });
  const showToast = useToastStore((s) => s.show);

  async function load() {
    setLoading(true);
    try {
      setSpeakers(await api.get<AdminSpeakerDTO[]>("/admin/speakers"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = query
    ? speakers.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : speakers;

  async function onDelete(speaker: AdminSpeakerDTO) {
    const warning =
      speaker.eventCount > 0
        ? `${speaker.name} is attached to ${speaker.eventCount} event(s). Deleting will remove them from those events too. Continue?`
        : `Delete ${speaker.name}?`;
    if (!window.confirm(warning)) return;
    try {
      await api.delete(`/admin/speakers/${speaker.id}`);
      showToast("Speaker deleted.");
      void load();
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.apiError.message : "Failed to delete speaker.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Speaker Management</h1>
          <p className="mt-1 text-sm text-muted">
            Create speakers once, then attach them to events from each event&apos;s Overview tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true, speaker: null })}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <PlusIcon width={16} height={16} /> Add Speaker
        </button>
      </div>

      <div className="relative mt-5 max-w-sm">
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search speakers by name..."
          className={`${FIELD_CLASS} pl-9`}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Speaker</th>
              <th className="px-4 py-3">Title / Company</th>
              <th className="px-4 py-3">Featured</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No speakers yet. Add your first speaker.</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {s.avatarUrl ? (
                      <img src={s.avatarUrl} alt={s.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-ink">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {[s.title, s.company].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  {s.featured && (
                    <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">Featured</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{s.eventCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setModal({ open: true, speaker: s })}
                      aria-label={`Edit ${s.name}`}
                      className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-primary"
                    >
                      <EditIcon width={16} height={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(s)}
                      aria-label={`Delete ${s.name}`}
                      className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-status-red"
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <SpeakerFormModal
          speaker={modal.speaker}
          onClose={() => setModal({ open: false, speaker: null })}
          onSaved={() => {
            setModal({ open: false, speaker: null });
            showToast("Speaker saved.");
            void load();
          }}
        />
      )}
    </div>
  );
}
