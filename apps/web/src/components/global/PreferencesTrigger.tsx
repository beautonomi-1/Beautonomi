"use client";

import { Globe } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { cn } from "@/lib/utils";

type PreferencesTriggerProps = {
  onClick: () => void;
  className?: string;
  /** Kept for call-site compatibility; the trigger is always the globe only. */
  compactOnMobile?: boolean;
  /** `header` matches hamburger / search / bell hit targets. */
  variant?: "header" | "inline";
  /** Kept for call-site compatibility; the label is never shown. */
  iconOnly?: boolean;
};

const HEADER_BTN =
  "inline-flex items-center justify-center p-1.5 md:p-2 min-w-[44px] min-h-[44px] rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation select-none text-gray-700";

export function PreferencesTrigger({
  onClick,
  className,
  variant = "inline",
}: PreferencesTriggerProps) {
  const { t } = useTranslation();
  const header = variant === "header";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        header
          ? HEADER_BTN
          : "inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2.5 py-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation select-none text-gray-700",
        className,
      )}
      aria-label={t("web.a11y.changePreferences")}
    >
      <Globe
        className={cn("shrink-0", header ? "h-5 w-5 md:h-6 md:w-6" : "h-4 w-4")}
        aria-hidden
      />
    </button>
  );
}
