import type { ReactNode } from "react";
import { BrandLogo } from "../../components/BrandLogo";
import { AuthCarousel } from "./AuthCarousel";

/**
 * Two-column auth shell mirroring the portal's AuthSplitLayout: promo carousel on
 * the left, centered content column on the right. No back link — the Admin CMS
 * login isn't reachable from a public marketing page.
 */
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-[1080px] items-center justify-center gap-10 px-6 py-8">
        <div className="hidden flex-1 lg:block">
          <div className="h-[540px]">
            <AuthCarousel />
          </div>
        </div>

        <div className="flex flex-1 justify-center">
          <div className="w-full max-w-[380px]">
            <div className="mb-6 flex justify-center">
              <BrandLogo heightClass="h-8" fallbackTextClass="text-xl" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
