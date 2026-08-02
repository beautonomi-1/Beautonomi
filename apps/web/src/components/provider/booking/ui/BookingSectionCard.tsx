"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BOOKING_CARD_BG, BOOKING_BORDER, BOOKING_RADIUS_SECTION } from "../tokens";

interface BookingSectionCardProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md";
}

export function BookingSectionCard({
  children,
  className,
  padding = "md",
  ...rest
}: BookingSectionCardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "border shadow-sm",
        padding === "sm" ? "p-3" : "p-4",
        className,
      )}
      style={{
        backgroundColor: BOOKING_CARD_BG,
        borderColor: BOOKING_BORDER,
        borderRadius: BOOKING_RADIUS_SECTION,
      }}
    >
      {children}
    </div>
  );
}
