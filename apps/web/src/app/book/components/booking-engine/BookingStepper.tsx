"use client";

import { cn } from "@/lib/utils";
import type { BookingStep } from "../../types/booking-engine";
import { getStepIndex, getStepLabel, STEP_ORDER } from "../../types/booking-engine";

interface BookingStepperProps {
  currentStep: BookingStep;
  className?: string;
  /** Show compact dots on small screens */
  compact?: boolean;
  /** When provided, use this order instead of STEP_ORDER (e.g. when staff step is hidden) */
  steps?: BookingStep[];
}

export function BookingStepper({ currentStep, className, compact, steps: stepsProp }: BookingStepperProps) {
  const steps = stepsProp ?? STEP_ORDER;
  const currentIndex = steps.indexOf(currentStep);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  if (compact) {
    return (
      <div className={cn("flex items-center justify-center gap-1.5", className)}>
        {steps.map((step, i) => (
          <div
            key={step}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300 min-w-[6px]",
              i <= safeIndex ? "bg-[#EC4899] opacity-100" : "bg-black/10"
            )}
            style={{
              width: i === safeIndex ? 20 : 6,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <nav
      className={cn("flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none", className)}
      aria-label="Booking progress"
    >
      {steps.map((step, i) => {
        const isActive = i === safeIndex;
        const isPast = i < safeIndex;
        return (
          <div
            key={step}
            className={cn(
              "flex items-center shrink-0",
              i > 0 && "ml-1"
            )}
          >
            {i > 0 && (
              <div
                className={cn(
                  "w-4 h-0.5 rounded transition-colors",
                  isPast ? "bg-[#EC4899]" : "bg-black/10"
                )}
              />
            )}
            <span
              className={cn(
                "text-xs font-medium px-2 py-1 rounded-full transition-colors whitespace-nowrap",
                isActive && "bg-[#EC4899] text-white",
                isPast && "bg-[#EC4899]/20 text-[#EC4899]",
                !isActive && !isPast && "text-black/50"
              )}
            >
              {getStepLabel(step)}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
