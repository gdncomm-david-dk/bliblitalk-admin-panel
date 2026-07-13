import { useEffect, useState } from "react";
import { statusColor, statusLabel, type BluColor } from "@repo/shared-utils";
import type { AdminAnalyticsDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";

const BAR_COLOR: Record<BluColor, string> = {
  blue: "bg-primary",
  green: "bg-status-green",
  orange: "bg-status-orange",
  red: "bg-status-red",
  purple: "bg-status-purple",
};

function BarRow({
  label,
  count,
  max,
  colorClass = "bg-primary",
}: {
  label: string;
  count: number;
  max: number;
  colorClass?: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="font-semibold text-muted">{count}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Functional MVP — the user will share a mockup to make this pixel-perfect later.
export function AnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminAnalyticsDTO>("/admin/analytics")
      .then(setData)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load analytics.");
      });
  }, []);

  if (error) return <p className="text-sm font-medium text-status-red">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading analytics…</p>;

  const maxCategory = Math.max(1, ...data.eventsByCategory.map((c) => c.count));
  const maxStatus = Math.max(1, ...data.registrationsByStatus.map((s) => s.count));
  const maxTop = Math.max(1, ...data.topEventsByRegistrations.map((e) => e.registrations));

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Analytics</h1>
      <p className="mt-1 text-sm text-muted">Event performance and engagement metrics.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Events by Category</p>
          <div className="mt-4 space-y-3">
            {data.eventsByCategory.map((c) => (
              <BarRow key={c.category} label={c.category} count={c.count} max={maxCategory} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Registrations by Status</p>
          <div className="mt-4 space-y-3">
            {data.registrationsByStatus.map((s) => (
              <BarRow
                key={s.status}
                label={statusLabel(s.status)}
                count={s.count}
                max={maxStatus}
                colorClass={BAR_COLOR[statusColor(s.status)]}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Top Events by Registrations</p>
          <div className="mt-4 space-y-3">
            {data.topEventsByRegistrations.map((e) => (
              <BarRow key={e.eventId} label={e.title} count={e.registrations} max={maxTop} />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <p className="px-5 pt-5 text-sm font-semibold text-ink">Attendance by Event</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2">Event</th>
                <th className="px-5 py-2">Registered</th>
                <th className="px-5 py-2">Present</th>
                <th className="px-5 py-2">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.eventAttendance.map((e) => (
                <tr key={e.eventId}>
                  <td className="max-w-[220px] truncate px-5 py-2 text-ink">{e.title}</td>
                  <td className="px-5 py-2 text-muted">{e.registrations}</td>
                  <td className="px-5 py-2 text-muted">{e.present}</td>
                  <td className="px-5 py-2 text-muted">{e.attendanceRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
