import { useEffect, useRef, useState } from "react";
import type { UserDTO } from "@repo/shared-types";
import { ChevronDownIcon, LogoutIcon } from "./icons";
import { RoleBadge } from "./RoleBadge";

interface UserMenuProps {
  user: UserDTO;
  onLogout: () => void;
  variant?: "topbar" | "sidebar";
  collapsed?: boolean;
}

export function UserMenu({ user, onLogout, variant = "topbar", collapsed = false }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sidebar = variant === "sidebar";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={collapsed ? user.name : undefined}
        className={
          collapsed
            ? "flex w-full items-center justify-center rounded-lg py-2 transition-colors hover:bg-surface"
            : sidebar
              ? "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
              : "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface"
        }
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary">
          {user.name.charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left leading-tight">
              <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
              {sidebar && (
                <p className="truncate text-xs text-muted">{user.department ?? user.role.replace(/_/g, " ")}</p>
              )}
            </div>
            <ChevronDownIcon width={16} height={16} className="shrink-0 text-muted" />
          </>
        )}
      </button>

      {open && (
        <div
          className={
            sidebar
              ? "absolute bottom-[calc(100%+4px)] left-0 z-40 w-56 overflow-hidden rounded-2xl border border-line bg-white shadow-soft"
              : "absolute right-0 top-[calc(100%+4px)] z-40 w-56 overflow-hidden rounded-2xl border border-line bg-white shadow-soft"
          }
        >
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-ink">{user.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-sm font-medium text-status-red hover:bg-surface"
          >
            <LogoutIcon width={16} height={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
