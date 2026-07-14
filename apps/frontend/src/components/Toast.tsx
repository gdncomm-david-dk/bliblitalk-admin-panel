import { CheckCircleIcon } from "./icons";
import { useToastStore, type ToastVariant } from "../store/toastStore";

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: "bg-ink text-white",
  error: "bg-status-red text-white",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-soft ${VARIANT_CLASS[t.variant]}`}
        >
          {t.variant === "success" && <CheckCircleIcon width={16} height={16} />}
          {t.message}
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="ml-1 text-white/70 transition-colors hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
