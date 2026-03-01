"use client";

import { ChevronLeft } from "lucide-react";
import type { BookingStep } from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_GLASS_BG,
  BOOKING_EDGE,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
} from "../../constants";

/** Inactive stepper segment (light grey) */
const STEPPER_INACTIVE = "rgba(0,0,0,0.08)";

interface BookingNavProps {
  currentStep: BookingStep;
  onBack?: () => void;
  showStepper?: boolean;
  embed?: boolean;
  title?: string;
  steps?: BookingStep[];
  providerName?: string;
  platformName?: string;
  accentColor?: string;
}

export function BookingNav({
  currentStep,
  onBack,
  showStepper = true,
  embed = false,
  title,
  steps,
  providerName,
  platformName = "Beautonomi",
  accentColor = BOOKING_ACCENT,
}: BookingNavProps) {
  const stepsList = steps ?? [];
  const currentIndex = stepsList.length > 0 ? stepsList.indexOf(currentStep) : 0;
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <header
      className="sticky top-0 z-50 border-b px-6 py-5"
      style={{
        background: BOOKING_GLASS_BG,
        backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        borderColor: BOOKING_EDGE,
      }}
    >
      <div className={embed ? "mx-auto max-w-md" : ""}>
        <div className="flex items-center justify-between gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className={`p-2.5 -ml-2 rounded-full touch-manipulation ${MIN_TAP} flex items-center justify-center`}
              style={{
                color: BOOKING_TEXT_PRIMARY,
                backgroundColor: "rgba(0,0,0,0.04)",
                border: `1px solid ${BOOKING_EDGE}`,
              }}
              aria-label="Go back"
            >
              <ChevronLeft size={20} strokeWidth={2} />
            </button>
          ) : (
            <div className="w-10" />
          )}
          <div className="text-center flex-1 min-w-0">
            {title ? (
              <h1 className="text-lg font-semibold truncate" style={{ color: BOOKING_TEXT_PRIMARY }}>
                {title}
              </h1>
            ) : (
              <>
                <p
                  className="text-[11px] font-bold tracking-[0.15em] uppercase truncate"
                  style={{ color: BOOKING_TEXT_SECONDARY }}
                >
                  {platformName}
                </p>
                {providerName && (
                  <p className="text-base font-semibold truncate mt-0.5" style={{ color: BOOKING_TEXT_PRIMARY }}>
                    {providerName}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="w-10" />
        </div>

        {/* Stepper: Beautonomi accent for active/completed steps, light grey for inactive */}
        {showStepper && stepsList.length > 0 && (
          <div
            className="mt-4 flex gap-1.5"
            role="progressbar"
            aria-valuenow={safeIndex + 1}
            aria-valuemin={0}
            aria-valuemax={stepsList.length}
          >
            {stepsList.map((_, i) => (
              <div
                key={i}
                className="h-1.5 flex-1 rounded-sm min-w-[6px] max-w-[28px] transition-colors duration-300"
                style={{
                  backgroundColor: i <= safeIndex ? accentColor : STEPPER_INACTIVE,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
