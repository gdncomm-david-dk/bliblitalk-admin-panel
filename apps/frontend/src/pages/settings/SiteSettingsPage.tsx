import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  LoginCarouselSettingsDTO,
  Role,
  SiteSettingsDTO,
  TestimonialDTO,
  TestimonialsSettingsDTO,
} from "@repo/shared-types";
import { Permission, can } from "@repo/auth";
import { api, ApiRequestError } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";
import { ImageUploadField } from "../../components/ImageUploadField";
import {
  PlusIcon,
  TrashIcon,
  SettingsIcon,
  GridIcon,
  MessageSquareIcon,
  FilterIcon,
  HeartIcon,
  StarIcon,
  AwardIcon,
} from "../../components/icons";
import { CategoriesPage } from "../categories/CategoriesPage";
import { SpeedDatingSettingsPage } from "./SpeedDatingSettingsPage";
import { FeedbackSettingsPage } from "./FeedbackSettingsPage";
import { CertificateSettingsPage } from "./CertificateSettingsPage";

/**
 * Every settings surface in the CMS, as one tabbed page.
 *
 * `permission` is the permission that tab's page required back when it was its own sidebar
 * entry, carried over verbatim. That matters: these tabs do not all need SETTINGS_MANAGE.
 * Categories, Speed Dating, Feedback and Certificates are reachable today by roles that have
 * no settings permission at all, and folding them under a single SETTINGS_MANAGE page would
 * have quietly revoked access HR TA and Event Admin rely on. Gating per tab keeps every
 * role's reach exactly as it was.
 *
 * This is presentation only. The API enforces the same permissions with requirePermission --
 * hiding a tab hides a link, it does not protect an endpoint.
 */
const TABS = [
  { key: "general", label: "General", icon: SettingsIcon, permission: Permission.SETTINGS_MANAGE },
  {
    key: "login-pages",
    label: "Login Pages",
    icon: GridIcon,
    permission: Permission.SETTINGS_MANAGE,
  },
  {
    key: "testimonials",
    label: "Testimonials",
    icon: MessageSquareIcon,
    permission: Permission.SETTINGS_MANAGE,
  },
  // SETTINGS_MANAGE, matching the API: this tab is a write surface over a platform-wide
  // taxonomy. An event admin still reads the category list — GET /admin/categories stays on
  // EVENT_UPDATE so the combobox in the event form keeps loading — they just no longer get a
  // page full of rename and delete buttons that the API would reject.
  { key: "categories", label: "Categories", icon: FilterIcon, permission: Permission.SETTINGS_MANAGE },
  {
    key: "speed-dating",
    label: "Speed Dating",
    icon: HeartIcon,
    permission: Permission.SPEEDDATING_MANAGE,
  },
  { key: "feedback", label: "Reviews & Feedback", icon: StarIcon, permission: Permission.EVENT_READ },
  {
    key: "certificates",
    label: "Certificates",
    icon: AwardIcon,
    permission: Permission.CERTIFICATE_MANAGE,
  },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** The tabs a role may see. Used here and by the sidebar to decide whether to show Settings. */
export function visibleSettingsTabs(role: Role) {
  return TABS.filter((t) => can(role, t.permission));
}

/**
 * The active tab lives in the URL (?tab=) like the event workspace, so a link to a specific
 * settings section survives a reload and can be shared. An unknown tab -- or one this role
 * cannot see -- falls back to the first tab they can, never to a blank panel.
 */
export function SiteSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const tabs = visibleSettingsTabs(user.role);
  const tabParam = searchParams.get("tab") as TabKey | null;
  const tab: TabKey | undefined = tabs.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : tabs[0]?.key;

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Everything that is configured once and applies across the CMS and the participant portal.
      </p>

      {tabs.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          You do not have access to any settings. Ask a Super Admin if you think you should.
        </p>
      ) : (
        <>
          <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setSearchParams({ tab: t.key })}
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
            {tab === "general" && <GeneralTab />}
            {tab === "login-pages" && (
              <div className="max-w-2xl space-y-6">
                <LoginCarouselEditor
                  title="Admin Login Carousel"
                  description="Slides shown on this admin CMS's own login page."
                  apiPath="/admin/settings/login-carousel-admin"
                />
                <LoginCarouselEditor
                  title="Participant Portal Login Carousel"
                  description="Slides shown on the participant portal's login and register pages."
                  apiPath="/admin/settings/login-carousel-portal"
                />
              </div>
            )}
            {tab === "testimonials" && (
              <div className="max-w-2xl">
                <TestimonialsEditor />
              </div>
            )}
            {tab === "categories" && <CategoriesPage />}
            {tab === "speed-dating" && <SpeedDatingSettingsPage />}
            {tab === "feedback" && <FeedbackSettingsPage />}
            {tab === "certificates" && <CertificateSettingsPage />}
          </div>
        </>
      )}
    </div>
  );
}

