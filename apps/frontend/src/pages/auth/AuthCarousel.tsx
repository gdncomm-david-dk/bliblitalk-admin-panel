import { useEffect, useState } from "react";
import { cn } from "../../utils/cn";

// Admin-branded promo slides — same visual language as the portal's AuthCarousel.
interface Slide {
  caption: string;
  gradient: string;
}

const SLIDES: Slide[] = [
  { caption: "Manage events end to end", gradient: "from-[#002E7A] via-[#0050BD] to-[#0072FF]" },
  { caption: "Review shortlists and attendance", gradient: "from-[#0050BD] via-[#0072FF] to-[#00CDC7]" },
  { caption: "Run the Talent Engagement Platform", gradient: "from-[#002E7A] via-[#0072FF] to-[#4FA4FF]" },
];

const INTERVAL_MS = 5000;

export function AuthCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[active]!;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl">
      {SLIDES.map((s, i) => (
        <div
          key={i}
          aria-hidden={i !== active}
          className={cn(
            "absolute inset-0 bg-gradient-to-br transition-opacity duration-700 ease-soft",
            s.gradient,
            i === active ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 p-8">
        <h2 className="max-w-xs text-2xl font-extrabold leading-tight text-white">{slide.caption}</h2>
        <div className="mt-4 flex gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === active ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
