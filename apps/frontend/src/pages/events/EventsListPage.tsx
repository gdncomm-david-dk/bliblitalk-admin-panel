import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import type { EventDTO } from "@repo/shared-types";
import { getEventDisplayStatus } from "@repo/shared-utils";
import { api, ApiRequestError } from "../../services/api";
import { StatusBadge } from "../../components/StatusBadge";
import { SearchIcon } from "../../components/icons";

type StatusFilter =
  | "DRAFT"
  | "PUBLISHED"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "ONGOING"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED"
  | "upcoming";

const FILTER_TITLES: Record<StatusFilter, string> = {
  DRAFT: "Draft Events",
  PUBLISHED: "Published Events",
  REGISTRATION_OPEN: "Registration Open",
  REGISTRATION_CLOSED: "Registration Closed",
  ONGOING: "Ongoing Events",
  COMPLETED: "Completed Events",
  CANCELLED: "Cancelled Events",
  ARCHIVED: "Archived Events",
  upcoming: "Upcoming Events",
};

const STATUS_PILLS: { value: StatusFilter | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ONGOING", label: "Ongoing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ARCHIVED", label: "Archived" },
];

function matchesFilter(e: EventDTO, filter: StatusFilter | null): boolean {
  if (!filter) return true;
  if (filter === "upcoming") {
    return e.status === "PUBLISHED" || e.status === "REGISTRATION_OPEN" || e.status === "REGISTRATION_CLOSED";
  }
  return e.status === filter;
}

// Functional MVP list — the user will share a mockup to make this pixel-perfect later.
export function EventsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<EventDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filter = (searchParams.get("status") as StatusFilter | null) ?? null;

  const load = () => {
    api
      .get<EventDTO[]>("/admin/events")
      .then(setEvents)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load events.");
      });
  };

  useEffect(load, []);

  const visible = useMemo(() => {
    if (!events) return null;
    const q = query.trim().toLowerCase();
    return events.filter((e) => matchesFilter(e, filter) && (!q || e.title.toLowerCase().includes(q)));
  }, [events, filter, query]);

  const title = filter ? FILTER_TITLES[filter] ?? "Event Management" : "Event Management";

  function setFilter(next: StatusFilter | null) {
    setSearchParams(next ? { status: next } : {});
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-muted">Create, edit, publish, and manage the event lifecycle.</p>
        </div>
        <Link
          to="/events/new"
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          + New Event
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {STATUS_PILLS.map((pill) => (
          <button
            key={pill.label}
            onClick={() => setFilter(pill.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              filter === pill.value
                ? "bg-primary text-white"
                : "border border-line text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <div className="relative mt-4 max-w-sm">
        <SearchIcon
          width={16}
          height={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events…"
          className="h-10 w-full rounded-lg bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:bg-white focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {error && <p className="mt-4 text-sm font-medium text-status-red">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Registrations</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible === null ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  Loading events…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  No events match this view.
                </td>
              </tr>
            ) : (
              visible.map((e) => (
                <tr key={e.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-surface">
                        {(e.thumbnailUrl ?? e.bannerUrl) && (
                          <img
                            src={e.thumbnailUrl ?? e.bannerUrl ?? undefined}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <span className="max-w-xs truncate font-medium text-ink">{e.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={getEventDisplayStatus(e)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {dayjs(e.startsAt).format("D MMM YYYY")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {e.seatsTaken}/{e.capacity || "∞"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link to={`/events/${e.id}`} className="text-sm font-semibold text-primary hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
