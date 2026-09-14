"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { cn } from "@/lib/utils";

interface BookingConflictBannerProps {
  message: string;
  onAction?: () => void;
  actionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  className?: string;
}

export function BookingConflictBanner({
  message,
  onAction,
  actionLabel,
  onSecondaryAction,
  secondaryActionLabel,
  className,
}: BookingConflictBannerProps) {
  const { t } = useTranslation();
  const primaryLabel = actionLabel ?? t("web.provider.bookings.conflictBanner.chooseAnotherTime");
  const secondaryLabel = secondaryActionLabel ?? t("web.provider.bookings.conflictBanner.proceedAnyway");

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-col gap-2",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
        <p className="text-sm text-amber-900">{message}</p>
      </div>
      {onAction || onSecondaryAction ? (
        <div className="flex flex-wrap gap-3 ps-6">
          {onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-sm font-semibold text-amber-800 underline underline-offset-2 shrink-0"
            >
              {primaryLabel}
            </button>
          ) : null}
          {onSecondaryAction ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="text-sm font-semibold text-amber-900 underline underline-offset-2 shrink-0"
            >
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
