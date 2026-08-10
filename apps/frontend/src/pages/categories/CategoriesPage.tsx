import { useEffect, useState } from "react";
import type { AdminCategoryDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { useToastStore } from "../../store/toastStore";
import { CategoryFormModal } from "../../components/CategoryFormModal";
import { SearchIcon, PlusIcon, EditIcon, TrashIcon } from "../../components/icons";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";

export function CategoriesPage() {
  const [categories, setCategories] = useState<AdminCategoryDTO[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; category: AdminCategoryDTO | null }>({
    open: false,
    category: null,
  });
  const showToast = useToastStore((s) => s.show);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCategories(await api.get<AdminCategoryDTO[]>("/admin/categories?includeInactive=true"));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = query
    ? categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories;

  async function onDelete(category: AdminCategoryDTO) {
    if (!window.confirm(`Deactivate ${category.name}?`)) return;
    try {
      await api.delete(`/admin/categories/${category.id}`);
      showToast("Category deactivated.");
      void load();
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.apiError.message : "Failed to deactivate category.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            Create categories once, then pick them from each event&apos;s Overview tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true, category: null })}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <PlusIcon width={16} height={16} /> Add Category
        </button>
      </div>

      <div className="relative mt-5 max-w-sm">
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories by name..."
          className={`${FIELD_CLASS} pl-9`}
        />
      </div>

      {error && <p className="mt-4 text-sm font-medium text-status-red">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No categories yet. Add your first category.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3">
                  {c.isActive ? (
                    <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">Active</span>
                  ) : (
                    <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-muted">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{c.eventCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setModal({ open: true, category: c })}
                      aria-label={`Edit ${c.name}`}
                      className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-primary"
                    >
                      <EditIcon width={16} height={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(c)}
                      aria-label={`Deactivate ${c.name}`}
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
        <CategoryFormModal
          category={modal.category}
          onClose={() => setModal({ open: false, category: null })}
          onSaved={() => {
            setModal({ open: false, category: null });
            showToast("Category saved.");
            void load();
          }}
        />
      )}
    </div>
  );
}
