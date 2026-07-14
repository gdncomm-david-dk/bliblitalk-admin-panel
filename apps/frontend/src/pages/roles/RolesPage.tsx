import { useEffect, useState } from "react";
import { ADMIN_ROLES } from "@repo/auth";
import { Role, type RegistrantListResult } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { PlusIcon, SearchIcon } from "../../components/icons";
import { useAuthStore } from "../../store/authStore";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";

const PAGE_SIZE = 20;

// validate.ts's 422s carry zod's flattened field errors in `details`; surface the
// first one instead of the generic "Invalid request" so a bad email/name/password
// doesn't leave the Super Admin guessing which field is wrong.
function describeAddAdminError(err: unknown): string {
  if (!(err instanceof ApiRequestError)) return "Failed to add admin.";
  const fieldErrors = (err.apiError.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  const firstField = fieldErrors && Object.values(fieldErrors).find((msgs) => msgs.length > 0)?.[0];
  return firstField ?? err.apiError.message;
}

const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: "Super Admin",
  [Role.EVENT_ADMIN]: "Event Admin",
  [Role.HR_TA]: "Talent Acquisition",
  [Role.VIEWER]: "Viewer",
  [Role.PARTICIPANT]: "Participant",
};

export function RolesPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [result, setResult] = useState<RegistrantListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>(Role.VIEWER);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function refresh() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query.trim()) params.set("search", query.trim());
    api
      .get<RegistrantListResult>(`/admin/users?${params}`)
      .then(setResult)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load users.");
      });
  }

  useEffect(refresh, [query, page]);

  async function onAddAdmin() {
    setAddError(null);
    setAdding(true);
    try {
      await api.post("/admin/users", { name: newName.trim(), email: newEmail.trim(), password: newPassword, role: newRole });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole(Role.VIEWER);
      setShowAddForm(false);
      setQuery("");
      setPage(1);
      refresh();
    } catch (err) {
      setAddError(describeAddAdminError(err));
    } finally {
      setAdding(false);
    }
  }

  async function onRoleChange(id: string, role: Role) {
    setSavingId(id);
    setError(null);
    try {
      await api.patch(`/admin/users/${id}/role`, { role });
      setResult((r) => (r ? { ...r, items: r.items.map((u) => (u.id === id ? { ...u, role } : u)) } : r));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to update role.");
    } finally {
      setSavingId(null);
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Role</h1>
          <p className="mt-1 text-sm text-muted">
            Assign Admin CMS access — Super Admin, Event Admin, Talent Acquisition, or Viewer. Only Super Admins can
            make changes here.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
        >
          <PlusIcon width={16} height={16} />
          Add Admin
        </button>
      </div>

      {showAddForm && (
        <div className="mt-5 rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-semibold text-ink">New Admin CMS account</p>
          <p className="mt-1 text-xs text-muted">
            Creates a staff account directly — no self-registration path for admin roles.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full name"
              autoComplete="off"
              className={FIELD_CLASS}
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
              placeholder="email@gdn-commerce.com"
              autoComplete="off"
              className={FIELD_CLASS}
            />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              placeholder="Password (min. 8 characters)"
              autoComplete="new-password"
              className={FIELD_CLASS}
            />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className={FIELD_CLASS}>
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          {addError && <p className="mt-3 text-sm font-medium text-status-red">{addError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={onAddAdmin}
              disabled={adding || !newName.trim() || !newEmail.trim() || newPassword.length < 8}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add Admin"}
            </button>
          </div>
        </div>
      )}

      <div className="relative mt-5 max-w-sm">
        <SearchIcon
          width={16}
          height={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search name, email…"
          className="h-10 w-full rounded-lg bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:bg-white focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {error && <p className="mt-4 text-sm font-medium text-status-red">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Institution</th>
              <th className="min-w-[200px] px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result === null ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : result.items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={4}>
                  No users match this search.
                </td>
              </tr>
            ) : (
              result.items.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-surface">
                    <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3 text-muted">{u.institution ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => onRoleChange(u.id, e.target.value as Role)}
                        disabled={isSelf || savingId === u.id}
                        title={isSelf ? "You can't change your own role here." : undefined}
                        className={`${FIELD_CLASS} h-9 disabled:opacity-60`}
                      >
                        {!ADMIN_ROLES.includes(u.role) && <option value={u.role}>{ROLE_LABELS[u.role]}</option>}
                        {ADMIN_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {result && result.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {page} of {totalPages} — {result.total} total
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-line px-3 py-1.5 font-semibold text-ink disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-line px-3 py-1.5 font-semibold text-ink disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