function GeneralTab() {
  const [settings, setSettings] = useState<SiteSettingsDTO>({ contactEmail: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SiteSettingsDTO>("/admin/settings/site")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await api.put<SiteSettingsDTO>("/admin/settings/site", settings);
      setSettings(saved);
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="max-w-md space-y-3">
      <div className="rounded-2xl border border-line bg-white p-4">
        <label className="mb-1 block text-xs font-semibold text-muted">Contact email</label>
        <input
          type="email"
          value={settings.contactEmail}
          onChange={(e) => setSettings({ contactEmail: e.target.value })}
          className={FIELD_CLASS}
        />
        <p className="mt-1.5 text-xs text-muted">
          Shown to participants as the recruitment/support contact address.
        </p>
      </div>

      {error && <p className="text-sm font-medium text-status-red">{error}</p>}
      {notice && <p className="text-sm font-medium text-status-green">{notice}</p>}

      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function LoginCarouselEditor({
  title,
  description,
  apiPath,
}: {
  title: string;
  description: string;
  apiPath: string;
}) {
  const [settings, setSettings] = useState<LoginCarouselSettingsDTO>({ slides: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<LoginCarouselSettingsDTO>(apiPath)
      .then((res) => {
        setSettings(res);
        setActiveIndex(0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiPath]);

  function updateSlide(index: number, patch: Partial<{ heading: string; imageUrl: string | null }>) {
    setSettings((s) => ({
      slides: s.slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)),
    }));
  }

  function addSlide() {
    setSettings((s) => {
      setActiveIndex(s.slides.length);
      return { slides: [...s.slides, { heading: "", imageUrl: null }] };
    });
  }

  function removeSlide(index: number) {
    setSettings((s) => {
      const slides = s.slides.filter((_, i) => i !== index);
      setActiveIndex((i) => Math.min(i, Math.max(0, slides.length - 1)));
      return { slides };
    });
  }

  async function onSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await api.put<LoginCarouselSettingsDTO>(apiPath, settings);
      setSettings(saved);
      setActiveIndex((i) => Math.min(i, Math.max(0, saved.slides.length - 1)));
      setNotice("Saved.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const activeSlide = settings.slides[activeIndex];

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs text-muted">{description}</p>

      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <select
              value={activeIndex}
              onChange={(e) => setActiveIndex(Number(e.target.value))}
              disabled={settings.slides.length === 0}
              className={`${FIELD_CLASS} flex-1`}
            >
              {settings.slides.length === 0 ? (
                <option>No slides yet</option>
              ) : (
                settings.slides.map((slide, i) => (
                  <option key={i} value={i}>
                    Slide {i + 1}
                    {slide.heading ? ` — ${slide.heading}` : ""}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={addSlide}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <PlusIcon width={14} height={14} />
              Add slide
            </button>
          </div>

          {activeSlide && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold text-muted">Heading</label>
                  <input
                    value={activeSlide.heading}
                    onChange={(e) => updateSlide(activeIndex, { heading: e.target.value })}
                    className={FIELD_CLASS}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSlide(activeIndex)}
                  className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-red-50 hover:text-status-red"
                  aria-label="Remove slide"
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
              <div className="mt-3">
                <ImageUploadField
                  label="Image (optional — falls back to a brand gradient)"
                  value={activeSlide.imageUrl ?? ""}
                  onChange={(url) => updateSlide(activeIndex, { imageUrl: url || null })}
                  recommendedWidth={1080}
                  recommendedHeight={1350}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm font-medium text-status-red">{error}</p>}
          {notice && <p className="text-sm font-medium text-status-green">{notice}</p>}

          <div>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "FR" from "Fajar Ramadhan" — mirrors the portal so the preview here matches what ships. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.map((w) => [...w].find((c) => /\p{L}|\p{N}/u.test(c)) ?? "").filter(Boolean);
  if (letters.length >= 2) return (letters[0]! + letters[letters.length - 1]!).toUpperCase();
  if (letters.length === 1) {
    const w = words[0]!.replace(/[^\p{L}\p{N}]/gu, "");
    return (w.length >= 2 ? w.slice(0, 2) : w).toUpperCase() || "?";
  }
  return "?";
}

/**
 * Editor for the landing page's testimonial cards.
 *
 * Every entry is on screen at once rather than behind a picker the way the carousel editor works:
 * this list is meant to grow, and reordering or spotting a half-filled card is the common task.
 * The list has no fixed length — it is stored as JSON under a single ModuleSettings key, so adding
 * a hundred entries is a save, not a migration.
 */
function TestimonialsEditor() {
  const [items, setItems] = useState<TestimonialDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TestimonialsSettingsDTO>("/admin/settings/testimonials")
      .then((res) => setItems(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(index: number, patch: Partial<TestimonialDTO>) {
    setItems((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    setNotice(null);
  }

  function add() {
    setItems((list) => [...list, { quote: "", name: "", meta: "" }]);
    setNotice(null);
  }

  function remove(index: number) {
    setItems((list) => list.filter((_, i) => i !== index));
    setNotice(null);
  }

  function move(index: number, delta: number) {
    setItems((list) => {
      const to = index + delta;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
    setNotice(null);
  }

  // The server rejects a blank quote or name, so catch it here and name the offending card —
  // a validation error alone would not say which of a long list is at fault.
  const firstIncomplete = items.findIndex((t) => !t.quote.trim() || !t.name.trim());

  async function onSave() {
    setError(null);
    setNotice(null);
    if (firstIncomplete !== -1) {
      setError(`Testimonial ${firstIncomplete + 1} needs both a quote and a name.`);
      return;
    }
    setSaving(true);
    try {
      const saved = await api.put<TestimonialsSettingsDTO>("/admin/settings/testimonials", {
        items,
      });
      setItems(saved.items);
      setNotice("Saved. The landing page picks this up on its next load.");
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.apiError.message : "Failed to save testimonials.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">Landing Page Testimonials</p>
      <p className="mt-1 text-xs text-muted">
        The quote cards on the participant portal's landing page. Add as many as you like — they are
        shown in the order below. Avatar initials come from the name automatically.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.length === 0 && (
            <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
              No testimonials yet. The landing page falls back to its built-in copy until you add
              one.
            </p>
          )}

          {items.map((t, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                  {initialsOf(t.name)}
                </span>
                <span className="text-xs font-semibold text-muted">Testimonial {i + 1}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move testimonial ${i + 1} up`}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-white disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label={`Move testimonial ${i + 1} down`}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-white disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={`Remove testimonial ${i + 1}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-red-50 hover:text-status-red"
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              </div>

              <label className="mb-1 block text-xs font-semibold text-muted">Quote</label>
              <textarea
                value={t.quote}
                onChange={(e) => update(i, { quote: e.target.value })}
                rows={3}
                className={FIELD_CLASS}
                placeholder="What they said about Blibli Talk"
              />

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
                  <input
                    value={t.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className={FIELD_CLASS}
                    placeholder="Fajar Ramadhan"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Role / detail <span className="font-normal">(optional)</span>
                  </label>
                  <input
                    value={t.meta}
                    onChange={(e) => update(i, { meta: e.target.value })}
                    className={FIELD_CLASS}
                    placeholder="Associate PM · Joined 2024"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <PlusIcon width={14} height={14} />
            Add testimonial
          </button>

          {error && <p className="text-sm font-medium text-status-red">{error}</p>}
          {notice && <p className="text-sm font-medium text-status-green">{notice}</p>}

          <div>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
