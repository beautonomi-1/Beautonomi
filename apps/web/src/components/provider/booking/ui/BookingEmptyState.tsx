"use client";

import { CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingActionButton } from "./BookingActionButton";
import { BOOKING_TEXT_SECONDARY } from "../tokens";

interface BookingEmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function BookingEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: BookingEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        <CalendarOff className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-xs text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <BookingActionButton className="mt-4 max-w-xs" fullWidth={false} onClick={onAction}>
          {actionLabel}
        </BookingActionButton>
      ) : null}
    </div>
  );
}
