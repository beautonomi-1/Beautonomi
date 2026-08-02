"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BOOKING_ACTIVE_SCALE, MIN_TAP } from "../tokens";

interface BookingActionButtonProps extends React.ComponentProps<typeof Button> {
  fullWidth?: boolean;
}

export function BookingActionButton({
  className,
  fullWidth = true,
  children,
  ...props
}: BookingActionButtonProps) {
  return (
    <Button
      className={cn(
        MIN_TAP,
        BOOKING_ACTIVE_SCALE,
        "touch-manipulation rounded-xl font-semibold",
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
