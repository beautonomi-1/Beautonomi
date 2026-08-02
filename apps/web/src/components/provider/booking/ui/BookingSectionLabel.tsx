"use client";

import { cn } from "@/lib/utils";
import { BOOKING_TEXT_SECONDARY } from "../tokens";

interface BookingSectionLabelProps {
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

export function BookingSectionLabel({ children, className, htmlFor }: BookingSectionLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-xs font-semibold uppercase tracking-wide", className)}
      style={{ color: BOOKING_TEXT_SECONDARY }}
    >
      {children}
    </label>
  );
}
