import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { AdminEventFeedbackDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { StatCard } from "./StatCard";

const DIMENSIONS: { key: keyof AdminEventFeedbackDTO["averages"]; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "topic", label: "Topic Quality" },
  { key: "speaker", label: "Speaker" },
  { key: "content", label: "Content" },
  { key: "qna", label: "Q&A" },
  { key: "venue", label: "Venue" },
  { key: "timing", label: "Timing" },
];

function Bar({
  label,
  value,
  max,
  display,
}: {
  label: string;
  value: number;
  max: number;
  display?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-muted">{display ?? value.toFixed(1)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-surface">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FeedbackTab({ eventId }: { eventId: string }) {
  const [data, setData] = useState<AdminEventFeedbackDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminEventFeedbackDTO>(`/admin/events/${eventId}/feedback`)
      .then(setData)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load feedback.");
      });
  }, [eventId]);

  if (error) return <p className="text-sm font-medium text-status-red">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading feedback…</p>;

  const maxWordCount = Math.max(1, ...data.wordCloud.map((w) => w.count));
  const maxStarCount = Math.max(1, ...data.starDistribution.map((s) => s.count));

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overall Rating" value={`${data.averages.overall.toFixed(1)}/10`} />
        <StatCard label="Recommendation (NPS ≥9)" value={`${data.recommendationRate}%`} />
        <StatCard label="Responses" value={data.responses} />
        <StatCard label="Completion Rate" value={`${data.completionRate}%`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Ratings by Dimension</p>
          <div className="mt-4 space-y-3">
            {DIMENSIONS.map((d) => (
              <Bar key={d.key} label={d.label} value={data.averages[d.key]} max={10} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm font-semibold text-ink">Star Distribution</p>
          <div className="mt-4 space-y-3">
            {data.starDistribution.map((s) => (
              <Bar
                key={s.stars}
                label={"★".repeat(s.stars) || "☆"}
                value={s.count}
                max={maxStarCount}
                display={String(s.count)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-5">
        <p className="text-sm font-semibold text-ink">Word Cloud</p>
        {data.wordCloud.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Not enough comments yet to build a word cloud.</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {data.wordCloud.map((w) => {
              const scale = 0.75 + (w.count / maxWordCount) * 1.5;
              return (
                <span
                  key={w.word}
                  className="font-semibold text-primary"
                  style={{ fontSize: `${scale}rem` }}
                  title={`${w.count} mentions`}
                >
                  {w.word}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-5">
        <p className="text-sm font-semibold text-ink">Recent Comments</p>
        {data.comments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No comments yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-line">
            {data.comments.map((c) => (
              <div key={c.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{c.userName}</p>
                  <p className="text-xs text-muted">{dayjs(c.createdAt).format("D MMM YYYY")}</p>
                </div>
                <p className="mt-1 text-sm text-ink/80">{c.comments}</p>
                {c.takeaway && <p className="mt-1 text-xs text-muted">Takeaway: {c.takeaway}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
