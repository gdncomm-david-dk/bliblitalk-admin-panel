import { statusColor, statusLabel, type BluColor } from "@repo/shared-utils";

const COLOR_CLASSES: Record<BluColor, string> = {
  blue: "bg-primary-50 text-primary",
  green: "bg-green-50 text-status-green",
  orange: "bg-amber-50 text-status-orange",
  red: "bg-red-50 text-status-red",
  purple: "bg-purple-50 text-status-purple",
};

export function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${COLOR_CLASSES[color]}`}
    >
      {statusLabel(status)}
    </span>
  );
}
