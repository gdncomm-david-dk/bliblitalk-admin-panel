import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { EmploymentType, type RegistrantListResult } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { SearchIcon, DownloadIcon } from "../../components/icons";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";

const PAGE_SIZE = 20;

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  [EmploymentType.INTERNAL]: "Internal (Employee)",
  [EmploymentType.EXTERNAL]: "External",
};

function toCsv(result: RegistrantListResult): string {
  const header = [
    "Name",
    "Email",
    "Phone",
    "Institution",
    "Department",
    "Position",
    "YoE",
    "Type",
    "Events Joined",
    "Last Joined",
    "Registered Since",
  ];
  const rows = result.items.map((r) => [
    r.name,
    r.email,
    r.phone ?? "",
    r.institution ?? "",
    r.department ?? "",
    r.position ?? "",
    r.yearsOfExperience ?? "",
    EMPLOYMENT_TYPE_LABELS[r.employmentType],
    String(r.eventsJoinedCount),
    r.lastJoinedAt ? dayjs(r.lastJoinedAt).format("YYYY-MM-DD") : "",
    dayjs(r.createdAt).format("YYYY-MM-DD"),
  ]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function RegistrantsPage() {
  const [result, setResult] = useState<RegistrantListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query.trim()) params.set("search", query.trim());
    api
      .get<RegistrantListResult>(`/admin/users?${params}`)
      .then(setResult)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load registrants.");
      });
  }, [query, page]);

  async function onEmploymentTypeChange(id: string, employmentType: EmploymentType) {
    setSavingId(id);
    setError(null);
    try {
      await api.patch(`/admin/users/${id}/employment-type`, { employmentType });
      setResult((r) => (r ? { ...r, items: r.items.map((u) => (u.id === id ? { ...u, employmentType } : u)) } : r));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to update type.");
    } finally {
      setSavingId(null);
    }
  }

  function exportCsv() {
    if (!result) return;
    const blob = new Blob([toCsv(result)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrants-${dayjs().format("YYYY-MM-DD")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">User Management</h1>
          <p className="mt-1 text-sm text-muted">
            Everyone who has ever registered for a Blibli Talk event — use this as your invite audience for
            future events (see Marketing Email).
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!result?.items.length}
          className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-40"
        >
          <DownloadIcon width={16} height={16} />
          Export CSV
        </button>
      </div>

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
          placeholder="Search name, email, institution…"
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
              <th className="px-4 py-3">Job Title</th>
              <th className="px-4 py-3">YoE</th>
              <th className="min-w-[170px] px-4 py-3">Type</th>
              <th className="px-4 py-3">Events Joined</th>
              <th className="px-4 py-3">Last Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result === null ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : result.items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={8}>
                  No registrants match this search.
                </td>
              </tr>
            ) : (
              result.items.map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-3 text-muted">{r.email}</td>
                  <td className="px-4 py-3 text-muted">{r.institution ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.position ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.yearsOfExperience ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={r.employmentType}
                      onChange={(e) => onEmploymentTypeChange(r.id, e.target.value as EmploymentType)}
                      disabled={savingId === r.id}
                      className={`${FIELD_CLASS} h-9 disabled:opacity-60`}
                    >
                      {Object.values(EmploymentType).map((type) => (
                        <option key={type} value={type}>
                          {EMPLOYMENT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.eventsJoinedCount}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.lastJoinedAt ? dayjs(r.lastJoinedAt).format("D MMM YYYY") : "—"}
                  </td>
                </tr>
              ))
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
