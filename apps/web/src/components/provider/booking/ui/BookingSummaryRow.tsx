"use client";

import { cn } from "@/lib/utils";
import { BOOKING_TEXT_PRIMARY, BOOKING_TEXT_SECONDARY } from "../tokens";

interface BookingSummaryRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
  emphasize?: boolean;
}

export function BookingSummaryRow({ label, value, className, emphasize }: BookingSummaryRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-2", className)}>
      <span className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
        {label}
      </span>
      <span
        className={cn("text-sm text-right font-medium", emphasize && "text-base font-semibold")}
        style={{ color: BOOKING_TEXT_PRIMARY }}
      >
        {value}
      </span>
    </div>
  );
}
