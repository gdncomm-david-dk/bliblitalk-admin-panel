import type { Role } from "@repo/shared-types";

const STYLES: Record<Role, string> = {
  SUPER_ADMIN: "bg-purple-50 text-status-purple",
  EVENT_ADMIN: "bg-primary-50 text-primary",
  HR_TA: "bg-amber-50 text-status-orange",
  PARTICIPANT: "bg-surface text-muted",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${STYLES[role]}`}
    >
      {role.replace(/_/g, " ")}
    </span>
  );
}
