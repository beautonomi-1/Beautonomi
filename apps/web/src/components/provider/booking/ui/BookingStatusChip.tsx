"use client";

import { cn } from "@/lib/utils";
import { mapStatus } from "@/lib/scheduling/mangomintAdapter";
import { getStatusColors } from "@/lib/scheduling/visualMapping";
import type { Appointment } from "@/lib/provider-portal/types";
import { BOOKING_RADIUS_PILL } from "../tokens";

interface BookingStatusChipProps {
  status?: string | null;
  className?: string;
}

export function BookingStatusChip({ status, className }: BookingStatusChipProps) {
  const mapped = mapStatus((status ?? "booked") as Appointment["status"]);
  const colors = getStatusColors(mapped);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 text-xs font-semibold border",
        colors.badgeClasses,
        className,
      )}
      style={{ borderRadius: BOOKING_RADIUS_PILL }}
    >
      {colors.label}
    </span>
  );
}
