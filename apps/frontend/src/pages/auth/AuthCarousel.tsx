import { useEffect, useState } from "react";
import type { LoginCarouselSlideDTO } from "@repo/shared-types";
import { api } from "../../services/api";
import { cn } from "../../utils/cn";

// Admin-branded promo slides — editable from Settings. This hardcoded set is only
// the fallback shown if that endpoint can't be reached (e.g. before login, if the
// backend is briefly down) so the login page never renders blank.
const FALLBACK_SLIDES: LoginCarouselSlideDTO[] = [
  { heading: "Manage events end to end", imageUrl: null },
  { heading: "Review shortlists and attendance", imageUrl: null },
  { heading: "Run the Talent Engagement Platform", imageUrl: null },
];

const GRADIENTS = [
  "from-[#002E7A] via-[#0050BD] to-[#0072FF]",
  "from-[#0050BD] via-[#0072FF] to-[#00CDC7]",
  "from-[#002E7A] via-[#0072FF] to-[#4FA4FF]",
];

const INTERVAL_MS = 5000;

export function AuthCarousel() {
  const [slides, setSlides] = useState<LoginCarouselSlideDTO[]>(FALLBACK_SLIDES);
  const [active, setActive] = useState(0);

  useEffect(() => {
    api
      .get<{ slides: LoginCarouselSlideDTO[] }>("/public/site-settings/login-carousel-admin")
      .then((res) => {
        if (res.slides.length > 0) setSlides(res.slides);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setActive(0);
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  const slide = slides[active]!;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl">
      {slides.map((s, i) => (
        <div
          key={i}
          aria-hidden={i !== active}
          className={cn(
            "absolute inset-0 bg-gradient-to-br transition-opacity duration-700 ease-soft",
            GRADIENTS[i % GRADIENTS.length],
            i === active ? "opacity-100" : "opacity-0",
          )}
        >
          {s.imageUrl && <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 p-8">
        <h2 className="max-w-xs text-2xl font-extrabold leading-tight text-white">{slide.heading}</h2>
        <div className="mt-4 flex gap-2">
          {slides.map((_, i) => (
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
