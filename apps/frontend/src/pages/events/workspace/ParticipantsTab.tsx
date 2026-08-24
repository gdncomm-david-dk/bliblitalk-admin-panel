import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import type { AdminRegistrationDTO } from "@repo/shared-types";
import { can, Permission } from "@repo/auth";
import { api, ApiRequestError } from "../../../services/api";
import { useAuthStore } from "../../../store/authStore";
import {
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  FilterIcon,
  MailIcon,
  MoreVerticalIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from "../../../components/icons";

// SEC-011: the CSV builder that used to live here now lives in the API
// (`adminParticipants.service.ts` → `participantCsv`). Built in the browser it could be neither
// gated nor recorded, and the file is a full list of participant names, emails, employers and
// job titles. The column set and formatting are unchanged.

const STATUS_OPTIONS = ["REGISTERED", "WAITING", "SHORTLISTED", "REJECTED", "CANCELLED"] as const;
const ATTENDANCE_OPTIONS = ["PENDING", "PRESENT", "ABSENT"] as const;
const PAGE_SIZES = [10, 25, 50] as const;

const SEARCH_CLASS =
  "h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:bg-white focus:ring-2 focus:ring-primary/30";
const SELECT_CLASS =
  "h-9 rounded-lg border border-line bg-white px-2.5 text-sm text-ink outline-none transition focus:ring-2 focus:ring-primary/30";

function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

function RowMenu({ onReject, onEmail }: { onReject: () => void; onEmail: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        <MoreVerticalIcon width={16} height={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-40 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-soft">
          <button
            onClick={() => {
              setOpen(false);
              onEmail();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface"
          >
            <MailIcon width={15} height={15} /> Send Email
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onReject();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-status-red hover:bg-surface"
          >
            <TrashIcon width={15} height={15} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

export function ParticipantsTab({ eventId }: { eventId: string }) {
  const [registrations, setRegistrations] = useState<AdminRegistrationDTO[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [viewing, setViewing] = useState<AdminRegistrationDTO | null>(null);

  // SEC-011: hiding the button is UX only — the route refuses the request regardless, which is
  // the actual boundary (client-side gating on its own is SEC-010).
  const role = useAuthStore((s) => s.user?.role);
  const canExport = role ? can(role, Permission.REGISTRANT_EXPORT) : false;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [shortlistFilter, setShortlistFilter] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState("");
  const [certFilter, setCertFilter] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const load = () => {
    setRegistrations(null);
    api
      .get<AdminRegistrationDTO[]>(`/admin/events/${eventId}/registrations`)
      .then(setRegistrations)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load registrations.");
      });
  };

  useEffect(load, [eventId]);

  const companies = useMemo(
    () => Array.from(new Set((registrations ?? []).map((r) => r.userDepartment).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [registrations],
  );

  const filtered = useMemo(() => {
    if (!registrations) return [];
    const q = search.trim().toLowerCase();
    return registrations.filter((r) => {
      if (
        q &&
        !r.userName.toLowerCase().includes(q) &&
        !r.userEmail.toLowerCase().includes(q) &&
        !(r.userDepartment ?? "").toLowerCase().includes(q)
      )
        return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (companyFilter && r.userDepartment !== companyFilter) return false;
      if (shortlistFilter === "yes" && r.status !== "SHORTLISTED") return false;
      if (shortlistFilter === "no" && r.status === "SHORTLISTED") return false;
      if (attendanceFilter && r.attendance !== attendanceFilter) return false;
      if (certFilter === "yes" && !r.certificateCode) return false;
      if (certFilter === "no" && r.certificateCode) return false;
      return true;
    });
  }, [registrations, search, statusFilter, companyFilter, shortlistFilter, attendanceFilter, certFilter]);

  const hasActiveFilters = Boolean(
    search || statusFilter || companyFilter || shortlistFilter || attendanceFilter || certFilter,
  );

  // Reset to page 1 whenever the filtered set changes size/shape.
  useEffect(() => setPage(1), [search, statusFilter, companyFilter, shortlistFilter, attendanceFilter, certFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filtered.length);

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setCompanyFilter("");
    setShortlistFilter("");
    setAttendanceFilter("");
    setCertFilter("");
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const allSelected = pageRows.length > 0 && pageRows.every((r) => prev.has(r.id));
      const next = new Set(prev);
      pageRows.forEach((r) => (allSelected ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  }

  async function act(id: string, action: "shortlist" | "reject" | "waitlist" | "check-in" | "mark-absent") {
    setError(null);
    try {
      const updated = await api.post<AdminRegistrationDTO>(`/admin/registrations/${id}/${action}`);
      setRegistrations((prev) => prev?.map((r) => (r.id === id ? updated : r)) ?? prev);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Action failed.");
    }
  }

  async function bulkAct(action: "shortlist" | "check-in" | "reject") {
    setError(null);
    setBusy(true);
    try {
      for (const id of selected) await act(id, action);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  /**
   * SEC-011: the file is built by the API, which is what makes it gateable
   * (`registrant:export`) and auditable.
   *
   * Behaviour change worth knowing: this exports every participant on the event, not the rows
   * left after the on-screen filters. Those filters are client-side only, and re-implementing
   * them server-side would mean two copies of the same predicate drifting apart.
   */
  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const csv = await api.getText(`/admin/events/${eventId}/registrations/export`);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `participants-${dayjs().format("YYYY-MM-DD")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to export participants.");
    } finally {
      setExporting(false);
    }
  }

  function emailSelected() {
    const emails = (registrations ?? []).filter((r) => selected.has(r.id)).map((r) => r.userEmail);
    if (emails.length) window.location.href = `mailto:${emails.join(",")}`;
  }

  const summary = useMemo(() => {
    const rows = registrations ?? [];
    const active = rows.filter((r) => r.status !== "CANCELLED");
    return {
      total: active.length,
      shortlisted: rows.filter((r) => r.status === "SHORTLISTED").length,
      present: rows.filter((r) => r.attendance === "PRESENT").length,
      absent: rows.filter((r) => r.attendance === "ABSENT").length,
      noShow: active.filter((r) => r.attendance === "PENDING" && r.status !== "REJECTED").length,
      certGenerated: rows.filter((r) => r.certificateCode).length,
      certPending: rows.filter((r) => r.attendance === "PRESENT" && !r.certificateCode).length,
      noCert: active.filter((r) => !r.certificateCode).length,
    };
  }, [registrations]);

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const locked = (r: AdminRegistrationDTO) => r.status === "REJECTED" || r.status === "CANCELLED";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink">Participants</h2>
        <p className="mt-0.5 text-sm text-muted">Kelola semua peserta yang mendaftar pada event ini.</p>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <SearchIcon
              width={15}
              height={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or company…"
              className={SEARCH_CLASS}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT_CLASS}>
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={SELECT_CLASS}>
            <option value="">All Company</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={shortlistFilter} onChange={(e) => setShortlistFilter(e.target.value)} className={SELECT_CLASS}>
            <option value="">All Shortlist Status</option>
            <option value="yes">Shortlisted</option>
            <option value="no">Not Shortlisted</option>
          </select>
          <select value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value)} className={SELECT_CLASS}>
            <option value="">All Attendance</option>
            {ATTENDANCE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a.charAt(0) + a.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <button
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
          >
            <FilterIcon width={15} height={15} />
            {hasActiveFilters ? "Clear" : "Filter"}
          </button>
        </div>

        {/* Bulk actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2">
          <span className="mr-1 text-sm text-muted">{selected.size} selected</span>
          <button
            disabled={selected.size === 0 || busy}
            onClick={() => bulkAct("shortlist")}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm ring-1 ring-line transition-colors hover:bg-primary-50 disabled:opacity-40"
          >
            <StarIcon width={14} height={14} /> Shortlist
          </button>
          <button
            disabled={selected.size === 0 || busy}
            onClick={() => bulkAct("check-in")}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-status-green shadow-sm ring-1 ring-line transition-colors hover:bg-green-50 disabled:opacity-40"
          >
            <CheckIcon width={14} height={14} /> Mark Present
          </button>
          {canExport && (
            <button
              disabled={!registrations || registrations.length === 0 || exporting}
              onClick={exportCsv}
              title="Exports every participant on this event, ignoring the filters above."
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-muted shadow-sm ring-1 ring-line transition-colors hover:bg-surface disabled:opacity-40"
            >
              <DownloadIcon width={14} height={14} /> {exporting ? "Exporting…" : "Export All"}
            </button>
          )}
          <button
            disabled={selected.size === 0}
            onClick={emailSelected}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-muted shadow-sm ring-1 ring-line transition-colors hover:bg-surface disabled:opacity-40"
          >
            <MailIcon width={14} height={14} /> Send Email
          </button>
          <button
            disabled={selected.size === 0 || busy}
            onClick={() => bulkAct("reject")}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-status-red shadow-sm ring-1 ring-line transition-colors hover:bg-red-50 disabled:opacity-40"
          >
            <TrashIcon width={14} height={14} /> Reject
          </button>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        {/* Table */}
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
                  </th>
                  <th className="px-4 py-3">Participant</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">YoE</th>
                  <th className="px-4 py-3">Register Date</th>
                  <th className="px-4 py-3">Shortlisted</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Feedback</th>
                  <th className="px-4 py-3">Certificate</th>
                  <th className="min-w-[140px] px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {registrations === null ? (
                  <tr>
                    <td className="px-4 py-6 text-muted" colSpan={11}>
                      Loading registrations…
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-muted" colSpan={11}>
                      No participants match these filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const shortlisted = r.status === "SHORTLISTED";
                    return (
                      <tr key={r.id} className="hover:bg-surface/60">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {r.userAvatarUrl ? (
                              <img
                                src={r.userAvatarUrl}
                                alt={r.userName}
                                className="h-9 w-9 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary">
                                {r.userName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{r.userName}</p>
                              <p className="truncate text-xs text-muted">{r.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">{r.userDepartment ?? "—"}</td>
                        <td className="px-4 py-3 text-muted">{r.userPosition ?? "—"}</td>
                        <td className="px-4 py-3 text-muted">{r.userYearsOfExperience ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="text-ink">{dayjs(r.createdAt).format("D MMM YYYY")}</p>
                          <p className="text-xs text-muted">{dayjs(r.createdAt).format("hh:mm A")}</p>
                        </td>
                        <td className="px-4 py-3">
                          {locked(r) ? (
                            <span className="text-xs text-muted">—</span>
                          ) : (
                            <button
                              onClick={() => act(r.id, shortlisted ? "waitlist" : "shortlist")}
                              title={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                                shortlisted
                                  ? "bg-green-50 text-status-green hover:bg-green-100"
                                  : "bg-surface text-muted hover:bg-line/60"
                              }`}
                            >
                              {shortlisted && <CheckIcon width={12} height={12} />}
                              {shortlisted ? "Yes" : "No"}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {locked(r) ? (
                            <span className="text-xs text-muted">—</span>
                          ) : (
                            <button
                              onClick={() => act(r.id, r.attendance === "PRESENT" ? "mark-absent" : "check-in")}
                              title="Toggle attendance"
                              className={`inline-flex flex-col items-start rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                                r.attendance === "PRESENT"
                                  ? "bg-green-50 text-status-green hover:bg-green-100"
                                  : r.attendance === "ABSENT"
                                    ? "bg-red-50 text-status-red hover:bg-red-100"
                                    : "bg-surface text-muted hover:bg-line/60"
                              }`}
                            >
                              <span>
                                {r.attendance === "PRESENT"
                                  ? "Present"
                                  : r.attendance === "ABSENT"
                                    ? "Absent"
                                    : "Pending"}
                              </span>
                              {r.attendance === "PRESENT" && r.checkedInAt && (
                                <span className="font-normal text-status-green/70">
                                  {dayjs(r.checkedInAt).format("hh:mm A")}
                                </span>
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.feedbackSubmitted ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-status-green">
                              <CheckIcon width={12} height={12} />
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-surface px-2 py-1 text-xs font-semibold text-muted">
                              No
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {r.certificateCode ? (
                            <span className="text-xs font-semibold text-status-green">
                              Generated
                              <span className="block font-normal text-muted">#{r.certificateCode}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex h-8 items-center justify-end gap-1.5">
                            <button
                              onClick={() => setViewing(r)}
                              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
                            >
                              <EyeIcon width={16} height={16} /> View
                            </button>
                            {!locked(r) && (
                              <RowMenu onReject={() => act(r.id, "reject")} onEmail={() => (window.location.href = `mailto:${r.userEmail}`)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
            <p className="text-muted">
              Showing {rangeStart} to {rangeEnd} of {filtered.length} participants
            </p>
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink outline-none focus:ring-2 focus:ring-primary/30"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} per page
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface disabled:opacity-40"
                >
                  ‹
                </button>
                {pageWindow(currentPage, totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`gap-${i}`} className="px-1 text-muted">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors ${
                        p === currentPage
                          ? "bg-primary text-white"
                          : "border border-line text-muted hover:bg-surface"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-white p-4">
          <h3 className="text-sm font-semibold text-ink">Participant Summary</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <SummaryRow label="Total Registered" value={summary.total} />
            <SummaryRow label="Shortlisted" value={summary.shortlisted} />
            <SummaryRow label="Checked In (Present)" value={summary.present} valueClass="text-status-green" />
            <SummaryRow label="Absent" value={summary.absent} valueClass="text-status-red" />
            <SummaryRow label="No Show" value={summary.noShow} />
            <SummaryRow label="Certificate Generated" value={summary.certGenerated} />
            <SummaryRow label="Pending Certificate" value={summary.certPending} valueClass="text-amber-500" />
          </dl>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <h3 className="text-sm font-semibold text-ink">Quick Filters</h3>
          <div className="mt-3 space-y-1">
            <QuickFilter
              label="Shortlisted"
              value={summary.shortlisted}
              active={shortlistFilter === "yes"}
              onClick={() => setShortlistFilter(shortlistFilter === "yes" ? "" : "yes")}
            />
            <QuickFilter
              label="Present"
              value={summary.present}
              active={attendanceFilter === "PRESENT"}
              onClick={() => setAttendanceFilter(attendanceFilter === "PRESENT" ? "" : "PRESENT")}
            />
            <QuickFilter
              label="Absent"
              value={summary.absent}
              active={attendanceFilter === "ABSENT"}
              onClick={() => setAttendanceFilter(attendanceFilter === "ABSENT" ? "" : "ABSENT")}
            />
            <QuickFilter
              label="Certificate Generated"
              value={summary.certGenerated}
              active={certFilter === "yes"}
              onClick={() => setCertFilter(certFilter === "yes" ? "" : "yes")}
            />
            <QuickFilter
              label="No Certificate"
              value={summary.noCert}
              active={certFilter === "no"}
              onClick={() => setCertFilter(certFilter === "no" ? "" : "no")}
            />
          </div>
          <button
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="mt-3 w-full rounded-lg border border-line py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-50 disabled:opacity-40"
          >
            Clear Filters
          </button>
        </div>
      </aside>

      {viewing && <ParticipantModal registration={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function SummaryRow({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold ${valueClass ?? "text-ink"}`}>{value}</dd>
    </div>
  );
}

function QuickFilter({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active ? "bg-primary-50 text-primary" : "text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      <span>{label}</span>
      <span className={`font-semibold ${active ? "text-primary" : "text-ink"}`}>{value}</span>
    </button>
  );
}

function ParticipantModal({
  registration: r,
  onClose,
}: {
  registration: AdminRegistrationDTO;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-soft"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          {r.userAvatarUrl ? (
            <img src={r.userAvatarUrl} alt={r.userName} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-base font-semibold text-primary">
              {r.userName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{r.userName}</p>
            <p className="truncate text-sm text-muted">{r.userEmail}</p>
          </div>
        </div>
        <dl className="space-y-2.5 px-5 py-4 text-sm">
          <ModalRow label="Company" value={r.userDepartment ?? "—"} />
          <ModalRow label="Job Title" value={r.userPosition ?? "—"} />
          <ModalRow label="YoE" value={r.userYearsOfExperience ?? "—"} />
          <ModalRow label="Status" value={r.status.charAt(0) + r.status.slice(1).toLowerCase()} />
          <ModalRow label="Attendance" value={r.attendance.charAt(0) + r.attendance.slice(1).toLowerCase()} />
          <ModalRow label="Feedback" value={r.feedbackSubmitted ? "Yes" : "No"} />
          <ModalRow label="Registered" value={dayjs(r.createdAt).format("D MMM YYYY, hh:mm A")} />
          <ModalRow label="Certificate" value={r.certificateCode ? `#${r.certificateCode}` : "—"} />
        </dl>
        <div className="border-t border-line px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
