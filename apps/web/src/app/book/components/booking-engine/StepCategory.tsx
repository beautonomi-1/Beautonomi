"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProviderCategoryOption } from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_WAITLIST_BG,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_CARD,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

const cardStyle = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(16px) saturate(180%)",
  WebkitBackdropFilter: "blur(16px) saturate(180%)",
  border: `1px solid ${BOOKING_EDGE}`,
  borderRadius: BOOKING_RADIUS_CARD,
  boxShadow: BOOKING_SHADOW_CARD,
};

interface StepCategoryProps {
  categories: ProviderCategoryOption[];
  selectedCategory: ProviderCategoryOption | null;
  onSelectCategory: (category: ProviderCategoryOption) => void;
  onNext: () => void;
}

export function StepCategory({
  categories,
  selectedCategory,
  onSelectCategory,
  onNext,
}: StepCategoryProps) {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Choose a Category
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          Select the type of service you&apos;re looking for
        </p>
      </div>

      <div className="space-y-8">
        <div className="space-y-3">
          {categories.map((cat) => {
            const isSelected = selectedCategory?.id === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat)}
                className={cn(
                  "w-full text-left rounded-2xl border-2 px-5 py-4 transition-all touch-manipulation flex items-center gap-4",
                  MIN_TAP,
                  BOOKING_ACTIVE_SCALE
                )}
                style={{
                  ...cardStyle,
                  borderColor: isSelected ? BOOKING_ACCENT : BOOKING_BORDER,
                  backgroundColor: isSelected ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold" style={{ color: BOOKING_TEXT_PRIMARY }}>
                    {cat.name}
                  </p>
                  {cat.description && (
                    <p className="text-sm mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
                      {cat.description}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0" style={{ color: BOOKING_TEXT_SECONDARY }} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!selectedCategory}
          className={cn(
            "w-full rounded-2xl h-12 font-semibold text-white touch-manipulation transition-all duration-300 disabled:opacity-50 disabled:active:scale-100",
            MIN_TAP,
            BOOKING_ACTIVE_SCALE
          )}
          style={{
            backgroundColor: BOOKING_ACCENT,
            borderRadius: BOOKING_RADIUS_CARD,
            boxShadow: BOOKING_SHADOW_CARD,
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
