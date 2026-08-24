import { useState, type FormEvent } from "react";
import type { AdminCategoryDTO, CreateCategoryInput, UpdateCategoryInput } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { FIELD_CLASS } from "../pages/events/workspace/fieldStyles";

interface CategoryFormModalProps {
  /** null = create mode; an existing category = edit mode. */
  category: AdminCategoryDTO | null;
  /** Create mode only — pre-fills the name field from the event form combobox's typed query. */
  initialName?: string;
  onClose: () => void;
  onSaved: (category: AdminCategoryDTO) => void;
}

interface FormState {
  name: string;
  isActive: boolean;
}

function fromCategory(c: AdminCategoryDTO | null, initialName?: string): FormState {
  return {
    name: c?.name ?? initialName ?? "",
    isActive: c?.isActive ?? true,
  };
}

export function CategoryFormModal({ category, initialName, onClose, onSaved }: CategoryFormModalProps) {
  const [form, setForm] = useState<FormState>(fromCategory(category, initialName));
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
      const saved = category
        ? await api.patch<AdminCategoryDTO>(`/admin/categories/${category.id}`, {
            name: form.name.trim(),
            isActive: form.isActive,
          } as UpdateCategoryInput)
        : await api.post<AdminCategoryDTO>("/admin/categories", {
            name: form.name.trim(),
          } as CreateCategoryInput);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="presentation"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h2 className="text-base font-bold text-ink">{category ? "Edit Category" : "Add Category"}</h2>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          {category && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              Active (shown as a selectable option on events)
            </label>
          )}

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
              {saving ? "Saving…" : "Save Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
