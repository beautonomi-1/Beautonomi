"use client";

import { ChevronRight } from "lucide-react";
import { useCookieConsent } from "@/providers/CookieConsentProvider";
import { cn } from "@/lib/utils";

type Variant = "footer" | "inline" | "policy";

const variantClass: Record<Variant, string> = {
  footer:
    "inline-flex min-h-[44px] items-center gap-0.5 text-sm text-gray-600 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 rounded-sm px-0.5 -mx-0.5",
  /** Inline in body copy: comfortable tap target without breaking line rhythm. */
  inline:
    "inline-flex min-h-[44px] items-center font-medium text-[#FF0077] underline decoration-[#FF0077]/35 underline-offset-[3px] transition-colors hover:text-[#D60565] hover:decoration-[#D60565]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0077]/35 focus-visible:ring-offset-2 rounded-md px-1 -mx-1 align-baseline",
  policy:
    "inline-flex min-h-[44px] items-center font-medium text-[#FF0077] underline decoration-[#FF0077]/35 underline-offset-[3px] transition-colors hover:text-[#D60565] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0077]/35 focus-visible:ring-offset-2 rounded-md px-0.5 -mx-0.5 align-baseline",
};

/**
 * Opens the cookie preference dialog. Matches footer link affordances when `variant="footer"`.
 */
export function CookieSettingsFooterLink({
  className,
  variant = "footer",
  showChevron = false,
}: {
  className?: string;
  variant?: Variant;
  /** Subtle cue that this opens a panel (footer row only). */
  showChevron?: boolean;
}) {
  const { openPreferences } = useCookieConsent();
  const v = variantClass[variant];

  return (
    <button
      type="button"
      onClick={(e) => openPreferences(e.currentTarget)}
      className={cn(v, className)}
    >
      <span>Cookie settings</span>
      {showChevron ? <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden /> : null}
    </button>
  );
}
