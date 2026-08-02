"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function BookingErrorBanner({ message, onDismiss, className }: BookingErrorBannerProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2",
        className,
      )}
      role="alert"
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-red-900">{message}</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-1 text-xs font-semibold text-red-800 underline underline-offset-2"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
