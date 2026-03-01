"use client";

import { User, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingData, StaffOption } from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_WAITLIST_BG,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_CARD,
  BOOKING_RADIUS_BUTTON,
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

interface StepStaffProps {
  data: BookingData;
  staff: StaffOption[];
  onSelectStaff: (staff: StaffOption | null) => void;
  onNext: () => void;
}

export function StepStaff({ data, staff, onSelectStaff, onNext }: StepStaffProps) {
  const noPreference: StaffOption = {
    id: "any",
    name: "Any Professional",
    role: "Fastest availability",
  };
  const selectedId = data.selectedStaff?.id ?? null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Select Professional
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          Choose your preferred specialist or fastest availability
        </p>
      </div>

      <div className="p-5 space-y-2 rounded-3xl" style={cardStyle}>
        <button
          type="button"
          onClick={() => onSelectStaff(noPreference)}
          className={cn(
            "w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all touch-manipulation flex items-center gap-3",
            MIN_TAP,
            BOOKING_ACTIVE_SCALE
          )}
          style={{
            borderColor: selectedId === "any" ? BOOKING_ACCENT : BOOKING_BORDER,
            backgroundColor: selectedId === "any" ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
          }}
        >
          <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
            <User className="h-6 w-6 text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium block" style={{ color: BOOKING_TEXT_PRIMARY }}>
              {noPreference.name}
            </span>
            <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
              {noPreference.role}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0" style={{ color: BOOKING_TEXT_SECONDARY }} />
        </button>

        {staff.map((s, i) => {
          const isSelected = selectedId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStaff(s)}
              className={cn(
                "w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all touch-manipulation flex items-center gap-3",
                MIN_TAP,
                BOOKING_ACTIVE_SCALE
              )}
              style={{
                borderColor: isSelected ? BOOKING_ACCENT : BOOKING_BORDER,
                backgroundColor: isSelected ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
              }}
            >
              <div className="h-12 w-12 rounded-full bg-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                {s.avatar_url ? (
                  <img
                    src={s.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-6 w-6 text-gray-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium block" style={{ color: BOOKING_TEXT_PRIMARY }}>
                  {s.name}
                </span>
                <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
                  {s.role}
                </p>
                {s.rating != null && (
                  <p className="text-xs mt-0.5" style={{ color: BOOKING_ACCENT }}>
                    ★ {Number(s.rating).toFixed(1)} rating
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
        className={cn(
          "w-full rounded-2xl h-12 font-semibold text-white touch-manipulation transition-all duration-300",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          backgroundColor: BOOKING_ACCENT,
          borderRadius: BOOKING_RADIUS_BUTTON,
          boxShadow: BOOKING_SHADOW_CARD,
        }}
      >
        Continue
      </button>
    </div>
  );
}
