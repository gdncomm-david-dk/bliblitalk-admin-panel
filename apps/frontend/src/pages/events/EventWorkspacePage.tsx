import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import type { EventDTO } from "@repo/shared-types";
import { getEventDisplayStatus, isEventLive, statusLabel } from "@repo/shared-utils";
import { api, ApiRequestError } from "../../services/api";
import {
  AwardIcon,
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  EditIcon,
  EyeIcon,
  FileIcon,
  GridIcon,
  HeartIcon,
  MapPinIcon,
  MessageSquareIcon,
  MoreVerticalIcon,
  SettingsIcon,
  StarIcon,
  UsersIcon,
} from "../../components/icons";
import { LifecycleActionBar } from "../../components/LifecycleActionBar";
import { OverdueBanner } from "../../components/OverdueBanner";
import { OverviewTab } from "./workspace/OverviewTab";
import { ParticipantsTab } from "./workspace/ParticipantsTab";
import { ShortlistTab } from "./workspace/ShortlistTab";
import { AttendanceTab } from "./workspace/AttendanceTab";
import { SpeedDatingTab } from "./workspace/SpeedDatingTab";
import { CertificatesTab } from "./workspace/CertificatesTab";
import { FeedbackTab } from "./workspace/FeedbackTab";
import { RemindersTab } from "./workspace/RemindersTab";
import { EventContentTab } from "./workspace/EventContentTab";
import { SettingsTab } from "./workspace/SettingsTab";
import { HistoryTab } from "./workspace/HistoryTab";

const PORTAL_BASE = import.meta.env.VITE_PORTAL_BASE_URL ?? "http://localhost:5173";

const TABS = [
  { key: "overview", label: "Overview", icon: GridIcon },
  { key: "participants", label: "Participants", icon: UsersIcon },
  { key: "shortlist", label: "Shortlist", icon: StarIcon },
  { key: "attendance", label: "Attendance", icon: CheckCircleIcon },
  { key: "speed-dating", label: "Speed Dating", icon: HeartIcon },
  { key: "certificates", label: "Certificates", icon: AwardIcon },
  { key: "feedback", label: "Feedback", icon: MessageSquareIcon },
  { key: "reminders", label: "Reminders", icon: BellIcon },
  { key: "content", label: "Event Content", icon: FileIcon },
  { key: "settings", label: "Settings", icon: SettingsIcon },
  { key: "history", label: "History", icon: ClockIcon },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function MoreMenu({ event, onDelete }: { event: EventDTO; onDelete: () => void }) {
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

  if (event.status !== "DRAFT") return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
      >
        <MoreVerticalIcon width={16} height={16} />
        More
        <ChevronDownIcon width={14} height={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 text-left shadow-soft">
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-4 py-2 text-sm font-medium text-status-red hover:bg-surface"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function EventWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [event, setEvent] = useState<EventDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tabParam = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : "overview";

  const reload = () => {
    if (!id) return;
    api
      .get<EventDTO>(`/admin/events/${id}`)
      .then(setEvent)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load event.");
      });
  };

  useEffect(reload, [id]);

  function setTab(next: TabKey) {
    setSearchParams(next === "overview" ? {} : { tab: next });
  }

  async function onDelete() {
    if (!event) return;
    setActionError(null);
    try {
      await api.delete(`/admin/events/${event.id}`);
      navigate("/events", { replace: true });
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Failed to delete event.");
    }
  }

  if (!id) return null;
  if (error) return <p className="text-sm font-medium text-status-red">{error}</p>;
  if (!event) return <p className="text-sm text-muted">Loading event workspace…</p>;

  const visibleTabs = TABS.filter((t) => t.key !== "speed-dating" || event.hasSpeedDating);
  const speaker = event.speakers.find((s) => s.featured) ?? event.speakers[0];

  return (
    <div>
      <button onClick={() => navigate("/events")} className="text-xs font-semibold text-muted hover:text-ink">
        ← Back to Event Management
      </button>

      {actionError && <p className="mt-3 text-sm font-medium text-status-red">{actionError}</p>}

      {/* Hero banner */}
      <div
        className="relative mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B3D91] to-[#1E63D0] p-8 text-white"
        style={
          event.bannerUrl
            ? {
                backgroundImage: `linear-gradient(to bottom right, rgba(11,61,145,0.88), rgba(30,99,208,0.88)), url(${event.bannerUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-purple-300/20 blur-2xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isEventLive(event) ? "bg-status-red" : "bg-status-green"}`}
              />
              {statusLabel(getEventDisplayStatus(event))}
            </div>

            <div className="mt-2.5">
              <LifecycleActionBar event={event} onChanged={reload} />
            </div>

            <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">{event.title}</h1>
            {event.subtitle && <p className="mt-1.5 text-sm text-white/80">{event.subtitle}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/90">
              <span className="flex items-center gap-1.5">
                <CalendarIcon width={16} height={16} />
                {dayjs(event.startsAt).format("D MMMM YYYY (dddd)")}
              </span>
              <span className="flex items-center gap-1.5">
                <ClockIcon width={16} height={16} />
                {dayjs(event.startsAt).format("hh.mm A")} - {dayjs(event.endsAt).format("hh.mm A")} WIB
              </span>
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPinIcon width={16} height={16} />
                  {event.location}
                </span>
              )}
            </div>

            {(event.category || event.tags.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {event.category && (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{event.category}</span>
                )}
                {event.tags
                  .filter((t) => t !== event.category)
                  .map((t) => (
                    <span key={t} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                      {t}
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("overview")}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold text-primary transition-colors hover:bg-white/90"
              >
                <EditIcon width={15} height={15} />
                Edit Event
              </button>
              <a
                href={`${PORTAL_BASE}/events/${event.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <EyeIcon width={15} height={15} />
                Preview Event
              </a>
              <MoreMenu event={event} onDelete={onDelete} />
            </div>

            {speaker && (
              <div className="flex items-end gap-3 text-right">
                <div className="max-w-[200px]">
                  <p className="text-xs text-white/60">Speaker:</p>
                  <p className="font-semibold text-blue-200">{speaker.name}</p>
                  {(speaker.title || speaker.company) && (
                    <p className="mt-0.5 text-xs leading-snug text-white/70">
                      {speaker.title}
                      {speaker.title && speaker.company ? ", " : ""}
                      {speaker.company}
                    </p>
                  )}
                </div>
                {speaker.avatarUrl ? (
                  <img
                    src={speaker.avatarUrl}
                    alt={speaker.name}
                    className="h-20 w-20 shrink-0 rounded-2xl border border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold text-white">
                    {speaker.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <OverdueBanner event={event} onChanged={reload} />

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === t.key
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent font-medium text-muted hover:text-ink"
              }`}
            >
              <Icon width={16} height={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab event={event} onSaved={reload} />}
        {tab === "participants" && <ParticipantsTab eventId={event.id} />}
        {tab === "shortlist" && <ShortlistTab eventId={event.id} />}
        {tab === "attendance" && <AttendanceTab event={event} onChanged={reload} />}
        {tab === "speed-dating" && <SpeedDatingTab eventId={event.id} />}
        {tab === "certificates" && <CertificatesTab event={event} />}
        {tab === "feedback" && <FeedbackTab eventId={event.id} />}
        {tab === "reminders" && <RemindersTab eventId={event.id} />}
        {tab === "content" && <EventContentTab event={event} onSaved={reload} />}
        {tab === "settings" && <SettingsTab event={event} onSaved={reload} />}
        {tab === "history" && <HistoryTab eventId={event.id} />}
      </div>
    </div>
  );
}
