import { useState, type ReactElement } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { can, Permission } from "@repo/auth";
import type { Role } from "@repo/shared-types";
import { useAuthStore } from "../store/authStore";
import { cn } from "../utils/cn";
import { BrandLogo } from "../components/BrandLogo";
import {
  AwardIcon,
  BarChartIcon,
  BellIcon,
  GridIcon,
  HeartIcon,
  HomeIcon,
  MailIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  StarIcon,
  UsersIcon,
} from "../components/icons";
import { UserMenu } from "../components/UserMenu";

const COLLAPSE_KEY = "admin.sidebar.collapsed";

interface NavLeaf {
  to: string;
  label: string;
  icon: (p: { width?: number; height?: number; className?: string }) => ReactElement;
  permission?: Permission;
}

interface NavGroup {
  label?: string;
  items: NavLeaf[];
}

const NAV: NavGroup[] = [
  {
    items: [
      { to: "/", label: "Dashboard", icon: HomeIcon },
      { to: "/events", label: "Event Management", icon: GridIcon, permission: Permission.EVENT_READ },
      { to: "/speed-dating-settings", label: "Speed Dating", icon: HeartIcon, permission: Permission.SPEEDDATING_MANAGE },
      { to: "/feedback-settings", label: "Reviews & Feedback", icon: StarIcon, permission: Permission.EVENT_READ },
      { to: "/certificate-settings", label: "Certificates", icon: AwardIcon, permission: Permission.CERTIFICATE_MANAGE },
      { to: "/registrants", label: "User Management", icon: UsersIcon, permission: Permission.USER_MANAGE },
      { to: "/marketing", label: "Marketing Email", icon: MailIcon, permission: Permission.MARKETING_MANAGE },
      { to: "/analytics", label: "Reports", icon: BarChartIcon, permission: Permission.ANALYTICS_READ },
      { to: "/settings", label: "Settings", icon: SettingsIcon, permission: Permission.SETTINGS_MANAGE },
    ],
  },
];

function visibleGroups(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(role, i.permission)) })).filter(
    (g) => g.items.length > 0,
  );
}

function isActive(pathname: string, search: string, to: string): boolean {
  const [path, query] = to.split("?");
  if (pathname !== path) return false;
  return query ? search === `?${query}` : true;
}

export function AdminShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-line", collapsed ? "justify-center px-2" : "px-5")}>
          {collapsed ? (
            <button
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <SidebarIcon width={18} height={18} />
            </button>
          ) : (
            <>
              <BrandLogo heightClass="h-6" fallbackTextClass="text-base" />
              <button
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <SidebarIcon width={18} height={18} />
              </button>
            </>
          )}
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {visibleGroups(user.role).map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label && !collapsed && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted/70">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(location.pathname, location.search, item.to);
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-lg text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
                        active ? "bg-primary-50 text-primary" : "text-muted hover:bg-surface hover:text-ink",
                      )}
                    >
                      <Icon width={17} height={17} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <UserMenu user={user} onLogout={handleLogout} variant="sidebar" collapsed={collapsed} />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-line bg-white px-6">
          <div className="relative w-full max-w-sm">
            <SearchIcon
              width={16}
              height={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              placeholder="Search events, participants…"
              className="h-9 w-full rounded-lg bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:bg-white focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
              aria-label="Notifications"
            >
              <BellIcon width={18} height={18} />
            </button>
            <UserMenu user={user} onLogout={handleLogout} />
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
