import { useId, useRef, useState } from "react";
import { api, ApiRequestError } from "../services/api";
import { DownloadIcon, TrashIcon } from "./icons";

interface ImageUploadFieldProps {
  label: string;
  value: string; // current image URL ("" when unset)
  onChange: (url: string) => void;
  helpText?: string;
  /** Aspect ratio for the preview box, e.g. "16 / 9" (banner) or "1 / 1" (thumbnail). */
  aspect?: string;
}

export function ImageUploadField({ label, value, onChange, helpText, aspect = "16 / 9" }: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.upload<{ url: string }>("/admin/uploads", file);
      onChange(url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted">{label}</label>

      {value ? (
        <div className="flex items-start gap-3">
          <div
            className="w-40 shrink-0 overflow-hidden rounded-lg border border-line bg-surface"
            style={{ aspectRatio: aspect }}
          >
            <img src={value} alt={label} className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-40"
            >
              <DownloadIcon width={14} height={14} className="rotate-180" />
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-status-red transition-colors hover:bg-red-50"
            >
              <TrashIcon width={14} height={14} />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-40 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line bg-surface text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
          style={{ aspectRatio: aspect }}
        >
          <DownloadIcon width={18} height={18} className="rotate-180" />
          {uploading ? "Uploading…" : "Upload image"}
        </button>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      {error && <p className="mt-1.5 text-xs font-medium text-status-red">{error}</p>}
      {helpText && !error && <p className="mt-1.5 text-xs text-muted">{helpText}</p>}
    </div>
  );
}
