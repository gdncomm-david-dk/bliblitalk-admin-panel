import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { AdminDashboardDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import {
  AwardIcon,
  CalendarIcon,
  CheckIcon,
  HeartIcon,
  StarIcon,
  UsersIcon,
} from "../components/icons";

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary">
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<AdminDashboardDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminDashboardDTO>("/admin/dashboard")
      .then(setData)
      .catch((err) => {
        setError(
          err instanceof ApiRequestError ? err.apiError.message : "Failed to load dashboard.",
        );
      });
  }, []);

  if (error) {
    return <p className="text-sm font-medium text-status-red">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-muted">Loading dashboard…</p>;
  }

  const { stats, recentRegistrations, upcomingCalendar } = data;

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Overview of events, participants, and activity.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<CalendarIcon width={18} height={18} />} label="Total Events" value={stats.totalEvents} />
        <StatCard icon={<CalendarIcon width={18} height={18} />} label="Upcoming Events" value={stats.upcomingEvents} />
        <StatCard icon={<UsersIcon width={18} height={18} />} label="Total Registrations" value={stats.totalRegistrations} />
        <StatCard icon={<CheckIcon width={18} height={18} />} label="Attendance Rate" value={`${stats.attendanceRate}%`} />
        <StatCard icon={<StarIcon width={18} height={18} />} label="Shortlisted" value={stats.shortlistedCount} />
        <StatCard icon={<HeartIcon width={18} height={18} />} label="Speed Dating Participants" value={stats.speedDatingParticipants} />
        <StatCard icon={<AwardIcon width={18} height={18} />} label="Certificates Issued" value={stats.certificatesIssued} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
          <p className="text-sm font-semibold text-ink">Recent Registrations</p>
          {recentRegistrations.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No registrations yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {recentRegistrations.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{r.userName}</p>
                    <p className="truncate text-xs text-muted">{r.eventTitle}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Upcoming Calendar</p>
          {upcomingCalendar.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No upcoming events.</p>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {upcomingCalendar.map((e) => (
                <div key={e.id} className="py-3">
                  <p className="truncate text-sm font-medium text-ink">{e.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {dayjs(e.startsAt).format("D MMM YYYY, HH:mm")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {e.registrationsCount}/{e.capacity} registered
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
