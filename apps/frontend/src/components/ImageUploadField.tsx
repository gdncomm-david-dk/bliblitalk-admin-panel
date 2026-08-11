import { useEffect, useId, useRef, useState } from "react";
import { api, ApiRequestError } from "../services/api";
import { DownloadIcon, TrashIcon } from "./icons";

interface ImageUploadFieldProps {
  label: string;
  value: string; // current image URL ("" when unset)
  onChange: (url: string) => void;
  helpText?: string;
  /**
   * Recommended pixel size. This is the single source of truth for three things that used to be
   * specified separately and could drift apart: the hint text, the preview box's aspect ratio,
   * and the post-upload crop check. Pass the real target size, not a ratio.
   */
  recommendedWidth?: number;
  recommendedHeight?: number;
}

/** Smallest whole-number ratio, e.g. 1280×720 → "16:9". Falls back to one decimal when the
 *  reduced form is still unwieldy (e.g. a 1001×1000 image would otherwise print "1001:1000"). */
function ratioLabel(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  if (rw <= 40 && rh <= 40) return `${rw}:${rh}`;
  return `${(w / h).toFixed(2)}:1`;
}

interface Dims {
  width: number;
  height: number;
}

export function ImageUploadField({
  label,
  value,
  onChange,
  helpText,
  recommendedWidth,
  recommendedHeight,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [showWhole, setShowWhole] = useState(false);

  const hasRecommendation = Boolean(recommendedWidth && recommendedHeight);
  const aspect = hasRecommendation ? `${recommendedWidth} / ${recommendedHeight}` : "16 / 9";

  // Measure whatever is currently set, including images loaded from an existing record — not just
  // ones uploaded in this session — so opening an old event still tells you if its banner is
  // being cropped. Guarded against a late resolve overwriting a newer image.
  useEffect(() => {
    setDims(null);
    if (!value) return;
    let stale = false;
    const img = new Image();
    img.onload = () => {
      if (!stale) setDims({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = value;
    return () => {
      stale = true;
    };
  }, [value]);

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

  // How much of the image the frame will cut off. The public site renders these with object-cover,
  // so an aspect mismatch is silently cropped — this is the number that makes that visible.
  let crop: { pct: number; edges: string } | null = null;
  let tooSmall = false;
  if (dims && hasRecommendation) {
    const frame = recommendedWidth! / recommendedHeight!;
    const actual = dims.width / dims.height;
    const pct = actual > frame ? 1 - frame / actual : 1 - actual / frame;
    // 1% tolerance: 1600×901 is 16:9 for every practical purpose and should not nag.
    if (pct > 0.01) {
      crop = { pct: Math.round(pct * 100), edges: actual > frame ? "left and right" : "top and bottom" };
    }
    tooSmall = dims.width < recommendedWidth! || dims.height < recommendedHeight!;
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
            <img
              src={value}
              alt={label}
              className={`h-full w-full ${showWhole ? "object-contain" : "object-cover"}`}
            />
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
            {crop && (
              <button
                type="button"
                onClick={() => setShowWhole((s) => !s)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface"
              >
                {showWhole ? "Show cropped" : "Show whole image"}
              </button>
            )}
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

      {!error && hasRecommendation && (
        <p className="mt-1.5 text-xs font-medium text-ink/70">
          Recommended: {recommendedWidth} × {recommendedHeight} ({ratioLabel(recommendedWidth!, recommendedHeight!)})
        </p>
      )}

      {!error && dims && (
        <p className="mt-1 text-xs text-muted">
          Uploaded: {dims.width} × {dims.height} ({ratioLabel(dims.width, dims.height)})
        </p>
      )}

      {!error && crop && (
        <p className="mt-1 text-xs font-medium text-status-red">
          This image is not {ratioLabel(recommendedWidth!, recommendedHeight!)}, so roughly {crop.pct}% of it is cut off
          at the {crop.edges}. Crop it to {ratioLabel(recommendedWidth!, recommendedHeight!)} before uploading, or use
          “Show whole image” to see what is lost.
        </p>
      )}

      {!error && !crop && tooSmall && (
        <p className="mt-1 text-xs font-medium text-status-red">
          Smaller than the recommended size, so it will look soft when scaled up.
        </p>
      )}

      {!error && helpText && <p className="mt-1.5 text-xs text-muted">{helpText}</p>}
    </div>
  );
}
