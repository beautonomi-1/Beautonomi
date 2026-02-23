"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingStepper } from "./BookingStepper";
import type { BookingStep } from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";

interface BookingNavProps {
  currentStep: BookingStep;
  onBack?: () => void;
  showStepper?: boolean;
  embed?: boolean;
  title?: string;
  /** Step order for stepper (e.g. omit staff when hidden) */
  steps?: BookingStep[];
}

export function BookingNav({
  currentStep,
  onBack,
  showStepper = true,
  embed = false,
  title,
  steps,
}: BookingNavProps) {
  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-black/5 bg-[#F2F2F7]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[#F2F2F7]/70"
      style={{ backgroundColor: "rgba(242, 242, 247, 0.8)" }}
    >
      <div className={embed ? "mx-auto max-w-md px-4 py-3" : "mx-auto max-w-lg px-4 py-4"}>
        <div className="flex items-center gap-3">
          <Link href="/" className="shrink-0 flex items-center" aria-label="Beautonomi home">
            <Image src="/images/logo.svg" alt="Beautonomi" width={120} height={32} className="h-8 w-auto" />
          </Link>
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className={`shrink-0 rounded-2xl ${MIN_TAP} touch-manipulation`}
              onClick={onBack}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            {showStepper && (
              <BookingStepper currentStep={currentStep} compact={embed} steps={steps} />
            )}
            {title && !showStepper && (
              <h1 className="text-lg font-semibold truncate">{title}</h1>
            )}
          </div>
          {onBack && <div className="w-10 shrink-0" />}
        </div>
      </div>
    </header>
  );
}
