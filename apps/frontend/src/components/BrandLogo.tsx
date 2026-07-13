import { useState } from "react";

// Mirrors apps/web's BrandLogo — same artwork, copied into apps/admin/public/.
function Megaphone({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <g transform="rotate(-16 16 16)" fill="currentColor">
        <path d="M6 12h5l12-5v18l-12-5H6z" />
        <rect x="3.5" y="12" width="4.5" height="8" rx="1.4" />
        <path d="M8.5 20h3.2l1.1 6.2a1 1 0 0 1-1 1.2H10a1 1 0 0 1-1-.8L8.5 20z" />
      </g>
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M25.5 3.5 28.5 1" />
        <path d="M28 9.5 31.2 8.2" />
        <path d="M27.4 6 30.6 4.4" />
      </g>
    </svg>
  );
}

function WordmarkFallback({ onDark, textClass }: { onDark: boolean; textClass: string }) {
  return (
    <span
      className={`relative inline-flex items-baseline font-extrabold lowercase leading-none tracking-tight ${
        onDark ? "text-white" : "text-primary"
      } ${textClass}`}
    >
      <span>blibli</span>
      <span className="relative italic">
        <Megaphone className="absolute -top-[0.62em] left-[0.02em] h-[0.82em] w-[0.82em]" />
        talk
      </span>
    </span>
  );
}

export function BrandLogo({
  heightClass = "h-8",
  fallbackTextClass = "text-2xl",
  onDark = false,
}: {
  heightClass?: string;
  fallbackTextClass?: string;
  onDark?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = onDark ? "/Logo-BlibliTalk-White.png" : "/Logo-BlibliTalk.png";

  if (failed) return <WordmarkFallback onDark={onDark} textClass={fallbackTextClass} />;

  return (
    <img
      src={src}
      alt="Blibli Talk"
      className={`${heightClass} w-auto object-contain`}
      onError={() => setFailed(true)}
    />
  );
}
